"""Segmentador de Cortex: de una serie de TC o RM a mallas 3D del paciente.

Servicio aparte del backend (perfiles ``ia`` e ``ia-gpu`` de Docker Compose):
torch y los pesos pesan gigas y no tienen por qué vivir en el proceso que atiende
la consulta.

- ``GET /health``: si responde, en qué modo, con qué dispositivo (cuda o cpu y
  el nombre de la GPU) y qué regiones sabe segmentar.
- ``POST /segmentar?region=columna&modalidad=CT``: el cuerpo es la serie (ZIP de
  DICOM o NIfTI). Responde un GLB con una malla por estructura, en milímetros y
  en LPS, o un error con ``detail`` en español. Regiones: ver ``etiquetas.TAREAS``.

``SEGMENTADOR_FALSO=1`` no llama al motor: devuelve una columna sintética
determinista. Lo dice en ``/health``, en la cabecera ``X-Cortex-Sintetico`` y
dentro del GLB, para que nadie la confunda con la de un paciente.

Nunca responde un GLB vacío: si no salió ninguna estructura es un 422 con el
motivo, no un «listo» sin nada que ver.

No guarda nada: cada trabajo usa un directorio temporal que se borra al terminar.
"""
from __future__ import annotations

import os
import sys
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.concurrency import run_in_threadpool

from . import motor
from .entrada import EntradaInvalida, guardar_entrada
from .etiquetas import CLASE_DISCOS, TAREAS, Tarea, tarea_de
from .glb import escribir_glb
from .mallas import acabado, mallas_de_mascaras, separar_discos
from .motor import FaltaRecurso, FalloDelMotor, MotorNoDisponible
from .sintetico import columna_sintetica

VERSION_SERVICIO = "0.2.0"


@asynccontextmanager
async def _arranque(_app: FastAPI):
    # La sonda de torch tarda unos segundos: se hace al arrancar, en un hilo, para
    # que el primer /health (y su healthcheck de 5 s) no la espere.
    if not modo_falso():
        threading.Thread(target=motor.info_dispositivo, daemon=True).start()
    yield


app = FastAPI(title="Cortex · segmentador", version=VERSION_SERVICIO, lifespan=_arranque)

# Un trabajo a la vez: dos segmentaciones juntas en CPU tardan más que en fila,
# y en GPU se pelean la memoria.
_candado = threading.Lock()


def modo_falso() -> bool:
    return os.environ.get("SEGMENTADOR_FALSO", "0") == "1"


def _motor() -> tuple[str, str]:
    if modo_falso():
        return "sintetico", VERSION_SERVICIO
    return "TotalSegmentator", motor.version_del_motor() or "no instalado"


def _regiones() -> list[dict]:
    return [
        {"region": t.region, "modalidad": t.modalidad, "nombre": t.nombre,
         "tareas": [p.tarea for p in t.pasos], "rapido": t.admite_rapido, "aviso": t.aviso}
        for t in TAREAS.values()
        if not modo_falso() or t.region == "columna"
    ]


@app.get("/health")
def salud() -> dict:
    nombre, version = _motor()
    if modo_falso():
        dispositivo = {"dispositivo": "ninguno", "gpu": None, "dispositivo_pedido": None}
    elif motor.info_dispositivo_conocida() is not None:
        dispositivo = motor.info_dispositivo_conocida()
    else:
        # Todavía corre la sonda del arranque: se dice, no se inventa.
        dispositivo = {"dispositivo": "consultando", "gpu": None,
                       "dispositivo_pedido": os.environ.get("SEGMENTADOR_DISPOSITIVO", "cpu")}
    return {
        "estado": "ok",
        "modo": "falso" if modo_falso() else "real",
        "motor": nombre,
        "version_motor": version,
        "version_servicio": VERSION_SERVICIO,
        **dispositivo,
        "rapido": os.environ.get("SEGMENTADOR_RAPIDO", "1") == "1",
        "respaldo": sorted(motor.respaldos()),
        "malla": acabado(),
        "regiones": _regiones(),
    }


class _Resultado:
    def __init__(self) -> None:
        self.tiempos: dict[str, float] = {}
        self.glb = b""
        self.cuantas = 0
        self.extras: dict = {}

    def medir(self, etapa: str, inicio: float) -> None:
        self.tiempos[etapa] = round(self.tiempos.get(etapa, 0.0) + time.monotonic() - inicio, 2)


