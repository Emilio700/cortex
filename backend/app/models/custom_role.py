"""
CustomRole model — tenant-specific role definitions.

A CustomRole lets a tenant (clinic) define roles beyond the 4 system roles.
Each custom role has a ``base_role`` from which it inherits default permissions.
Overrides can then be applied per-user as usual via the Permission table.

SYSTEM_ROLES are immutable and cannot be modified.
"""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow

# System roles that cannot be customized via CustomRole
SYSTEM_ROLES = {"master", "admin", "secretaria", "doctor"}

# Friendly labels for the UI
SYSTEM_ROLE_LABELS: dict[str, str] = {
    "master": "Master (Desarrollador)",
    "admin": "Administrador",
    "secretaria": "Secretaría",
    "doctor": "Doctor",
}


class CustomRole(Base):
    """
    Tenant-specific role definition.

    A CustomRole references a ``base_role`` (one of the 4 system roles) and
    inherits its default permissions. The role name must be unique within the
    tenant.
    """

    __tablename__ = "custom_roles"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    name = Column(String(50), nullable=False)
    base_role = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="custom_roles")

def is_system_role(role: str) -> bool:
    """Check if a role name is a system role (immutable)."""
    return role.lower() in SYSTEM_ROLES


def get_system_role_label(role: str) -> str:
    """Get the friendly label for a system role."""
    return SYSTEM_ROLE_LABELS.get(role.lower(), role)
