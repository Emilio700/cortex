"""Unit tests for clinical-image safety contracts."""

from app.models.permission import ROLE_DEFAULT_PERMISSIONS
from app.schemas.clinical_image import ClinicalImageUpdate
from app.utils.uploads import ALLOWED_IMAGE_MIME_TYPES, sniff_mime_type


def test_clinical_images_require_explicit_doctor_permissions():
    permissions = ROLE_DEFAULT_PERMISSIONS["doctor"]
    assert {
        "clinical_images.read",
        "clinical_images.upload",
        "clinical_images.update",
    }.issubset(permissions)
    assert "clinical_images.upload" not in ROLE_DEFAULT_PERMISSIONS["secretaria"]


def test_clinical_image_update_sanitizes_text_and_keeps_archive_explicit():
    image = ClinicalImageUpdate(caption="  Comparativo\x00  ", is_archived=True)
    assert image.caption == "Comparativo"
    assert image.is_archived is True


def test_only_real_jpeg_or_png_signatures_are_accepted_for_images():
    assert sniff_mime_type(b"\xff\xd8\xfftest") in ALLOWED_IMAGE_MIME_TYPES
    assert sniff_mime_type(b"\x89PNG\r\n\x1a\ntest") in ALLOWED_IMAGE_MIME_TYPES
    assert sniff_mime_type(b"%PDF-document") not in ALLOWED_IMAGE_MIME_TYPES
