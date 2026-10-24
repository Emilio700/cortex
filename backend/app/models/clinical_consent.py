"""Immutable, patient-specific informed-consent records."""

import enum

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class ConsentType(str, enum.Enum):
    CONTRACEPTIVE_METHOD = "contraceptive_method"
    CONDYLOMAS_OFFICE = "condylomas_office"
    LABIAPLASTY = "labiaplasty"
    BREAST_SURGERY = "breast_surgery"
    CERVICAL_BIOPSY = "cervical_biopsy"
    CERVICAL_CONE = "cervical_cone"
    HYSTEROSCOPY = "hysteroscopy"
    BARTOLINITIS = "bartolinitis"
    GYNECOLOGIC_SURGERY = "gynecologic_surgery"
    OBSTETRIC_CURETTAGE = "obstetric_curettage"
    LABOR_INDUCTION = "labor_induction"
    DELIVERY = "delivery"
    CESAREAN = "cesarean"
    ILE = "ile"


class ConsentStatus(str, enum.Enum):
    DRAFT = "draft"
    SIGNED = "signed"
    REJECTED = "rejected"
    REVOKED = "revoked"
    # Anulación administrativa: el documento se emitió por error. Nunca se
    # borra la fila ni el texto; sólo deja de estar vigente.
    CANCELLED = "cancelled"


class ClinicalConsent(Base):
    """A versioned consent snapshot; signed rows are never edited or deleted."""

    __tablename__ = "clinical_consents"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True, index=True)
    clinical_episode_id = Column(
        Integer, ForeignKey("clinical_episodes.id"), nullable=True, index=True
    )
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    consent_type = Column(String(60), nullable=False, index=True)
    template_version = Column(String(40), nullable=False)
    status = Column(String(20), nullable=False, default=ConsentStatus.DRAFT.value, index=True)
    title = Column(String(255), nullable=False)
    procedure_name = Column(String(255), nullable=True)
    diagnosis = Column(Text, nullable=True)
    rendered_body = Column(Text, nullable=False)
    field_values = Column(JSON, nullable=False, default=dict)
    acknowledgements = Column(JSON, nullable=False, default=list)

    patient_signed_name = Column(String(200), nullable=True)
    patient_signature_path = Column(String(500), nullable=True)
    patient_signed_at = Column(DateTime, nullable=True)
    doctor_confirmed_at = Column(DateTime, nullable=True)
    signed_pdf_path = Column(String(500), nullable=True)
    content_hash = Column(String(64), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    revoked_reason = Column(Text, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    cancelled_reason = Column(Text, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    cancelled_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    cancelled_pdf_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant")
    patient = relationship("Patient", back_populates="clinical_consents")
    appointment = relationship("Appointment")
    clinical_episode = relationship("ClinicalEpisode")
    doctor = relationship("User", foreign_keys=[doctor_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    cancelled_by = relationship("User", foreign_keys=[cancelled_by_user_id])

    @property
    def cancelled_by_name(self) -> str | None:
        """Nombre de quien anuló, para mostrarlo en el historial sin otra consulta."""
        return self.cancelled_by.full_name if self.cancelled_by else None
