"""ClamAV INSTREAM scanner for untrusted uploads."""

import socket
import struct

from fastapi import HTTPException, status

from app.core.config import settings


def scan_upload(content: bytes) -> None:
    if not settings.ANTIVIRUS_ENABLED:
        return
    try:
        with socket.create_connection((settings.CLAMAV_HOST, settings.CLAMAV_PORT), timeout=settings.CLAMAV_TIMEOUT_SECONDS) as connection:
            connection.sendall(b"zINSTREAM\0")
            for offset in range(0, len(content), 64 * 1024):
                chunk = content[offset:offset + 64 * 1024]
                connection.sendall(struct.pack("!I", len(chunk)) + chunk)
            connection.sendall(struct.pack("!I", 0))
            response = connection.recv(4096).decode("utf-8", errors="replace")
        if "FOUND" in response:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo fue rechazado por seguridad")
        if "OK" not in response:
            raise RuntimeError(f"Unexpected ClamAV response: {response[:200]}")
    except HTTPException:
        raise
    except Exception as error:
        if settings.ANTIVIRUS_REQUIRED:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="La validación antivirus no está disponible; el archivo no fue almacenado") from error
