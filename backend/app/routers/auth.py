"""Authentication router"""
import logging
from datetime import UTC, timedelta
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import settings
from app.core.deps import get_current_user, get_db, get_user_permissions
from app.core.rate_limit import enforce_login_rate_limit
from app.core.request_context import client_ip_hash, request_device
from app.db.session import utcnow
from app.models.user import User
from app.models.user_session import UserSession
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    ResetPasswordRequest,
    TokenResponse,
    MFAConfirmResponse,
    MFASetupResponse,
    MFATicketRequest,
    MFAVerifyRequest,
)
from app.schemas.user import UserMeResponse, UserResponse
from app.services.audit_service import log_action
from app.services import mfa_service

router = APIRouter(prefix="/auth", tags=["Authentication"])

logger = logging.getLogger(__name__)


def _credentials_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Tu sesión expiró. Vuelve a iniciar sesión.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _issue_session_tokens(user: User, session: UserSession) -> TokenResponse:
    """Issue access/refresh JWTs bound to one persistent session."""
    access_token = security.create_access_token(
        data={"sub": str(user.id), "role": user.role.value, "sid": session.id}
    )
    refresh_token = security.create_refresh_token(
        data={"sub": str(user.id), "sid": session.id, "jti": session.refresh_jti}
    )
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        must_change_password=user.must_change_password,
    )


