"""Escritura de estudios en el almacenamiento y lectura de manifiestos.

Un estudio se guarda tal como llegó: los archivos DICOM no se reescriben ni se
recomprimen. Lo único que se agrega es un manifiesto por serie con el orden de
los cortes y sus rutas, que es lo que el visor necesita para no tener que releer
cientos de cabeceras en cada apertura.

Las rutas no llevan datos del paciente: identificadores internos y UID. Ni nombre
ni fecha de nacimiento.
"""
from __future__ import annotations

import json
import re
import zipfile
from io import BytesIO
from typing import Optional

from app.core.storage import StorageBackend
from app.services.imagen_medica.ingesta import (
    MAX_ARCHIVOS_POR_ESTUDIO,
    MAX_BYTES_POR_ARCHIVO,
    MAX_BYTES_POR_ESTUDIO,
    GrupoEstudio,
)

_UID_SEGURO = re.compile(r"[^0-9.]")


def _uid(valor: str) -> str:
    """Los UID son dígitos y puntos; cualquier otra cosa se descarta de la ruta."""
    limpio = _UID_SEGURO.sub("", valor or "")
    return limpio or "sin-uid"


def prefijo_del_estudio(tenant_id: int, patient_id: int, study_instance_uid: str) -> str:
    return f"tenants/{tenant_id}/patients/{patient_id}/imaging/{_uid(study_instance_uid)}"


def ruta_de_instancia(prefijo: str, series_uid: str, sop_uid: str) -> str:
    return f"{prefijo}/series/{_uid(series_uid)}/{_uid(sop_uid)}.dcm"


def ruta_de_manifiesto(prefijo: str, series_uid: str) -> str:
    return f"{prefijo}/manifests/{_uid(series_uid)}.json"


def guardar_estudio(
    storage: StorageBackend,
    tenant_id: int,
    patient_id: int,
    estudio: GrupoEstudio,
    contenidos: dict[str, bytes],
) -> dict:
    """Guarda las instancias y los manifiestos. Devuelve las rutas resultantes.

    ``contenidos`` va por ``SOPInstanceUID`` y lo arma quien llama, que es quien
    tiene los bytes: aquí solo se decide dónde va cada cosa y en qué orden.

    Se llama después de agrupar y ordenar; si algo falla a la mitad, las series
    ya escritas quedan huérfanas pero el estudio no se marca como listo. La
    limpieza la hace quien llama, con ``borrar_estudio``.
    """
    prefijo = prefijo_del_estudio(tenant_id, patient_id, estudio.study_instance_uid)
    resultado = {"prefijo": prefijo, "series": [], "bytes": 0, "instancias": 0}
    vistos: set[str] = set()

    for serie in estudio.series:
        manifiesto = {
            "series_instance_uid": serie.series_instance_uid,
            "series_number": serie.series_number,
            "modality": serie.modality,
            "series_description": serie.series_description,
            "sequence_label": serie.sequence_label,
            "sequence_detected_by": serie.sequence_detected_by,
            "ordered_by": serie.ordenadas_por,
            "instances": [],
        }
        bytes_serie = 0
        for instancia in serie.instancias:
            # El mismo corte puede venir dos veces (CD duplicado, carpeta
            # copiada). Se guarda una vez y se referencia.
            if instancia.sop_instance_uid in vistos:
                continue
            contenido = contenidos.get(instancia.sop_instance_uid)
            if contenido is None:
                continue
            vistos.add(instancia.sop_instance_uid)
            ruta = ruta_de_instancia(prefijo, serie.series_instance_uid, instancia.sop_instance_uid)
            storage.save(ruta, contenido)
            instancia.ruta = ruta
            bytes_serie += instancia.size
            manifiesto["instances"].append(
                {
                    "sop_instance_uid": instancia.sop_instance_uid,
                    "instance_number": instancia.instance_number,
                    "position": list(instancia.image_position or ()),
                    "orientation": list(instancia.image_orientation or ()),
                    "rows": instancia.rows,
                    "columns": instancia.columns,
                    "path": ruta,
                    "bytes": instancia.size,
                }
            )

        ruta_manifiesto = ruta_de_manifiesto(prefijo, serie.series_instance_uid)
        storage.save(ruta_manifiesto, json.dumps(manifiesto).encode("utf-8"))
        resultado["series"].append(
            {
                "series_instance_uid": serie.series_instance_uid,
                "manifest_path": ruta_manifiesto,
                "bytes": bytes_serie,
                "instancias": len(manifiesto["instances"]),
            }
        )
        resultado["bytes"] += bytes_serie
        resultado["instancias"] += len(manifiesto["instances"])

    return resultado


def leer_manifiesto(storage: StorageBackend, ruta: str) -> Optional[dict]:
    try:
        return json.loads(storage.read(ruta).decode("utf-8"))
    except (FileNotFoundError, ValueError, OSError):
        return None


def borrar_estudio(storage: StorageBackend, prefijo: str) -> None:
    """Borra lo escrito a medias. Solo se usa cuando la ingesta falla."""
    for ruta in listar_archivos(storage, prefijo):
        storage.delete(ruta)


def listar_archivos(storage: StorageBackend, prefijo: str) -> list[str]:
    """Rutas bajo un prefijo, para poder limpiar una ingesta a medias."""
    resolver = getattr(storage, "resolve_path", None)
    if resolver is None:
        return []
    try:
        raiz = resolver(prefijo)
    except (ValueError, OSError):
        return []
    if not raiz.exists():
        return []
    return [
        f"{prefijo}/{archivo.relative_to(raiz).as_posix()}"
        for archivo in raiz.rglob("*")
        if archivo.is_file()
    ]


class ArchivoInvalido(ValueError):
    """El archivo no se puede aceptar; el mensaje se muestra tal cual."""


def extraer_zip(contenido: bytes) -> list[tuple[str, bytes]]:
    """Descomprime con límites y sin confiar en el contenido.

    Un ZIP de WhatsApp trae cualquier cosa: carpetas anidadas, nombres con
    ``..``, archivos de 2 GB. Aquí todo eso se rechaza o se ignora, y lo que
    sobrevive se filtra después por cabecera DICOM, no por extensión.
    """
    try:
        archivo = zipfile.ZipFile(BytesIO(contenido))
    except zipfile.BadZipFile as error:
        raise ArchivoInvalido("El archivo no es un ZIP válido.") from error

    salida: list[tuple[str, bytes]] = []
    total = 0
    with archivo:
        for info in archivo.infolist():
            if info.is_dir():
                continue
            nombre = info.filename.replace("\\", "/")
            if nombre.startswith("/") or ".." in nombre.split("/"):
                raise ArchivoInvalido("El ZIP trae rutas no permitidas.")
            if info.file_size > MAX_BYTES_POR_ARCHIVO:
                continue
            total += info.file_size
            if total > MAX_BYTES_POR_ESTUDIO:
                raise ArchivoInvalido(
                    "El ZIP es demasiado grande para un estudio; divide la carga."
                )
            if len(salida) >= MAX_ARCHIVOS_POR_ESTUDIO:
                raise ArchivoInvalido("El ZIP trae demasiados archivos.")
            salida.append((nombre, archivo.read(info)))
    return salida
