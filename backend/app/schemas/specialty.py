"""Schemas for Specialty (Fase 6.1)"""
from typing import Optional

from pydantic import BaseModel, Field


class SpecialtyBase(BaseModel):
    name: str = Field(max_length=200)
    description: Optional[str] = None


class SpecialtyCreate(SpecialtyBase):
    pass


class SpecialtyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = None
    is_active: Optional[bool] = None


class SpecialtyResponse(SpecialtyBase):
    id: int
    slug: str
    is_active: bool

    class Config:
        from_attributes = True
