"""Appointment creation confirmation (Fase 4.4).

Unlike reminders (Fase 4.3, sent later by a background job with dedup
bookkeeping), a confirmation fires exactly once, synchronously, right after
create_appointment commits - no AppointmentReminder-style ledger needed
since there's only ever one creation event per appointment.
"""
from typing import Optional

from sqlalchemy.orm import Session

from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.user import User
from app.services.email_service import send_email
from app.services.email_templates import appointment_confirmation as tmpl, get_clinic_info
from app.utils.tratamiento import nombre_con_tratamiento


def enmascarar_correo(correo: str) -> str:
    """Esconde el correo para no exponerlo entero en la respuesta ni en la
    bitácora: deja la primera letra del usuario y el dominio (``a***@dominio``).

    Recepción sólo necesita confirmar que el correo al que se reenvió es el que
    ella espera, no leer la dirección completa de la paciente.
    """
    correo = (correo or "").strip()
    if "@" not in correo:
        # No debería llegar aquí (sólo se llama con un correo capturado), pero
        # si llegara, no se filtra el valor crudo.
        return "***"
    usuario, dominio = correo.rsplit("@", 1)
    inicial = usuario[0] if usuario else ""
    return f"{inicial}***@{dominio}"


def _armar_correo_de_confirmacion(
    db: Session, appointment: Appointment, patient: Patient, doctor: User
) -> tuple[str, str, str]:
    """Arma asunto, texto y HTML del correo de confirmación de una cita.

    Se comparte entre el envío al crear la cita y el reenvío manual (S-05) para
    que los dos correos digan exactamente lo mismo: si el texto cambia en un
    lado, cambia en los dos.
    """
    clinic = get_clinic_info(db, user_id=appointment.doctor_id, tenant_id=appointment.tenant_id)
    date_str = appointment.scheduled_at.strftime('%d/%m/%Y')
    time_str = appointment.scheduled_at.strftime('%I:%M %p')
    reason = getattr(appointment, 'reason', '') or ''
    # Con el tratamiento capturado ("Dra."); sin él, el nombre solo: un
    # "Dr." fijo le llegaba también a las pacientes de las doctoras.
    medico = nombre_con_tratamiento(doctor)
    body_text = f"Hola {patient.first_name}, tu cita está confirmada para el {date_str} a las {time_str} con {medico}."
    body_html = tmpl(clinic, patient.first_name, date_str, time_str, medico, reason)
    return "Confirmación de tu cita médica", body_text, body_html


def reenviar_confirmacion_de_cita(db: Session, appointment: Appointment) -> dict:
    """Reenvía a la paciente el correo de confirmación de su cita (S-05).

    Se usa al reagendar: la paciente conserva por escrito la hora vieja y hay
    que mandarle la nueva. Devuelve sólo lo que de verdad se sabe del envío, sin
    afirmar de más (regla de oro, plan 22):

    - ``sin_email``: la paciente no tiene correo capturado; no se intenta nada.
    - ``fallo_envio``: se intentó y el servidor de correo lo rechazó.
    - ``None`` (enviado): el correo se entregó al servidor SMTP.

    Nota honesta: ``send_email`` sólo confirma el envío real cuando
    ``EMAIL_ENABLED`` está activo (producción). Con el correo deshabilitado
    (dev/CI) simula éxito, así que ahí ``enviado`` será ``True`` sin salida
    real; en producción el booleano refleja la entrega al SMTP.
    """
    patient = db.query(Patient).filter(Patient.id == appointment.patient_id).first()
    doctor = db.query(User).filter(User.id == appointment.doctor_id).first()
    if not patient or not doctor:
        # Sin paciente o sin doctora no hay a quién ni de parte de quién escribir.
        return {"enviado": False, "motivo": "sin_email", "destinatario": None}

    if not patient.email:
        return {"enviado": False, "motivo": "sin_email", "destinatario": None}

    subject, body_text, body_html = _armar_correo_de_confirmacion(db, appointment, patient, doctor)
    enviado = send_email(
        to_email=patient.email, subject=subject, body_text=body_text, body_html=body_html
    )
    destinatario = enmascarar_correo(patient.email)
    if enviado:
        return {"enviado": True, "motivo": None, "destinatario": destinatario}
    return {"enviado": False, "motivo": "fallo_envio", "destinatario": destinatario}


def send_appointment_confirmation(
    db: Session, appointment: Appointment, actor_user_id: Optional[int] = None
) -> None:
    """Le manda a la paciente (si tiene correo) la confirmación de su cita.

    Best-effort: a failed email must not roll back or fail the appointment
    creation that already succeeded, so failures are swallowed here.

    El aviso en la campana a la doctora ya no sale de aquí: se escribe en la
    misma transacción que la cita (``avisos_de_citas.avisar_cita_agendada``,
    plan 27), y este correo se manda después de confirmar. ``actor_user_id`` se
    conserva para no romper a quien ya llamaba a esta función.
    """
    patient = db.query(Patient).filter(Patient.id == appointment.patient_id).first()
    doctor = db.query(User).filter(User.id == appointment.doctor_id).first()
    if not patient or not doctor:
        return

    if patient.email:
        subject, body_text, body_html = _armar_correo_de_confirmacion(db, appointment, patient, doctor)
        send_email(to_email=patient.email, subject=subject, body_text=body_text, body_html=body_html)
