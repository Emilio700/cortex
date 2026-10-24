"""Specialty lookup helpers (Fase 6.1)"""
from sqlalchemy.orm import Session

from app.models.specialty import Specialty

DEFAULT_SPECIALTY_NAME = "Medicina General"


def get_default_specialty_id(db: Session) -> int:
    """Resolve the id of the fallback specialty used when auto-creating a
    doctor profile that has none yet. Creates it if the seed migration
    hasn't run in this environment."""
    specialty = db.query(Specialty).filter(Specialty.name == DEFAULT_SPECIALTY_NAME).first()
    if not specialty:
        specialty = Specialty(name=DEFAULT_SPECIALTY_NAME, slug="medicina-general")
        db.add(specialty)
        db.commit()
        db.refresh(specialty)
    return specialty.id
