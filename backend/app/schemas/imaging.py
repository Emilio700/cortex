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
    # Archivos del disco que no son imágenes (DICOMDIR, autorun, un lector).
    # Se informan, pero no vuelven el estudio «incompleto».
    archivos_ajenos: int = 0
    mensajes: list[str] = []


class ComparisonCandidateOut(BaseModel):
    study: ImagingStudyOut
    avisos: list[str] = []


# ── Cortes clave ────────────────────────────────────────────────────────────


class KeyImageViewState(BaseModel):
    """Cómo se veía el corte al marcarlo. Los campos desconocidos se descartan."""

    wc: Optional[float] = None
    ww: Optional[float] = Field(default=None, gt=0)
    zoom: Optional[float] = Field(default=None, gt=0, le=100)
    rotation: Optional[float] = Field(default=None, ge=-360, le=360)
    flip_h: bool = False
    flip_v: bool = False
    invert: bool = False


class ImagingKeyImageOut(BaseModel):
    id: int
    study_id: int
    series_id: int
    series_description: Optional[str] = None
    instance_index: int
    sop_instance_uid: Optional[str] = None
    label: Optional[str] = None
    notes: Optional[str] = None
    view_state: dict = {}
    has_image: bool = False
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None


class ImagingKeyImageUpdate(BaseModel):
    label: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = Field(default=None, max_length=2000)


class ExportPdfRequest(BaseModel):
    # Vacío = todos los cortes clave que tengan captura.
    key_image_ids: list[int] = []
    # Sin nombre ni fecha de nacimiento, para mandarla a un colega.
    anonimo: bool = False


# ── Enlaces temporales ──────────────────────────────────────────────────────


class ShareLinkCreate(BaseModel):
    # Hasta una semana: un enlace que no vence deja de ser «temporal».
    hours: int = Field(ge=1, le=168)
    note: Optional[str] = Field(default=None, max_length=160)
    # Sin esta confirmación no se crea: queda registrada con fecha y autor.
    consent_confirmed: bool


class ShareLinkOut(BaseModel):
    id: int
    recipient_note: Optional[str] = None
    created_at: datetime
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    access_count: int = 0
    last_access_at: Optional[datetime] = None
    created_by: Optional[str] = None
    # activo | vencido | revocado
    estado: str


class ShareLinkCreatedOut(ShareLinkOut):
    # El token en claro sólo existe en esta respuesta; en la base queda su hash.
    token: str
    avisos: list[str] = []


class SharedSeriesOut(BaseModel):
    id: int
    series_number: int
    series_description: Optional[str] = None
    sequence_label: Optional[str] = None
    modality: str
    instance_count: int


class SharedStudyOut(BaseModel):
    """Lo único que ve quien abre el enlace. Sin paciente, sin institución."""

    modality: str
    study_date: datetime
    study_description: Optional[str] = None
    body_part: Optional[str] = None
    series: list[SharedSeriesOut] = []
    expires_at: datetime
    aviso: str
