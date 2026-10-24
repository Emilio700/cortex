"""Appointment model"""
import enum

from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class AppointmentStatus(str, enum.Enum):
    """Appointment status enum"""

    AGENDADA = "agendada"  # Scheduled
    CONFIRMADA = "confirmada"  # Confirmed
    EN_SALA = "en_sala"  # In waiting room
    # La doctora abrió la consulta (plan 28, D-3). Nadie lo marca a mano: lo
    # pone ``POST /appointments/{id}/iniciar-consulta`` al abrir la pantalla de
    # consulta y se sale de él al finalizar (atendida), al regresar a la
    # paciente a sala o al cancelar. Ver ``app/services/consulta_en_curso.py``.
    EN_CONSULTA = "en_consulta"
    CANCELADA = "cancelada"  # Cancelled
    ATENDIDA = "atendida"  # Completed


class AppointmentOrigen(str, enum.Enum):
    """De dónde salió la cita.

    ``express`` es la consulta rápida que no se agendó y se registró al
    cobrarla (plan 23, ajustes del 2026-09-28): ya ocurrió, así que la agenda
    y el historial tienen que distinguirla de una consulta que sí se agendó.
    """

    AGENDA = "agenda"
    EXPRESS = "express"


class AppointmentType(str, enum.Enum):
    """Appointment type enum"""

    CONSULTA = "consulta"
    CIRUGIA = "cirugia"
    PROCEDIMIENTO = "procedimiento"


class Appointment(Base):
    """Appointment model"""

    __tablename__ = "appointments"
    # Doctora + fecha: «Mis consultas» filtra por doctora y ordena por fecha
    # sobre todo el histórico (migración 2026_09_29_0027, B-05).
    __table_args__ = (
        Index("ix_appointments_doctor_id_scheduled_at", "doctor_id", "scheduled_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # Sala física donde se atiende. Nullable a proposito: las 25 658 citas
    # historicas se quedan sin sala (no se inventa en cual fueron) y hay
    # sucursales que no configuran salas.
    room_id = Column(Integer, ForeignKey("consultation_rooms.id"), nullable=True, index=True)
    scheduled_at = Column(DateTime, nullable=False, index=True)
    duration_minutes = Column(Integer, default=30, nullable=False)
    status = Column(
        Enum(AppointmentStatus, values_callable=lambda obj: [e.value for e in obj]), default=AppointmentStatus.AGENDADA, nullable=False, index=True
    )
    # Dónde estaba la cita antes de que la doctora abriera la consulta
    # (agendada, confirmada o en_sala). Salir sin cerrar la devuelve AHÍ: si la
    # abrió para prepararla antes de que la paciente llegara, «regresar a sala»
    # la habría puesto en sala sin triage y sin aviso de llegada (plan 28, D-3).
    # Texto y no enum a propósito: no crea otro tipo en PostgreSQL. Nula fuera
    # de consulta.
    estado_antes_de_consulta = Column(String(20), nullable=True)
    notes = Column(Text)
    # Motivo extra de la cita: una nota corta para el doctor ("CONTROL",
    # "PRIMERA VEZ", "ULTRASONIDO"...). OPCIONAL a proposito y en texto libre:
    # el consultorio lo pidio como nota, NO como tipo de cita. Los tipos del
    # sistema siguen siendo tres (consulta, cirugia, procedimiento).
    motivo_extra = Column(String(120), nullable=True)
    # Surgery / procedure fields
    appointment_type = Column(
        Enum(AppointmentType, values_callable=lambda obj: [e.value for e in obj]),
        default=AppointmentType.CONSULTA, nullable=False, index=True
    )
    cirugia_type = Column(String(100), nullable=True)
    hospital = Column(String(200), nullable=True)
    anestesiologo = Column(String(200), nullable=True)
    preop_notes = Column(Text, nullable=True)
    postop_notes = Column(Text, nullable=True)
    duration_hours = Column(Float, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    # Cancellation trail (Fase 3.5) - who cancelled, when, and why. Populated
    # only when status transitions to CANCELADA; left null otherwise.
    cancellation_reason = Column(Text, nullable=True)
    cancelled_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    cancelled_at = Column(DateTime, nullable=True)

    # Quién atendió de verdad. Se fija al finalizar y es a quien pertenece el
    # ingreso (plan 23, decisión 4): la titular puede no ser quien atendió.
    attended_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Exención de cobro: la doctora marca la consulta "sin cargo" (cortesía,
    # revisión incluida) y queda quién, cuándo y por qué. Sin esto una consulta
    # sin cobrar sería indistinguible de una que a recepción se le olvidó.
    cobro_sin_cargo_motivo = Column(String(255), nullable=True)
    cobro_sin_cargo_por_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    cobro_sin_cargo_at = Column(DateTime, nullable=True)

    # VARCHAR y no ENUM nativo, igual que ``payments.status``: bajar la
    # migración 0025 no deja un tipo huérfano en PostgreSQL.
    origen = Column(
        Enum(
            AppointmentOrigen,
            values_callable=lambda obj: [e.value for e in obj],
            native_enum=False,
            length=20,
        ),
        default=AppointmentOrigen.AGENDA,
        server_default=AppointmentOrigen.AGENDA.value,
        nullable=False,
    )

    # Relationships
    tenant = relationship("Tenant", back_populates="appointments")
    patient = relationship("Patient", back_populates="appointments")
    doctor = relationship("User", back_populates="appointments_as_doctor", foreign_keys=[doctor_id])
    room = relationship("ConsultationRoom", back_populates="appointments")
    cancelled_by = relationship("User", foreign_keys=[cancelled_by_user_id])
    attended_by = relationship("User", foreign_keys=[attended_by_user_id])
    cobro_sin_cargo_por = relationship("User", foreign_keys=[cobro_sin_cargo_por_user_id])
    triage = relationship("Triage", back_populates="appointment", uselist=False)
    soap_note = relationship("SOAPNote", back_populates="appointment", uselist=False)
    prescriptions = relationship("Prescription", back_populates="appointment")
    medical_certificates = relationship("MedicalCertificate", back_populates="appointment")
    reminders = relationship("AppointmentReminder", back_populates="appointment")
