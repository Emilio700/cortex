"""Triage model"""
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class Triage(Base):
    """Triage/vital signs model"""

    __tablename__ = "triages"

    id = Column(Integer, primary_key=True, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=False, unique=True)
    weight_kg = Column(Float)
    height_cm = Column(Float)
    blood_pressure_systolic = Column(Integer)
    blood_pressure_diastolic = Column(Integer)
    temperature_celsius = Column(Float)
    chief_complaint = Column(String(500))  # Motivo de consulta
    observations = Column(Text)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    # Relationships
    appointment = relationship("Appointment", back_populates="triage")
    created_by = relationship("User", back_populates="triages_created")
