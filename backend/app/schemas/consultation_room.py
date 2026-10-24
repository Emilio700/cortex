"""Schemas de las salas de consulta."""
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class _RoomTextFields(BaseModel):
    """Normaliza el nombre de la sala (espacios sobrantes, vacío -> None)."""

    @field_validator("name", mode="before", check_fields=False)
    @classmethod
    def strip_text(cls, value):
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value


class ConsultationRoomCreate(_RoomTextFields):
    """Alta de una sala."""

    name: str = Field(min_length=1, max_length=100)
    display_order: int = Field(default=0, ge=0, le=999)


class ConsultationRoomUpdate(_RoomTextFields):
    """Campos editables de una sala. Actualización parcial."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    display_order: int | None = Field(default=None, ge=0, le=999)


class ConsultationRoomStatusUpdate(BaseModel):
    """Activación o desactivación. No existe borrado físico: de una sala
    cuelgan citas que deben conservarse."""

    is_active: bool


class ConsultationRoomResponse(BaseModel):
    id: int
    tenant_id: int
    name: str
    is_active: bool
    display_order: int
    created_at: datetime

    model_config = {"from_attributes": True}
