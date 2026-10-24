"""Pydantic contracts for explicit patient care-team access."""
from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.patient_care_team import CareTeamAccessRole
from app.models.user import Role
from app.utils.sanitize import sanitize_text


class PatientCareTeamMemberCreate(BaseModel):
    user_id: int
    access_role: CareTeamAccessRole
    episode_id: int | None = None
    reason: str | None = Field(default=None, max_length=1000)
    starts_at: datetime | None = None
    expires_at: datetime | None = None

    @field_validator("reason")
    @classmethod
    def sanitize_reason(cls, value: str | None) -> str | None:
        return sanitize_text(value, 1000).strip() if value else value

    @field_validator("starts_at", "expires_at")
    @classmethod
    def normalize_to_utc_naive(cls, value: datetime | None) -> datetime | None:
        """Match the project's current UTC-naive database convention safely."""
        if value is None or value.tzinfo is None:
            return value
        return value.astimezone(UTC).replace(tzinfo=None)

    @model_validator(mode="after")
    def validate_access_window(self):
        if self.access_role == CareTeamAccessRole.TEMPORARY and not self.reason:
            raise ValueError("El acceso temporal requiere un motivo")
        if self.access_role == CareTeamAccessRole.TEMPORARY and not self.expires_at:
            raise ValueError("El acceso temporal requiere fecha de vencimiento")
        if self.starts_at and self.expires_at and self.expires_at <= self.starts_at:
            raise ValueError("El vencimiento debe ser posterior al inicio del acceso")
        return self


class PatientCareTeamMemberRevoke(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)

    @field_validator("reason")
    @classmethod
    def sanitize_reason(cls, value: str) -> str:
        return sanitize_text(value, 1000).strip()


class PatientCareTeamMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int
    tenant_id: int
    user_id: int
    user_full_name: str
    user_role: Role
    episode_id: int | None = None
    access_role: CareTeamAccessRole
    granted_by_user_id: int
    starts_at: datetime
    expires_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime
