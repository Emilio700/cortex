"""Tenant/Clinic model"""
from sqlalchemy import Boolean, Column, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class Tenant(Base):
    """Tenant/Clinic model for multi-tenant support"""

    __tablename__ = "tenants"
    __table_args__ = (UniqueConstraint("codigo_folio", name="uq_tenants_codigo_folio"),)

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    address = Column(String(500))
    phone = Column(String(20))
    email = Column(String(100))
    # Código corto de la clínica para los folios homologados (plan 32):
    # ``{CODIGO}-{TIPO}-{AÑO}-{CONSECUTIVO}``, p. ej. GYG-REC-2026-0042. Lo
    # configura Master en Sucursales; mientras falte, el folio usa ``S{id}``.
    codigo_folio = Column(String(5), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    # Relationships
    users = relationship("User", back_populates="tenant")
    patients = relationship("Patient", back_populates="tenant")
    custom_roles = relationship("CustomRole", back_populates="tenant")
    appointments = relationship("Appointment", back_populates="tenant")
    consultation_rooms = relationship("ConsultationRoom", back_populates="tenant")
    documents = relationship("Document", back_populates="tenant")
    soap_notes = relationship("SOAPNote", back_populates="tenant")
    prescriptions = relationship("Prescription", back_populates="tenant")
    medical_certificates = relationship("MedicalCertificate", back_populates="tenant")
    appointment_reminders = relationship("AppointmentReminder", back_populates="tenant")
    reminder_preferences = relationship("AppointmentReminderPreference", back_populates="tenant")