def _create_session(db: Session, user: User, request: Request) -> UserSession:
    device_label, user_agent_hash = request_device(request)
    session = UserSession(
        id=str(uuid4()),
        user_id=user.id,
        tenant_id=user.tenant_id,
        refresh_jti=str(uuid4()),
        expires_at=utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        ip_hash=client_ip_hash(request),
        device_label=device_label,
        user_agent_hash=user_agent_hash,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    log_action(
        db,
        action="auth.session_created",
        entity_type="user_session",
        actor_user_id=user.id,
        tenant_id=user.tenant_id,
        details={"session_id": session.id},
        request=request,
    )
    return session


def _ticket_user(db: Session, ticket: str, purpose: str) -> User:
    try:
        user_id = mfa_service.decode_ticket(ticket, purpose)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Desafío MFA inválido o vencido") from exc
    user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
    if user is None:
        raise HTTPException(status_code=401, detail="Usuario no disponible")
    return user


def _revoke_user_sessions(db: Session, user_id: int) -> None:
    """Revoke every still-active device session for an account."""
    db.query(UserSession).filter(
        UserSession.user_id == user_id,
        UserSession.revoked_at.is_(None),
    ).update({UserSession.revoked_at: utcnow()}, synchronize_session=False)


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(enforce_login_rate_limit)])
def login(credentials: LoginRequest, request: Request, db: Annotated[Session, Depends(get_db)]):
    """
    Authenticate user and return JWT token

    Rate-limited per client IP (see app.core.rate_limit) to blunt brute-force
    password guessing - counts both failed and successful attempts.

    Args:
        credentials: Email and password
        db: Database session

    Returns:
        JWT access token

    Raises:
        HTTPException: If credentials are invalid, or 429 if rate-limited
    """
    # Find user by email
    user = db.query(User).filter(User.email == credentials.email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify password
    if not security.verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Tu usuario está desactivado. Contacta al administrador.")

    if user.role.value in settings.mfa_required_roles:
        purpose = "challenge" if user.mfa_enabled else "setup"
        return TokenResponse(
            mfa_required=True,
            mfa_enrollment_required=not user.mfa_enabled,
            mfa_ticket=mfa_service.create_ticket(user.id, purpose),
        )

    return _issue_session_tokens(user, _create_session(db, user, request))


@router.post("/mfa/setup", response_model=MFASetupResponse, dependencies=[Depends(enforce_login_rate_limit)])
def setup_mfa(payload: MFATicketRequest, db: Annotated[Session, Depends(get_db)]):
    user = _ticket_user(db, payload.mfa_ticket, "setup")
    if user.mfa_enabled:
        raise HTTPException(status_code=409, detail="MFA ya está configurado")
    secret = mfa_service.new_secret()
    user.mfa_secret_encrypted = mfa_service.encrypt_secret(secret)
    db.commit()
    uri = mfa_service.provisioning_uri(secret, user.email)
    return MFASetupResponse(
        mfa_ticket=mfa_service.create_ticket(user.id, "confirm"),
        secret=secret,
        provisioning_uri=uri,
        qr_code_data_url=mfa_service.qr_data_url(uri),
    )


@router.post("/mfa/confirm", response_model=MFAConfirmResponse, dependencies=[Depends(enforce_login_rate_limit)])
def confirm_mfa(
    payload: MFAVerifyRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
):
    user = _ticket_user(db, payload.mfa_ticket, "confirm")
    if not user.mfa_secret_encrypted:
        raise HTTPException(status_code=409, detail="Primero inicia la configuración MFA")
    secret = mfa_service.decrypt_secret(user.mfa_secret_encrypted)
    if not mfa_service.verify_totp(secret, payload.code):
        raise HTTPException(status_code=401, detail="Código de autenticación incorrecto")
    raw_codes, hashed_codes = mfa_service.generate_recovery_codes()
    user.mfa_enabled = True
    user.mfa_recovery_codes = hashed_codes
    user.mfa_enrolled_at = utcnow()
    db.commit()
    session = _create_session(db, user, request)
    tokens = _issue_session_tokens(user, session)
    log_action(
        db,
        action="auth.mfa_enrolled",
        entity_type="user",
        entity_id=user.id,
        actor_user_id=user.id,
        tenant_id=user.tenant_id,
        request=request,
    )
    return MFAConfirmResponse(**tokens.model_dump(), recovery_codes=raw_codes)


@router.post("/mfa/verify", response_model=TokenResponse, dependencies=[Depends(enforce_login_rate_limit)])
def verify_mfa(
    payload: MFAVerifyRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
):
    user = _ticket_user(db, payload.mfa_ticket, "challenge")
    if not user.mfa_enabled or not user.mfa_secret_encrypted:
        raise HTTPException(status_code=409, detail="MFA no está configurado")
    secret = mfa_service.decrypt_secret(user.mfa_secret_encrypted)
    accepted = mfa_service.verify_totp(secret, payload.code)
    recovery_used = False
    if not accepted:
        remaining = mfa_service.consume_recovery_code(payload.code, user.mfa_recovery_codes)
        if remaining is not None:
            user.mfa_recovery_codes = remaining
            recovery_used = True
            accepted = True
    if not accepted:
        log_action(
            db,
            action="auth.mfa_failed",
            entity_type="user",
            entity_id=user.id,
            actor_user_id=user.id,
            tenant_id=user.tenant_id,
            outcome="denied",
            request=request,
        )
        raise HTTPException(status_code=401, detail="Código de autenticación incorrecto")
    db.commit()
    session = _create_session(db, user, request)
    if recovery_used:
        log_action(
            db,
            action="auth.mfa_recovery_used",
            entity_type="user",
            entity_id=user.id,
            actor_user_id=user.id,
            tenant_id=user.tenant_id,
            request=request,
        )
    return _issue_session_tokens(user, session)


@router.post("/refresh", response_model=TokenResponse)
def refresh_access_token(payload: RefreshRequest, db: Annotated[Session, Depends(get_db)]):
    """
    Exchange a valid, non-expired refresh token for a new access+refresh
    token pair, so a user doesn't have to log in again every time the
    short-lived access token expires.

    A new refresh token is issued on every call. The previous token becomes
    unusable immediately; reusing it revokes that device session.

    Args:
        payload: The refresh token to exchange
        db: Database session

    Returns:
        New JWT access + refresh token pair

    Raises:
        HTTPException: If the refresh token is invalid, expired, of the
            wrong type, or the user no longer exists/is inactive
    """
    credentials_exception = _credentials_exception()

    try:
        decoded = jwt.decode(payload.refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError as exc:
        raise credentials_exception from exc

    if decoded.get("type") != "refresh":
        raise credentials_exception

    user_id = decoded.get("sub")
    session_id = decoded.get("sid")
    refresh_jti = decoded.get("jti")
    if user_id is None or not session_id or not refresh_jti:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise credentials_exception

    session = (
        db.query(UserSession)
        .filter(UserSession.id == session_id, UserSession.user_id == user.id)
        .first()
    )
    if session is None or session.revoked_at is not None or session.expires_at <= utcnow():
        raise credentials_exception

    if session.refresh_jti != refresh_jti:
        # A previously rotated refresh token was reused. Treat the device as
        # compromised and require a fresh login.
        session.revoked_at = utcnow()
        db.commit()
        log_action(
            db,
            action="auth.refresh_reuse_detected",
            entity_type="user_session",
            actor_user_id=user.id,
            tenant_id=user.tenant_id,
            details={"session_id": session.id},
        )
        raise credentials_exception

    session.refresh_jti = str(uuid4())
    session.last_used_at = utcnow()
    session.expires_at = utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    db.commit()
    db.refresh(session)
    log_action(
        db,
        action="auth.session_refreshed",
        entity_type="user_session",
        actor_user_id=user.id,
        tenant_id=user.tenant_id,
        details={"session_id": session.id},
    )

    return _issue_session_tokens(user, session)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: LogoutRequest, db: Annotated[Session, Depends(get_db)]):
    """Revoke the current device session using its refresh token."""
    try:
        decoded = jwt.decode(payload.refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None

    if decoded.get("type") != "refresh":
        return None

    session_id = decoded.get("sid")
    refresh_jti = decoded.get("jti")
    if not session_id or not refresh_jti:
        return None

    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if session and session.refresh_jti == refresh_jti and session.revoked_at is None:
        session.revoked_at = utcnow()
        db.commit()
        log_action(
            db,
            action="auth.session_revoked",
            entity_type="user_session",
            actor_user_id=session.user_id,
            tenant_id=session.tenant_id,
            details={"session_id": session.id, "reason": "logout"},
        )

    return None


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Revoke all active sessions for the authenticated account."""
    _revoke_user_sessions(db, current_user.id)
    db.commit()
    log_action(
        db,
        action="auth.sessions_revoked",
        entity_type="user_session",
        actor_user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        details={"reason": "logout_all"},
    )

    return None


@router.get("/me", response_model=UserMeResponse)
def get_current_user_info(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Perfil de la sesion, con los permisos efectivos ya resueltos.

    Los permisos viajan aqui porque es la unica llamada que el frontend hace
    siempre al entrar: sin ellos la pantalla de Master concede permisos que la
    interfaz nunca llega a mirar, que es el defecto B2 del plan maestro.
    """
    perfil = UserMeResponse.model_validate(current_user)
    perfil.permissions = sorted(get_user_permissions(current_user, db))
    return perfil


@router.patch("/me", response_model=UserResponse)
def update_current_user_info(
    payload: dict,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Update current user's own profile fields (personal_email, etc)."""
    allowed = {"personal_email"}
    for key, value in payload.items():
        if key in allowed:
            setattr(current_user, key, value if value else None)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/change-password", status_code=status.HTTP_200_OK)
def change_password(
    payload: "ChangePasswordRequest",
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Change password for the currently authenticated user."""

    if not security.verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual es incorrecta",
        )

    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe tener al menos 8 caracteres",
        )

    if security.verify_password(payload.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña no puede ser igual a la actual",
        )

    current_user.hashed_password = security.get_password_hash(payload.new_password)
    current_user.must_change_password = False
    _revoke_user_sessions(db, current_user.id)
    db.commit()

    # Audit log
    try:
        from app.services.audit_service import log_action
        log_action(
            db,
            action="password.changed",
            entity_type="user",
            actor_user_id=current_user.id,
            entity_id=current_user.id,
            tenant_id=current_user.tenant_id,
            details={"email": current_user.email},
        )
    except Exception:
        pass  # non-critical — don't fail the request if audit log fails

    return {"message": "Contraseña actualizada correctamente"}


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Annotated[Session, Depends(get_db)],
):
    """Send a password reset email with a time-limited token."""
    from app.models.password_reset_token import PasswordResetToken

    user = db.query(User).filter(User.email == payload.email, User.is_active.is_(True)).first()
    if not user:
        # Don't reveal whether the email exists (security)
        return {"message": "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña."}

    # Generate unique token
    import secrets
    token = secrets.token_urlsafe(32)

    # Expire in 1 hour
    from datetime import datetime, timedelta
    expires_at = datetime.now(UTC) + timedelta(hours=1)

    reset_token = PasswordResetToken(
        user_id=user.id,
        token=token,
        expires_at=expires_at,
    )
    db.add(reset_token)
    db.commit()

    # Send email
    reset_link = f"{settings.FRONTEND_URL.rstrip('/')}/#/reset-password?token={token}"
    try:
        from app.services.email_service import send_email
        from app.services.email_templates import forgot_password as fp_template
        from app.services.email_templates import get_clinic_info
        clinic = get_clinic_info(db, tenant_id=user.tenant_id)
        body_text = f"Hola {user.full_name}, restablece tu contraseña aquí: {reset_link}"
        body_html = fp_template(clinic, reset_link, user.full_name)
        send_email(
            to_email=user.email,
            subject="Restablecer tu contraseña — G.E.M.S",
            body_text=body_text,
            body_html=body_html,
        )
    except Exception:
        logger.exception("No se pudo enviar el correo de restablecimiento de contrasena")

    return {"message": "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña."}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(
    payload: ResetPasswordRequest,
    db: Annotated[Session, Depends(get_db)],
):
    """Reset password using a valid token."""
    from datetime import datetime

    from app.models.password_reset_token import PasswordResetToken

    reset_token = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token == payload.token, PasswordResetToken.used.is_(False))
        .first()
    )
    if not reset_token:
        raise HTTPException(status_code=400, detail="Token inválido o ya utilizado")

    if reset_token.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        raise HTTPException(status_code=400, detail="El enlace ha expirado. Solicita uno nuevo.")

    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 8 caracteres")

    user = db.query(User).filter(User.id == reset_token.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    user.hashed_password = security.get_password_hash(payload.new_password)
    user.must_change_password = False
    reset_token.used = True
    _revoke_user_sessions(db, user.id)
    db.commit()

    return {"message": "Contraseña actualizada correctamente. Ya puedes iniciar sesión."}
