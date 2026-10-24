"""
Folios homologados de los documentos de GEMS (plan 32).

Formato único para todo lo que se emite desde la 1.2.0::

    {CLÍNICA}-{TIPO}-{AÑO}-{CONSECUTIVO}
    GYG-REC-2026-0042   receta
    GYG-CER-2026-0007   certificado
    GYG-ORD-2026-0118   papel de orden de estudios
    GYG-RES-2026-0003   resumen clínico

- ``{CLÍNICA}`` es el código corto de la sucursal (``tenants.codigo_folio``);
  mientras no se configure, ``S{id}``.
- El consecutivo es por clínica, tipo y año del consultorio (hora de
  Mazatlán), y se lleva en ``folios_emitidos``, que además es la bitácora con
  la que la administración verifica un folio.
- Lo emitido antes (``REC-{id}-{año}-…``, ``CERT-…``, ``C-``, ``G-``, ``P-``)
  no se renumera: cada documento conserva el folio que trae impreso.
"""

import hashlib
from collections.abc import Callable
from typing import TypeVar

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.hora_local import hoy_local
from app.models.folio_emitido import FolioEmitido, TipoDeFolio
from app.models.tenant import Tenant

# Cuántas veces se vuelve a intentar el guardado cuando dos consultas
# simultáneas se ganaron el mismo folio. Con cuatro intentos alcanza de sobra:
# cada colisión real deja a un ganador, y nunca hay cuatro doctoras guardando
# en el mismo instante en una clínica de tres consultorios.
INTENTOS_POR_COLISION_DE_FOLIO = 4

# Clave de ``Session.info`` con el folio reservado en la transacción en curso,
# para ligarlo al documento en cuanto éste tiene id.
_PENDIENTE = "folio_emitido_pendiente"

RegistroT = TypeVar("RegistroT")


