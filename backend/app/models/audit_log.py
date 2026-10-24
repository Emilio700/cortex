"""Audit log model - a minimal, append-only trail of sensitive actions.

G.E.M.S had no audit trail at all: admin actions (creating/editing users) and
irreversible operations (deleting a patient's clinical document) left no
record of who did what, or when. This model backs a lightweight, generic log
- not a full event-sourcing system - populated via
``app.services.audit_service.log_action``.
"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class AuditLog(Base):
    """A single recorded action, e.g. 'user.created' or 'document.deleted'."""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    # Nullable tenant_id: a handful of actions (e.g. a super-admin managing
    # tenants themselves, if that ever exists) might not belong to one tenant.
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=True, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String(100), nullable=False, index=True)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(Integer, nullable=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=True, index=True)
    outcome = Column(String(20), nullable=False, default="success", index=True)
    ip_hash = Column(String(64), nullable=True, index=True)
    device_label = Column(String(120), nullable=True)
    reason = Column(String(300), nullable=True)
    # Small, free-form JSON payload for context (e.g. which fields changed).
    # Named `details` (not `metadata`) to avoid colliding with SQLAlchemy's
    # reserved `Base.metadata` attribute.
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)

    tenant = relationship("Tenant")
    actor = relationship("User")
    patient = relationship("Patient")

    def __repr__(self):
        return f"<AuditLog(action='{self.action}', entity_type='{self.entity_type}', entity_id={self.entity_id})>"
