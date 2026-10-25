"""Módulos opcionales: se instalan todos y se encienden por consultorio.

Los permisos dicen *quién* puede usar algo; los módulos dicen *si el consultorio
lo usa*. Un módulo apagado no aparece en el menú y sus rutas responden 404 (no
403), para que su información no se asome por otro camino ni se adivine que
existe. Apagarlo nunca borra nada: al volver a encenderlo, todo sigue ahí.

``disponible`` separa lo que está en el catálogo de lo que ya está construido.
La pantalla de módulos solo ofrece los disponibles: un interruptor que enciende
algo que todavía no existe sería una promesa falsa. Cada módulo pasa a
``disponible=True`` en la misma rama que lo construye.
"""
from dataclasses import dataclass
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, get_db
from app.models.tenant_modulo import TenantModulo
from app.models.user import User

MENSAJE_MODULO_INACTIVO = "Este módulo no está activo en el consultorio."


@dataclass(frozen=True)
class ModuloOpcional:
    id: str
    nombre: str
    descripcion: str
    # Id de ``estado_servicios.SERVICIOS`` que debe estar configurado para
    # encenderlo; ``None`` si funciona solo con Cortex.
    servicio_requerido: Optional[str] = None
    activo_por_defecto: bool = False
    disponible: bool = False


_CATALOGO = (
    # Apagados por defecto: los usa quien los necesita.
    ModuloOpcional(
        "inventario", "Inventario de implantes",
        "Registra los implantes usados en cirugía (lote y serie) ligados al paciente "
        "y al procedimiento.",
    ),
    ModuloOpcional(
        "tareas", "Tareas",
        "Pendientes del equipo: revisar un estudio que llegó, dar seguimiento "
        "posoperatorio.",
    ),
    ModuloOpcional(
        "encuestas", "Satisfacción",
        "Encuesta breve al salir de la consulta, en una tableta en modo kiosco.",
    ),
    ModuloOpcional(
        "interoperabilidad", "Interoperabilidad FHIR",
        "Exporta el resumen del paciente en FHIR para referirlo a un hospital.",
    ),
    ModuloOpcional(
        "patologia", "Patología",
        "Resultados de neuropatología con sus laminillas digitales.",
    ),
    ModuloOpcional(
        "ecg", "ECG y EEG",
        "Visor de trazos de electrocardiograma y electroencefalograma (EDF).",
    ),
    ModuloOpcional(
        "goniometro", "Goniómetro",
        "Mide con la cámara el rango de movimiento cervical y lumbar.",
    ),
    ModuloOpcional(
        "telemedicina", "Telemedicina",
        "Videoconsulta para el seguimiento de pacientes foráneos.",
    ),
    ModuloOpcional(
        "whatsapp", "WhatsApp",
        "Recordatorios de cita y preparación de estudios por WhatsApp.",
    ),
    # Requieren un servicio: no se dejan encender sin él.
    ModuloOpcional(
        "pacs_orthanc", "Recepción desde equipos",
        "Los estudios que manda el gabinete o el hospital llegan solos al expediente.",
        servicio_requerido="orthanc",
    ),
    ModuloOpcional(
        "dictado", "Dictado",
        "Dicta la nota SOAP o la operatoria; el audio se transcribe en tu servidor.",
        servicio_requerido="whisper",
    ),
    ModuloOpcional(
        "asistente_ia", "Asistente IA",
        "Resumen preconsulta y borradores sin firmar a partir de los datos del "
        "expediente.",
        servicio_requerido="ia",
    ),
    ModuloOpcional(
        "laboratorios_ocr", "Laboratorios con OCR",
        "Lee la foto de los laboratorios y propone los valores para que el médico "
        "los confirme.",
        # Tesseract corre en el navegador: no depende de ningún servicio.
        servicio_requerido=None,
    ),
    ModuloOpcional(
        "neuro3d_paciente", "Neuro 3D del paciente",
        "Modelo 3D del encéfalo o la columna armado con los estudios del paciente.",
        servicio_requerido="segmentador",
    ),
)

MODULOS_OPCIONALES: dict[str, ModuloOpcional] = {m.id: m for m in _CATALOGO}


def servicio_configurado(servicio: Optional[str]) -> bool:
    """Si el servicio que pide un módulo tiene configuración. No hace red."""
    if servicio is None:
        return True
    if servicio == "orthanc":
        return bool(settings.ORTHANC_URL)
    if servicio == "whisper":
        return bool(settings.WHISPER_URL)
    if servicio == "presidio":
        return bool(settings.PRESIDIO_URL)
    if servicio == "segmentador":
        return bool(settings.SEGMENTADOR_URL)
    if servicio == "ia":
        return settings.ia_proveedor != "ninguno"
    return False


def estados_del_consultorio(db: Session, tenant_id: int) -> dict[str, bool]:
    """Encendido o apagado de cada módulo disponible para un consultorio."""
    filas = {
        f.modulo: f.activo
        for f in db.query(TenantModulo).filter(TenantModulo.tenant_id == tenant_id).all()
    }
    return {
        m.id: filas.get(m.id, m.activo_por_defecto)
        for m in MODULOS_OPCIONALES.values()
        if m.disponible
    }


def modulo_activo(db: Session, tenant_id: int, modulo_id: str) -> bool:
    return estados_del_consultorio(db, tenant_id).get(modulo_id, False)


def require_modulo(modulo_id: str):
    """Dependencia para los routers de un módulo opcional.

    Responde 404 si el módulo está apagado, si no está construido o si el id no
    existe. Un id mal escrito así falla en las pruebas del módulo, no en silencio.

    Uso::

        router = APIRouter(dependencies=[Depends(require_modulo("tareas"))])
    """

    def verificar(
        current_user: Annotated[User, Depends(get_current_user)],
        db: Annotated[Session, Depends(get_db)],
    ) -> User:
        if not modulo_activo(db, current_user.tenant_id, modulo_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=MENSAJE_MODULO_INACTIVO
            )
        return current_user

    return verificar
