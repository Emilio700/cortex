"""Clinical images linked to patient care, never generic file attachments."""

import enum

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class ClinicalImageCategory(str, enum.Enum):
    CLINICAL_PHOTO = "clinical_photo"
    REFERENCE = "reference"
    ULTRASOUND = "ultrasound"
    PROCEDURE = "procedure"
    OTHER = "other"


class ClinicalImage(Base):
    """An auditable, consent-gated image belonging to a patient record."""

    __tablename__ = "clinical_images"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True, index=True)
    clinical_episode_id = Column(
        Integer, ForeignKey("clinical_episodes.id"), nullable=True, index=True
    )
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    category = Column(String(40), nullable=False, index=True)
    body_region = Column(String(100), nullable=True)
    caption = Column(Text, nullable=True)
    taken_at = Column(DateTime, nullable=False, default=utcnow, index=True)
    consent_obtained = Column(Boolean, nullable=False, default=False)
    consent_recorded_at = Column(DateTime, nullable=True)
    is_reference = Column(Boolean, nullable=False, default=False, index=True)
    is_archived = Column(Boolean, nullable=False, default=False, index=True)
    file_path = Column(String(500), nullable=False)
    thumbnail_path = Column(String(500), nullable=True)
    file_name = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    mime_type = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant")
    patient = relationship("Patient", back_populates="clinical_images")
    appointment = relationship("Appointment")
    clinical_episode = relationship("ClinicalEpisode")
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_user_id])
