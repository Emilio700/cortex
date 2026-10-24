"""Los avisos que nacen de la agenda (plan 27, Fase 1).

Viven aquí y no en ``routers/appointments.py`` para que ese router, que tocan
varias manos a la vez, sólo tenga que llamar una función en el punto del
evento. Todas escriben en la transacción en curso y **no confirman**: el aviso
y el cambio de la cita existen los dos o ninguno.
"""
from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.hora_local import hoy_local
from app.models.appointment import Appointment, AppointmentStatus
from app.models.notification import NotificationPriority, NotificationType
from app.models.patient import Patient
from app.models.user import User
from app.services.notification_service import destinatarios_de_recepcion, notify, resolver

# Estados en los que la paciente todavía no llega. Sólo de aquí a «en sala» es
# una llegada: volver a sala desde la consulta (plan 28) o reabrir una consulta
# cerrada no es que alguien acabe de llegar.
_ANTES_DE_LLEGAR = {AppointmentStatus.AGENDADA, AppointmentStatus.CONFIRMADA}


def _paciente(db: Session, cita: Appointment) -> str:
    paciente = cita.patient or db.query(Patient).filter(Patient.id == cita.patient_id).first()
    if paciente is None:
        return "La paciente"
    return " ".join(filter(None, [paciente.first_name, paciente.last_name])) or "La paciente"


def _cuando(momento: datetime) -> str:
    return momento.strftime("%d/%m/%Y a las %H:%M")


def prioridad_por_cercania(*fechas: Optional[datetime]) -> str:
    """Accionable si alguna de las fechas (hora del consultorio) es hoy o
    mañana: es un hueco o un cambio en la agenda inmediata de la doctora. Más
    lejos sólo hay que saberlo (D-6). Se compara contra la fecha local, no la
    del contenedor, que corre en UTC."""
    hoy = hoy_local()
    cercanas = {hoy, hoy + timedelta(days=1)}
    if any(f is not None and f.date() in cercanas for f in fechas):
        return NotificationPriority.ACCIONABLE
    return NotificationPriority.INFORMATIVO


def resolver_prenatal_si_ya_tiene_cita(db: Session, patient_id: int, actor: Optional[User] = None) -> int:
    """Cierra el «control prenatal sin cita» si la paciente ya quedó citada
    para ese control, con la misma ventana que usa el aviso para decidir que
    hay que mandarlo (así nunca difieren en qué es «ya está citada»)."""
    from app.models.notification import Notification
    from app.models.pregnancy import Pregnancy, PregnancyStatus
    from scripts.aviso_proxima_revision import _tiene_cita

    db.flush()
    hay_abiertos = (
        db.query(Notification.id)
        .filter(
            Notification.type == NotificationType.PRENATAL_REVIEW_DUE,
            Notification.entity_type == "patient",
            Notification.entity_id == patient_id,
            Notification.resolved_at.is_(None),
        )
        .first()
    )
    if hay_abiertos is None:
        return 0
    hoy = hoy_local()
    embarazos = (
        db.query(Pregnancy)
        .filter(
            Pregnancy.patient_id == patient_id,
            Pregnancy.status == PregnancyStatus.ACTIVE.value,
            Pregnancy.next_review_on.isnot(None),
        )
        .all()
    )
    if not any(_tiene_cita(db, e, hoy) for e in embarazos):
        return 0
    return resolver(
        db,
        tipos=[NotificationType.PRENATAL_REVIEW_DUE],
        entity_type="patient",
        entity_id=patient_id,
        por_user_id=actor.id if actor else None,
    )


def avisar_cita_agendada(db: Session, cita: Appointment, actor: User) -> None:
    """La doctora se entera de la cita que le agendó alguien más; y si con
    esa cita la paciente ya queda citada para su control prenatal, el aviso a
    recepción de «llámala para agendar» se cierra solo."""
    db.flush()
    if actor.id != cita.doctor_id:
        notify(
            db,
            tenant_id=cita.tenant_id,
            user_id=cita.doctor_id,
            type=NotificationType.APPOINTMENT_SCHEDULED,
            title="Nueva cita agendada",
            message=f"Se agendó una cita de {_paciente(db, cita)} el {_cuando(cita.scheduled_at)}.",
            entity_type="appointment",
            entity_id=cita.id,
            dedupe_key=f"appointment_scheduled:appointment:{cita.id}",
        )
    resolver_prenatal_si_ya_tiene_cita(db, cita.patient_id, actor)


