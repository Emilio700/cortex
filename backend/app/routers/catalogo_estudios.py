"""Catalogo de estudios de imagen del laboratorio con el que trabaja la clinica.

Sale del formato de solicitud en papel que usa el consultorio (Imagenes
Diagnosticas de Mazatlan). Tenerlo estructurado evita que el doctor teclee a
mano el nombre de cada estudio y que luego el laboratorio reciba variantes
del mismo texto.
"""
import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/catalogo-estudios", tags=["Catalogo de estudios"])

RUTA_CATALOGO = Path(__file__).resolve().parent.parent / "data" / "catalogo_estudios.json"


@lru_cache(maxsize=1)
def cargar_catalogo() -> dict:
    """Se lee una sola vez: es un archivo fijo."""
    with RUTA_CATALOGO.open(encoding="utf-8") as archivo:
        return json.load(archivo)


@router.get("", response_model=dict)
def obtener_catalogo(current_user: Annotated[User, Depends(get_current_user)]):
    """Grupos de estudios con sus modificadores y si piden region o lateralidad."""
    return cargar_catalogo()
