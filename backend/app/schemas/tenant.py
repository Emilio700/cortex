"""Tenant schemas"""
from datetime import datetime

import re

from pydantic import BaseModel, EmailStr, Field, field_validator

# Tres a cinco letras sin acentos: va impreso en cada folio (GYG-REC-2026-0042).
_CODIGO_FOLIO = re.compile(r"^[A-Z]{2,5}$")


class _TenantTextFields(BaseModel):
    """Normaliza los campos de texto de una sucursal (vacío -> None)."""

    @field_validator("name", "address", "phone", mode="before", check_fields=False)
    @classmethod
    def strip_text(cls, value):
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @field_validator("codigo_folio", mode="before", check_fields=False)
    @classmethod
    def validar_codigo_folio(cls, value):
        if value is None:
            return None
        value = str(value).strip().upper()
        if not value:
            return None
        if not _CODIGO_FOLIO.match(value):
            raise ValueError("El código de folio lleva de 2 a 5 letras, sin acentos ni números (p. ej. GYG).")
        return value


class TenantCreate(_TenantTextFields):
    """Datos para dar de alta una sucursal."""

    name: str = Field(min_length=3, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    codigo_folio: str | None = None


class TenantUpdate(_TenantTextFields):
    """Campos editables de una sucursal. Todos opcionales (actualización parcial)."""

    name: str | None = Field(default=None, min_length=3, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    phone: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    codigo_folio: str | None = None


class TenantStatusUpdate(BaseModel):
    """Activación o desactivación de una sucursal (no existe borrado físico)."""

    is_active: bool


class TenantResponse(BaseModel):
    id: int
    name: str
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    codigo_folio: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TenantSwitchResponse(BaseModel):
    """Tokens renovados tras cambiar de sucursal."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    tenant_id: int
    tenant_name: str
