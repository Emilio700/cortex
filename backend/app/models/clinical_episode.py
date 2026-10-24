"""Longitudinal clinical episodes for the gynecology record.

An episode groups related encounters without assuming every patient is
pregnant. Pregnancy, preventive care, cervical screening, breast care,
infections, bleeding and procedures can share one secure, auditable timeline.
"""

import enum

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class ClinicalEpisodeType(str, enum.Enum):
    ROUTINE = "routine"
    PREGNANCY = "pregnancy"
    BLEEDING = "bleeding"
    INFECTION = "infection"
    BREAST = "breast"
    CERVIX = "cervix"
    MENOPAUSE = "menopause"
    CONTRACEPTION = "contraception"
    FERTILITY = "fertility"
    PROCEDURE = "procedure"
    OTHER = "other"


class ClinicalEpisodeStatus(str, enum.Enum):
    ACTIVE = "active"
    MONITORING = "monitoring"
    RESOLVED = "resolved"
    ARCHIVED = "archived"


class ClinicalEpisode(Base):
    """A patient-centered clinical episode with a follow-up plan."""

    __tablename__ = "clinical_episodes"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    episode_type = Column(String(40), nullable=False, index=True)
    status = Column(
        String(20), nullable=False, default=ClinicalEpisodeStatus.ACTIVE.value, index=True
    )
    title = Column(String(160), nullable=False)
    summary = Column(Text, nullable=True)
    started_on = Column(Date, nullable=False)
    follow_up_on = Column(Date, nullable=True, index=True)
    next_action = Column(Text, nullable=True)
    resolved_on = Column(Date, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant")
    patient = relationship("Patient", back_populates="clinical_episodes")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
