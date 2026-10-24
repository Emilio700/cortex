import pyotp

from app.services import mfa_service


def test_totp_secret_is_encrypted_and_verifiable():
    secret = mfa_service.new_secret()
    encrypted = mfa_service.encrypt_secret(secret)
    assert secret not in encrypted
    assert mfa_service.decrypt_secret(encrypted) == secret
    assert mfa_service.verify_totp(secret, pyotp.TOTP(secret).now())


def test_mfa_ticket_is_scoped_to_purpose():
    ticket = mfa_service.create_ticket(42, "challenge")
    assert mfa_service.decode_ticket(ticket, "challenge") == 42
    try:
        mfa_service.decode_ticket(ticket, "confirm")
    except ValueError:
        pass
    else:
        raise AssertionError("A challenge ticket must not confirm enrollment")


def test_recovery_code_is_consumed_once():
    raw, hashes = mfa_service.generate_recovery_codes(2)
    remaining = mfa_service.consume_recovery_code(raw[0], hashes)
    assert remaining is not None and len(remaining) == 1
    assert mfa_service.consume_recovery_code(raw[0], remaining) is None


def test_mfa_is_disabled_by_default_and_can_be_reenabled(monkeypatch):
    """MFA queda apagado por configuracion, pero se reactiva sin tocar codigo."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "MFA_REQUIRED_ROLES", "", raising=False)
    assert settings.mfa_required_roles == set()

    monkeypatch.setattr(settings, "MFA_REQUIRED_ROLES", "master, admin ,doctor,", raising=False)
    assert settings.mfa_required_roles == {"master", "admin", "doctor"}
