"""Pydantic contracts for longitudinal clinical episodes."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.clinical_episode import ClinicalEpisodeStatus, ClinicalEpisodeType
from app.utils.sanitize import sanitize_text


class ClinicalEpisodeBase(BaseModel):
    episode_type: ClinicalEpisodeType
    title: str = Field(min_length=3, max_length=160)
    summary: Optional[str] = Field(default=None, max_length=4000)
    started_on: date
    follow_up_on: Optional[date] = None
    next_action: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("title", "summary", "next_action")
    @classmethod
    def sanitize_text_fields(cls, value: Optional[str]) -> Optional[str]:
        return sanitize_text(value, 4000) if value else value

    @model_validator(mode="after")
    def validate_follow_up_date(self):
        if self.follow_up_on and self.follow_up_on < self.started_on:
            raise ValueError("La fecha de seguimiento no puede ser anterior al inicio del episodio")
        return self


class ClinicalEpisodeCreate(ClinicalEpisodeBase):
    patient_id: int


class ClinicalEpisodeUpdate(BaseModel):
    status: Optional[ClinicalEpisodeStatus] = None
    title: Optional[str] = Field(default=None, min_length=3, max_length=160)
    summary: Optional[str] = Field(default=None, max_length=4000)
    follow_up_on: Optional[date] = None
    next_action: Optional[str] = Field(default=None, max_length=2000)
    resolved_on: Optional[date] = None

    @field_validator("title", "summary", "next_action")
    @classmethod
    def sanitize_text_fields(cls, value: Optional[str]) -> Optional[str]:
        return sanitize_text(value, 4000) if value else value


class ClinicalEpisodeResponse(ClinicalEpisodeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    patient_id: int
    created_by_user_id: int
    status: ClinicalEpisodeStatus
    resolved_on: Optional[date] = None
    created_at: datetime
    updated_at: datetime


class ClinicalEpisodePage(BaseModel):
    items: list[ClinicalEpisodeResponse]
    total: int


class ClinicalRecordSummary(BaseModel):
    patient_id: int
    active_episodes: list[ClinicalEpisodeResponse]
    last_appointment_at: Optional[datetime] = None
    next_appointment_at: Optional[datetime] = None
    open_follow_ups: int
