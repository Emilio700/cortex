"""Validation contracts for digital informed consent."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.clinical_consent import ConsentStatus, ConsentType
from app.utils.sanitize import sanitize_text


class ConsentTemplateResponse(BaseModel):
    consent_type: ConsentType
    title: str
    summary: str
    acknowledgements: list[str]
    allows_photos: bool
    requires_pregnancy_test: bool
    allows_transfusion_choice: bool


class ClinicalConsentCreate(BaseModel):
    patient_id: int = Field(gt=0)
    consent_type: ConsentType
    appointment_id: int | None = Field(default=None, gt=0)
    clinical_episode_id: int | None = Field(default=None, gt=0)
    procedure_name: str | None = Field(default=None, max_length=255)
    diagnosis: str | None = Field(default=None, max_length=4000)
    field_values: dict[str, Any] = Field(default_factory=dict)
    #: Texto redactado o ajustado por el médico en la tarjeta. Si llega vacío
    #: se usa el resumen de la plantilla aprobada.
    custom_body: str | None = Field(default=None, max_length=20000)
    #: Sólo informativo para la trazabilidad: si el médico partió del texto
    #: precargado de la plantilla o escribió el suyo.
    use_template_body: bool = True

    @field_validator("procedure_name", "diagnosis")
    @classmethod
    def sanitize_text_fields(cls, value: str | None) -> str | None:
        return sanitize_text(value, 4000) if value else value

    @field_validator("custom_body")
    @classmethod
    def sanitize_body(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = sanitize_text(value, 20000)
        return cleaned or None


class ClinicalConsentSign(BaseModel):
    patient_signed_name: str = Field(min_length=3, max_length=200)
    signature_data_url: str = Field(min_length=50, max_length=2_000_000)
    acknowledgements: list[str] = Field(min_length=1, max_length=20)
    photo_record_authorized: bool | None = None
    photo_education_authorized: bool | None = None
    transfusion_authorized: bool | None = None

    @field_validator("patient_signed_name")
    @classmethod
    def sanitize_name(cls, value: str) -> str:
        return sanitize_text(value, 200)


class ClinicalConsentRevoke(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)

    @field_validator("reason")
    @classmethod
    def sanitize_reason(cls, value: str) -> str:
        return sanitize_text(value, 2000)


class ClinicalConsentCancel(BaseModel):
    """Anulación de un consentimiento emitido por error; el motivo es obligatorio."""

    reason: str = Field(min_length=5, max_length=2000)

    @field_validator("reason")
    @classmethod
    def sanitize_reason(cls, value: str) -> str:
        cleaned = sanitize_text(value, 2000)
        if len(cleaned) < 5:
            raise ValueError("El motivo de cancelación debe explicarse con al menos 5 caracteres")
        return cleaned


class ClinicalConsentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    patient_id: int
    appointment_id: int | None = None
    clinical_episode_id: int | None = None
    doctor_id: int
    consent_type: ConsentType
    template_version: str
    status: ConsentStatus
    title: str
    procedure_name: str | None = None
    diagnosis: str | None = None
    rendered_body: str
    field_values: dict[str, Any]
    acknowledgements: list[str]
    patient_signed_name: str | None = None
    patient_signed_at: datetime | None = None
    doctor_confirmed_at: datetime | None = None
    rejection_reason: str | None = None
    revoked_reason: str | None = None
    revoked_at: datetime | None = None
    cancelled_reason: str | None = None
    cancelled_at: datetime | None = None
    cancelled_by_user_id: int | None = None
    cancelled_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class ClinicalConsentPage(BaseModel):
    items: list[ClinicalConsentResponse]
    total: int
