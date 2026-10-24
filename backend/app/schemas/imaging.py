"""Esquemas de los estudios de imagen.

Lo que sale hacia el visor es deliberadamente pequeño: la serie, su etiqueta y
cuántos cortes tiene. Los cortes se piden uno por uno contra su endpoint.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ImagingAnnotationCreate(BaseModel):
    kind: str = Field(max_length=24)
    geometry: dict
    series_id: Optional[int] = None
    value: Optional[float] = None
    unit: Optional[str] = Field(default=None, max_length=16)
    label: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = None


class ImagingAnnotationOut(BaseModel):
    id: int
    kind: str
    series_id: Optional[int]
    value: Optional[float]
    unit: Optional[str]
    label: Optional[str]
    notes: Optional[str]
    is_confirmed: bool
    created_at: datetime
    created_by: Optional[str] = None

    class Config:
        from_attributes = True


class ImagingSeriesOut(BaseModel):
    id: int
    series_instance_uid: str
    series_number: int
    modality: str
    series_description: Optional[str]
    sequence_label: Optional[str]
    sequence_detected_by: Optional[str]
    instance_count: int
    rows: Optional[int]
    columns: Optional[int]
    pixel_spacing_x: Optional[float]
    pixel_spacing_y: Optional[float]
    slice_thickness: Optional[float]
    has_geometry: bool
    is_derived: bool
    total_bytes: int

    class Config:
        from_attributes = True


class ImagingStudyOut(BaseModel):
    id: int
    patient_id: int
    study_instance_uid: str
    modality: str
    study_date: datetime
    study_description: Optional[str]
    body_part: Optional[str]
    institution_name: Optional[str]
    status: str
    status_detail: Optional[str]
    series_count: int
    instance_count: int
    total_bytes: int
    has_contrast: Optional[bool]
    created_at: datetime

    class Config:
        from_attributes = True


class ImagingStudyDetailOut(ImagingStudyOut):
    series: list[ImagingSeriesOut] = []
    annotations: list[ImagingAnnotationOut] = []
    warnings: list[str] = []


class ImagingStudyCreatedOut(BaseModel):
    id: int
    study_instance_uid: str
    modality: str
    study_date: datetime
    series_count: int
    instance_count: int
    total_bytes: int
    status: str
    status_detail: Optional[str] = None


class ImagingUploadResult(BaseModel):
    creados: list[ImagingStudyCreatedOut] = []
    ya_existentes: list[int] = []
    archivos_leidos: int = 0
    archivos_descartados: int = 0
    mensajes: list[str] = []


class ComparisonCandidateOut(BaseModel):
    study: ImagingStudyOut
    avisos: list[str] = []
