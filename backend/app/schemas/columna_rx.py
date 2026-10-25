"""Esquemas del ajuste de columna desde radiografías (Cortex).

El alta **no trae mediciones**: las calcula el servidor. Los puntos, la escala y
las opciones viajan como JSON y los valida ``services/columna_rx.py``, que da
los errores en español nombrando la vértebra.
"""
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class OrigenDeVista(BaseModel):
    tipo: Literal["imagen_clinica", "serie_dicom"]
    id: int = Field(gt=0)


class ColumnaAjusteRxCreate(BaseModel):
    lateral: Optional[OrigenDeVista] = None
    ap: Optional[OrigenDeVista] = None
    puntos: dict[str, Any]
    calibracion: dict[str, Any]
    opciones: dict[str, Any]
    notas: Optional[str] = Field(default=None, max_length=2000)


class ColumnaAjusteRxAnular(BaseModel):
    motivo: str = Field(min_length=5, max_length=500)


class ColumnaAjusteRxResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int
    doctor_id: int
    lateral_origen: Optional[str] = None
    lateral_origen_id: Optional[int] = None
    ap_origen: Optional[str] = None
    ap_origen_id: Optional[int] = None
    puntos: dict[str, Any]
    calibracion: dict[str, Any]
    opciones: dict[str, Any]
    mediciones: dict[str, Any]
    version_calculo: str
    notas: Optional[str] = None
    created_by_user_id: int
    created_at: datetime
    anulado_at: Optional[datetime] = None
    anulado_por_user_id: Optional[int] = None
    anulado_motivo: Optional[str] = None
