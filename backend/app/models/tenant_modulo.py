"""Módulos opcionales encendidos o apagados por consultorio (base-modulos-extra).

Una fila por consultorio y módulo, solo cuando alguien lo cambió: si no hay
fila, manda ``activo_por_defecto`` del catálogo (``app.core.modulos``). Apagar un
módulo cambia ``activo`` a falso y nada más; los datos del módulo se quedan.
"""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from app.db.session import Base, utcnow


class TenantModulo(Base):
    __tablename__ = "tenant_modulos"
    __table_args__ = (
        UniqueConstraint("tenant_id", "modulo", name="uq_tenant_modulos_tenant_modulo"),
    )

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    modulo = Column(String(60), nullable=False)
    activo = Column(Boolean, nullable=False, default=False)
    # Quién hizo el último cambio y cuándo; el historial completo está en la bitácora.
    activado_por = Column(Integer, ForeignKey("users.id"), nullable=True)
    activado_en = Column(DateTime, nullable=False, default=utcnow)
