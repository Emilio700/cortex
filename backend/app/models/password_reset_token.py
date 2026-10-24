"""Password reset token model — time-limited JWT for password recovery."""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Boolean
from app.db.session import Base, utcnow


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token = Column(String(500), nullable=False, unique=True, index=True)
    used = Column(Boolean, default=False, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
