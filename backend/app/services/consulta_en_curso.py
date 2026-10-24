"""El estado «en consulta» de una cita (plan 28, D-3).

Decisión de Emilio (2026-10-04): la cita pasa a «en consulta» cuando la doctora
abre la consulta y a «atendida» cuando la cierra. Nadie lo marca a mano.

Reglas que fijó la coordinación del plan, y por qué:

- **Entra solo por un endpoint explícito** (``POST /appointments/{id}/
  iniciar-consulta``) que la pantalla de consulta llama al abrirse, nunca por un
  GET: leer una cita no puede cambiarla.
- **Solo la doctora de la cita.** Si la abre MASTER para supervisar, o una
  compañera que la cubre para leerla, la agenda no puede decir que la titular
  está atendiendo.
- **Solo desde agendada, confirmada o en sala, y solo si la cita es de hoy**
  (hora de Mazatlán). Abrir una atendida para releerla, una cancelada o la de
  la semana pasada no cambia nada.
- **Sale** al finalizar (atendida), al cancelar o «sin cerrar»: de vuelta al
  estado del que entró (``estado_antes_de_consulta``). Si la doctora la abrió
  para prepararla antes de que llegara la paciente, vuelve a agendada o
  confirmada, y la llegada posterior sigue pidiendo triage y avisando como
  siempre; si estaba en sala, «Regresar a sala». No se revierte al salir de la pantalla: cerrar una pestaña, perder la
  red o apagar el teléfono no son señales confiables de que la consulta acabó,
  y adivinarlo haría mentir a la agenda en el otro sentido.

La lógica vive aquí y no en el router de citas, que comparte el plan 27.
"""
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.hora_local import hoy_local
from app.models.appointment import Appointment, AppointmentStatus
from app.models.notification import NotificationType
from app.models.user import User
from app.services.audit_service import log_action
from app.services.notification_service import resolver

# Desde dónde se puede entrar a consulta.
ESTADOS_QUE_INICIAN = (
    AppointmentStatus.AGENDADA,
    AppointmentStatus.CONFIRMADA,
    AppointmentStatus.EN_SALA,
)

# Las salidas que cierran la consulta. La otra salida, «sin cerrar», es el
# estado del que entró (``estado_previo``).
CIERRES_DE_CONSULTA = (
    AppointmentStatus.ATENDIDA,
    AppointmentStatus.CANCELADA,
)

# Por qué abrir la consulta no cambió el estado. La pantalla no lo muestra
# como error: es el caso normal de releer una consulta.
MOTIVO_YA_EN_CONSULTA = "ya_en_consulta"
MOTIVO_NO_ES_SU_CITA = "no_es_su_cita"
MOTIVO_ESTADO = "estado_no_inicia"
MOTIVO_OTRO_DIA = "cita_de_otro_dia"


def motivo_para_no_iniciar(cita: Appointment, user: User) -> Optional[str]:
    """``None`` si abrir la consulta debe pasar la cita a «en consulta»."""
    if cita.status == AppointmentStatus.EN_CONSULTA:
        return MOTIVO_YA_EN_CONSULTA
    if cita.doctor_id != user.id:
        return MOTIVO_NO_ES_SU_CITA
    if cita.status not in ESTADOS_QUE_INICIAN:
        return MOTIVO_ESTADO
    # ``scheduled_at`` se guarda en hora local del consultorio.
    if cita.scheduled_at is None or cita.scheduled_at.date() != hoy_local():
        return MOTIVO_OTRO_DIA
    return None


def iniciar_consulta(db: Session, cita: Appointment, user: User) -> Optional[str]:
    """Pasa la cita a «en consulta» si toca. Devuelve el motivo si no tocó.

    Idempotente: una segunda llamada (dos pestañas, un reintento de red)
    encuentra la cita ya en consulta y no escribe ni registra nada.
    """
    motivo = motivo_para_no_iniciar(cita, user)
    if motivo is not None:
        return motivo
    anterior = cita.status
    cita.estado_antes_de_consulta = anterior.value
    cita.status = AppointmentStatus.EN_CONSULTA
    # «Paciente en sala» ya no pide nada: la doctora la está atendiendo. Se
    # cierra en la misma transacción que el cambio de estado, igual que en el
    # PATCH de estado (plan 27): si no, la campana seguiría pidiéndole que
    # atienda a la paciente que ya tiene enfrente.
    resolver(
        db,
        tipos=[NotificationType.PATIENT_ARRIVED],
        entity_type="appointment",
        entity_id=cita.id,
        por_user_id=user.id,
    )
    db.commit()
    log_action(
        db,
        action="appointment.consultation_started",
        entity_type="appointment",
        entity_id=cita.id,
        actor_user_id=user.id,
        tenant_id=cita.tenant_id,
        patient_id=cita.patient_id,
        details={"estado_anterior": anterior.value, "estado_nuevo": AppointmentStatus.EN_CONSULTA.value},
    )
    return None


