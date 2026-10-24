"""Contracts for consent-gated clinical images."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.clinical_image import ClinicalImageCategory
from app.utils.sanitize import sanitize_text


class ClinicalImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    patient_id: int
    appointment_id: Optional[int] = None
    clinical_episode_id: Optional[int] = None
    uploaded_by_user_id: int
    category: ClinicalImageCategory
    body_region: Optional[str] = None
    caption: Optional[str] = None
    taken_at: datetime
    consent_obtained: bool
    consent_recorded_at: Optional[datetime] = None
    is_reference: bool
    is_archived: bool
    file_name: str
    file_size: int
    mime_type: str
    created_at: datetime
    updated_at: datetime


class ClinicalImageUpdate(BaseModel):
    caption: Optional[str] = Field(default=None, max_length=2000)
    body_region: Optional[str] = Field(default=None, max_length=100)
    is_reference: Optional[bool] = None
    is_archived: Optional[bool] = None

    @field_validator("caption", "body_region")
    @classmethod
    def sanitize_text_fields(cls, value: Optional[str]) -> Optional[str]:
        return sanitize_text(value, 2000) if value else value
