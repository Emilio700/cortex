"""El motor real: dcm2niix + TotalSegmentator, con respaldo si falta GPU o memoria.

TotalSegmentator corre en un proceso aparte (``app/ejecutor.py``): si se acaba
la RAM muere ese proceso y no el servicio, y la VRAM se libera al terminar.

Qué pasa cuando algo falta (``SEGMENTADOR_RESPALDO``, lista separada por comas):

- ``rapido`` (por omisión): si se agota la VRAM o la RAM con el modelo de 1.5 mm,
  se repite con el de 3 mm (``--fast``), que pide menos de las dos.
- ``cpu``: si no hay GPU (o ni el modelo rápido cabe en la VRAM), se repite en
  CPU. Tarda minutos; por eso no viene encendido.

Cada intento queda anotado y el modelo dice con qué resolución y en qué
dispositivo salió. Si nada funciona, el error dice en español qué faltó.
"""
from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import sys
import time
from dataclasses import dataclass, field
from importlib import metadata
from pathlib import Path

import numpy as np

from .entrada import EntradaInvalida
from .etiquetas import Paso, Tarea


class MotorNoDisponible(RuntimeError):
    """Falta el motor (torch, TotalSegmentator o dcm2niix) en este servidor."""


class FalloDelMotor(RuntimeError):
    """El motor corrió y falló. El mensaje es para el médico."""


class FaltaRecurso(FalloDelMotor):
    """Faltó GPU, VRAM o RAM. ``clave`` dice cuál; el mensaje es para el médico."""

    def __init__(self, clave: str, mensaje: str):
        super().__init__(mensaje)
        self.clave = clave


MENSAJES = {
    "sin_gpu": (
        "El segmentador está configurado para usar la GPU, pero no encuentra ninguna. "
        "Revisa que el equipo tenga la tarjeta NVIDIA y su controlador, o configúralo en CPU."
    ),
    "sin_vram": (
        "La tarjeta de video se quedó sin memoria con este estudio. Prueba con el modelo "
        "rápido (3 mm) o con una serie de menos cortes."
    ),
    "sin_ram": (
        "El servidor del segmentador se quedó sin memoria RAM con este estudio. Prueba con "
        "el modelo rápido (3 mm), con una serie de menos cortes o dale más memoria a Docker."
    ),
    "tiempo": "La segmentación tardó más de lo permitido y se detuvo.",
}
MENSAJES_YA_RAPIDO = {
    "sin_vram": (
        "La tarjeta de video se quedó sin memoria con este estudio, aun con el modelo rápido (3 mm). "
        "Prueba con una serie de menos cortes o pide que se configure el respaldo en CPU."
    ),
    "sin_ram": (
        "El servidor del segmentador se quedó sin memoria RAM con este estudio, aun con el modelo "
        "rápido (3 mm). Hace falta darle más memoria (Docker) o usar una serie de menos cortes."
    ),
}

TIEMPO_DCM2NIIX = 300


def tiempo_limite() -> int:
    return int(os.environ.get("SEGMENTADOR_TIEMPO_LIMITE", "1500"))


def respaldos() -> set[str]:
    valor = os.environ.get("SEGMENTADOR_RESPALDO", "rapido")
    return {v.strip() for v in valor.split(",") if v.strip() and v.strip() != "ninguno"}


def version_del_motor() -> str | None:
    try:
        return metadata.version("TotalSegmentator")
    except metadata.PackageNotFoundError:
        return None


_INFO: dict | None = None


def info_dispositivo_conocida() -> dict | None:
    """Lo que dijo la sonda, si ya terminó; None mientras corre."""
    return _INFO


def info_dispositivo() -> dict:
    """Qué ve torch: dispositivo, GPU y su memoria.

    Se pregunta en un proceso aparte: abrir CUDA en el proceso del servicio le
    dejaría ~300 MB de VRAM tomados para siempre. Se hace una vez por arranque.
    """
    pedido = os.environ.get("SEGMENTADOR_DISPOSITIVO", "cpu")
    base = {"dispositivo_pedido": pedido, "dispositivo": "cpu", "gpu": None, "vram_total_mb": None,
            "torch": None, "cuda": None}
    sonda = (
        "import json, torch\n"
        "d = {'torch': torch.__version__, 'cuda': torch.version.cuda}\n"
        "if torch.cuda.is_available():\n"
        "    p = torch.cuda.get_device_properties(0)\n"
        "    d.update(dispositivo='cuda', gpu=p.name, vram_total_mb=round(p.total_memory / 2**20))\n"
        "print(json.dumps(d))\n"
    )
    try:
        salida = subprocess.run([sys.executable, "-c", sonda], capture_output=True, text=True, timeout=120)
        if salida.returncode == 0:
            base.update(json.loads(salida.stdout.strip().splitlines()[-1]))
    except (OSError, subprocess.TimeoutExpired, ValueError, IndexError):
        pass
    global _INFO
    _INFO = base
    return base


