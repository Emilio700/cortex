"""Revocable server-side sessions backing refresh and access tokens."""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class UserSession(Base):
    """One active device session for a user.

    The refresh JWT contains the current ``refresh_jti``. Rotating it on each
    refresh prevents an older token from being reused without invalidating the
    whole account. Access tokens carry this row's id and are rejected after the
    session is revoked.
    """

    __tablename__ = "user_sessions"

    id = Column(String(36), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    refresh_jti = Column(String(36), nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True, index=True)
    last_used_at = Column(DateTime, nullable=True)
    ip_hash = Column(String(64), nullable=True, index=True)
    device_label = Column(String(120), nullable=True)
    user_agent_hash = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    user = relationship("User", back_populates="sessions")
