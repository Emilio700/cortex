"""Schemas for doctor working hours and schedule blocks (Fase 5.1/5.2)"""
from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class WorkingHoursCreate(BaseModel):
    """Create one recurring weekly working-hours window."""

    weekday: int = Field(ge=0, le=6, description="0=Monday ... 6=Sunday")
    start_time: time
    end_time: time

    @field_validator("end_time")
    @classmethod
    def end_after_start(cls, end_time: time, info):
        start_time = info.data.get("start_time")
        if start_time is not None and end_time <= start_time:
            raise ValueError("end_time must be after start_time")
        return end_time


class WorkingHoursResponse(BaseModel):
    id: int
    doctor_id: int
    weekday: int
    start_time: time
    end_time: time

    class Config:
        from_attributes = True


class ScheduleBlockCreate(BaseModel):
    """Create a one-off unavailability block for a doctor."""

    doctor_id: int
    start_at: datetime
    end_at: datetime
    reason: Optional[str] = Field(default=None, max_length=255)

    @field_validator("end_at")
    @classmethod
    def end_after_start(cls, end_at: datetime, info):
        start_at = info.data.get("start_at")
        if start_at is not None and end_at <= start_at:
            raise ValueError("end_at must be after start_at")
        return end_at


class ScheduleBlockResponse(BaseModel):
    id: int
    doctor_id: int
    start_at: datetime
    end_at: datetime
    reason: Optional[str] = None
    created_by_user_id: int

    class Config:
        from_attributes = True


class DoctorAvailabilityResponse(BaseModel):
    """A doctor entry for the "available doctors" listing (Fase 5.3 selector)."""

    id: int
    full_name: str
    email: str
    specialty: Optional[str] = None

    class Config:
        from_attributes = True


# ── Disponibilidad (huecos libres de la agenda) ──────────────────────────
#
# Lo que alimenta el calendario y la rejilla de horarios del modal de cita.
# Todas las horas son **hora local del consultorio** y van sin zona horaria,
# igual que ``appointments.scheduled_at``: mandarlas en UTC desfasaría la
# pantalla siete horas.


class FranjaDisponible(BaseModel):
    """Una franja de la rejilla de horarios."""

    inicio: datetime = Field(description="Inicio de la franja, hora local del consultorio")
    hora: str = Field(description='Etiqueta en 24 h, p. ej. "09:00"')
    meridiano: str = Field(description='"am" o "pm", para el conmutador de la rejilla')
    disponible: bool
    motivo: Optional[str] = Field(
        default=None,
        description="Por qué no se puede agendar ahí, en español y listo para mostrar",
    )


class DiaDisponible(BaseModel):
    """Un día del calendario mensual."""

    fecha: date
    disponible: bool
    huecos: int = Field(description="Cuántas franjas libres quedan ese día")


class DisponibilidadResponse(BaseModel):
    doctor_id: int
    fecha: date
    duration_minutes: int
    step_minutes: int
    room_id: Optional[int] = None
    jornada_por_defecto: bool = Field(
        description=(
            "true si ese día el doctor no tiene horario de atención configurado y "
            "se está suponiendo la jornada del consultorio (07:00-20:00)"
        )
    )
    franjas: list[FranjaDisponible]
    dias: list[DiaDisponible] = Field(
        default_factory=list,
        description="Días del mes pedido; vacío si no se pidió el mes",
    )
