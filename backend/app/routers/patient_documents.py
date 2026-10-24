"""Patient Documents router - Upload and manage medical files"""

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.access_scope import resolver_paciente_con_relacion_asistencial
from app.core.deps import get_db, get_user_permissions, require_permission
from app.core.resultados_visibles import filtrar_resultados_ajenos, puede_abrir_documento
from app.core.storage import default_storage, storage_response
from app.core.tenant_scope import scoped_query
from app.models import Patient, PatientDocument, User
from app.models.acceso_clinico import SeccionClinica
from app.models.appointment import Appointment
from app.models.notification import NotificationType
from app.models.clinical_tracking import DiagnosticResult
from app.models.patient_document import DocumentType
from app.models.user import Role
from app.schemas.patient_document import (
    MotivoDeCorreccion,
    MoverDocumento,
    PatientDocumentResponse,
    PatientDocumentUpdate,
)
from app.services import correccion_documentos as correccion
from app.services.audit_service import log_action
from app.services.bitacora_accesos import registrar_acceso
from app.services.notification_service import notify
from app.utils.sanitize import sanitize_text
from app.utils.uploads import (
    ALLOWED_DOCUMENT_MIME_TYPES,
    MAX_DOCUMENT_SIZE_BYTES,
    extension_for_mime,
    read_and_validate_upload,
)

# Writing is limited by permissions. Reading a document now additionally
# requires an explicit clinical relationship to the patient.
WRITE_ROLES = [Role.SECRETARIA, Role.DOCTOR, Role.ADMIN]

router = APIRouter(prefix="/documents", tags=["documents"])

logger = logging.getLogger(__name__)

# Configure upload directory
UPLOAD_DIR = Path("uploads/patient_documents")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _patient_with_document_access(db: Session, patient_id: int, current_user: User) -> Patient:
    """Resolve a document patient without blocking the reception workflow.

    Doctors need an owner/care-team relationship. Reception and administration
    retain tenant-scoped, permission-gated document handling so they can attach
    studies for every patient in their clinic without access to medical notes.
    """
    return resolver_paciente_con_relacion_asistencial(db, patient_id, current_user)


def _documento(db: Session, document_id: int, current_user: User, *, incluir_anulado: bool = False) -> PatientDocument:
    """El documento de la sucursal; un anulado solo lo ve la administración.

    Anulado = fuera de las vistas normales (plan 29, lote 7): para quien no es
    administración, un documento anulado no existe.
    """
    document = (
        scoped_query(db.query(PatientDocument), PatientDocument, current_user)
        .filter(PatientDocument.id == document_id)
        .first()
    )
    if not document or (
        document.anulado_at is not None and not (incluir_anulado and correccion.es_administracion(current_user))
    ):
        raise HTTPException(status_code=404, detail=correccion.NO_ENCONTRADO)
    _patient_with_document_access(db, document.patient_id, current_user)
    # El resultado de estudio que no recibió ella, para recepción no existe
    # (plan 32, C2): mismo 404 que un documento de otra sucursal.
    if not puede_abrir_documento(db, document, current_user):
        raise HTTPException(status_code=404, detail=correccion.NO_ENCONTRADO)
    return document


def _avisar_documento_nuevo(db: Session, documento: PatientDocument, patient, actor: User) -> None:
    """Avisa a cada médico que tiene alguna cita con el paciente.

    No hay asignación directa paciente-doctora en el modelo de datos, así que
    el historial de citas es la única forma confiable de saber quién la trata.
    A quien subió el archivo no se le avisa de su propio acto: es el aviso más
    fácil de ignorar y enseña a ignorar todos los demás.
    """
    doctor_ids = (
        db.query(Appointment.doctor_id)
        .filter(Appointment.patient_id == documento.patient_id, Appointment.tenant_id == actor.tenant_id)
        .distinct()
        .all()
    )
    for (doctor_id,) in doctor_ids:
        if doctor_id == actor.id:
            continue
        notify(
            db,
            tenant_id=actor.tenant_id,
            user_id=doctor_id,
            type=NotificationType.DOCUMENT_UPLOADED,
            title="Nuevo documento",
            message=f"Se subió '{documento.title}' para {patient.first_name} {patient.last_name}.",
            entity_type="patient_document",
            entity_id=documento.id,
        )


