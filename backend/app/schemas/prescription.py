"""Prescription schemas"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, field_validator

# Tope del motivo de consulta impreso en la receta. Es una línea bajo los datos
# del paciente, no un párrafo: lo que no quepa se recorta al imprimir, así que
# es mejor que no entre por la puerta.
LIMITE_MOTIVO = 300


# Base schema
class PrescriptionBase(BaseModel):
    """Base prescription schema"""

    medications: List[Dict[str, Any]]
    instructions: Optional[str] = None
    diagnosis: Optional[str] = None
    digital_signature: Optional[str] = None

    @field_validator("medications")
    @classmethod
    def validate_medications(cls, v: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Validate medications list"""
        if not v or len(v) == 0:
            raise ValueError("At least one medication is required")
        for med in v:
            if not med.get("name"):
                raise ValueError("Medication name is required")
            if not med.get("dosage"):
                raise ValueError("Medication dosage is required")
            if not med.get("frequency"):
                raise ValueError("Medication frequency is required")
            # Ensure "intake_time" exists, default to empty string if missing
            if "intake_time" not in med:
                med["intake_time"] = ""
            # Los campos que se imprimen en la receta se limpian aquí para que
            # el PDF no tenga que adivinar: un espacio de más en la vía o la
            # presentación se vería como un hueco en el renglón del medicamento.
            for clave in ("presentation", "route", "quantity", "notes"):
                valor = med.get(clave)
                if valor is None:
                    continue
                med[clave] = " ".join(str(valor).split())
        return v

    @field_validator("diagnosis")
    @classmethod
    def _limpiar_motivo(cls, valor):
        """Vacío es igual que ausente: la receta no imprime un renglón en blanco."""
        if valor is None:
            return None
        limpio = " ".join(str(valor).split()).strip()
        return limpio[:LIMITE_MOTIVO] if limpio else None


# Create schema
class PrescriptionCreate(PrescriptionBase):
    """Schema for creating prescription"""

    appointment_id: int
    patient_id: int


# Update schema
class PrescriptionUpdate(BaseModel):
    """Schema for updating prescription"""

    medications: Optional[List[Dict[str, Any]]] = None
    instructions: Optional[str] = None
    diagnosis: Optional[str] = None
    digital_signature: Optional[str] = None

    @field_validator("diagnosis")
    @classmethod
    def _limpiar_motivo(cls, valor):
        """Apagar el motivo es mandarlo vacío, no dejar el anterior impreso."""
        if valor is None:
            return None
        limpio = " ".join(str(valor).split()).strip()
        return limpio[:LIMITE_MOTIVO] if limpio else None


# Response schema
class PrescriptionResponse(PrescriptionBase):
    """Schema for prescription response"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    appointment_id: int
    patient_id: int
    doctor_id: int
    tenant_id: int
    folio_number: Optional[str] = None
    diagnosis: Optional[str] = None
    created_at: datetime
    updated_at: datetime
