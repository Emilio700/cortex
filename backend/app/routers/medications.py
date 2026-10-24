"""
Medication search router — endpoints for searching medications via OpenFDA
API + local cache, and administrating the cache.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_permission
from app.models.user import User
from app.schemas.medication import MedicationSearchResult
from app.services.medication_service import search_medications, cache_openfda_results

import json
from functools import lru_cache
from pathlib import Path

RUTA_VADEMECARIO = Path(__file__).resolve().parent.parent / "data" / "vademecario.json"


@lru_cache(maxsize=1)
def _cargar_vademecario() -> list[dict]:
    """Se lee una sola vez: es un archivo fijo de 315 entradas."""
    with RUTA_VADEMECARIO.open(encoding="utf-8") as archivo:
        return json.load(archivo)


router = APIRouter(prefix="/medications", tags=["Medications"])


@router.get("/search", response_model=MedicationSearchResult)
async def search_medications_endpoint(
    q: str = Query(..., min_length=2, description="Search query (brand or generic name)"),
    limit: int = Query(20, ge=1, le=50, description="Max results"),
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("medications.search")),
):
    """Search for medications by brand name, generic name, or active ingredient.

    Results come from the local cache first; if few results are found, the
    service fetches from OpenFDA API and caches them on the fly.
    """
    result = await search_medications(db, query=q, limit=limit)
    return result


@router.post("/sync", response_model=dict)
async def sync_medications(
    q: str = Query(..., min_length=2, description="Query to fetch from OpenFDA"),
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("medications.search")),
):
    """Force-fetch medications from OpenFDA for a given query and cache them.

    Useful as a one-off admin action or after a MASTER user adds known
    medication terms. Returns the number of newly cached entries.
    """
    new_count = await cache_openfda_results(db, q)
    return {"message": "Sincronización completada", "new_entries": new_count, "query": q}


@router.get("/frecuentes", response_model=list[dict])
def medicamentos_frecuentes(
    current_user: Annotated[User, Depends(get_current_user)],
    limite: int = Query(60, ge=1, le=315, description="Cuantos devolver"),
):
    """Vademecario del consultorio, ordenado por lo que mas se receta.

    Sale de las 24 750 recetas del sistema anterior: son los medicamentos que
    el doctor usa de verdad, no un catalogo generico. Evita que tenga que
    teclear cada vez lo que receta a diario.
    """
    return _cargar_vademecario()[:limite]