def avisar_reprogramacion(
    db: Session,
    cita: Appointment,
    *,
    antes: datetime,
    doctora_antes: int,
    actor: User,
) -> None:
    """Se movió la hora o la doctora de una cita viva (D-6)."""
    if cita.status in (AppointmentStatus.CANCELADA, AppointmentStatus.ATENDIDA):
        return
    if cita.scheduled_at == antes and cita.doctor_id == doctora_antes:
        return
    paciente = _paciente(db, cita)
    prioridad = prioridad_por_cercania(antes, cita.scheduled_at)

    if cita.doctor_id != doctora_antes:
        # A la que la pierde, el hueco; a la que la recibe, la cita nueva.
        if actor.id != doctora_antes:
            notify(
                db,
                tenant_id=cita.tenant_id,
                user_id=doctora_antes,
                type=NotificationType.APPOINTMENT_RESCHEDULED,
                title="Cita pasada a otra doctora",
                message=f"La cita de {paciente} del {_cuando(antes)} ya no está en tu agenda: se pasó a otra doctora.",
                entity_type="appointment",
                entity_id=cita.id,
                priority=prioridad_por_cercania(antes),
                dedupe_key=f"appointment_rescheduled:appointment:{cita.id}:sale:{doctora_antes}:{antes.isoformat()}",
            )
        if actor.id != cita.doctor_id:
            notify(
                db,
                tenant_id=cita.tenant_id,
                user_id=cita.doctor_id,
                type=NotificationType.APPOINTMENT_RESCHEDULED,
                title="Te pasaron una cita",
                message=f"Ahora atiendes a {paciente} el {_cuando(cita.scheduled_at)}.",
                entity_type="appointment",
                entity_id=cita.id,
                priority=prioridad_por_cercania(cita.scheduled_at),
                dedupe_key=f"appointment_rescheduled:appointment:{cita.id}:entra:{cita.doctor_id}:{cita.scheduled_at.isoformat()}",
            )
    elif actor.id != cita.doctor_id:
        notify(
            db,
            tenant_id=cita.tenant_id,
            user_id=cita.doctor_id,
            type=NotificationType.APPOINTMENT_RESCHEDULED,
            title="Cita reprogramada",
            message=f"La cita de {paciente} pasó del {_cuando(antes)} al {_cuando(cita.scheduled_at)}.",
            entity_type="appointment",
            entity_id=cita.id,
            priority=prioridad,
            dedupe_key=f"appointment_rescheduled:appointment:{cita.id}:{cita.scheduled_at.isoformat()}",
        )
    resolver_prenatal_si_ya_tiene_cita(db, cita.patient_id, actor)


def al_cambiar_estado(
    db: Session,
    cita: Appointment,
    *,
    anterior: AppointmentStatus,
    actor: User,
    es_reapertura: bool,
    ya_estaba_atendida: bool,
    aviso_de_cierre: Callable[[], tuple[str, str]],
) -> None:
    """Avisos y cierres de avisos que provoca un cambio de estado de la cita.

    Se llama ANTES de confirmar, con ``cita.status`` ya en el estado nuevo.
    """
    nuevo = cita.status
    db.flush()

    # «Paciente en sala» deja de pedir algo en cuanto la cita sale de sala, sea
    # a consulta, atendida o cancelada. Se escribe como «ya no está en sala» y
    # no como una lista de estados para que un estado nuevo (plan 28) cuente.
    if nuevo != AppointmentStatus.EN_SALA:
        resolver(
            db,
            tipos=[NotificationType.PATIENT_ARRIVED],
            entity_type="appointment",
            entity_id=cita.id,
            por_user_id=actor.id,
        )

    # Reabrir devuelve la consulta a la doctora: el «pendiente de cobro» del
    # cierre anterior se cierra, y al volver a cerrar sale uno nuevo con el
    # estado del cobro de ese momento. Así recepción se entera de que volvió a
    # cerrarse, sin dos pendientes de la misma consulta a la vez.
    if es_reapertura:
        resolver_cobro_pendiente(db, cita.id, actor)

    if nuevo == AppointmentStatus.EN_SALA and not es_reapertura and anterior in _ANTES_DE_LLEGAR:
        if actor.id != cita.doctor_id:
            notify(
                db,
                tenant_id=cita.tenant_id,
                user_id=cita.doctor_id,
                type=NotificationType.PATIENT_ARRIVED,
                title="Paciente en sala",
                message=f"{_paciente(db, cita)} está en sala de espera.",
                entity_type="appointment",
                entity_id=cita.id,
                dedupe_key=f"patient_arrived:appointment:{cita.id}",
            )

    if nuevo == AppointmentStatus.CANCELADA and anterior != AppointmentStatus.CANCELADA:
        if actor.id != cita.doctor_id:
            motivo = f" Motivo: {cita.cancellation_reason}" if cita.cancellation_reason else ""
            notify(
                db,
                tenant_id=cita.tenant_id,
                user_id=cita.doctor_id,
                type=NotificationType.APPOINTMENT_CANCELLED,
                title="Cita cancelada",
                message=f"Se canceló la cita de {_paciente(db, cita)} del {_cuando(cita.scheduled_at)}.{motivo}",
                entity_type="appointment",
                entity_id=cita.id,
                priority=prioridad_por_cercania(cita.scheduled_at),
                dedupe_key=f"appointment_cancelled:appointment:{cita.id}",
            )

    if nuevo == AppointmentStatus.ATENDIDA and not ya_estaba_atendida:
        _avisar_cierre(db, cita, actor, aviso_de_cierre)