@router.post("/upload", response_model=PatientDocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    *,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("documents.upload")),
    patient_id: int = Form(...),
    document_type: DocumentType = Form(...),
    title: str = Form(...),
    description: str = Form(None),
    lab_name: str = Form(None),
    study_date: str = Form(None),
    file: UploadFile = File(...),
):
    """Sube un documento del paciente: una referencia o nota de otro médico, u otro archivo.

    Plan 32, punto 6: un resultado de laboratorio o un estudio de imagen ya no
    entra aquí como archivo suelto. El de una orden se adjunta a su orden y el
    de otro lugar se sube como estudio externo, para que llegue a Estudios.
    Así el médico se entera y la orden no se queda «pendiente» (C4).
    """
    if document_type in (DocumentType.LAB_RESULT, DocumentType.IMAGING_STUDY):
        raise HTTPException(
            status_code=422,
            detail="Los resultados de estudios no se suben como documento: adjúntalo a su orden o súbelo como estudio de otro lugar.",
        )
    # «Otros archivos» los guarda el médico; recepción sube referencias de otro médico.
    if document_type == DocumentType.OTHER and "medical_history.read" not in get_user_permissions(current_user, db):
        raise HTTPException(status_code=403, detail="Desde recepción se suben referencias o notas de otro médico.")
    patient = _patient_with_document_access(db, patient_id, current_user)

    # Validate real file size/content before touching disk - never trust the
    # client-supplied Content-Type header or an unbounded upload size.
    content, detected_mime = await read_and_validate_upload(
        file,
        allowed_mime_types=ALLOWED_DOCUMENT_MIME_TYPES,
        max_size_bytes=MAX_DOCUMENT_SIZE_BYTES,
    )

    # Generate unique filename (UUID-based; the original filename is only
    # kept as display metadata, sanitized below, never used as a disk path)
    file_extension = extension_for_mime(detected_mime)
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    relative_path = str(UPLOAD_DIR / unique_filename)

    try:
        default_storage.save(relative_path, content)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="No se pudo guardar el archivo. Inténtalo otra vez; si vuelve a fallar, avisa al equipo de soporte.") from exc

    safe_display_name = sanitize_text(
        Path(file.filename).name if file.filename else "documento", 255
    )

    # Create database record
    db_document = PatientDocument(
        patient_id=patient_id,
        tenant_id=current_user.tenant_id,
        uploaded_by_user_id=current_user.id,
        document_type=document_type,
        title=sanitize_text(title, 255),
        description=description,
        file_path=relative_path,
        file_name=safe_display_name,
        file_size=len(content),
        mime_type=detected_mime,
        lab_name=sanitize_text(lab_name, 255) if lab_name else lab_name,
        study_date=study_date,
    )

    try:
        db.add(db_document)
        db.flush()
        # El aviso a los médicos va en la misma transacción que el documento
        # (plan 27, M-4): si falla, no queda un documento registrado a medias
        # con un 500 que invita a subirlo otra vez.
        _avisar_documento_nuevo(db, db_document, patient, current_user)
        db.commit()
        db.refresh(db_document)
    except Exception as exc:
        db.rollback()
        default_storage.delete(relative_path)
        raise HTTPException(status_code=500, detail="El archivo se subió pero no se pudo registrar en el expediente. Inténtalo de nuevo; si vuelve a fallar, avisa al equipo de soporte.") from exc

    return db_document


@router.get("/patient/{patient_id}", response_model=list[PatientDocumentResponse])
def get_patient_documents(
    *,
    db: Session = Depends(get_db),
    patient_id: int,
    current_user: User = Depends(require_permission("documents.read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    anulados: bool = Query(False, description="Solo administración: los anulados en vez de los vigentes"),
    incluir_resultados: bool = Query(False, description="También los archivos que son resultado de un estudio"),
    response: Response,
):
    """Get one bounded page of documents for a patient.

    Los anulados no salen en la lista normal; con ``anulados=true`` la
    administración ve solo esos, para revisarlos o revertirlos (plan 29).
    """
    _patient_with_document_access(db, patient_id, current_user)
    registrar_acceso(db, current_user, patient_id, SeccionClinica.DOCUMENTOS)
    if anulados and not correccion.es_administracion(current_user):
        raise HTTPException(status_code=403, detail="Solo la administración puede ver los documentos anulados.")

    query = (
        filtrar_resultados_ajenos(
            scoped_query(db.query(PatientDocument), PatientDocument, current_user), db, current_user
        )
        .filter(PatientDocument.patient_id == patient_id)
        .filter(PatientDocument.anulado_at.isnot(None) if anulados else PatientDocument.anulado_at.is_(None))
    )
    # Los resultados de estudios viven en Estudios, no aquí (plan 32, punto 6):
    # antes el mismo archivo salía dos veces, con nombres distintos (C3). No se
    # migra nada; solo se filtra al listar, y la cabecera dice cuántos hay
    # para ofrecer «Ver en Estudios».
    if not incluir_resultados:
        from sqlalchemy import select

        de_resultados = select(DiagnosticResult.patient_document_id).where(DiagnosticResult.patient_document_id.isnot(None))
        response.headers["X-Resultados-En-Estudios"] = str(query.filter(PatientDocument.id.in_(de_resultados)).count())
        query = query.filter(PatientDocument.id.notin_(de_resultados))
    # Recepción ve las referencias de otro médico y lo que ella subió; los
    # «otros archivos» son del médico (decisión de Emilio).
    if "medical_history.read" not in get_user_permissions(current_user, db):
        query = query.filter(
            (PatientDocument.document_type == DocumentType.EXTERNAL_NOTE)
            | (PatientDocument.uploaded_by_user_id == current_user.id)
        )
    documents = query.order_by(PatientDocument.created_at.desc()).offset(skip).limit(limit).all()

    log_action(
        db,
        action="document.list_viewed",
        entity_type="patient",
        entity_id=patient_id,
        actor_user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        details={"document_count": len(documents)},
    )

    return documents


@router.get("/{document_id}", response_model=PatientDocumentResponse)
def get_document(
    *,
    db: Session = Depends(get_db),
    document_id: int,
    current_user: User = Depends(require_permission("documents.read")),
):
    """Get a specific document"""
    document = _documento(db, document_id, current_user, incluir_anulado=True)

    log_action(
        db,
        action="document.metadata_viewed",
        entity_type="patient_document",
        entity_id=document.id,
        actor_user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        details={"patient_id": document.patient_id},
    )

    return document


@router.put("/{document_id}", response_model=PatientDocumentResponse)
def update_document(
    *,
    db: Session = Depends(get_db),
    document_id: int,
    document_in: PatientDocumentUpdate,
    current_user: User = Depends(require_permission("documents.update")),
):
    """Update document metadata"""
    document = _documento(db, document_id, current_user)

    # Update fields
    update_data = document_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(document, field, value)

    db.add(document)
    db.commit()
    db.refresh(document)

    return document


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    *,
    db: Session = Depends(get_db),
    document_id: int,
    current_user: User = Depends(require_permission("documents.delete")),
):
    """Los documentos clínicos no se borran (plan 29, lote 7).

    Antes borraba el archivo y el registro sin dejar rastro del contenido. Un
    documento subido por error se anula (con motivo, y se puede revertir) o se
    mueve al paciente correcta.
    """
    _documento(db, document_id, current_user, incluir_anulado=True)
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Los documentos clínicos no se borran. Anúlalo con su motivo o muévelo al paciente correcta.",
    )