def _clave_de_bloqueo(prefijo: str) -> int:
    """Número estable de 63 bits para el candado de una serie de folios.

    Postgres no recibe el prefijo como texto, sólo un entero, así que se deriva
    del prefijo con un resumen: dos procesos que piden folio de la misma serie
    (misma clínica, mismo año, mismo tipo de documento) llegan siempre al mismo
    número y por lo tanto al mismo candado, y series distintas no se estorban.
    """
    resumen = hashlib.blake2b(prefijo.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(resumen, "big") & 0x7FFFFFFFFFFFFFFF


def _bloquear_serie(db: Session, prefijo: str) -> None:
    """Serializa a quienes piden folio de la misma serie, mientras dure la transacción.

    El folio se calcula leyendo el último y sumando uno; sin candado, dos
    guardados concurrentes leen el mismo último y piden el mismo número, y como
    el folio es único el segundo revienta con un 500 justo cuando el médico
    está cerrando la consulta. El candado es de transacción: se suelta solo en
    el commit o el rollback, así que cubre exactamente la ventana entre
    calcular el folio y grabarlo.

    En SQLite (las pruebas) no existe este mecanismo y no hace falta: ahí la
    escritura ya está serializada. El reintento de ``guardar_con_folio`` es la
    red que cubre ese caso y también el de dos procesos que no comparten
    candado.
    """
    try:
        dialecto = db.get_bind().dialect.name
    except Exception:  # pragma: no cover - sesión sin motor asociado
        return
    if dialecto != "postgresql":
        return
    db.execute(text("SELECT pg_advisory_xact_lock(:clave)"), {"clave": _clave_de_bloqueo(prefijo)})


def codigo_de_clinica(db: Session, tenant_id: int) -> str:
    codigo = db.query(Tenant.codigo_folio).filter(Tenant.id == tenant_id).scalar()
    return codigo or f"S{tenant_id}"


def emitir_folio(
    db: Session,
    *,
    tenant_id: int,
    tipo: str,
    user_id: int | None = None,
    patient_id: int | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    clave_origen: str | None = None,
) -> FolioEmitido:
    """Reserva el siguiente folio de la serie y lo agrega a la transacción. No confirma.

    Si aun con el candado dos procesos calculan el mismo número, el índice
    único de ``folios_emitidos`` rechaza al segundo al confirmar y quien llama
    reintenta (``guardar_con_folio``).
    """
    if tipo not in TipoDeFolio.NOMBRES:
        raise ValueError(f"Tipo de folio desconocido: {tipo}")
    # El año del consultorio, no el del contenedor (UTC): la noche del 31 de
    # diciembre el documento estrenaba la serie del año siguiente.
    anio = hoy_local().year
    _bloquear_serie(db, f"{tenant_id}-{tipo}-{anio}")
    ultimo = (
        db.query(FolioEmitido.consecutivo)
        .filter(FolioEmitido.tenant_id == tenant_id, FolioEmitido.tipo == tipo, FolioEmitido.anio == anio)
        .order_by(FolioEmitido.consecutivo.desc())
        .limit(1)
        .scalar()
    )
    consecutivo = (ultimo or 0) + 1
    emitido = FolioEmitido(
        folio=f"{codigo_de_clinica(db, tenant_id)}-{tipo}-{anio}-{consecutivo:04d}",
        tenant_id=tenant_id,
        tipo=tipo,
        anio=anio,
        consecutivo=consecutivo,
        patient_id=patient_id,
        entity_type=entity_type,
        entity_id=entity_id,
        clave_origen=clave_origen,
        emitted_by_user_id=user_id,
    )
    db.add(emitido)
    db.info[_PENDIENTE] = emitido
    return emitido


def guardar_con_folio(
    db: Session,
    *,
    generar_folio: Callable[[], str],
    construir: Callable[[str], RegistroT],
) -> RegistroT:
    """Graba un documento clínico con folio, reintentando si el número ya se lo llevó otra.

    El folio se vuelve a calcular en cada intento: reusar el que ya chocó sólo
    repetiría el choque. Si ``generar_folio`` lo reservó en ``folios_emitidos``,
    queda ligado al documento en la misma transacción: existen los dos o
    ninguno. Se devuelve el registro ya refrescado.
    """
    ultimo_error: IntegrityError | None = None
    for _ in range(INTENTOS_POR_COLISION_DE_FOLIO):
        db.info.pop(_PENDIENTE, None)
        registro = construir(generar_folio())
        db.add(registro)
        try:
            emitido = db.info.pop(_PENDIENTE, None)
            if emitido is not None:
                db.flush()
                emitido.entity_id = getattr(registro, "id", None)
            db.commit()
        except IntegrityError as exc:
            # El rollback deja la sesión utilizable; sin él, el reintento
            # fallaría por la transacción abortada y no por el folio.
            db.rollback()
            ultimo_error = exc
            continue
        db.refresh(registro)
        return registro
    raise ultimo_error  # type: ignore[misc]


def generate_prescription_folio(
    db: Session, tenant_id: int, *, user_id: int | None = None, patient_id: int | None = None
) -> str:
    """El siguiente folio de receta: ``{CLÍNICA}-REC-{año}-{n}``."""
    return emitir_folio(
        db, tenant_id=tenant_id, tipo=TipoDeFolio.RECETA, user_id=user_id, patient_id=patient_id,
        entity_type="prescription",
    ).folio


def generate_certificate_folio(
    db: Session, tenant_id: int, *, user_id: int | None = None, patient_id: int | None = None
) -> str:
    """El siguiente folio de certificado: ``{CLÍNICA}-CER-{año}-{n}``."""
    return emitir_folio(
        db, tenant_id=tenant_id, tipo=TipoDeFolio.CERTIFICADO, user_id=user_id, patient_id=patient_id,
        entity_type="medical_certificate",
    ).folio


# Lo que la bitácora anotaba al imprimir un papel de órdenes antes de la 1.2.0.
_ACCIONES_DE_PAPEL = ("diagnostic_order.batch_pdf_generated", "diagnostic_order_group.pdf_generated")


def _impreso_con_folio_anterior(db: Session, folio_anterior: str, entity_type: str, entity_id: int) -> bool:
    """¿Ese papel ya salió impreso con su folio de antes (``C-``, ``G-``, ``P-``)?"""
    from app.models.audit_log import AuditLog

    for (detalles,) in (
        db.query(AuditLog.details)
        .filter(
            AuditLog.action.in_(_ACCIONES_DE_PAPEL),
            AuditLog.entity_type == entity_type,
            AuditLog.entity_id == entity_id,
        )
        .all()
    ):
        # El papel del lote no anotaba folio: era siempre ``G-{lote}``.
        if (detalles or {}).get("folio", folio_anterior) == folio_anterior:
            return True
    return False


def folio_de_papel_de_ordenes(
    db: Session,
    *,
    tenant_id: int,
    clave_origen: str,
    folio_anterior: str,
    entity_type: str,
    entity_id: int,
    user_id: int | None,
    patient_id: int | None,
) -> str:
    """El folio ``ORD`` del papel consolidado de órdenes. Confirma si emite uno.

    - El mismo papel (mismas órdenes, mismo origen) reimpreso da el mismo
      folio: se busca por ``clave_origen``.
    - Un papel que ya se había impreso antes de la 1.2.0 conserva su folio de
      entonces (``C-``, ``G-``, ``P-``): ya se entregó con ese número.
    - Cada renglón sigue llevando su «Orden n.º», que es con lo que se liga el
      resultado; el folio identifica la hoja.
    """
    for _ in range(INTENTOS_POR_COLISION_DE_FOLIO):
        # Candado antes de buscar: dos impresiones simultáneas del mismo papel
        # no deben estrenar dos folios distintos.
        _bloquear_serie(db, f"{tenant_id}-{TipoDeFolio.ORDEN}-{hoy_local().year}")
        existente = (
            db.query(FolioEmitido.folio)
            .filter(
                FolioEmitido.tenant_id == tenant_id,
                FolioEmitido.tipo == TipoDeFolio.ORDEN,
                FolioEmitido.clave_origen == clave_origen,
            )
            .scalar()
        )
        if existente:
            return existente
        if _impreso_con_folio_anterior(db, folio_anterior, entity_type, entity_id):
            return folio_anterior
        emitido = emitir_folio(
            db, tenant_id=tenant_id, tipo=TipoDeFolio.ORDEN, user_id=user_id, patient_id=patient_id,
            entity_type=entity_type, entity_id=entity_id, clave_origen=clave_origen,
        )
        db.info.pop(_PENDIENTE, None)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            continue
        return emitido.folio
    raise RuntimeError("No se pudo emitir el folio de la orden tras varios intentos.")


def folio_impreso_de(db: Session, tenant_id: int, order_ids: list[int]) -> str | None:
    """El folio ``ORD`` con el que salió el papel de exactamente esas órdenes, si lo hay."""
    ids = ",".join(str(i) for i in sorted(order_ids))
    return (
        db.query(FolioEmitido.folio)
        .filter(
            FolioEmitido.tenant_id == tenant_id,
            FolioEmitido.tipo == TipoDeFolio.ORDEN,
            FolioEmitido.clave_origen.like(f"%|{ids}"),
        )
        .order_by(FolioEmitido.id.desc())
        .limit(1)
        .scalar()
    )
