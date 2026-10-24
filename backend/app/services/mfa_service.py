"""TOTP enrollment, verification and one-time recovery codes."""

import base64
import hashlib
import io
import secrets
from datetime import UTC, datetime, timedelta

import pyotp
import qrcode
from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt

from app.core.config import settings


def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key)


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(encrypted: str) -> str:
    try:
        return _fernet().decrypt(encrypted.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("MFA secret cannot be decrypted") from exc


def create_ticket(user_id: int, purpose: str, minutes: int = 10) -> str:
    payload = {
        "sub": str(user_id),
        "type": "mfa_ticket",
        "purpose": purpose,
        "exp": datetime.now(UTC) + timedelta(minutes=minutes),
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_ticket(ticket: str, purpose: str) -> int:
    try:
        payload = jwt.decode(ticket, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError as exc:
        raise ValueError("Invalid or expired MFA ticket") from exc
    if payload.get("type") != "mfa_ticket" or payload.get("purpose") != purpose:
        raise ValueError("Invalid MFA ticket purpose")
    return int(payload["sub"])


def new_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=settings.MFA_ISSUER)


def qr_data_url(uri: str) -> str:
    image = qrcode.make(uri)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()


def verify_totp(secret: str, code: str) -> bool:
    normalized = "".join(character for character in code if character.isdigit())
    return len(normalized) == 6 and pyotp.TOTP(secret).verify(normalized, valid_window=1)


def generate_recovery_codes(count: int = 8) -> tuple[list[str], list[str]]:
    raw = [secrets.token_hex(12).upper() for _ in range(count)]
    hashed = [hashlib.sha256(code.encode()).hexdigest() for code in raw]
    return raw, hashed


def consume_recovery_code(code: str, hashes: list[str] | None) -> list[str] | None:
    digest = hashlib.sha256(code.strip().upper().encode()).hexdigest()
    available = list(hashes or [])
    for index, stored in enumerate(available):
        if secrets.compare_digest(digest, stored):
            available.pop(index)
            return available
    return None