def convertir_dicom(carpeta: Path, salida: Path) -> Path:
    binario = shutil.which("dcm2niix")
    if not binario:
        raise MotorNoDisponible("Falta dcm2niix en el servidor del segmentador.")
    salida.mkdir(parents=True, exist_ok=True)
    try:
        proceso = subprocess.run(
            [binario, "-z", "y", "-b", "n", "-f", "serie_%s", "-o", str(salida), str(carpeta)],
            capture_output=True, text=True, timeout=TIEMPO_DCM2NIIX,
        )
    except subprocess.TimeoutExpired as error:
        raise FalloDelMotor("La conversión de la serie tardó demasiado.") from error
    archivos = sorted(salida.glob("*.nii.gz"), key=lambda p: p.stat().st_size, reverse=True)
    if proceso.returncode != 0 and not archivos:
        raise EntradaInvalida("No se pudo convertir la serie DICOM a volumen (dcm2niix).")
    if not archivos:
        raise EntradaInvalida("La serie no forma un volumen: quizá son cortes sueltos o una localizadora.")
    # Si la serie trae varios volúmenes (ecos, fases), se usa el más grande.
    return archivos[0]


def clasificar_salida(codigo: int, salida: str) -> dict:
    """Del código de salida y la última línea del ejecutor, qué pasó."""
    resultado: dict = {}
    for linea in salida.splitlines():
        if linea.startswith("CORTEX_RESULTADO "):
            try:
                resultado = json.loads(linea.split(" ", 1)[1])
            except ValueError:
                resultado = {}
    if codigo == 0 and resultado.get("ok"):
        return resultado
    # -9 / 137: el kernel mató al proceso por memoria (el OOM killer de Docker).
    if codigo in (-9, 137) or resultado.get("error") == "sin_ram":
        return {"error": "sin_ram"}
    # Antes que «MemoryError»: el de torch se llama «OutOfMemoryError».
    if resultado.get("error") == "sin_vram" or "CUDA out of memory" in salida:
        return {"error": "sin_vram"}
    if "MemoryError" in salida:
        return {"error": "sin_ram"}
    if resultado.get("error") == "sin_gpu":
        return {"error": "sin_gpu"}
    if resultado.get("error") == "sin_torch":
        return {"error": "sin_motor"}
    ultima = next((l for l in reversed(salida.strip().splitlines()) if l.strip()), "")
    return {"error": "fallo", "detalle": ultima[-200:]}


