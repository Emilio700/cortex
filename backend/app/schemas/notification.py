"""Notification Pydantic schemas"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class NotificationResponse(BaseModel):
    """A single in-app notification"""

    id: int
    type: str
    title: str
    message: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    is_read: bool
    created_at: datetime
    # Plan 27, Fase 1. La prioridad la decide el servidor (registro de tipos):
    # el frontend ya no mantiene su propia lista de tipos que «se asoman».
    priority: str = "informativo"
    resolved_at: Optional[datetime] = None
    # «auto» (el servidor vio el hecho), «descartado» o «migracion».
    resolution: Optional[str] = None
    resolved_by_name: Optional[str] = None
    # Pantalla del «Ir» para quien pide la lista, o nula si no puede abrir
    # ninguna: el frontend no inventa destinos.
    ruta: Optional[str] = None
    # Un médico en dos sucursales recibe avisos de ambas: el de la sucursal
    # que no tiene activa dice de cuál es y no ofrece «Ir» (la pantalla le
    # respondería «no se encontró» hasta que cambie de sucursal).
    tenant_id: Optional[int] = None
    de_otra_sucursal: bool = False
    sucursal: Optional[str] = None

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    """Notification inbox: recent items plus the unread count for a badge"""

    unread_count: int
    # Accionables y urgentes sin resolver: el número rojo de la campana.
    abiertos_count: int = 0
    total: int = 0
    items: list[NotificationResponse]


class AbiertosPorPrioridad(BaseModel):
    accionable: int = 0
    urgente: int = 0


class NotificationEstado(BaseModel):
    """Lo mínimo para saber si hay que volver a pedir la lista (§3.5)."""

    sin_leer: int
    abiertos: AbiertosPorPrioridad
    # Cambia cuando llega un aviso nuevo...
    ultimo_id: Optional[int] = None
    # ...o cuando se resuelve uno (cobró otra asistente, se atendió).
    ultima_resolucion: Optional[datetime] = None
    hora_servidor: datetime


class NotificationPreferences(BaseModel):
    sonido: bool = False
    navegador: bool = False
    recordatorio_una_hora: bool = False
    tipos_silenciados: list[str] = Field(default_factory=list)
    # Sólo lectura: qué tipos se pueden silenciar (los informativos).
    tipos_silenciables: list[str] = Field(default_factory=list)


class NotificationPreferencesUpdate(BaseModel):
    sonido: Optional[bool] = None
    navegador: Optional[bool] = None
    recordatorio_una_hora: Optional[bool] = None
    tipos_silenciados: Optional[list[str]] = None
