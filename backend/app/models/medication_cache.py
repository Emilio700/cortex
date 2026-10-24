"""
Medication cache model — stores medication data cached from external APIs
(primarily OpenFDA) for fast local search and offline fallback.

The cache is global (not tenant-scoped) because medication data is universal,
not clinic-specific. Access control is handled at the router level
(``medications.search`` permission required).
"""
from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, Integer, String

from app.db.session import Base, utcnow


class MedicationCache(Base):
    """Cached medication data from external drug APIs."""

    __tablename__ = "medication_cache"

    id = Column(Integer, primary_key=True)
    brand_name = Column(String(500), index=True, nullable=False)
    generic_name = Column(String(500), index=True, nullable=True)
    active_ingredient = Column(String(500), nullable=True)
    # JSON list of presentations: [{"form": "Tableta", "dosage": "500mg", "route": "Oral"}, ...]
    presentations = Column(JSON, nullable=True, default=list)
    # JSON list of common dosages: ["250mg", "500mg", "1g"]
    common_dosages = Column(JSON, nullable=True, default=list)
    # JSON list of common frequencies: ["Cada 8 horas", "Cada 12 horas", "Cada 24 horas"]
    common_frequencies = Column(JSON, nullable=True, default=list)
    last_updated = Column(DateTime, default=utcnow, onupdate=utcnow)
    data_source = Column(String(50), default="openfda")  # "openfda" | "manual"
