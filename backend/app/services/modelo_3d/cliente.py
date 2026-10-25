"""Cliente HTTP del servicio segmentador.

Se usa ``urllib`` de la biblioteca estándar, como ``estado_servicios``: ``httpx``
sólo está entre las dependencias de desarrollo.

Todo error sale como ``ErrorDelSegmentador`` con un mensaje en español que se
guarda como motivo del fallo y el médico lee tal cual. No se le muestra una
traza ni un «Errno 111».
"""
from __future__ import annotations

import json
import socket
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from app.core.config import settings

MAGIA_GLB = b"glTF"


class ErrorDelSegmentador(RuntimeError):
    """El segmentador no entregó el modelo. El mensaje es para el médico."""


@dataclass(frozen=True)
class ResultadoSegmentacion:
    glb: bytes
    motor: str
    motor_version: str
    estructuras: int
    sintetico: bool


def _detalle(error: urllib.error.HTTPError) -> str | None:
    try:
        cuerpo = json.loads(error.read().decode("utf-8"))
    except Exception:  # noqa: BLE001 — el cuerpo puede no ser JSON
        return None
    detalle = cuerpo.get("detail") if isinstance(cuerpo, dict) else None
    return detalle if isinstance(detalle, str) and detalle.strip() else None


def segmentar(zip_de_la_serie: bytes, *, region: str, modalidad: str) -> ResultadoSegmentacion:
    base = (settings.SEGMENTADOR_URL or "").strip().rstrip("/")
    if not base:
        raise ErrorDelSegmentador("El segmentador no está configurado en el servidor.")
    consulta = urllib.parse.urlencode({"region": region, "modalidad": modalidad})
    peticion = urllib.request.Request(
        f"{base}/segmentar?{consulta}",
        data=zip_de_la_serie,
        method="POST",
        headers={"Content-Type": "application/zip"},
    )
    try:
        with urllib.request.urlopen(
            peticion, timeout=settings.SEGMENTADOR_TIEMPO_LIMITE_SEGUNDOS
        ) as respuesta:
            glb = respuesta.read()
            cabeceras = respuesta.headers
    except urllib.error.HTTPError as error:
        detalle = _detalle(error)
        if detalle:
            raise ErrorDelSegmentador(detalle) from error
        raise ErrorDelSegmentador(
            f"El segmentador respondió con un error ({error.code})."
        ) from error
    except (socket.timeout, TimeoutError) as error:
        raise ErrorDelSegmentador(
            "El segmentador no terminó a tiempo. Vuelve a intentarlo más tarde o avisa a soporte."
        ) from error
    except urllib.error.URLError as error:
        if isinstance(error.reason, (socket.timeout, TimeoutError)):
            raise ErrorDelSegmentador(
                "El segmentador no terminó a tiempo. Vuelve a intentarlo más tarde o avisa a soporte."
            ) from error
        raise ErrorDelSegmentador(
            "No se pudo conectar con el segmentador. Revisa en Sistema → Servicios que esté en línea."
        ) from error
    except OSError as error:
        raise ErrorDelSegmentador("Se cortó la conexión con el segmentador.") from error

    if glb[:4] != MAGIA_GLB:
        raise ErrorDelSegmentador("El segmentador devolvió un archivo que no es un modelo 3D.")
    try:
        estructuras = int(cabeceras.get("X-Cortex-Estructuras", "0"))
    except ValueError:
        estructuras = 0
    return ResultadoSegmentacion(
        glb=glb,
        motor=(cabeceras.get("X-Cortex-Motor") or "desconocido")[:64],
        motor_version=(cabeceras.get("X-Cortex-Motor-Version") or "")[:32],
        estructuras=estructuras,
        sintetico=cabeceras.get("X-Cortex-Sintetico") == "1",
    )
