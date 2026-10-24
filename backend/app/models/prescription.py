"""Prescription model for medication orders"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class Prescription(Base):
    """Prescription model for medication orders"""

    __tablename__ = "prescriptions"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    
    # Folio: formato "REC-{tenant_id}-{año}-{número correlativo}"
    folio_number = Column(String(50), unique=True, nullable=True, index=True)
    
    # Medications as JSON array: [{name, dosage, frequency, duration, notes}]
    medications = Column(JSON, nullable=False)
    
    # General instructions
    instructions = Column(Text)

    # Motivo de consulta impreso en la receta, a peticion del médico y
    # receta por receta: el expediente clinico no viaja en la receta salvo que
    # ella lo pida para ese paciente concreta. NULL = no se imprime.
    # Se guarda el TEXTO y no una llave a la nota de consulta a proposito: la
    # reimpresion de esta receta tiene que seguir diciendo lo mismo que el
    # papel que ya tiene el paciente en la mano, aunque la nota se corrija
    # despues.
    diagnosis = Column(Text, nullable=True)

    # Digital signature (placeholder for future crypto implementation)
    digital_signature = Column(Text)
    
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="prescriptions")
    appointment = relationship("Appointment", back_populates="prescriptions")
    doctor = relationship("User", back_populates="prescriptions")
    patient = relationship("Patient", back_populates="prescriptions")
