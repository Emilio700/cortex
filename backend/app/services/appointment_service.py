"""Appointment business rules: scheduling collisions and status transitions.

Extracted verbatim from ``app/routers/appointments.py`` (Fase 2.3 of the
roadmap) - behavior is unchanged, only the location moved, so this logic can
be unit-tested and reused (e.g. by a future notifications job) without
importing the router module.
"""
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models.appointment import Appointment, AppointmentStatus
from app.models.consultation_room import ConsultationRoom

# Estados que ocupan agenda de verdad. Una cita cancelada o ya atendida no
# reserva ni al doctor ni la sala; una en consulta sí, igual que en sala: la
# doctora y el consultorio están ocupados con ella (plan 28, D-3).
ESTADOS_QUE_OCUPAN = [
    AppointmentStatus.AGENDADA,
    AppointmentStatus.CONFIRMADA,
    AppointmentStatus.EN_SALA,
    AppointmentStatus.EN_CONSULTA,
]


def se_solapa(
    inicio_a: datetime,
    duracion_a: int,
    inicio_b: datetime,
    duracion_b: int,
) -> bool:
    """Criterio único de solapamiento de dos franjas de la agenda.

    Dos citas se pisan si una empieza antes de que termine la otra y termina
    después de que la otra empiece; tocarse en el borde (10:00-10:30 y
    10:30-11:00) NO es solapamiento.

    Vive aquí y en un solo sitio a propósito: el empalme del doctor, el choque
    de sala, los bloqueos de agenda y el cálculo de huecos libres tienen que
    responder exactamente lo mismo, o la pantalla ofrecerá horarios que el
    servidor luego rechaza.
    """
    fin_a = inicio_a + timedelta(minutes=duracion_a)
    fin_b = inicio_b + timedelta(minutes=duracion_b)
    return inicio_a < fin_b and fin_a > inicio_b


def se_solapa_rango(
    inicio_a: datetime,
    duracion_a: int,
    inicio_b: datetime,
    fin_b: datetime,
) -> bool:
    """Igual que ``se_solapa`` cuando el otro lado ya viene con fecha de fin
    (los bloqueos de agenda guardan ``start_at``/``end_at``, no duración)."""
    fin_a = inicio_a + timedelta(minutes=duracion_a)
    return inicio_a < fin_b and fin_a > inicio_b


def check_appointment_collision(
    db: Session,
    doctor_id: int,
    scheduled_at: datetime,
    duration_minutes: int,
    exclude_appointment_id: Optional[int] = None,
) -> bool:
    """
    Check if doctor has overlapping appointment

    Args:
        db: Database session
        doctor_id: Doctor user ID
        scheduled_at: Start time of appointment
        duration_minutes: Duration in minutes
        exclude_appointment_id: Appointment ID to exclude from check (for updates)

    Returns:
        True if collision exists, False otherwise
    """
    # Get all active appointments for this doctor
    query = db.query(Appointment).filter(
        Appointment.doctor_id == doctor_id,
        Appointment.status.in_(ESTADOS_QUE_OCUPAN),
    )

    if exclude_appointment_id:
        query = query.filter(Appointment.id != exclude_appointment_id)

    existing_appointments = query.all()

    # Check for overlaps in Python, con el criterio compartido (``se_solapa``)
    for existing in existing_appointments:
        if se_solapa(scheduled_at, duration_minutes, existing.scheduled_at, existing.duration_minutes):
            return True

    return False


def check_outside_working_hours(
    db: Session,
    doctor_id: int,
    scheduled_at: datetime,
    duration_minutes: int,
) -> bool:
    """
    Whether the given window falls (even partially) outside the doctor's
    configured recurring working hours for that weekday.

    A doctor with NO working-hours rows configured at all is treated as
    "unrestricted" (returns False) - Fase 5.1 doesn't retroactively lock out
    doctors who haven't set up a schedule yet.
    """
    from app.models.doctor_schedule import DoctorWorkingHours

    weekday = scheduled_at.weekday()
    windows = (
        db.query(DoctorWorkingHours)
        .filter(DoctorWorkingHours.doctor_id == doctor_id, DoctorWorkingHours.weekday == weekday)
        .all()
    )
    if not windows:
        return False

    appointment_end = scheduled_at + timedelta(minutes=duration_minutes)
    start_t = scheduled_at.time()
    end_t = appointment_end.time()

    # An appointment crossing midnight can't fit any same-day window.
    if appointment_end.date() != scheduled_at.date():
        return True

    for window in windows:
        if start_t >= window.start_time and end_t <= window.end_time:
            return False

    return True


