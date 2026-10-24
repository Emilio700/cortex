"""Patient Document Model - Stores lab results, studies, and other medical files"""
from sqlalchemy import Column, Integer, String, ForeignKey, Text, Enum as SQLEnum, DateTime
from sqlalchemy.orm import relationship
from app.db.session import Base, utcnow
import enum


class DocumentType(str, enum.Enum):
    """Types of medical documents"""

    LAB_RESULT = "lab_result"
    IMAGING_STUDY = "imaging_study"
    EXTERNAL_NOTE = "external_note"
    OTHER = "other"


class PatientDocument(Base):
    """
    Stores uploaded documents for patients
    Lab results, imaging studies, external medical notes, etc.
    """

    __tablename__ = "patient_documents"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Stored as a plain VARCHAR(50) to match the existing DB column (migration 006).
    # native_enum=False keeps enum validation at the app layer without creating a
    # PostgreSQL ENUM type, so Alembic autogenerate won't flag a spurious type diff.
    document_type = Column(
        SQLEnum(DocumentType, native_enum=False, length=50, create_constraint=False),
        nullable=False,
        default=DocumentType.OTHER,
    )
    title = Column(String(255), nullable=False)
    description = Column(Text)
    file_path = Column(String(500), nullable=False)  # Path to stored file
    file_name = Column(String(255), nullable=False)  # Original filename
    file_size = Column(Integer)  # Size in bytes
    mime_type = Column(String(100))  # e.g., "application/pdf", "image/jpeg"

    # Optional metadata
    lab_name = Column(String(255))  # Name of laboratory
    study_date = Column(String(50))  # Date of study/exam

    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    # Corrección de documentos (plan 29, lote 7). Un documento clínico nunca se
    # borra: se ANULA (sale de las vistas normales y el archivo se conserva)
    # con motivo, quién y cuándo, y se puede revertir. Ver
    # ``app/services/correccion_documentos.py``.
    anulado_at = Column(DateTime, nullable=True, index=True)
    anulado_por_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    anulado_motivo = Column(String(500), nullable=True)
    # Si se subió al paciente equivocado y se movió: de quién venía. El
    # historial completo de movimientos queda en la bitácora de ambas.
    movido_desde_patient_id = Column(Integer, ForeignKey("patients.id"), nullable=True)
    movido_at = Column(DateTime, nullable=True)
    movido_por_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    movido_motivo = Column(String(500), nullable=True)

    # Relationships
    patient = relationship("Patient", backref="patient_documents", foreign_keys=[patient_id])
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_user_id])

    def __repr__(self):
        return f"<PatientDocument(id={self.id}, patient_id={self.patient_id}, title='{self.title}')>"
