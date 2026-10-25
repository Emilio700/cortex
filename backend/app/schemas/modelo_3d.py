"""Esquemas del modelo 3D del paciente (Cortex, feat/modelo-3d-desde-tc)."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class Modelo3DOut(BaseModel):
    id: int
    patient_id: int
    study_id: int
    series_id: int
    region: str
    estado: str
    motivo_fallo: Optional[str] = None
    estructuras: Optional[int] = None
    motor: Optional[str] = None
    motor_version: Optional[str] = None
    sintetico: bool = False
    solicitado_por: Optional[str] = None
    solicitado_en: datetime
    terminado_en: Optional[datetime] = None
    confirmado_por: Optional[str] = None
    confirmado_en: Optional[datetime] = None
    # Para el selector de Neuro 3D: de qué estudio y serie salió, en palabras.
    estudio_fecha: Optional[datetime] = None
    estudio_descripcion: Optional[str] = None
    serie_descripcion: Optional[str] = None
    modalidad: Optional[str] = None
