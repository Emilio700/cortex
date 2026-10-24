"""Schemas for PatientDocument"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator
from app.models.patient_document import DocumentType
from app.utils.sanitize import sanitize_text


class PatientDocumentBase(BaseModel):
    document_type: DocumentType
    title: str
    description: Optional[str] = None
    lab_name: Optional[str] = None
    study_date: Optional[str] = None

    @field_validator("title")
    @classmethod
    def _sanitize_title(cls, v: str) -> str:
        return sanitize_text(v, max_length=255)

    @field_validator("lab_name")
    @classmethod
    def _sanitize_lab_name(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_text(v, max_length=255) if v else v


class PatientDocumentCreate(PatientDocumentBase):
    patient_id: int
    # File info will be added during upload processing
    file_path: str
    file_name: str
    file_size: Optional[int] = None
    mime_type: Optional[str] = None


class PatientDocumentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    document_type: Optional[DocumentType] = None
    lab_name: Optional[str] = None
    study_date: Optional[str] = None

    @field_validator("title")
    @classmethod
    def _sanitize_title(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_text(v, max_length=255) if v else v

    @field_validator("lab_name")
    @classmethod
    def _sanitize_lab_name(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_text(v, max_length=255) if v else v


class PatientDocumentResponse(PatientDocumentBase):
    id: int
    patient_id: int
    tenant_id: int
    uploaded_by_user_id: int
    file_name: str
    file_size: Optional[int]
    mime_type: Optional[str]
    created_at: datetime
    # Corrección (plan 29, lote 7). Nulos en un documento vigente.
    anulado_at: Optional[datetime] = None
    anulado_motivo: Optional[str] = None
    movido_desde_patient_id: Optional[int] = None
    movido_at: Optional[datetime] = None
    movido_motivo: Optional[str] = None

    class Config:
        from_attributes = True


class MotivoDeCorreccion(BaseModel):
    """Anular o revertir: el motivo es obligatorio y queda en la bitácora."""

    motivo: str

    @field_validator("motivo")
    @classmethod
    def _motivo(cls, v: str) -> str:
        limpio = sanitize_text(v or "", max_length=500).strip()
        if len(limpio) < 3:
            raise ValueError("Escribe el motivo de la corrección.")
        return limpio


class MoverDocumento(MotivoDeCorreccion):
    """Mover a otro paciente de la misma sucursal."""

    patient_id: int