def _matar_grupo(proceso: subprocess.Popen) -> None:
    if hasattr(os, "killpg"):
        try:
            os.killpg(proceso.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass


def correr_paso(nifti: Path, salida: Path, paso: Paso, *, rapido: bool, dispositivo: str) -> dict:
    """Una corrida de TotalSegmentator en su proceso. Devuelve tiempos y VRAM, o lanza."""
    argumentos = {
        "entrada": str(nifti), "salida": str(salida), "tarea": paso.tarea,
        "roi_subset": list(paso.roi_subset) if paso.roi_subset else None,
        "rapido": rapido and paso.admite_rapido, "dispositivo": dispositivo,
    }
    raiz = Path(__file__).resolve().parent.parent
    # Sesión propia: si el kernel mata al ejecutor por memoria, sus procesos
    # auxiliares quedarían huérfanos con gigas tomados y el siguiente estudio
    # fallaría también. Al terminar, pase lo que pase, se mata el grupo entero.
    proceso = subprocess.Popen(
        [sys.executable, "-m", "app.ejecutor", json.dumps(argumentos)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=str(raiz),
        start_new_session=True,
    )
    try:
        stdout, stderr = proceso.communicate(timeout=tiempo_limite())
    except subprocess.TimeoutExpired as error:
        _matar_grupo(proceso)
        proceso.communicate()
        raise FaltaRecurso("tiempo", MENSAJES["tiempo"]) from error
    finally:
        _matar_grupo(proceso)
    resultado = clasificar_salida(proceso.returncode, stdout + "\n" + stderr)
    error = resultado.get("error")
    if error is None:
        return resultado
    # Lo último que dijo el motor queda en el registro del servicio (no en la
    # respuesta: el médico no tiene por qué leer una traza).
    cola = (stderr or "").strip().splitlines()[-6:]
    print(f"[segmentador] {paso.tarea} terminó con {proceso.returncode} ({error}): " + " | ".join(cola),
          file=sys.stderr, flush=True)
    if error == "sin_motor":
        raise MotorNoDisponible("Este servidor no tiene instalado el motor de segmentación (torch).")
    if error in MENSAJES:
        raise FaltaRecurso(error, MENSAJES[error])
    print(f"[segmentador] el motor falló en {paso.tarea}: {resultado.get('detalle')}", file=sys.stderr, flush=True)
    raise FalloDelMotor(f"El motor de segmentación falló ({paso.tarea}).")


@dataclass
class Corrida:
    """Lo que salió de segmentar: las clases en disco y cómo se obtuvieron."""

    carpeta: Path
    rapido: bool
    dispositivo: str
    intentos: list[str] = field(default_factory=list)
    vram_pico_mb: int | None = None


def _plan(rapido: bool, dispositivo: str, tarea: Tarea) -> list[tuple[bool, str]]:
    """Los intentos posibles, en orden: el pedido y luego los respaldos."""
    plan = [(rapido, dispositivo)]
    disponibles = respaldos()
    if "rapido" in disponibles and not rapido and tarea.admite_rapido:
        plan.append((True, dispositivo))
    if "cpu" in disponibles and dispositivo != "cpu":
        plan.append((rapido or tarea.admite_rapido, "cpu"))
    return plan


def _respaldo_sirve(clave: str, actual: tuple[bool, str], siguiente: tuple[bool, str]) -> bool:
    """Si con ese respaldo tiene sentido volver a intentar tras ``clave``."""
    if clave == "sin_gpu":
        return siguiente[1] == "cpu"
    if clave in ("sin_vram", "sin_ram"):
        # El modelo rápido pide menos de todo; la CPU sólo ayuda si faltó VRAM.
        return (siguiente[0] and not actual[0]) or (clave == "sin_vram" and siguiente[1] == "cpu")
    return False


def segmentar(nifti: Path, trabajo: Path, tarea: Tarea, *, ejecutar=correr_paso) -> Corrida:
    """Corre los pasos de la tarea; si falta un recurso, prueba los respaldos."""
    rapido = os.environ.get("SEGMENTADOR_RAPIDO", "1") == "1" and tarea.admite_rapido
    dispositivo = os.environ.get("SEGMENTADOR_DISPOSITIVO", "cpu")
    plan = _plan(rapido, dispositivo, tarea)
    intentos: list[str] = []
    ultimo: FaltaRecurso | None = None
    actual = None
    for opcion in plan:
        if ultimo is not None and not _respaldo_sirve(ultimo.clave, actual, opcion):
            continue
        actual = opcion
        es_rapido, en = opcion
        etiqueta = f"{'cuda' if en == 'gpu' else 'cpu'}-{'rapido' if es_rapido else 'normal'}"
        salida = trabajo / f"segmentos-{etiqueta}"
        vram = None
        try:
            for paso in tarea.pasos:
                inicio = time.monotonic()
                resultado = ejecutar(nifti, salida, paso, rapido=es_rapido, dispositivo=en)
                vram = max(vram or 0, resultado.get("vram_pico_mb") or 0) or vram
                print(f"[segmentador] {paso.tarea} {etiqueta}: {time.monotonic() - inicio:.1f} s, "
                      f"VRAM pico {resultado.get('vram_pico_mb')} MB", file=sys.stderr, flush=True)
        except FaltaRecurso as error:
            intentos.append(f"{etiqueta}:{error.clave}")
            ultimo = error
            continue
        intentos.append(f"{etiqueta}:ok")
        return Corrida(salida, es_rapido, "cuda" if en == "gpu" else "cpu", intentos, vram)
    assert ultimo is not None and actual is not None
    if actual[0] and ultimo.clave in MENSAJES_YA_RAPIDO:
        # No se le sugiere al médico «prueba el modelo rápido» si ya se probó.
        raise FaltaRecurso(ultimo.clave, MENSAJES_YA_RAPIDO[ultimo.clave])
    raise FaltaRecurso(ultimo.clave, str(ultimo))


def leer_mascaras(corrida: Corrida, tarea: Tarea) -> tuple[dict[str, np.ndarray], np.ndarray, dict[str, np.ndarray]]:
    """Las máscaras por estructura del catálogo, la afín y las clases sueltas extra (discos)."""
    import nibabel as nib

    afin = None
    mascaras: dict[str, np.ndarray] = {}

    def cargar(clase: str):
        nonlocal afin
        ruta = corrida.carpeta / f"{clase}.nii.gz"
        if not ruta.exists():
            return None
        imagen = nib.load(str(ruta))
        afin = imagen.affine if afin is None else afin
        return np.asanyarray(imagen.dataobj) > 0

    for estructura in tarea.estructuras:
        union = None
        for clase in estructura.clases:
            datos = cargar(clase)
            if datos is None:
                continue
            union = datos if union is None else (union | datos)
        if union is not None and union.any():
            mascaras[estructura.id] = union
    sueltas: dict[str, np.ndarray] = {}
    if tarea.separar_discos:
        from .etiquetas import CLASE_DISCOS

        discos = cargar(CLASE_DISCOS)
        if discos is not None and discos.any():
            sueltas[CLASE_DISCOS] = discos
    if afin is None:
        raise FalloDelMotor("El motor terminó sin dejar ninguna segmentación.")
    return mascaras, np.asarray(afin, dtype=float), sueltas
