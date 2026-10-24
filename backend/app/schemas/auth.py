"""Authentication schemas"""
from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    """Login request schema"""

    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """JWT token response schema"""

    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str = "bearer"
    must_change_password: bool = False
    mfa_required: bool = False
    mfa_enrollment_required: bool = False
    mfa_ticket: str | None = None


class MFATicketRequest(BaseModel):
    mfa_ticket: str


class MFASetupResponse(BaseModel):
    mfa_ticket: str
    secret: str
    provisioning_uri: str
    qr_code_data_url: str


class MFAVerifyRequest(MFATicketRequest):
    code: str


class MFAConfirmResponse(TokenResponse):
    recovery_codes: list[str] = Field(default_factory=list)


class RefreshRequest(BaseModel):
    """Refresh token request schema"""

    refresh_token: str


class LogoutRequest(BaseModel):
    """Refresh token used to revoke the matching device session."""

    refresh_token: str


class TokenData(BaseModel):
    """Token payload data"""

    user_id: int | None = None


class ChangePasswordRequest(BaseModel):
    """Change password request — user must provide current password"""

    current_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    """Request password reset email"""

    email: str


class ResetPasswordRequest(BaseModel):
    """Reset password using a token"""

    token: str
    new_password: str
