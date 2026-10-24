"""DoctorClinic bridge model — links a doctor to multiple clinics (tenants)."""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class DoctorClinic(Base):
    __tablename__ = "doctor_clinics"
    __table_args__ = (
        UniqueConstraint("doctor_id", "tenant_id", name="uq_doctor_tenant"),
    )

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    # Relationships
    doctor = relationship("User", backref="doctor_clinics")
    tenant = relationship("Tenant")
