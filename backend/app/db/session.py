"""SQLAlchemy database session configuration"""
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings


def utcnow() -> datetime:
    """Naive UTC timestamp for model defaults.

    Drop-in replacement for the deprecated ``datetime.utcnow`` used as column
    ``default``/``onupdate``. Returns a naive datetime in UTC so stored values
    stay identical to the previous behavior (the timestamp columns are not
    timezone-aware).
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)

# Create database engine
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,  # Verify connections before using
    echo=settings.ENVIRONMENT == "development",  # Log SQL in development
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()
