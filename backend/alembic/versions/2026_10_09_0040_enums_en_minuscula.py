"""Etiquetas de enum en minúscula en una base creada desde cero.

Por qué
-------
La migración inicial (``65444aa3d811``) y la de certificados y preregistro
crearon ``appointmentstatus``, ``certificatetype`` y ``preregistrationstatus``
con etiquetas en MAYÚSCULA, pero los modelos guardan los VALORES del enum
(``values_callable``), que van en minúscula. En producción se corrigió a mano el
2026-07-22 (``scripts/fix_prod_enums.sql``) y nunca quedó en una migración: una
base nueva hecha con ``alembic upgrade head`` no puede insertar una cita
(«invalid input value for enum appointmentstatus: "agendada"»). La 0035 ya
agregó ``en_consulta`` en minúscula, así que en una base nueva el tipo quedaba
mezclado.

Se revisaron todos los enums nativos contra los modelos: ``appointmenttype``,
``paymentmethod`` y ``role`` (corregido en ``b8f3c1d4e9a0``) ya coinciden.

Cómo
----
``ALTER TYPE … RENAME VALUE`` por etiqueta, **solo** si la etiqueta existe en
mayúscula y su versión en minúscula no existe. No reescribe filas ni cambia el
orden, y corre dentro de la transacción. En producción, que ya está en
minúscula, no hace nada. Correrla dos veces tampoco hace nada.

``downgrade`` no hace nada a propósito. Volver a mayúscula rompería al leer
cualquier cita con el código de cualquier versión, y la base no guarda si
esas etiquetas estuvieron alguna vez en mayúscula (producción nunca lo estuvo
después de julio). Bajar de la 0040 deja el esquema válido.

En SQLite (las pruebas) los enums son VARCHAR con CHECK: no hay nada que migrar.

Revision ID: 2026_10_09_0040
Revises: 2026_10_04_0039
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_10_09_0040"
down_revision = "2026_10_04_0039"
branch_labels = None
depends_on = None

# Tipo -> etiquetas que usan los modelos (``app.models``).
ESPERADAS: dict[str, tuple[str, ...]] = {
    "appointmentstatus": ("agendada", "confirmada", "en_sala", "en_consulta", "cancelada", "atendida"),
    "certificatetype": ("sick_leave", "fitness", "other"),
    "preregistrationstatus": ("pending", "contacted", "converted", "discarded"),
}


def _etiquetas(conexion, tipo: str) -> list[str]:
    return [
        fila[0]
        for fila in conexion.execute(
            sa.text(
                "SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid "
                "WHERE t.typname = :tipo ORDER BY e.enumsortorder"
            ),
            {"tipo": tipo},
        )
    ]


def renombres_pendientes(etiquetas: list[str], esperadas: tuple[str, ...]) -> list[tuple[str, str]]:
    """Las etiquetas en mayúscula que hay que pasar a minúscula, y a cuál."""
    presentes = set(etiquetas)
    return [
        (etiqueta, etiqueta.lower())
        for etiqueta in etiquetas
        if etiqueta != etiqueta.lower()
        and etiqueta.lower() in esperadas
        and etiqueta.lower() not in presentes
    ]


def upgrade() -> None:
    conexion = op.get_bind()
    if conexion.dialect.name != "postgresql":
        return
    for tipo, esperadas in ESPERADAS.items():
        for viejo, nuevo in renombres_pendientes(_etiquetas(conexion, tipo), esperadas):
            op.execute(f"ALTER TYPE {tipo} RENAME VALUE '{viejo}' TO '{nuevo}'")


def downgrade() -> None:
    # Ver el docstring: volver a mayúscula rompería la aplicación.
    pass
