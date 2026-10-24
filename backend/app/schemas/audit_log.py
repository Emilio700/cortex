"""Administrative audit trail responses."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class AuditLogItem(BaseModel):
    id: int
    actor_user_id: int | None
    actor_name: str | None = None
    action: str
    entity_type: str
    entity_id: int | None
    patient_id: int | None
    # Nombre de la paciente para leer la bitácora sin buscar el número
    # (plan 29, lote 5). Solo la de la misma sucursal (Master, todas).
    patient_name: str | None = None
    outcome: str
    ip_anonymized: str | None = None
    device_label: str | None
    reason: str | None
    details: dict[str, Any] | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuditLogPage(BaseModel):
    items: list[AuditLogItem]
    total: int
    skip: int
    limit: int


class AccesoSeccion(BaseModel):
    seccion: str
    veces: int
    primer_acceso: datetime
    ultimo_acceso: datetime


class AccesoSesionItem(BaseModel):
    """Lo que una persona abrió del expediente de una paciente en una sesión."""

    # Recortado: identifica la sesión al leer sin exponer el id completo.
    sesion: str
    user_id: int
    user_name: str | None = None
    patient_id: int
    patient_name: str | None = None
    device_label: str | None = None
    primer_acceso: datetime
    ultimo_acceso: datetime
    secciones: list[AccesoSeccion]


class AccesoSesionPage(BaseModel):
    items: list[AccesoSesionItem]
    total: int
    skip: int
    limit: int


class FolioItem(BaseModel):
    folio: str
    tipo: str
    tipo_nombre: str
    patient_id: int | None = None
    patient_name: str | None = None
    emitted_by_name: str | None = None
    emitted_at: datetime | None = None
    entity_type: str | None = None
    entity_id: int | None = None
    # ``False`` si es un folio de antes de la 1.2.0, encontrado en el documento.
    homologado: bool = True


class FolioPage(BaseModel):
    items: list[FolioItem]
    total: int
    skip: int
    limit: int
