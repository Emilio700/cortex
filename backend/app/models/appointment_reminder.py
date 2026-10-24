"""Appointment reminder preferences and history (Fase 4.3)"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, Boolean, String
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class AppointmentReminder(Base):
    """Stores when appointment reminders were sent and doctor preferences."""

    __tablename__ = "appointment_reminders"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=False)

    # Which reminder window was sent (in minutes before appointment, e.g., 1440 = 24h, 60 = 1h)
    reminder_minutes_before = Column(Integer, nullable=False)

    # When was this reminder actually sent
    sent_at = Column(DateTime, nullable=False)

    # How was it sent (for audit/multi-channel support in future)
    channel = Column(String(50), default="email_and_inapp")  # "email", "inapp", "email_and_inapp"

    created_at = Column(DateTime, default=utcnow, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="appointment_reminders")
    doctor = relationship("User", back_populates="appointment_reminders")
    appointment = relationship("Appointment", back_populates="reminders")


class AppointmentReminderPreference(Base):
    """Doctor's preferences for appointment reminders (Fase 4.3)."""

    __tablename__ = "appointment_reminder_preferences"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)

    # Master toggle
    enabled = Column(Boolean, default=True)

    # Reminder windows (in minutes before appointment). Comma-separated, e.g., "1440,60"
    # This is simple but fragile; if we need more flexibility later, make it a separate table.
    reminder_times = Column(String(255), default="1440,60")  # 24h, 1h

    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="reminder_preferences")
    doctor = relationship("User", back_populates="reminder_preference")
