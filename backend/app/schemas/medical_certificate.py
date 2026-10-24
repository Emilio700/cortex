"""Medical Certificate schemas"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


# Certificate type enum (matches model)
class CertificateType(str):
    """Certificate type enum for schemas"""

    SICK_LEAVE = "sick_leave"
    FITNESS = "fitness"
    OTHER = "other"


# Base schema
class MedicalCertificateBase(BaseModel):
    """Base medical certificate schema"""

    certificate_type: str
    diagnosis: str
    days_off: Optional[int] = None
    notes: Optional[str] = None

    @field_validator("certificate_type")
    @classmethod
    def validate_certificate_type(cls, v: str) -> str:
        """Validate certificate type"""
        valid_types = [CertificateType.SICK_LEAVE, CertificateType.FITNESS, CertificateType.OTHER]
        if v not in valid_types:
            raise ValueError(f"Certificate type must be one of {valid_types}")
        return v

    @field_validator("days_off")
    @classmethod
    def validate_days_off(cls, v: Optional[int], info) -> Optional[int]:
        """Validate days_off is required for sick leave"""
        certificate_type = info.data.get("certificate_type")
        if certificate_type == CertificateType.SICK_LEAVE and (v is None or v <= 0):
            raise ValueError("Days off must be greater than 0 for sick leave certificates")
        return v


# Create schema
class MedicalCertificateCreate(MedicalCertificateBase):
    """Schema for creating medical certificate"""

    appointment_id: int
    patient_id: int


# Update schema
class MedicalCertificateUpdate(BaseModel):
    """Schema for updating medical certificate"""

    certificate_type: Optional[str] = None
    diagnosis: Optional[str] = None
    days_off: Optional[int] = None
    notes: Optional[str] = None


# Response schema
class MedicalCertificateResponse(MedicalCertificateBase):
    """Schema for medical certificate response"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    appointment_id: int
    patient_id: int
    doctor_id: int
    tenant_id: int
    folio_number: Optional[str] = None
    created_at: datetime
    updated_at: datetime
