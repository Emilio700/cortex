"""Upload validation helpers shared by every file-upload endpoint.

G.E.M.S has three upload endpoints (patient documents, doctor logo, doctor
signature) and, until now, none of them validated file size or real content
type - they trusted the client-supplied ``Content-Type`` header and had no
size cap at all. This module centralizes that validation so future upload
endpoints get it "for free" instead of re-copying ad-hoc checks.
"""

import io

from fastapi import HTTPException, UploadFile, status
from reportlab.lib.utils import ImageReader
from app.services.antivirus_service import scan_upload

# Magic-byte signatures for the handful of formats G.E.M.S accepts today.
# Order matters only in that more specific signatures should be checked
# before more general ones; none of these currently overlap.
_MAGIC_SIGNATURES: list[tuple[bytes, str]] = [
    (b"%PDF-", "application/pdf"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
]

_EXTENSION_BY_MIME = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
}

ALLOWED_DOCUMENT_MIME_TYPES = {"application/pdf", "image/jpeg", "image/png"}
ALLOWED_IMAGE_MIME_TYPES = {"image/jpeg", "image/png"}

MAX_DOCUMENT_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB - lab results/imaging studies
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB - doctor logo/signature

_READ_CHUNK_SIZE = 1024 * 1024  # 1 MB
MAX_IMAGE_DIMENSION = 12_000


def sniff_mime_type(content: bytes) -> str | None:
    """Detect a file's real MIME type from its magic bytes.

    Deliberately ignores the client-supplied ``Content-Type`` header, which
    is fully attacker-controlled and was the only signal previously used
    (recorded as-is into ``mime_type`` without any verification).
    """
    for signature, mime_type in _MAGIC_SIGNATURES:
        if content.startswith(signature):
            return mime_type
    return None


def extension_for_mime(mime_type: str, fallback: str = "") -> str:
    """Pick a safe file extension based on the *detected* MIME type.

    Avoids trusting the client-supplied filename's extension, which could
    otherwise disagree with the file's real content (e.g. a ``.png`` that is
    actually a PDF).
    """
    return _EXTENSION_BY_MIME.get(mime_type, fallback)


def validate_file_structure(content: bytes, mime_type: str) -> None:
    """Reject truncated/polyglot-like payloads that only spoof magic bytes."""
    if mime_type in ALLOWED_IMAGE_MIME_TYPES:
        try:
            width, height = ImageReader(io.BytesIO(content)).getSize()
        except Exception as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La imagen está dañada o incompleta",
            ) from error
        if width <= 0 or height <= 0 or width > MAX_IMAGE_DIMENSION or height > MAX_IMAGE_DIMENSION:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Las dimensiones de la imagen no son válidas",
            )
    elif mime_type == "application/pdf":
        # A full PDF parser is intentionally not exposed to uploads. This
        # structural check catches truncated files while the browser still
        # receives the file as attachment/inline with nosniff enabled.
        if b"%%EOF" not in content[-2048:]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El PDF está dañado o incompleto",
            )


async def read_and_validate_upload(
    file: UploadFile,
    *,
    allowed_mime_types: set[str],
    max_size_bytes: int,
) -> tuple[bytes, str]:
    """Read an ``UploadFile`` fully while enforcing a size cap and a real
    content-type whitelist.

    Reads in chunks so an oversized upload is rejected as soon as the cap is
    exceeded instead of buffering an arbitrarily large file in memory first.

    Returns:
        A tuple of ``(raw_bytes, detected_mime_type)``.

    Raises:
        HTTPException: 413 if the file exceeds ``max_size_bytes``, 400 if the
            content doesn't match one of ``allowed_mime_types``.
    """
    buffer = bytearray()
    while True:
        chunk = await file.read(_READ_CHUNK_SIZE)
        if not chunk:
            break
        buffer.extend(chunk)
        if len(buffer) > max_size_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    f"El archivo supera el tamaño máximo permitido de "
                    f"{max_size_bytes // (1024 * 1024)} MB"
                ),
            )

    await file.close()

    detected_mime = sniff_mime_type(bytes(buffer))
    if detected_mime is None or detected_mime not in allowed_mime_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de archivo no soportado o no reconocido",
        )

    validate_file_structure(bytes(buffer), detected_mime)
    scan_upload(bytes(buffer))

    return bytes(buffer), detected_mime


def sanitize_clinical_photo(content: bytes, mime_type: str) -> tuple[bytes, bytes, str]:
    """Normalize orientation, strip EXIF/GPS and create a compact thumbnail."""
    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(content)) as source:
        image = ImageOps.exif_transpose(source)
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        output = io.BytesIO()
        if mime_type == "image/png" and image.mode == "RGBA":
            image.save(output, format="PNG", optimize=True)
            normalized_mime = "image/png"
        else:
            image = image.convert("RGB")
            image.save(output, format="JPEG", quality=90, optimize=True)
            normalized_mime = "image/jpeg"
        thumbnail = image.copy()
        thumbnail.thumbnail((480, 480))
        thumb_output = io.BytesIO()
        thumbnail.convert("RGB").save(thumb_output, format="JPEG", quality=82, optimize=True)
    return output.getvalue(), thumb_output.getvalue(), normalized_mime
