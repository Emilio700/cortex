"""Avisos de resultados de estudios (plan 27, Fase 1).

Escriben en la transacción en curso y no confirman, igual que los de la
agenda: el resultado y su aviso existen los dos o ninguno.

El resultado **crítico** no pasa por aquí a propósito: es una incidencia que
se deriva de su estado abierto (plan 26, D-8), no una fila de aviso que alguien
pueda dar por atendida sin haberle comunicado nada al paciente.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.clinical_tracking import DiagnosticOrder
from app.models.notification import NotificationType
from app.models.patient import Patient
from app.models.user import User
from app.services.notification_service import notify, resolver


def avisar_resultado_recibido(db: Session, order: DiagnosticOrder, patient: Patient, actor: User) -> None:
    """Al médico que pidió el estudio: llegó su resultado (con archivo o
    capturado sin él) y falta que lo revise. A quien lo registró no se le
    avisa de su propio acto."""
    if order.doctor_id == actor.id:
        return
    nombre = " ".join(filter(None, [patient.first_name, patient.last_name])) or "el paciente"
    notify(
        db,
        tenant_id=order.tenant_id,
        user_id=order.doctor_id,
        type=NotificationType.DIAGNOSTIC_RESULT_RECEIVED,
        title="Llegó un resultado",
        message=f"Llegó el resultado de «{order.study_name}» de {nombre}. Falta que lo revises.",
        entity_type="diagnostic_order",
        entity_id=order.id,
        # Un segundo archivo de la misma orden no repite el aviso mientras el
        # primero siga sin revisar: el aviso ya dice lo que hay que hacer.
        dedupe_key=f"diagnostic_result_received:diagnostic_order:{order.id}",
    )


def resolver_resultado_si_ya_no_espera(db: Session, order: DiagnosticOrder, actor: User) -> int:
    """El aviso se cierra cuando la orden deja «resultado recibido»: se revisó,
    se canceló o se rechazó."""
    if order.status == "result_received":
        return 0
    return resolver(
        db,
        tipos=[NotificationType.DIAGNOSTIC_RESULT_RECEIVED],
        entity_type="diagnostic_order",
        entity_id=order.id,
        por_user_id=actor.id,
    )
