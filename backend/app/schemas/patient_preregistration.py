"""Schemas for patient preregistration / intake (Fase 6.4)"""
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from app.models.patient_preregistration import PreregistrationStatus
from app.schemas.specialty import SpecialtyResponse


class PreregistrationCreate(BaseModel):
    full_name: str = Field(max_length=200)
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    specialty_id: Optional[int] = None
    reason: Optional[str] = None


class PreregistrationUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=200)
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    specialty_id: Optional[int] = None
    reason: Optional[str] = None
    status: Optional[PreregistrationStatus] = None


class PreregistrationResponse(BaseModel):
    id: int
    full_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    specialty_id: Optional[int] = None
    specialty: Optional[SpecialtyResponse] = None
    reason: Optional[str] = None
    status: PreregistrationStatus
    converted_patient_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ConvertToPatientRequest(BaseModel):
    """Fields needed to create the real Patient record that this
    preregistration didn't already capture (birth date, etc.)."""

    # Opcional, igual que en el alta exprés de recepción (plan 29): la paciente
    # no siempre la da por teléfono y exigirla bloqueaba convertir. La edad en
    # todo el sistema ya muestra «—» sin fecha.
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    address: Optional[str] = None
