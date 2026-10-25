"""El motor real: dcm2niix + TotalSegmentator.

Se importan aquí y tarde (dentro de las funciones): en modo falso no hacen falta
torch ni los pesos, y el servicio arranca igual en una máquina sin GPU.

Sólo se usa la tarea ``total`` (licencia abierta, Apache-2.0 en código y pesos)
con ``roi_subset``, para no segmentar 117 estructuras cuando se necesitan 26.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from importlib import metadata
from pathlib import Path

import numpy as np

from .entrada import EntradaInvalida
from .etiquetas import ESTRUCTURAS_COLUMNA, clases_de_totalsegmentator


class MotorNoDisponible(RuntimeError):
    """Falta el motor (torch, TotalSegmentator o dcm2niix) en este servidor."""


class FalloDelMotor(RuntimeError):
    """El motor corrió y falló. El mensaje es para el médico."""


TIEMPO_DCM2NIIX = 300


def version_del_motor() -> str | None:
    try:
        return metadata.version("TotalSegmentator")
    except metadata.PackageNotFoundError:
        return None


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


def segmentar_columna(nifti: Path, trabajo: Path) -> tuple[dict[str, np.ndarray], np.ndarray]:
    try:
        import nibabel as nib
        from totalsegmentator.python_api import totalsegmentator
    except ImportError as error:  # pragma: no cover - depende de la imagen
        raise MotorNoDisponible("Este servidor no tiene instalado TotalSegmentator.") from error

    salida = trabajo / "segmentos"
    rapido = os.environ.get("SEGMENTADOR_RAPIDO", "1") == "1"
    dispositivo = os.environ.get("SEGMENTADOR_DISPOSITIVO", "cpu")
    try:
        totalsegmentator(
            str(nifti), str(salida),
            task="total", roi_subset=clases_de_totalsegmentator(),
            fast=rapido, device=dispositivo, quiet=True,
        )
    except Exception as error:  # noqa: BLE001 — el motor lanza de todo
        raise FalloDelMotor(f"El motor de segmentación falló: {type(error).__name__}.") from error

    afin = None
    mascaras: dict[str, np.ndarray] = {}
    for estructura in ESTRUCTURAS_COLUMNA:
        union = None
        for clase in estructura.clases:
            ruta = salida / f"{clase}.nii.gz"
            if not ruta.exists():
                continue
            imagen = nib.load(str(ruta))
            datos = np.asanyarray(imagen.dataobj) > 0
            afin = imagen.affine if afin is None else afin
            union = datos if union is None else (union | datos)
        if union is not None and union.any():
            mascaras[estructura.id] = union
    if afin is None or not mascaras:
        raise EntradaInvalida("No se encontró columna en el estudio. ¿La serie abarca la columna?")
    return mascaras, np.asarray(afin, dtype=float)