@router.post("/{document_id}/anular", response_model=PatientDocumentResponse)
def anular_documento(
    *,
    db: Session = Depends(get_db),
    document_id: int,
    datos: MotivoDeCorreccion,
    current_user: User = Depends(require_permission("documents.read")),
):
    """Anula un documento subido por error: sale de las vistas, el archivo se conserva.

    La puerta es ``documents.read`` y no ``documents.correct`` a propósito: quien
    subió el documento puede corregirlo en sus primeras 24 h aunque no tenga el
    permiso (plan 29, lote 7). Esa regla la aplica ``correccion.anular``.
    """
    documento = _documento(db, document_id, current_user)
    return correccion.anular(db, documento, current_user, datos.motivo)


@router.post("/{document_id}/revertir-anulacion", response_model=PatientDocumentResponse)
def revertir_anulacion_de_documento(
    *,
    db: Session = Depends(get_db),
    document_id: int,
    datos: MotivoDeCorreccion,
    current_user: User = Depends(require_permission("documents.correct")),
):
    """Solo administración con ``documents.correct``: devuelve un anulado a las vistas."""
    documento = _documento(db, document_id, current_user, incluir_anulado=True)
    return correccion.revertir_anulacion(db, documento, current_user, datos.motivo)


@router.post("/{document_id}/mover", response_model=PatientDocumentResponse)
def mover_documento(
    *,
    db: Session = Depends(get_db),
    document_id: int,
    datos: MoverDocumento,
    current_user: User = Depends(require_permission("documents.read")),
):
    """Mueve un documento al paciente correcta, de la misma sucursal.

    Misma puerta y misma regla que anular: ``documents.correct`` o quien lo
    subió en las primeras 24 h, aplicada en ``correccion.mover``.
    """
    documento = _documento(db, document_id, current_user)
    # La de destino, con el mismo alcance que subirle un documento.
    destino = _patient_with_document_access(db, datos.patient_id, current_user)
    return correccion.mover(db, documento, current_user, destino.id, datos.motivo, destino.tenant_id)


@router.get("/{document_id}/download")
def download_document(
    *,
    db: Session = Depends(get_db),
    document_id: int,
    current_user: User = Depends(require_permission("documents.read")),
):
    """Download the document file"""
    document = _documento(db, document_id, current_user, incluir_anulado=True)
    registrar_acceso(db, current_user, document.patient_id, SeccionClinica.DOCUMENTOS)

    if not default_storage.exists(document.file_path):
        raise HTTPException(status_code=404, detail="El archivo ya no está guardado en el sistema. Vuelve a subirlo desde el expediente del paciente.")

    log_action(
        db,
        action="document.downloaded",
        entity_type="patient_document",
        entity_id=document.id,
        actor_user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        details={"patient_id": document.patient_id, "file_name": document.file_name},
    )

    return storage_response(document.file_path, filename=document.file_name, media_type=document.mime_type)
