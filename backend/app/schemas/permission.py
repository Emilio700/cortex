"""Pydantic schemas for permission management"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class PermissionBase(BaseModel):
    """Base schema for a permission assignment"""
    role: str = Field(..., min_length=1, max_length=50)
    action: str = Field(..., min_length=1, max_length=100)
    is_granted: bool = True
    user_id: Optional[int] = None


class PermissionCreate(PermissionBase):
    """Schema for creating a new permission override"""
    pass


class PermissionResponse(PermissionBase):
    """Schema for permission response"""
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class PermissionOverride(PermissionBase):
    """Schema for creating/updating a per-user permission override.

    ``role`` is inherited from PermissionBase but is NOT required here: the
    update endpoint always derives the role from the target user, and the
    frontend only sends {user_id, action, is_granted}. Making it optional
    keeps that payload valid instead of failing validation with a 422.
    """
    role: Optional[str] = None
    user_id: int
    action: str
    is_granted: bool


class UserPermissionsResponse(BaseModel):
    """Response with a user's effective permissions"""
    role: str
    role_defaults: list[str]
    overrides: list[PermissionResponse]
    effective_permissions: list[str]


class PermissionUpdateResult(BaseModel):
    """Lo que de verdad quedo guardado tras cambiar los permisos de alguien.

    Un "listo" a secas obliga a la pantalla de Master a suponer el resultado. Si
    el guardado y la pantalla se separan, la interfaz afirma algo que el sistema
    no hizo, que es el error que este proyecto no se permite. Por eso vuelven
    los permisos efectivos resultantes y la version con la que la sesion de esa
    persona va a recargar los suyos.
    """

    detail: str
    permissions_version: int
    effective_permissions: list[str]


class AvailablePermission(BaseModel):
    """An available permission action with its description"""
    action: str
    description: str


class PermissionUpdateRequest(BaseModel):
    """Request to update a user's permission overrides"""
    user_id: int
    overrides: list[PermissionOverride]
