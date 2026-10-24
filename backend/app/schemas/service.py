"""Service catalog Pydantic schemas"""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, field_validator

from app.utils.sanitize import sanitize_text


class ServiceBase(BaseModel):
    """Base service schema"""

    name: str
    description: Optional[str] = None
    price: Decimal
    duration_minutes: Optional[int] = None

    @field_validator("name")
    @classmethod
    def _sanitize_name(cls, v: str) -> str:
        return sanitize_text(v, max_length=200)

    @field_validator("price")
    @classmethod
    def _validate_price(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("Price cannot be negative")
        return v

    @field_validator("duration_minutes")
    @classmethod
    def _validate_duration(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v <= 0:
            raise ValueError("Duration must be positive")
        return v


class ServiceCreate(ServiceBase):
    """Service creation schema"""

    pass


class ServiceUpdate(BaseModel):
    """Service update schema - all fields optional"""

    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[Decimal] = None
    duration_minutes: Optional[int] = None
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def _sanitize_name(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_text(v, max_length=200) if v else v

    @field_validator("price")
    @classmethod
    def _validate_price(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and v < 0:
            raise ValueError("Price cannot be negative")
        return v


class ServiceResponse(ServiceBase):
    """Service response schema"""

    id: int
    tenant_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
