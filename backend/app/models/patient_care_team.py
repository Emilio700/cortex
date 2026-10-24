"""Explicit, time-bound clinical care-team memberships for a patient."""
import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class CareTeamAccessRole(str, enum.Enum):
    """The limited access roles granted in addition to the owner doctor."""

    COLLABORATOR = "collaborator"
    ASSISTANT = "assistant"
    TEMPORARY = "temporary"


class PatientCareTeamMember(Base):
    """A revocable clinical-access grant for one patient.

    The patient's ``owner_doctor_id`` remains the accountable clinician. This
    model records a distinct collaboration, assistant, or time-limited guard
    access without changing ownership or silently broadening clinic access.
    """

    __tablename__ = "patient_care_team_members"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    episode_id = Column(Integer, ForeignKey("clinical_episodes.id"), nullable=True, index=True)
    access_role = Column(
        Enum(
            CareTeamAccessRole,
            values_callable=lambda values: [value.value for value in values],
            native_enum=False,
            length=20,
        ),
        nullable=False,
        index=True,
    )
    granted_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    reason = Column(Text, nullable=True)
    starts_at = Column(DateTime, default=utcnow, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=True, index=True)
    revoked_at = Column(DateTime, nullable=True, index=True)
    revocation_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    patient = relationship("Patient", back_populates="care_team_members")
    user = relationship("User", foreign_keys=[user_id], back_populates="care_team_memberships")
    granted_by = relationship("User", foreign_keys=[granted_by_user_id], back_populates="care_team_grants")
    episode = relationship("ClinicalEpisode")
