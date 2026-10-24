"""Qué doctoras apoya cada secretaria (plan 23, ajustes del 2026-09-28).

La secretaria cobra y ve los pagos de toda la sucursal; eso no cambia. Lo que
esta tabla acota es el **corte de caja**: la asistente que apoya al Dr. Adolfo
tiene que poder cuadrar lo que cobró él sin ver cuánto ingresó cada colega.

La asignación es explícita y la hace administración. No se deduce de quién
agendó o cobró qué: una deducción así cambiaría sola, sin que nadie la
decidiera, lo que una persona puede ver del dinero de otra.

Quitar una asignación la desactiva (``is_active = False``) en vez de borrarla:
la bitácora dice quién la quitó, y la fila dice desde cuándo existía.
"""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, UniqueConstraint, true
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class SecretariaDoctora(Base):
    __tablename__ = "secretaria_doctoras"
    # Una sola fila por pareja: reactivar reutiliza la misma en vez de apilar
    # duplicados que obligarían a decidir cuál manda.
    __table_args__ = (
        UniqueConstraint("secretaria_id", "doctor_id", name="uq_secretaria_doctoras_pareja"),
    )

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    secretaria_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    is_active = Column(Boolean, default=True, server_default=true(), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    secretaria = relationship("User", foreign_keys=[secretaria_id])
    doctor = relationship("User", foreign_keys=[doctor_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])
