"""Document model - DEPRECATED, kept for schema compatibility only.

No router ever exposed this model over the API; it was superseded by
``PatientDocument`` (see ``app.models.patient_document``), which is what every
upload/download endpoint actually uses today. The ``documents`` table is left
in place rather than dropped via an Alembic migration here, since that would
be a destructive, irreversible schema change that hasn't been verified against
a real Postgres instance in this environment. Do not build new features on
top of this model - use ``PatientDocument`` instead. Dropping this table is
tracked as a candidate for a future, properly-tested migration.
"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class Document(Base):
    """Deprecated - use ``PatientDocument`` instead. See module docstring."""

    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True)
    document_type = Column(String(100))  # lab_result, prescription, image, etc.
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    uploaded_at = Column(DateTime, default=utcnow, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="documents")
    patient = relationship("Patient", back_populates="documents")
    uploaded_by = relationship("User", back_populates="documents_uploaded")
