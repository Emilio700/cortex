"""Salas de consulta (consultorios físicos) de una sucursal.

El consultorio G & G tiene dos salas físicas y cuatro doctores: sin este
concepto el sistema dejaba agendar tres doctores a la misma hora aunque solo
hubiera dos salas donde atender. La tabla es configurable por sucursal, así
que abrir una tercera sala no exige tocar código.
"""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class ConsultationRoom(Base):
    """Sala física de atención, perteneciente a una sucursal (tenant)."""

    __tablename__ = "consultation_rooms"
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_consultation_room_tenant_name"),
    )

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    # Booleano de verdad: una columna 'is_*' creada como INTEGER hace que
    # PostgreSQL rechace el INSERT (ver tests/test_tipos_modelo_vs_schema.py).
    is_active = Column(Boolean, default=True, nullable=False)
    # Orden de presentación en la agenda; a igualdad, se desempata por nombre.
    display_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="consultation_rooms")
    appointments = relationship("Appointment", back_populates="room")
