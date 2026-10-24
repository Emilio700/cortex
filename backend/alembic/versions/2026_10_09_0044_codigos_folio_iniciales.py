"""Códigos de folio de las dos sucursales reales (plan 32, decisión de Emilio).

Sin código, los folios homologados salen como ``S{id}-REC-…``, y como lo
impreso no se renumera, ese número se quedaría para siempre en el papel de una
paciente. Por eso el código se pone en la migración y no queda como paso manual
después del despliegue.

- Identifica cada sucursal por su **nombre**, nunca por id: los ids no son los
  mismos en cada base. Los nombres son los de producción
  (``docs/ESTADO_PRODUCCION.md``, ``scripts/seed.py``); se comparan sin
  distinguir mayúsculas, acentos ni espacios repetidos.
- **Solo llena lo vacío.** Si Master ya puso un código, se respeta.
- **No inventa.** Si un nombre no aparece, aparece más de una vez o el código
  ya lo usa otra sucursal, no toca nada y lo deja en el log de la migración.
- Idempotente: un segundo ``upgrade`` no cambia nada.

``downgrade`` no hace nada a propósito: quitar el código no des-imprime los
folios que ya salieron con él.

Revision ID: 2026_10_09_0044
Revises: 2026_10_09_0043
"""
import logging
import unicodedata

import sqlalchemy as sa
from alembic import op

revision = "2026_10_09_0044"
down_revision = "2026_10_09_0043"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

# Nombre de la sucursal en producción -> código de folio.
CODIGOS: dict[str, str] = {
    "G & G GINECOLOGOS": "GYG",
    "GEMS - Sucursal San Ignacio": "SIG",
}


def normalizar(nombre: str | None) -> str:
    sin_acentos = unicodedata.normalize("NFKD", nombre or "").encode("ascii", "ignore").decode()
    return " ".join(sin_acentos.upper().split())


def asignaciones(sucursales: list[tuple[int, str, str | None]]) -> tuple[list[tuple[int, str]], list[str]]:
    """``(id, código)`` a escribir y los avisos de lo que no se tocó."""
    usados = {codigo for _, _, codigo in sucursales if codigo}
    por_nombre: dict[str, list[tuple[int, str | None]]] = {}
    for id_, nombre, codigo in sucursales:
        por_nombre.setdefault(normalizar(nombre), []).append((id_, codigo))
    escribir, avisos = [], []
    for nombre, codigo in CODIGOS.items():
        candidatas = por_nombre.get(normalizar(nombre), [])
        if len(candidatas) != 1:
            avisos.append(
                f"codigo_folio {codigo}: {'no hay' if not candidatas else 'hay varias'} sucursal(es) "
                f"llamada(s) «{nombre}»; no se asignó. Captúralo en Sucursales."
            )
            continue
        id_, actual = candidatas[0]
        if actual:
            continue  # Ya tiene uno: se respeta.
        if codigo in usados:
            avisos.append(f"codigo_folio {codigo}: ya lo usa otra sucursal; «{nombre}» se quedó sin código.")
            continue
        escribir.append((id_, codigo))
        usados.add(codigo)
    return escribir, avisos


def upgrade() -> None:
    conexion = op.get_bind()
    sucursales = [tuple(f) for f in conexion.execute(sa.text("SELECT id, name, codigo_folio FROM tenants"))]
    escribir, avisos = asignaciones(sucursales)
    for id_, codigo in escribir:
        conexion.execute(
            sa.text("UPDATE tenants SET codigo_folio = :codigo WHERE id = :id AND codigo_folio IS NULL"),
            {"codigo": codigo, "id": id_},
        )
        log.info("codigo_folio %s asignado a la sucursal %s", codigo, id_)
    for aviso in avisos:
        log.warning(aviso)


def downgrade() -> None:
    # Ver el docstring: los folios ya impresos conservan su código.
    pass
