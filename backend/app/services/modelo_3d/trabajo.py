"""El trabajo en segundo plano que pide el modelo 3D al segmentador.

Por qué un hilo del proceso web y no APScheduler: el programador corre en su
propio contenedor (``scheduler_runner``) y no recibe trabajos desde una petición.
Un ``ThreadPoolExecutor`` de un solo hilo basta: la petición responde en el acto
(«pendiente»), la segmentación tarda lo que tarde y sólo hay una a la vez por
proceso, para no comerle la CPU a la consulta.

Lo que puede salir mal y cómo se dice:

- El segmentador falla o no responde: la fila queda en ``fallo`` con el motivo.
- El proceso web se reinicia a media segmentación (despliegue, caída): el hilo
  se pierde y la fila se quedaría en ``procesando`` para siempre. Por eso
  ``vencer_si_colgado`` la pasa a ``fallo`` cuando ya pasó el tiempo límite; se
  llama cada vez que alguien consulta el estado.
"""
from __future__ import annotations

import io
import logging
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from typing import Callable, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.storage import StorageBackend, default_storage
from app.db.session import utcnow
from app.models.imaging import ImagingSeries
from app.models.imaging_modelo_3d import EstadoModelo3D, ImagingModelo3D
from app.services.audit_service import log_action
from app.services.imagen_medica.almacen import leer_manifiesto
from app.services.modelo_3d import cliente

log = logging.getLogger(__name__)

_hilo = ThreadPoolExecutor(max_workers=1, thread_name_prefix="modelo-3d")

MOTIVO_INTERRUMPIDO = (
    "El proceso se interrumpió antes de terminar (el servidor se reinició o tardó "
    "demasiado). Vuelve a generarlo."
)
MOTIVO_INESPERADO = "Ocurrió un error inesperado al armar el modelo. Vuelve a intentarlo; si se repite, avisa a soporte."

EN_CURSO = (EstadoModelo3D.PENDIENTE.value, EstadoModelo3D.PROCESANDO.value)


def ruta_del_modelo(storage_prefix: str, modelo_id: int) -> str:
    return f"{storage_prefix}/modelos/{modelo_id}.glb"


def zip_de_la_serie(storage: StorageBackend, serie: ImagingSeries) -> bytes:
    """Los cortes originales de la serie, en un ZIP, tal cual se guardaron."""
    if not serie.manifest_path:
        raise cliente.ErrorDelSegmentador("La serie no tiene manifiesto; vuelve a subir el estudio.")
    manifiesto = leer_manifiesto(storage, serie.manifest_path) or {}
    instancias = manifiesto.get("instances", [])
    if not instancias:
        raise cliente.ErrorDelSegmentador("La serie no tiene cortes guardados.")
    salida = io.BytesIO()
    with zipfile.ZipFile(salida, "w", compression=zipfile.ZIP_STORED) as archivo:
        for i, instancia in enumerate(instancias):
            try:
                datos = storage.read(instancia["path"])
            except (FileNotFoundError, OSError, KeyError) as error:
                raise cliente.ErrorDelSegmentador(
                    "Faltan cortes de la serie en el almacenamiento; no se puede armar el modelo."
                ) from error
            archivo.writestr(f"{i:05d}.dcm", datos)
    return salida.getvalue()


def _terminar(db: Session, modelo: ImagingModelo3D, *, estado: str, motivo: Optional[str] = None) -> None:
    modelo.estado = estado
    modelo.motivo_fallo = motivo
    modelo.terminado_en = utcnow()
    db.commit()
    log_action(
        db,
        action="modelo3d_listo" if estado == EstadoModelo3D.LISTO.value else "modelo3d_fallo",
        entity_type="imaging_modelo_3d",
        entity_id=modelo.id,
        actor_user_id=None,
        tenant_id=modelo.tenant_id,
        patient_id=modelo.patient_id,
        outcome="success" if estado == EstadoModelo3D.LISTO.value else "failure",
        reason=motivo,
        details={"study_id": modelo.study_id, "series_id": modelo.series_id, "motor": modelo.motor},
    )


def procesar(
    db: Session,
    modelo_id: int,
    *,
    storage: Optional[StorageBackend] = None,
    segmentar: Optional[Callable[..., cliente.ResultadoSegmentacion]] = None,
) -> None:
    """Lleva un modelo de ``pendiente`` a ``listo`` o ``fallo``. Nunca lanza."""
    storage = storage or default_storage
    segmentar = segmentar or cliente.segmentar
    modelo = db.get(ImagingModelo3D, modelo_id)
    if modelo is None or modelo.estado != EstadoModelo3D.PENDIENTE.value:
        return
    modelo.estado = EstadoModelo3D.PROCESANDO.value
    modelo.iniciado_en = utcnow()
    db.commit()

    try:
        serie = modelo.series
        datos = zip_de_la_serie(storage, serie)
        resultado = segmentar(datos, region=modelo.region, modalidad=serie.modality)
        ruta = ruta_del_modelo(modelo.study.storage_prefix, modelo.id)
        storage.save(ruta, resultado.glb)
    except cliente.ErrorDelSegmentador as error:
        db.rollback()
        _terminar(db, modelo, estado=EstadoModelo3D.FALLO.value, motivo=str(error))
        return
    except Exception:  # noqa: BLE001 — el hilo no puede morir callado
        log.exception("Falló el modelo 3D %s", modelo_id)
        db.rollback()
        _terminar(db, modelo, estado=EstadoModelo3D.FALLO.value, motivo=MOTIVO_INESPERADO)
        return

    modelo.archivo_path = ruta
    modelo.archivo_bytes = len(resultado.glb)
    modelo.estructuras = resultado.estructuras
    modelo.motor = resultado.motor
    modelo.motor_version = resultado.motor_version
    modelo.sintetico = resultado.sintetico
    _terminar(db, modelo, estado=EstadoModelo3D.LISTO.value)


def _en_hilo(modelo_id: int) -> None:
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        procesar(db, modelo_id)
    finally:
        db.close()


def encolar(modelo_id: int) -> None:
    """Manda el trabajo al hilo. Las pruebas lo reemplazan por una llamada directa."""
    _hilo.submit(_en_hilo, modelo_id)


def vencer_si_colgado(db: Session, modelo: ImagingModelo3D) -> bool:
    """Si lleva más del tiempo límite «en curso», el hilo ya no existe: es un fallo."""
    if modelo.estado not in EN_CURSO:
        return False
    margen = timedelta(seconds=settings.SEGMENTADOR_TIEMPO_LIMITE_SEGUNDOS + 300)
    desde = modelo.iniciado_en or modelo.solicitado_en
    if desde is None or utcnow() - desde < margen:
        return False
    _terminar(db, modelo, estado=EstadoModelo3D.FALLO.value, motivo=MOTIVO_INTERRUMPIDO)
    return True
