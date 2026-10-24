"""Unit tests for consent template, signature and permission contracts."""

import base64

import pytest
from fastapi import HTTPException

from app.models.clinical_consent import ConsentType
from app.models.permission import ROLE_DEFAULT_PERMISSIONS
from app.routers.clinical_consents import _decode_signature
from app.schemas.clinical_consent import ClinicalConsentSign
from app.services.consent_templates import get_template, list_templates

VALID_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def test_all_received_consent_categories_have_a_versioned_template():
    templates = list_templates()
    assert len(templates) == len(ConsentType)
    assert get_template(ConsentType.CESAREAN).allows_transfusion_choice is True
    assert get_template(ConsentType.CONDYLOMAS_OFFICE).allows_photos is True


def test_signature_accepts_only_a_real_png_data_url():
    encoded = "data:image/png;base64," + base64.b64encode(VALID_PNG).decode()
    assert _decode_signature(encoded) == VALID_PNG
    with pytest.raises(HTTPException, match="PNG"):
        _decode_signature("data:image/jpeg;base64," + base64.b64encode(VALID_PNG).decode())
    with pytest.raises(HTTPException, match="PNG"):
        malformed = b"\x89PNG\r\n\x1a\nminimal"
        _decode_signature("data:image/png;base64," + base64.b64encode(malformed).decode())


def test_signature_contract_rejects_empty_patient_name():
    with pytest.raises(ValueError):
        ClinicalConsentSign(
            patient_signed_name="", signature_data_url="x" * 50, acknowledgements=["ok"]
        )


def test_only_doctors_receive_default_consent_writing_permissions():
    permissions = ROLE_DEFAULT_PERMISSIONS["doctor"]
    assert {
        "clinical_consents.read",
        "clinical_consents.create",
        "clinical_consents.sign",
        "clinical_consents.revoke",
    }.issubset(permissions)
    assert "clinical_consents.sign" not in ROLE_DEFAULT_PERMISSIONS["secretaria"]
