"""Medical Certificate model for sick leave and fitness certificates"""
import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class CertificateType(str, enum.Enum):
    """Certificate type enum"""
    SICK_LEAVE = "sick_leave"
    FITNESS = "fitness"
    OTHER = "other"


class MedicalCertificate(Base):
    """Medical Certificate model"""

    __tablename__ = "medical_certificates"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    
    # Folio: formato "CERT-{tenant_id}-{año}-{número correlativo}"
    folio_number = Column(String(50), unique=True, nullable=True, index=True)
    
    certificate_type = Column(Enum(CertificateType, values_callable=lambda obj: [e.value for e in obj]), nullable=False)
    days_off = Column(Integer)  # For sick leave
    diagnosis = Column(Text, nullable=False)
    notes = Column(Text)
    
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="medical_certificates")
    appointment = relationship("Appointment", back_populates="medical_certificates")
    doctor = relationship("User", back_populates="medical_certificates")
    patient = relationship("Patient", back_populates="medical_certificates")
