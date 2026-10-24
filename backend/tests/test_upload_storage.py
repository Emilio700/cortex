"""File validation and durable local-storage contracts."""

import base64

import pytest
from fastapi import HTTPException, UploadFile

from app.core.storage import LocalStorageBackend
from app.utils.uploads import (
    ALLOWED_DOCUMENT_MIME_TYPES,
    MAX_DOCUMENT_SIZE_BYTES,
    extension_for_mime,
    read_and_validate_upload,
)

VALID_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)
VALID_PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


@pytest.mark.asyncio
async def test_upload_uses_detected_content_and_rejects_truncated_files():
    upload = UploadFile(filename="engañoso.exe", file=__import__("io").BytesIO(VALID_PNG))
    content, mime = await read_and_validate_upload(
        upload,
        allowed_mime_types=ALLOWED_DOCUMENT_MIME_TYPES,
        max_size_bytes=MAX_DOCUMENT_SIZE_BYTES,
    )
    assert content == VALID_PNG
    assert mime == "image/png"
    assert extension_for_mime(mime) == ".png"

    truncated = UploadFile(filename="resultado.pdf", file=__import__("io").BytesIO(b"%PDF-1.4"))
    with pytest.raises(HTTPException, match="PDF"):
        await read_and_validate_upload(
            truncated,
            allowed_mime_types=ALLOWED_DOCUMENT_MIME_TYPES,
            max_size_bytes=MAX_DOCUMENT_SIZE_BYTES,
        )


def test_local_storage_is_atomic_and_cannot_escape_root(tmp_path):
    storage = LocalStorageBackend(tmp_path)
    storage.save("uploads/patient_documents/report.pdf", VALID_PDF)
    assert storage.read("uploads/patient_documents/report.pdf") == VALID_PDF
    assert not list(tmp_path.rglob("*.tmp"))
    with pytest.raises(ValueError, match="escapes"):
        storage.save("../outside.txt", b"blocked")