def _procesar(datos: bytes, tarea: Tarea) -> _Resultado:
    r = _Resultado()
    with tempfile.TemporaryDirectory(prefix="cortex-seg-") as tmp:
        trabajo = Path(tmp)
        inicio = time.monotonic()
        tipo, ruta = guardar_entrada(datos, trabajo)
        r.medir("entrada", inicio)
        corrida = None
        if modo_falso():
            mascaras, afin = columna_sintetica()
            sueltas: dict = {}
        else:
            inicio = time.monotonic()
            nifti = motor.convertir_dicom(ruta, trabajo / "nifti") if tipo == "zip" else ruta
            r.medir("dcm2niix", inicio)
            inicio = time.monotonic()
            corrida = motor.segmentar(nifti, trabajo, tarea, ejecutar=motor.correr_paso)
            r.medir("segmentacion", inicio)
            inicio = time.monotonic()
            mascaras, afin, sueltas = motor.leer_mascaras(corrida, tarea)
            r.medir("lectura", inicio)
        inicio = time.monotonic()
        # Las vértebras de la tarea de discos sirven para ponerle nivel a cada uno;
        # van también en el modelo, que sin ellas los discos flotan.
        if CLASE_DISCOS in sueltas:
            mascaras = {**mascaras, **separar_discos(sueltas[CLASE_DISCOS], mascaras, afin)}
        mallas = mallas_de_mascaras(mascaras, afin, con_conducto=tarea.derivar_conducto)
        r.medir("mallas", inicio)
        if not mallas:
            raise EntradaInvalida(tarea.sin_hallazgos)
        if tarea.separar_discos and not any(m.id.startswith("disco-") for m in mallas):
            raise EntradaInvalida(tarea.sin_hallazgos)
        nombre, version = _motor()
        r.extras = {
            "unidades": "mm",
            "sistema": "LPS",
            "region": tarea.region,
            "modalidad": tarea.modalidad,
            "tareas": [p.tarea for p in tarea.pasos],
            "licencia": tarea.licencia,
            "motor": nombre,
            "version_motor": version,
            "version_servicio": VERSION_SERVICIO,
            "sintetico": modo_falso(),
            "malla": acabado(),
            "aviso": tarea.aviso,
        }
        if corrida is not None:
            r.extras.update({
                "dispositivo": corrida.dispositivo,
                "resolucion": "rapida (3 mm)" if corrida.rapido else "normal (1.5 mm)",
                "intentos": corrida.intentos,
                "vram_pico_mb": corrida.vram_pico_mb,
            })
        inicio = time.monotonic()
        r.glb = escribir_glb(mallas, {k: v for k, v in r.extras.items() if k != "vram_pico_mb"})
        r.medir("glb", inicio)
        r.cuantas = len(mallas)
    return r


def _validar(region: str, modalidad: str) -> Tarea:
    modalidad = modalidad.upper()
    if region == "encefalo":
        raise HTTPException(
            status_code=422,
            detail="El modelo del encéfalo todavía no está disponible: la tarea abierta que lo haría no "
            "existe (la de estructuras cerebrales pide licencia). Por ahora: columna, discos, cráneo, "
            "vasos del cuello y hemorragia.",
        )
    regiones = sorted({t.region for t in TAREAS.values()})
    if region not in regiones:
        raise HTTPException(status_code=422, detail=f"Región desconocida: «{region}».")
    if modalidad not in ("CT", "MR"):
        raise HTTPException(status_code=422, detail="Sólo se segmentan tomografías y resonancias.")
    tarea = tarea_de(region, modalidad)
    if tarea is None:
        posibles = " o ".join("tomografía" if t.modalidad == "CT" else "resonancia"
                              for t in TAREAS.values() if t.region == region)
        raise HTTPException(status_code=422, detail=f"Esta región se arma desde {posibles}; la serie es de otra modalidad.")
    if modo_falso() and region != "columna":
        raise HTTPException(status_code=422, detail="En modo de prueba (sintético) sólo hay columna.")
    return tarea


@app.post("/segmentar")
async def segmentar(
    request: Request,
    region: str = Query("columna"),
    modalidad: str = Query("CT"),
) -> Response:
    tarea = _validar(region, modalidad)
    datos = await request.body()

    def trabajo() -> _Resultado:
        with _candado:
            return _procesar(datos, tarea)

    inicio = time.monotonic()
    try:
        r = await run_in_threadpool(trabajo)
    except EntradaInvalida as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except MotorNoDisponible as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except FaltaRecurso as error:
        # Falta GPU, VRAM o RAM: no es culpa del estudio ni un error del código.
        raise HTTPException(status_code=503, detail=str(error), headers={"X-Cortex-Falta": error.clave}) from error
    except FalloDelMotor as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    r.tiempos["total"] = round(time.monotonic() - inicio, 2)
    texto_tiempos = ";".join(f"{k}={v}" for k, v in r.tiempos.items())
    print(f"[segmentador] {tarea.region}/{tarea.modalidad}: {r.cuantas} mallas, {len(r.glb)} bytes, "
          f"{texto_tiempos}, {r.extras.get('intentos')}", file=sys.stderr, flush=True)
    nombre, version = _motor()
    cabeceras = {
        "X-Cortex-Motor": nombre,
        "X-Cortex-Motor-Version": version,
        "X-Cortex-Estructuras": str(r.cuantas),
        "X-Cortex-Sintetico": "1" if modo_falso() else "0",
        "X-Cortex-Tiempos": texto_tiempos,
    }
    if "dispositivo" in r.extras:
        cabeceras["X-Cortex-Dispositivo"] = r.extras["dispositivo"]
        cabeceras["X-Cortex-Resolucion"] = "rapida" if "rapida" in r.extras["resolucion"] else "normal"
        cabeceras["X-Cortex-Intentos"] = ",".join(r.extras["intentos"])
        if r.extras.get("vram_pico_mb"):
            cabeceras["X-Cortex-VRAM-Pico-MB"] = str(r.extras["vram_pico_mb"])
    return Response(content=r.glb, media_type="model/gltf-binary", headers=cabeceras)
