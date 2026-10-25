"""Segmentador de Cortex: de una serie de TC a mallas 3D del paciente.

Servicio aparte del backend (perfil ``ia`` de Docker Compose): torch y los pesos
pesan gigas y no tienen por qué vivir en el proceso que atiende la consulta.

- ``GET /health``: si responde y en qué modo está.
- ``POST /segmentar?region=columna&modalidad=CT``: el cuerpo es la serie (ZIP de
  DICOM o NIfTI). Responde un GLB con una malla por estructura, en milímetros y
  en LPS, o un error con ``detail`` en español.

``SEGMENTADOR_FALSO=1`` no llama al motor: devuelve una columna sintética
determinista. Lo dice en ``/health``, en la cabecera ``X-Cortex-Sintetico`` y
dentro del GLB, para que nadie la confunda con la de un paciente.

No guarda nada: cada trabajo usa un directorio temporal que se borra al terminar.
"""
from __future__ import annotations

import os
import tempfile
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.concurrency import run_in_threadpool

from .entrada import EntradaInvalida, guardar_entrada
from .glb import escribir_glb
from .mallas import mallas_de_mascaras
from .motor import FalloDelMotor, MotorNoDisponible, convertir_dicom, segmentar_columna, version_del_motor
from .sintetico import columna_sintetica

VERSION_SERVICIO = "0.1.0"
REGIONES = ("columna", "encefalo")

app = FastAPI(title="Cortex · segmentador", version=VERSION_SERVICIO)

# Un trabajo a la vez: dos segmentaciones juntas en CPU tardan más que en fila,
# y en GPU se pelean la memoria.
_candado = threading.Lock()


def modo_falso() -> bool:
    return os.environ.get("SEGMENTADOR_FALSO", "0") == "1"


def _motor() -> tuple[str, str]:
    if modo_falso():
        return "sintetico", VERSION_SERVICIO
    return "TotalSegmentator", version_del_motor() or "no instalado"


@app.get("/health")
def salud() -> dict:
    motor, version = _motor()
    return {
        "estado": "ok",
        "modo": "falso" if modo_falso() else "real",
        "motor": motor,
        "version_motor": version,
        "version_servicio": VERSION_SERVICIO,
        "regiones": ["columna"],
    }


def _procesar(datos: bytes, region: str, modalidad: str) -> tuple[bytes, int]:
    with tempfile.TemporaryDirectory(prefix="cortex-seg-") as tmp:
        trabajo = Path(tmp)
        tipo, ruta = guardar_entrada(datos, trabajo)
        if modo_falso():
            mascaras, afin = columna_sintetica()
        else:
            if modalidad != "CT":
                raise EntradaInvalida(
                    "Por ahora el modelo por niveles se arma desde tomografía. La resonancia "
                    "de columna llegará en una fase posterior."
                )
            nifti = convertir_dicom(ruta, trabajo / "nifti") if tipo == "zip" else ruta
            mascaras, afin = segmentar_columna(nifti, trabajo)
        mallas = mallas_de_mascaras(mascaras, afin)
        if not mallas:
            raise EntradaInvalida("No quedó ninguna estructura con tamaño suficiente para mallarla.")
        motor, version = _motor()
        glb = escribir_glb(mallas, {
            "unidades": "mm",
            "sistema": "LPS",
            "region": region,
            "modalidad": modalidad,
            "motor": motor,
            "version_motor": version,
            "version_servicio": VERSION_SERVICIO,
            "sintetico": modo_falso(),
        })
        return glb, len(mallas)


@app.post("/segmentar")
async def segmentar(
    request: Request,
    region: str = Query("columna"),
    modalidad: str = Query("CT"),
) -> Response:
    if region not in REGIONES:
        raise HTTPException(status_code=422, detail=f"Región desconocida: «{region}».")
    if region == "encefalo":
        raise HTTPException(
            status_code=422,
            detail="El modelo del encéfalo todavía no está disponible; por ahora sólo la columna.",
        )
    modalidad = modalidad.upper()
    if modalidad not in ("CT", "MR"):
        raise HTTPException(status_code=422, detail="Sólo se segmentan tomografías y resonancias.")
    datos = await request.body()

    def trabajo() -> tuple[bytes, int]:
        with _candado:
            return _procesar(datos, region, modalidad)

    try:
        glb, cuantas = await run_in_threadpool(trabajo)
    except EntradaInvalida as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except MotorNoDisponible as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except FalloDelMotor as error:
        raise HTTPException(status_code=500, detail=str(error)) from error

    motor, version = _motor()
    return Response(
        content=glb,
        media_type="model/gltf-binary",
        headers={
            "X-Cortex-Motor": motor,
            "X-Cortex-Motor-Version": version,
            "X-Cortex-Estructuras": str(cuantas),
            "X-Cortex-Sintetico": "1" if modo_falso() else "0",
        },
    )
