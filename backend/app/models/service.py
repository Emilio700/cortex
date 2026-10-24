"""Service catalog model - Fase 3.1 of the roadmap.

G.E.M.S had no concept of a billable "service" at all - no catalog, no
prices, nothing to attach a payment to. This is the first piece of the
administrative module (Fase 3): a simple catalog Admin/Secretaria can
maintain, which Fase 3.2 (payments) will reference.

``specialty_id`` (Fase 6.1) is nullable = "servicio general", not tied to
one specialty (e.g. "Consulta de valoración").
"""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class Service(Base):
    """A billable service offered by the clinic (e.g. "Consulta general")."""

    __tablename__ = "services"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    price = Column(Numeric(10, 2), nullable=False)
    duration_minutes = Column(Integer)
    specialty_id = Column(Integer, ForeignKey("specialties.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant")
    specialty = relationship("Specialty", back_populates="services")

    def __repr__(self):
        return f"<Service(id={self.id}, name='{self.name}', price={self.price})>"
