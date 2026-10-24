"""Unit tests for password hashing and JWT creation."""
from jose import jwt

from app.core import security
from app.core.config import settings


def test_password_hash_roundtrip():
    hashed = security.get_password_hash("s3cret-pass")
    assert hashed != "s3cret-pass"  # never store plaintext
    assert security.verify_password("s3cret-pass", hashed) is True
    assert security.verify_password("wrong-pass", hashed) is False


def test_access_token_encodes_subject_and_role():
    token = security.create_access_token(data={"sub": "42", "role": "doctor", "sid": "session-1"})
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    assert payload["sub"] == "42"
    assert payload["role"] == "doctor"
    assert payload["sid"] == "session-1"
    assert payload["type"] == "access"
    assert "exp" in payload


def test_refresh_token_encodes_session_and_rotation_identifier():
    token = security.create_refresh_token(data={"sub": "42", "sid": "session-1", "jti": "rotation-1"})
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    assert payload["type"] == "refresh"
    assert payload["sid"] == "session-1"
    assert payload["jti"] == "rotation-1"
