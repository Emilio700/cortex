"""SOAP Note schemas"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


# Base schema
class SOAPNoteBase(BaseModel):
    """Base SOAP note schema.

    Sin ``diagnosis``: la migracion 2026_08_01_0003 borro esa columna al quitar
    CIE-10, pero el esquema la conservo. Como el router arma el modelo con
    ``SOAPNote(**model_dump())``, cada alta le pasaba un argumento inexistente y
    reventaba en un 500 generico. Entre el 1 de agosto y el 24 de septiembre de
    2026 no se guardo ni una sola nota en produccion por esto.
    """

    # Las cuatro secciones son opcionales a proposito: el doctor puede emitir la
    # receta sin documentar la nota completa, y completarla despues. Se guardan
    # como cadena vacia porque las columnas son NOT NULL.
    subjective: str = ""
    objective: str = ""
    assessment: str = ""
    plan: str = ""

    @field_validator("subjective", "objective", "assessment", "plan", mode="before")
    @classmethod
    def _nulo_es_cadena_vacia(cls, valor):
        return "" if valor is None else valor


# Create schema
class SOAPNoteCreate(SOAPNoteBase):
    """Schema for creating SOAP note"""

    appointment_id: int


# Update schema
class SOAPNoteUpdate(BaseModel):
    """Schema for updating SOAP note"""

    subjective: Optional[str] = None
    objective: Optional[str] = None
    assessment: Optional[str] = None
    plan: Optional[str] = None


# Response schema
class SOAPNoteResponse(SOAPNoteBase):
    """Schema for SOAP note response"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    appointment_id: int
    doctor_id: int
    tenant_id: int
    created_at: datetime
    updated_at: datetime
