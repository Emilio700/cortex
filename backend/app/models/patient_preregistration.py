"""Patient preregistration / intake (Fase 6.4 - multiespecialidad).

Captures a would-be patient's intent (contact info, desired specialty,
reason for consultation) at first contact - phone call or walk-in - before
Secretaria formalizes it into a real Patient record and Appointment. G.E.M.S
has no patient-facing auth/portal, so this is staff-entered, not
self-service; a public intake form is a larger, separate undertaking.

Deliberately specialty-only, no per-specialty dynamic fields yet: the
roadmap's ClinicalTemplate (dynamic intake/SOAP forms per specialty) stays
deferred until a second specialty is in real use (see Fase 6.1/6.3) - this
just captures which specialty the patient wants to be seen for.
"""
import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class PreregistrationStatus(str, enum.Enum):
    """Lifecycle of an intake entry."""

    PENDING = "pending"  # Captured, not yet acted on
    CONTACTED = "contacted"  # Staff reached out to schedule
    CONVERTED = "converted"  # Became a real Patient (+ usually an Appointment)
    DISCARDED = "discarded"  # Patient didn't follow up / not interested


class PatientPreregistration(Base):
    """A pending intake entry, not yet a formal Patient record."""

    __tablename__ = "patient_preregistrations"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)

    full_name = Column(String(200), nullable=False)
    phone = Column(String(20), nullable=True)
    email = Column(String(100), nullable=True)
    specialty_id = Column(Integer, ForeignKey("specialties.id"), nullable=True)
    reason = Column(Text, nullable=True)  # Motivo de consulta

    status = Column(Enum(PreregistrationStatus, values_callable=lambda obj: [e.value for e in obj]), default=PreregistrationStatus.PENDING, nullable=False, index=True)

    # Set once staff converts this into a real Patient record
    converted_patient_id = Column(Integer, ForeignKey("patients.id"), nullable=True)

    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant")
    specialty = relationship("Specialty")
    converted_patient = relationship("Patient")
    created_by = relationship("User")

    def __repr__(self):
        return f"<PatientPreregistration(id={self.id}, full_name='{self.full_name}', status={self.status})>"