def estado_previo(cita: Appointment) -> AppointmentStatus:
    """A dónde vuelve la cita si se sale de la consulta sin cerrarla.

    El estado guardado al entrar; sin él (una cita que entró antes de que
    existiera la columna), «en sala», como se hacía al principio.
    """
    try:
        previo = AppointmentStatus(cita.estado_antes_de_consulta or "")
    except ValueError:
        return AppointmentStatus.EN_SALA
    return previo if previo in ESTADOS_QUE_INICIAN else AppointmentStatus.EN_SALA


def validar_cambio_manual(cita: Appointment, nuevo: AppointmentStatus) -> None:
    """Reglas del cambio de estado a mano (``PATCH /appointments/{id}/status``).

    «En consulta» no se elige: lo pone abrir la consulta. Y desde «en consulta»
    solo se cierra (atendida, cancelada) o se vuelve al estado del que entró.
    """
    actual = cita.status
    if nuevo == AppointmentStatus.EN_CONSULTA and actual != AppointmentStatus.EN_CONSULTA:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="«En consulta» no se marca a mano: la cita pasa sola a ese estado cuando la doctora abre la consulta.",
        )
    if actual != AppointmentStatus.EN_CONSULTA or nuevo in CIERRES_DE_CONSULTA + (AppointmentStatus.EN_CONSULTA,):
        return
    previo = estado_previo(cita)
    if nuevo != previo:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"La cita entró a consulta desde «{ETIQUETAS[previo]}»: si se sale sin cerrarla, "
                f"vuelve a «{ETIQUETAS[previo]}». También se puede finalizar o cancelar."
            ),
        )


ETIQUETAS = {
    AppointmentStatus.AGENDADA: "agendada",
    AppointmentStatus.CONFIRMADA: "confirmada",
    AppointmentStatus.EN_SALA: "en sala",
}


def es_salida_sin_cerrar(actual: AppointmentStatus, nuevo: AppointmentStatus) -> bool:
    """La doctora sale de la consulta sin cerrarla (vuelve al estado previo).

    No es una llegada: volver a «en sala» no exige triage (la doctora pudo
    abrir la consulta sin signos) ni avisa «paciente en sala» a la propia
    doctora. Volver a agendada o confirmada tampoco avisa nada; la llegada
    real, después, sí pide triage y avisa como siempre.
    """
    return actual == AppointmentStatus.EN_CONSULTA and nuevo not in CIERRES_DE_CONSULTA + (
        AppointmentStatus.EN_CONSULTA,
    )


def preparar_salida_de_consulta(cita: Appointment, nuevo: AppointmentStatus) -> None:
    """Al salir de «en consulta», el estado guardado ya no aplica."""
    if cita.status == AppointmentStatus.EN_CONSULTA and nuevo != AppointmentStatus.EN_CONSULTA:
        cita.estado_antes_de_consulta = None


def registrar_salida_de_consulta(
    db: Session, cita: Appointment, user: User, anterior: AppointmentStatus
) -> None:
    """Bitácora de toda salida de «en consulta», para reconstruir el día."""
    if anterior != AppointmentStatus.EN_CONSULTA or cita.status == AppointmentStatus.EN_CONSULTA:
        return
    log_action(
        db,
        action="appointment.consultation_left",
        entity_type="appointment",
        entity_id=cita.id,
        actor_user_id=user.id,
        tenant_id=cita.tenant_id,
        patient_id=cita.patient_id,
        details={"estado_anterior": anterior.value, "estado_nuevo": cita.status.value},
    )
