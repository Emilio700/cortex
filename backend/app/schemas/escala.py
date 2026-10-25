"""Esquemas de las escalas neurológicas aplicadas (Cortex).

El alta **no trae puntaje**: lo calcula el servidor. Si el navegador lo manda
de todos modos, Pydantic lo ignora (los modelos no aceptan campos de más como
dato) y se guarda el que calculó ``services/escalas.py``.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class EscalaAplicadaCreate(BaseModel):
    escala: str = Field(min_length=1, max_length=40)
    # La versión con la que la pantalla armó el formulario. Si no es la del
    # servidor, las respuestas podrían significar otra cosa: se rechaza.
    version_escala: str = Field(min_length=1, max_length=20)
    respuestas: dict[str, str]
    appointment_id: Optional[int] = None
    aplicada_en: Optional[datetime] = None
    notas: Optional[str] = Field(default=None, max_length=2000)


class EscalaAnular(BaseModel):
    motivo: str = Field(min_length=5, max_length=500)


class EscalaAplicadaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int
    appointment_id: Optional[int] = None
    doctor_id: int
    escala: str
    version_escala: str
    respuestas: dict[str, str]
    puntaje: Optional[float] = None
    interpretacion: Optional[str] = None
    detalle: Optional[str] = None
    notas: Optional[str] = None
    aplicada_en: datetime
    created_by_user_id: int
    created_at: datetime
    anulado_at: Optional[datetime] = None
    anulado_por_user_id: Optional[int] = None
    anulado_motivo: Optional[str] = None
    # Derivados para pintar, no se guardan: el color de la interpretación y
    # los avisos (secciones omitidas, ítems «UN»). Con una versión de escala
    # que ya no existe se dejan neutros en vez de recalcular con otras reglas.
    tono: str = "neutral"
    avisos: list[str] = []
