"""El rastro de cada estudio: qué pasó, cuándo y quién (plan 32, punto 3).

Decisión de Emilio (2026-10-05): «para ellos es muy importante llevar eso
bien medido». Cada orden dice su última actualización con fecha y autor, y se
puede ver su línea de tiempo completa: solicitud, impresión, cada archivo,
cada seguimiento, revisión, comunicación, cierre de la incidencia, cambio de
estado y anulación.

Sale de los campos que ya existían y de la bitácora (las impresiones). Donde
el pasado no guardó quién o cuándo, no se inventa: el evento dice «sin
registro» (``autor=None``). Las fechas van como el servidor las guarda (UTC
ingenuo); la pantalla las muestra en hora de Mazatlán.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.clinical_tracking import DiagnosticOrder, DiagnosticOrderFollowUp, DiagnosticResult
from app.models.patient_document import PatientDocument
from app.models.user import User
from app.services.estudios_atrasados import MOTIVOS_DE_SEGUIMIENTO

CANALES = {"en_mano": "En mano", "llamada": "Llamada", "whatsapp": "WhatsApp", "correo": "Correo"}
ESTADOS = {
    "cancelled": "Cancelada",
    "rejected": "Rechazada",
    "accepted": "Aceptada por el laboratorio",
    "scheduled": "Agendada en el laboratorio",
    "collected": "Muestra tomada",
    "in_process": "En proceso en el laboratorio",
    "result_received": "Resultado recibido",
    "reviewed": "Revisada",
    "ordered": "Solicitada",
}


@dataclass
class Evento:
    tipo: str
    titulo: str
    cuando: datetime | None
    autor_id: int | None = None
    detalle: str | None = None
    # La solicitud solo guarda el día (``requested_on``): sin hora no se inventa una.
    solo_fecha: bool = False


def _nombres(db: Session, ids: set[int]) -> dict[int, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {uid: nombre for uid, nombre in db.query(User.id, User.full_name).filter(User.id.in_(ids))}


def nombres_de_usuarios(db: Session, ids) -> dict[int, str]:
    return _nombres(db, set(ids))


def eventos_de_orden(db: Session, orden: DiagnosticOrder, *, incluir_anulados: bool) -> list[Evento]:
    eventos: list[Evento] = [
        Evento(
            "solicitud",
            "Solicitado",
            orden.created_at or datetime.combine(orden.requested_on, time()),
            orden.doctor_id,
            detalle=f"Pedido para el {orden.requested_on.strftime('%d/%m/%Y')}" if orden.requested_on else None,
        )
    ]

    impresiones = (
        db.query(AuditLog)
        .filter(
            AuditLog.tenant_id == orden.tenant_id,
            AuditLog.action.in_(("diagnostic_order.printed", "diagnostic_order.batch_printed")),
            AuditLog.patient_id == orden.patient_id,
            or_(AuditLog.entity_type == "diagnostic_order", AuditLog.entity_type == "patient"),
        )
        .all()
    )
    for registro in impresiones:
        ids = (registro.details or {}).get("order_ids") or (
            [registro.entity_id] if registro.entity_type == "diagnostic_order" else []
        )
        if orden.id not in ids:
            continue
        accion = (registro.details or {}).get("accion")
        eventos.append(
            Evento(
                "impresion",
                "Descargado" if accion == "descargar" else "Impreso",
                registro.created_at,
                registro.actor_user_id,
                detalle=(registro.details or {}).get("folio"),
            )
        )

    resultados = db.query(DiagnosticResult).filter(DiagnosticResult.diagnostic_order_id == orden.id).all()
    archivos = {
        doc_id: nombre
        for doc_id, nombre in db.query(PatientDocument.id, PatientDocument.file_name).filter(
            PatientDocument.id.in_([r.patient_document_id for r in resultados if r.patient_document_id] or [-1])
        )
    }
    for r in resultados:
        if r.anulado_at is not None and not incluir_anulados:
            continue
        eventos.append(
            Evento(
                "archivo" if r.patient_document_id else "resultado",
                "Subido" if r.patient_document_id else "Resultado capturado",
                r.created_at,
                r.recorded_by_user_id,
                detalle=archivos.get(r.patient_document_id),
            )
        )
        if r.interpretacion_escrita_at:
            eventos.append(Evento("escrito", "Interpretación escrita", r.interpretacion_escrita_at, r.interpretacion_escrita_por_user_id))
        if r.interpretacion_editada_at:
            eventos.append(Evento("editado", "Interpretación editada", r.interpretacion_editada_at, r.interpretacion_editada_por_user_id))
        if r.reviewed_at:
            eventos.append(Evento("revisado", "Revisado", r.reviewed_at, r.reviewed_by_user_id))
        if r.communicated_at:
            eventos.append(
                Evento("comunicado", "Comunicado", r.communicated_at, r.communicated_by_user_id,
                       detalle=CANALES.get(r.communication_channel or "", r.communication_channel))
            )
        if r.incidencia_cerrada_at:
            eventos.append(Evento("incidencia", "Incidencia crítica cerrada", r.incidencia_cerrada_at, r.incidencia_cerrada_by_user_id))
        if r.anulado_at:
            eventos.append(Evento("anulado", "Resultado anulado", r.anulado_at, r.anulado_por_user_id, detalle=r.anulado_motivo))

    for seg in (
        db.query(DiagnosticOrderFollowUp).filter(DiagnosticOrderFollowUp.diagnostic_order_id == orden.id).all()
    ):
        eventos.append(
            Evento(
                "seguimiento",
                "Seguimiento",
                seg.created_at,
                seg.registrado_por_user_id,
                detalle=f"{MOTIVOS_DE_SEGUIMIENTO.get(seg.motivo, seg.motivo)} · revisar el {seg.revisar_el.strftime('%d/%m/%Y')}"
                + (f" · {seg.nota}" if seg.nota else ""),
            )
        )

    if orden.status_changed_at and orden.status in ("cancelled", "rejected"):
        eventos.append(
            Evento("estado", ESTADOS.get(orden.status, orden.status), orden.status_changed_at,
                   orden.status_changed_by_user_id, detalle=orden.status_reason)
        )
    if orden.delivered_at:
        eventos.append(Evento("entregada", "Entregada a la paciente", orden.delivered_at, orden.delivered_by_user_id))

    eventos.sort(key=lambda e: (e.cuando or datetime.min))
    return eventos


def ultima_actualizacion(eventos: list[Evento]) -> Evento | None:
    """El evento más reciente con fecha. La solicitud cuenta solo si no pasó nada más."""
    con_fecha = [e for e in eventos if e.cuando is not None]
    return con_fecha[-1] if con_fecha else None


def ultima_actualizacion_de_fila(orden, resultados, ultimo_seguimiento) -> tuple[datetime | None, int | None]:
    """Lo mismo que ``ultima_actualizacion`` sin ir a la base: para cada fila de la bandeja.

    No mira la bitácora (las impresiones): imprimir no cambia el estudio, y
    consultarla por cada fila haría lenta la bandeja. La línea de tiempo sí
    las trae.
    """
    candidatos: list[tuple[datetime, int | None]] = [(orden.created_at, orden.doctor_id)] if orden.created_at else []
    if orden.status_changed_at:
        candidatos.append((orden.status_changed_at, orden.status_changed_by_user_id))
    if orden.delivered_at:
        candidatos.append((orden.delivered_at, orden.delivered_by_user_id))
    for r in resultados:
        for cuando, quien in (
            (r.created_at, r.recorded_by_user_id),
            (getattr(r, "interpretacion_escrita_at", None), getattr(r, "interpretacion_escrita_por_user_id", None)),
            (getattr(r, "interpretacion_editada_at", None), getattr(r, "interpretacion_editada_por_user_id", None)),
            (r.reviewed_at, r.reviewed_by_user_id),
            (r.communicated_at, getattr(r, "communicated_by_user_id", None)),
            (getattr(r, "anulado_at", None), getattr(r, "anulado_por_user_id", None)),
        ):
            if cuando:
                candidatos.append((cuando, quien))
    if ultimo_seguimiento is not None:
        candidatos.append((ultimo_seguimiento.created_at, ultimo_seguimiento.registrado_por_user_id))
    if not candidatos:
        return None, None
    return max(candidatos, key=lambda c: c[0])