def _avisar_cierre(
    db: Session, cita: Appointment, actor: User, aviso_de_cierre: Callable[[], tuple[str, str]]
) -> None:
    """«Consulta finalizada» a recepción, con el estado REAL del cobro.

    Sólo pide algo si falta cobrar; si ya se cobró o fue sin cargo, es un
    «entérate» y además cierra el «pendiente de cobro» de un cierre anterior
    (consulta reabierta y vuelta a cerrar ya cobrada).
    """
    from app.services.cobro_service import doctora_de_la_cita, resumen_de_cobros

    estado = resumen_de_cobros(db, [cita])[cita.id]["estado_cobro"]
    pendiente = estado not in ("cobrada", "sin_cargo")
    titulo, mensaje = aviso_de_cierre()
    if not pendiente:
        resolver_cobro_pendiente(db, cita.id, actor)

    for destinataria in destinatarios_de_recepcion(
        db,
        tenant_id=cita.tenant_id,
        permiso="payments.create",
        doctor_id=doctora_de_la_cita(cita),
        excluir_user_id=actor.id,
    ):
        notify(
            db,
            tenant_id=cita.tenant_id,
            user_id=destinataria.id,
            type=NotificationType.CONSULTATION_COMPLETED,
            title=titulo,
            message=mensaje,
            entity_type="appointment",
            entity_id=cita.id,
            priority=NotificationPriority.ACCIONABLE if pendiente else NotificationPriority.INFORMATIVO,
            dedupe_key=f"consultation_completed:appointment:{cita.id}:{'pendiente' if pendiente else estado}",
        )


def resolver_cobro_pendiente(db: Session, appointment_id: int, actor: Optional[User]) -> int:
    """Se cobró la cita: el «pendiente de cobro» se cierra para todas."""
    return resolver(
        db,
        tipos=[NotificationType.CONSULTATION_COMPLETED],
        entity_type="appointment",
        entity_id=appointment_id,
        por_user_id=actor.id if actor else None,
    )


def avisar_cobro_anulado(db: Session, cita: Appointment, actor: User) -> None:
    """Se anuló el cobro de una consulta ya atendida y quedó sin cobrar.

    Recepción tenía un «ya cobrada, no volver a cobrar» (o el pendiente ya se
    había cerrado al cobrar): sin este aviso, ese texto seguiría diciendo algo
    que dejó de ser cierto, y nadie volvería a cobrar.
    """
    from app.services.cobro_service import doctora_de_la_cita, resumen_de_cobros

    if cita.status != AppointmentStatus.ATENDIDA:
        return
    db.flush()
    if resumen_de_cobros(db, [cita])[cita.id]["estado_cobro"] in ("cobrada", "sin_cargo"):
        return
    paciente = _paciente(db, cita)
    for destinataria in destinatarios_de_recepcion(
        db,
        tenant_id=cita.tenant_id,
        permiso="payments.create",
        doctor_id=doctora_de_la_cita(cita),
        excluir_user_id=actor.id,
    ):
        notify(
            db,
            tenant_id=cita.tenant_id,
            user_id=destinataria.id,
            type=NotificationType.CONSULTATION_COMPLETED,
            title="Cobro anulado — pendiente de cobro",
            message=f"Se anuló el cobro de la consulta de {paciente}. La consulta quedó sin cobrar.",
            entity_type="appointment",
            entity_id=cita.id,
            priority=NotificationPriority.ACCIONABLE,
            dedupe_key=f"consultation_completed:appointment:{cita.id}:pendiente",
        )
