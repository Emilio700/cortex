"""SOAP Note model for medical consultations"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class SOAPNote(Base):
    """SOAP (Subjective, Objective, Assessment, Plan) Note model"""

    __tablename__ = "soap_notes"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=False, unique=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # SOAP fields
    subjective = Column(Text, nullable=False)  # Patient's complaints/symptoms
    objective = Column(Text, nullable=False)   # Physical exam findings
    assessment = Column(Text, nullable=False)  # Diagnosis/clinical impression
    plan = Column(Text, nullable=False)        # Treatment plan

    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="soap_notes")
    appointment = relationship("Appointment", back_populates="soap_note")
    doctor = relationship("User", back_populates="soap_notes")
