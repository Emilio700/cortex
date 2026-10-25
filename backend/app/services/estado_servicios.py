"""Estado de los servicios auxiliares de los módulos extra.

La pantalla «Servicios» solo muestra lo que este módulo averigua: el backend es
quien ve la red del servidor, el navegador no. Cada consulta tiene un tiempo
corto y van en paralelo, así una pantalla con todo caído tarda lo que el más
lento y no la suma.

Estados:

- ``no_configurado``: falta su URL en el entorno.
- ``en_linea``: respondió a una petición HTTP sin error de servidor ni de acceso.
- ``sin_respuesta``: está configurado pero no contestó a tiempo, dio error 5xx o
  rechazó las credenciales.
- ``configurado``: solo para la IA. No se le hace una consulta de prueba porque
  cada consulta cuesta; decir «en línea» sin haberlo comprobado sería mentir.

Se usa ``urllib`` de la biblioteca estándar: ``httpx`` solo está entre las
dependencias de desarrollo y una consulta de estado no justifica otra en producción.
"""
import base64
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from typing import Callable, Optional

from app.core.config import settings

TIEMPO_LIMITE_SEGUNDOS = 2.0

NO_CONFIGURADO = "no_configurado"
EN_LINEA = "en_linea"
SIN_RESPUESTA = "sin_respuesta"
CONFIGURADO = "configurado"


@dataclass(frozen=True)
class EstadoServicio:
    id: str
    nombre: str
    para_que: str
    estado: str
    detalle: str


@dataclass(frozen=True)
class _Servicio:
    id: str
    nombre: str
    para_que: str
    url: Callable[[], str]
    ruta: str = ""
    credenciales: Callable[[], Optional[tuple[str, str]]] = lambda: None


SERVICIOS: tuple[_Servicio, ...] = (
    _Servicio(
        "orthanc", "Orthanc (PACS)", "Recibe los estudios que mandan los equipos.",
        url=lambda: settings.ORTHANC_URL, ruta="/system",
        credenciales=lambda: (settings.ORTHANC_USUARIO, settings.ORTHANC_PASSWORD)
        if settings.ORTHANC_USUARIO else None,
    ),
    _Servicio(
        "whisper", "Whisper (dictado)", "Transcribe el dictado en tu servidor.",
        url=lambda: settings.WHISPER_URL, ruta="/health",
    ),
    _Servicio(
        "presidio", "Presidio", "Quita los datos personales antes de enviar texto a la IA.",
        url=lambda: settings.PRESIDIO_URL, ruta="/health",
    ),
    _Servicio(
        "segmentador", "Segmentador", "Arma el modelo 3D con los estudios del paciente.",
        url=lambda: settings.SEGMENTADOR_URL, ruta="/health",
    ),
)


def _consultar(servicio: _Servicio) -> EstadoServicio:
    base = (servicio.url() or "").strip()
    if not base:
        return EstadoServicio(
            servicio.id, servicio.nombre, servicio.para_que, NO_CONFIGURADO,
            "Falta su dirección en la configuración del servidor.",
        )
    peticion = urllib.request.Request(base.rstrip("/") + servicio.ruta, method="GET")
    credenciales = servicio.credenciales()
    if credenciales:
        token = base64.b64encode(f"{credenciales[0]}:{credenciales[1]}".encode()).decode()
        peticion.add_header("Authorization", f"Basic {token}")
    try:
        with urllib.request.urlopen(peticion, timeout=TIEMPO_LIMITE_SEGUNDOS) as respuesta:
            codigo = respuesta.status
    except urllib.error.HTTPError as error:
        codigo = error.code
    except Exception:  # noqa: BLE001 — cualquier falla de red es «sin respuesta»
        return EstadoServicio(
            servicio.id, servicio.nombre, servicio.para_que, SIN_RESPUESTA,
            "No contestó a tiempo.",
        )
    if codigo >= 500:
        return EstadoServicio(
            servicio.id, servicio.nombre, servicio.para_que, SIN_RESPUESTA,
            f"Respondió con error ({codigo}).",
        )
    # Contesta, pero Cortex no podría usarlo: no se pinta como «en línea».
    if codigo in (401, 403):
        return EstadoServicio(
            servicio.id, servicio.nombre, servicio.para_que, SIN_RESPUESTA,
            "Responde, pero rechazó el usuario o la contraseña.",
        )
    return EstadoServicio(
        servicio.id, servicio.nombre, servicio.para_que, EN_LINEA, "Responde."
    )


def _estado_ia() -> EstadoServicio:
    nombre, para_que = "Asistente IA", "Resúmenes y borradores sin firmar."
    proveedor = settings.ia_proveedor
    if proveedor == "ninguno":
        return EstadoServicio(
            "ia", nombre, para_que, NO_CONFIGURADO, "No hay un proveedor de IA configurado."
        )
    modelo = f" · {settings.IA_MODELO}" if settings.IA_MODELO else ""
    return EstadoServicio(
        "ia", nombre, para_que, CONFIGURADO,
        f"Proveedor {proveedor}{modelo}. No se probó la conexión para no gastar consultas.",
    )


def estado_de_servicios() -> list[dict]:
    with ThreadPoolExecutor(max_workers=len(SERVICIOS)) as grupo:
        estados = list(grupo.map(_consultar, SERVICIOS))
    estados.append(_estado_ia())
    return [asdict(e) for e in estados]
