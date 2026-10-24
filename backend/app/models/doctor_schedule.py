"""Doctor working hours and schedule blocks (Fase 5.1/5.2 - multidoctor).

Two separate concepts, both needed to know "is this doctor available at this
time":
- DoctorWorkingHours: the recurring weekly shape of a doctor's schedule
  (e.g. Monday 09:00-14:00). If a doctor has no rows here, they are treated
  as having no defined schedule yet (Fase 5.1 doesn't force every existing
  doctor to configure this before they can keep using the system - collision
  checking against other appointments still applies regardless).
- ScheduleBlock: one-off exceptions layered on top (vacation day, an
  afternoon out for a conference, etc.) that override the recurring pattern
  for a specific date/time range.
"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, SmallInteger, String, Text, Time
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class DoctorWorkingHours(Base):
    """A single recurring weekly working-hours window for one doctor.

    A doctor can have multiple rows (e.g. Mon-Fri 09:00-14:00 AND
    Mon/Wed/Fri 16:00-19:00) - each row is one contiguous block on one
    weekday, not a whole week's schedule.
    """

    __tablename__ = "doctor_working_hours"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # 0=Monday ... 6=Sunday (Python's datetime.weekday() convention, so
    # comparing against scheduled_at.weekday() needs no translation)
    weekday = Column(SmallInteger, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

    created_at = Column(DateTime, default=utcnow, nullable=False)

    tenant = relationship("Tenant")
    doctor = relationship("User", back_populates="working_hours")


class ScheduleBlock(Base):
    """A one-off block of time when a doctor is NOT available (vacation,
    personal appointment, conference, etc.), regardless of their recurring
    working hours. Appointments cannot be created/rescheduled into a range
    that overlaps an active block for that doctor."""

    __tablename__ = "schedule_blocks"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    start_at = Column(DateTime, nullable=False)
    end_at = Column(DateTime, nullable=False)
    reason = Column(String(255), nullable=True)

    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    tenant = relationship("Tenant")
    doctor = relationship("User", back_populates="schedule_blocks", foreign_keys=[doctor_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])