def check_schedule_block_collision(
    db: Session,
    doctor_id: int,
    scheduled_at: datetime,
    duration_minutes: int,
) -> bool:
    """Whether the given window overlaps any active ScheduleBlock for the doctor."""
    from app.models.doctor_schedule import ScheduleBlock

    blocks = db.query(ScheduleBlock).filter(ScheduleBlock.doctor_id == doctor_id).all()
    for block in blocks:
        if se_solapa_rango(scheduled_at, duration_minutes, block.start_at, block.end_at):
            return True

    return False


def can_transition_to_en_sala(appointment: Appointment) -> bool:
    """
    Whether an appointment may move to EN_SALA status.

    Business rule: a patient can't be marked as "in the room" until their
    triage (vitals) has been recorded.
    """
    return appointment.triage is not None


def find_room_collision(
    db: Session,
    room_id: int,
    scheduled_at: datetime,
    duration_minutes: int,
    exclude_appointment_id: Optional[int] = None,
) -> Optional[Appointment]:
    """La cita que ya ocupa esa sala en ese rango, o ``None`` si está libre.

    Mismo criterio de solapamiento que ``check_appointment_collision`` (el
    solapamiento parcial cuenta), pero sobre la sala física en vez del doctor:
    dos doctores distintos a la misma hora son válidos siempre que estén en
    salas distintas — ese es justamente el caso que hace útil todo esto.

    Devuelve la cita en conflicto (y no un booleano) para poder decir en el
    mensaje de error de quién es la cita que choca.
    """
    if room_id is None:
        return None

    query = db.query(Appointment).filter(
        Appointment.room_id == room_id,
        Appointment.status.in_(ESTADOS_QUE_OCUPAN),
    )
    if exclude_appointment_id:
        query = query.filter(Appointment.id != exclude_appointment_id)

    for existente in query.all():
        if se_solapa(scheduled_at, duration_minutes, existente.scheduled_at, existente.duration_minutes):
            return existente

    return None


def active_rooms(db: Session, tenant_id: int) -> list[ConsultationRoom]:
    """Salas activas de una sucursal, en su orden de presentación."""
    return (
        db.query(ConsultationRoom)
        .filter(
            ConsultationRoom.tenant_id == tenant_id,
            ConsultationRoom.is_active.is_(True),
        )
        .order_by(ConsultationRoom.display_order, ConsultationRoom.name)
        .all()
    )


def room_collision_message(db: Session, room_id: int, conflicto: Appointment) -> str:
    """Mensaje en español que dice qué sala choca y de quién es la otra cita."""
    sala = db.query(ConsultationRoom).filter(ConsultationRoom.id == room_id).first()
    nombre_sala = sala.name if sala else "La sala seleccionada"

    doctor = conflicto.doctor
    if doctor is not None and doctor.full_name:
        de_quien = f" por {doctor.full_name}"
    else:
        de_quien = ""

    hora = conflicto.scheduled_at.strftime("%H:%M")
    return (
        f"{nombre_sala} ya está ocupada a esa hora{de_quien} "
        f"(cita de las {hora}). Elige otra sala u otro horario."
    )


def resolve_room_for_appointment(
    db: Session,
    tenant_id: int,
    room_id: Optional[int],
) -> Optional[int]:
    """Resuelve la sala de una cita según cuántas tenga configuradas la sucursal.

    Reglas acordadas con el consultorio:

    - Más de una sala activa (G & G): la sala es **obligatoria**.
    - Exactamente una sala activa (San Ignacio): se asigna sola, sin molestar.
    - Ninguna sala configurada: **no se bloquea**. No todas las sucursales
      usarán salas, y las 25 658 citas históricas tampoco tienen sala; exigirla
      donde nadie la ha dado de alta dejaría la agenda inutilizable.

    Devuelve el ``room_id`` que debe guardarse (puede ser ``None``).
    Lanza ``ValueError`` con el mensaje en español si la sala falta o no es
    válida; quien llama lo traduce a HTTP 400.
    """
    salas = active_rooms(db, tenant_id)

    if room_id is not None:
        elegida = next((s for s in salas if s.id == room_id), None)
        if elegida is None:
            raise ValueError(
                "La sala seleccionada no existe o está desactivada en esta sucursal."
            )
        return elegida.id

    if len(salas) == 1:
        return salas[0].id

    if len(salas) > 1:
        nombres = ", ".join(s.name for s in salas)
        raise ValueError(
            f"Hay que indicar en qué sala será la cita. Salas disponibles: {nombres}."
        )

    return None
