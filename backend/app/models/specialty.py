"""Medical specialty catalog (Fase 6.1 - multiespecialidad base).

Global (not tenant-scoped): a specialty like "Ginecología" or "Pediatría" is
a fixed medical concept, not clinic-specific data - unlike Service, which is
each clinic's own price list. Seeded once with "Ginecología" so the existing
clinic's data migrates transparently (see migration
2026_07_10_0001_add_specialty).
"""
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class Specialty(Base):
    """A medical specialty (e.g. "Ginecología y Obstetricia")."""

    __tablename__ = "specialties"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, unique=True)
    slug = Column(String(200), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    doctor_profiles = relationship("DoctorProfile", back_populates="specialty")
    services = relationship("Service", back_populates="specialty")

    def __repr__(self):
        return f"<Specialty(id={self.id}, name='{self.name}')>"
