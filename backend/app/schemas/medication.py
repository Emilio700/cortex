"""Medication search schemas."""
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class MedicationItem(BaseModel):
    """A single medication result from the search endpoint."""

    id: int
    brand_name: str
    generic_name: str | None = None
    active_ingredient: str | None = None
    presentations: list[dict[str, Any]] = []
    common_dosages: list[str] = []
    common_frequencies: list[str] = []
    last_updated: str | None = None
    data_source: str | None = "openfda"

    class Config:
        from_attributes = True


class MedicationSearchResult(BaseModel):
    """Wrapper for medication search results."""

    results: list[MedicationItem] = []
    source: str = "cache"  # "cache" | "openfda" | "cache+openfda"
    total: int = 0
