"""Lo que llega al segmentador: un ZIP de DICOM o un NIfTI.

Se valida antes de gastar minutos de CPU: un ZIP con rutas que se salen del
directorio, demasiados archivos o nada que parezca DICOM se rechaza con un
motivo en español que Cortex le muestra tal cual al médico.
"""
from __future__ import annotations

import gzip
import io
import zipfile
from pathlib import Path


class EntradaInvalida(ValueError):
    """La serie no se puede usar. El mensaje es para el médico."""


MAX_BYTES = 1024 * 1024 * 1024  # 1 GB: una angio-TC de cortes finos cabe.
MAX_ARCHIVOS = 5000


def tipo_de_entrada(datos: bytes) -> str:
    if datos[:4] == b"PK\x03\x04":
        return "zip"
    if datos[:2] == b"\x1f\x8b":
        return "nifti.gz"
    if len(datos) >= 348 and datos[344:347] in (b"n+1", b"ni1"):
        return "nifti"
    raise EntradaInvalida("Lo que llegó no es un ZIP de DICOM ni un NIfTI.")


def guardar_entrada(datos: bytes, directorio: Path) -> tuple[str, Path]:
    """Deja la serie en ``directorio`` y dice qué es. No convierte nada."""
    if not datos:
        raise EntradaInvalida("La serie llegó vacía.")
    if len(datos) > MAX_BYTES:
        raise EntradaInvalida("La serie supera el tamaño máximo que acepta el segmentador (1 GB).")
    tipo = tipo_de_entrada(datos)
    if tipo == "nifti.gz":
        try:
            with gzip.open(io.BytesIO(datos)) as f:
                cabecera = f.read(348)
        except OSError as error:
            raise EntradaInvalida("El NIfTI comprimido está dañado.") from error
        if len(cabecera) < 348 or cabecera[344:347] not in (b"n+1", b"ni1"):
            raise EntradaInvalida("El archivo comprimido no es un NIfTI.")
        destino = directorio / "serie.nii.gz"
        destino.write_bytes(datos)
        return tipo, destino
    if tipo == "nifti":
        destino = directorio / "serie.nii"
        destino.write_bytes(datos)
        return tipo, destino

    carpeta = directorio / "dicom"
    carpeta.mkdir()
    try:
        archivo = zipfile.ZipFile(io.BytesIO(datos))
    except zipfile.BadZipFile as error:
        raise EntradaInvalida("El ZIP de la serie está dañado.") from error
    with archivo:
        miembros = [m for m in archivo.infolist() if not m.is_dir()]
        if not miembros:
            raise EntradaInvalida("El ZIP de la serie no trae archivos.")
        if len(miembros) > MAX_ARCHIVOS:
            raise EntradaInvalida("El ZIP trae demasiados archivos para una sola serie.")
        if sum(m.file_size for m in miembros) > MAX_BYTES:
            raise EntradaInvalida("La serie descomprimida supera 1 GB.")
        raiz = carpeta.resolve()
        dicom = 0
        for n, miembro in enumerate(miembros):
            # Nombres propios: no se confía en las rutas del ZIP (pueden salirse
            # del directorio con «..»).
            contenido = archivo.read(miembro)
            if len(contenido) > 132 and contenido[128:132] == b"DICM":
                dicom += 1
            destino = (carpeta / f"{n:05d}.dcm").resolve()
            if raiz not in destino.parents:
                raise EntradaInvalida("El ZIP trae rutas no válidas.")
            destino.write_bytes(contenido)
        if dicom == 0:
            raise EntradaInvalida("El ZIP no trae cortes DICOM.")
    return tipo, carpeta
