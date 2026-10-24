"""Pydantic schemas for CustomRole management"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CustomRoleBase(BaseModel):
    """Base schema for a custom role"""
    name: str = Field(..., min_length=1, max_length=50, description="Unique role name within the tenant")
    base_role: str = Field(..., description="System role to inherit permissions from (admin/secretaria/doctor)")
    description: Optional[str] = Field(None, max_length=500)


class CustomRoleCreate(CustomRoleBase):
    """Schema for creating a new custom role"""
    pass


class CustomRoleUpdate(BaseModel):
    """Schema for updating a custom role"""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    base_role: Optional[str] = None
    description: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class CustomRoleResponse(CustomRoleBase):
    """Schema for custom role response"""
    id: int
    tenant_id: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CustomRoleWithUserCount(CustomRoleResponse):
    """Custom role with number of users assigned"""
    user_count: int = 0


class SystemRoleInfo(BaseModel):
    """Information about a system role"""
    name: str
    label: str
    is_system: bool = True
    user_count: int = 0


class RoleAssignmentUpdate(BaseModel):
    """Update a user's role assignment (to system or custom role)"""
    user_id: int
    role: str  # System role name or custom role name
