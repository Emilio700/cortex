"""Appointment reminder logic (Fase 4.3) — sending reminders 24h/1h before appointment."""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.appointment import Appointment, AppointmentStatus
from app.models.appointment_reminder import AppointmentReminder, AppointmentReminderPreference
from app.models.notification import NotificationPreference, NotificationType
from app.models.patient import Patient
from app.services.email_service import send_email
from app.services.email_templates import appointment_reminder as tmpl, get_clinic_info
from app.services.notification_service import notify


def _quiere_recordatorio_de_una_hora(db: Session, doctor_id: int) -> bool:
    pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == doctor_id).first()
    return bool(pref and pref.recordatorio_una_hora)


UNA_HORA = 60


def avisar_cita_en_una_hora(db: Session, appointment: Appointment) -> None:
    """Aviso en la campana al médico, una hora antes de su cita (plan 27, D-1).

    Sólo si lo pidió en sus preferencias de avisos (``recordatorio_una_hora``),
    que es el único lugar donde se gobierna; no depende del correo a la
    paciente. El de 24 h ya no existe: la agenda del día lo dice, y treinta
    recordatorios diarios enseñaban a ignorar la campana entera. La
    ``dedupe_key`` evita repetirlo si el trabajo corre dos veces. No confirma.
    """
    if not _quiere_recordatorio_de_una_hora(db, appointment.doctor_id):
        return
    patient = db.query(Patient).filter(Patient.id == appointment.patient_id).first()
    nombre = f"{patient.first_name} {patient.last_name}" if patient else "un paciente"
    notify(
        db,
        tenant_id=appointment.tenant_id,
        user_id=appointment.doctor_id,
        type=NotificationType.APPOINTMENT_REMINDER,
        title="Recordatorio de cita",
        message=f"Tienes una cita con {nombre} en 1 h ({appointment.scheduled_at.strftime('%H:%M')}).",
        entity_type="appointment",
        entity_id=appointment.id,
        dedupe_key=f"appointment_reminder:appointment:{appointment.id}:{UNA_HORA}",
    )


def send_appointment_reminder(db: Session, appointment: Appointment, minutes_before: int) -> bool:
    """
    Manda el recordatorio por correo al paciente (si tiene correo).
    Returns True if sent successfully, False otherwise.

    Es lo que gobierna la tarjeta «Recordatorios por correo a tus pacientes»
    del perfil (``reminder_times``). Antes también mandaba el aviso en la
    campana al médico, así que el de una hora dependía de que tuviera
    encendido el correo a pacientes con «1 hora antes»: el interruptor del
    centro de avisos no hacía lo que decía (plan 29).

    Does NOT check if reminder was already sent — that's the caller's
    responsibility via AppointmentReminder lookup.
    """
    patient = db.query(Patient).filter(Patient.id == appointment.patient_id).first()
    if not patient:
        return False

    hours_before = minutes_before // 60
    date_str = appointment.scheduled_at.strftime('%d/%m/%Y')
    time_str = appointment.scheduled_at.strftime('%I:%M %p')
    subject = f"Recordatorio: tu cita en {hours_before}h" if hours_before >= 1 else f"Recordatorio: tu cita en {minutes_before}m"
    body_text = f"Hola {patient.first_name}, te recordamos tu cita del {date_str} a las {time_str}."

    sent = True
    if patient.email:
        clinic = get_clinic_info(db, user_id=appointment.doctor_id, tenant_id=appointment.tenant_id)
        body_html = tmpl(clinic, patient.first_name, date_str, time_str, hours_before if hours_before >= 1 else 0)
        sent = send_email(to_email=patient.email, subject=subject, body_text=body_text, body_html=body_html)

    # Log the send
    reminder = AppointmentReminder(
        tenant_id=appointment.tenant_id,
        doctor_id=appointment.doctor_id,
        appointment_id=appointment.id,
        reminder_minutes_before=minutes_before,
        sent_at=datetime.utcnow(),
        # Sólo correo: el aviso en la campana al médico va aparte
        # (``avisar_cita_en_una_hora``) y no depende de esta preferencia.
        channel="email" if patient.email else "sin_correo",
    )
    db.add(reminder)
    db.commit()

    return sent


def get_doctor_reminder_preference(db: Session, doctor_id: int, tenant_id: int) -> AppointmentReminderPreference:
    """Get or create default reminder preference for a doctor."""
    pref = (
        db.query(AppointmentReminderPreference)
        .filter(AppointmentReminderPreference.doctor_id == doctor_id)
        .first()
    )
    if not pref:
        pref = AppointmentReminderPreference(
            tenant_id=tenant_id,
            doctor_id=doctor_id,
            enabled=True,
            reminder_times="1440,60",  # 24h, 1h
        )
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return pref


def parse_reminder_times(reminder_times_str: str) -> list[int]:
    """Parse comma-separated reminder times (in minutes) into a list."""
    try:
        return sorted([int(t.strip()) for t in reminder_times_str.split(",") if t.strip()])
    except (ValueError, AttributeError):
        return [1440, 60]  # Fallback to defaults
