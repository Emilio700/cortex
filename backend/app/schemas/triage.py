"""Triage Pydantic schemas"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TriageBase(BaseModel):
    """Base triage schema"""

    weight_kg: Optional[float] = Field(default=None, gt=0, le=300)
    height_cm: Optional[float] = Field(default=None, gt=0, le=250)
    blood_pressure_systolic: Optional[int] = Field(default=None, ge=50, le=300)
    blood_pressure_diastolic: Optional[int] = Field(default=None, ge=30, le=200)
    temperature_celsius: Optional[float] = Field(default=None, ge=30.0, le=45.0)
    chief_complaint: Optional[str] = None
    observations: Optional[str] = None


class TriageCreate(TriageBase):
    """Triage creation schema"""

    appointment_id: int


class TriageUpdate(TriageBase):
    """Triage update schema"""

    pass


class TriageResponse(TriageBase):
    """Triage response schema with calculated BMI"""

    id: int
    appointment_id: int
    created_by_user_id: int
    created_at: datetime
    bmi: Optional[float] = None  # Calculated field

    class Config:
        from_attributes = True
