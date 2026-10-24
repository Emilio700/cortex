"""Estudios de otro lugar y resultados viejos sin orden (plan 32, punto 6).

Regla de arquitectura adoptada: «si GEMS puede saber qué estudio representa
un archivo, no lo guarda como archivo suelto».

- **Estudio de otro lugar**: lo que el paciente trae de otro médico o
  laboratorio, sin orden de GEMS. Nace como una orden con ``origen='externo'``
  ya con su resultado recibido, así va a Estudios, el médico lo valora y lo
  revisa igual que uno propio, y cuenta en la gráfica y en la línea de tiempo.
- **Resultados viejos sin orden**: antes de este cambio el modal de Documentos
  ofrecía «Resultado de Laboratorio» y no lo ligaba a nada (C4). Se listan y
  el médico los liga a su orden pendiente o los marca como estudio externo.
  Nada se cambia solo, y el archivo no se mueve ni se copia: se le crea su
  resultado apuntando al mismo documento.
"""
import uuid
from datetime import date
from pathlib import Path
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.access_scope import exigir_autoria_clinica, resolver_paciente_con_relacion_asistencial
from app.core.deps import get_db, require_permission
from app.core.hora_local import hoy_local
from app.core.storage import default_storage
from app.core.tenant_scope import scoped_query
from app.models.acceso_clinico import SeccionClinica
from app.models.clinical_tracking import DiagnosticOrder, DiagnosticResult
from app.models.patient import Patient
from app.models.patient_document import DocumentType, PatientDocument
from app.models.user import Role, User
from app.services import avisos_de_atrasados, avisos_de_resultados
from app.services.audit_service import log_action
from app.services.bitacora_accesos import registrar_acceso
from app.utils.sanitize import sanitize_text
from app.utils.uploads import (
    ALLOWED_DOCUMENT_MIME_TYPES,
    MAX_DOCUMENT_SIZE_BYTES,
    extension_for_mime,
    read_and_validate_upload,
)

router = APIRouter(prefix="/clinical-tracking", tags=["clinical-tracking"])

ORIGEN_EXTERNO = "externo"
CATEGORIAS = ("laboratory", "gynecology", "breast", "obstetric", "imaging", "neurophysiology", "other")
TIPO_POR_CATEGORIA = {
    "laboratory": DocumentType.LAB_RESULT,
    "gynecology": DocumentType.LAB_RESULT,
    "breast": DocumentType.IMAGING_STUDY,
    "obstetric": DocumentType.IMAGING_STUDY,
    "imaging": DocumentType.IMAGING_STUDY,
    "neurophysiology": DocumentType.IMAGING_STUDY,
}
INDICACION_EXTERNA = "Estudio de otro lugar, traído por el paciente."
TIPOS_QUE_PARECEN_RESULTADO = (DocumentType.LAB_RESULT, DocumentType.IMAGING_STUDY)


class EstudioExternoCreado(BaseModel):
    order_id: int
    result_id: int
    patient_document_id: int
    order_status: str


def _doctora_de(paciente: Patient, user: User) -> int:
    """De quién es el estudio: el médico que lo sube, o la dueña del expediente."""
    if user.role == Role.DOCTOR:
        return user.id
    if paciente.owner_doctor_id is None:
        raise HTTPException(
            status_code=409,
            detail="El paciente no tiene doctora asignada; pídele al médico que lo suba desde su expediente.",
        )
    return paciente.owner_doctor_id


def _orden_externa(paciente: Patient, doctora_id: int, *, study_name: str, category: str,
                   catalog_code: Optional[str], resulted_on: Optional[date], proveedor: Optional[str]) -> DiagnosticOrder:
    if category not in CATEGORIAS:
        raise HTTPException(status_code=422, detail=f"Categoría desconocida: {category}.")
    nombre = sanitize_text(study_name, 255) if study_name else ""
    if len(nombre.strip()) < 2:
        raise HTTPException(status_code=422, detail="Escribe qué estudio es.")
    return DiagnosticOrder(
        tenant_id=paciente.tenant_id,
        patient_id=paciente.id,
        doctor_id=doctora_id,
        category=category,
        study_name=nombre.strip(),
        catalog_code=(sanitize_text(catalog_code, 100) or None) if catalog_code else None,
        clinical_indication=INDICACION_EXTERNA,
        priority="routine",
        requested_on=resulted_on or hoy_local(),
        destination=proveedor,
        status="result_received",
        origen=ORIGEN_EXTERNO,
    )


@router.post("/external-studies", response_model=EstudioExternoCreado, status_code=status.HTTP_201_CREATED)
async def subir_estudio_externo(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.attach_result"))],
    patient_id: int = Form(..., gt=0),
    study_name: str = Form(..., max_length=255),
    category: str = Form("laboratory", max_length=60),
    catalog_code: Optional[str] = Form(None, max_length=100),
    resulted_on: Optional[date] = Form(None),
    reporting_provider: Optional[str] = Form(None, max_length=255),
    file: UploadFile = File(...),
):
    """Sube un estudio de otro lugar: nace en Estudios con su resultado recibido.

    Lo sube el médico o recepción (que suele recibirlo). Le llega a la
    doctora como resultado por revisar, igual que uno pedido en GEMS.
    """
    paciente = resolver_paciente_con_relacion_asistencial(db, patient_id, user)
    if resulted_on and resulted_on > hoy_local():
        raise HTTPException(status_code=422, detail="La fecha del estudio no puede ser futura.")
    proveedor = sanitize_text(reporting_provider, 255) if reporting_provider else None
    orden = _orden_externa(
        paciente, _doctora_de(paciente, user), study_name=study_name, category=category,
        catalog_code=catalog_code, resulted_on=resulted_on, proveedor=proveedor,
    )
    content, mime = await read_and_validate_upload(
        file, allowed_mime_types=ALLOWED_DOCUMENT_MIME_TYPES, max_size_bytes=MAX_DOCUMENT_SIZE_BYTES,
    )
    ruta = f"uploads/patient_documents/{uuid.uuid4()}{extension_for_mime(mime)}"
    try:
        default_storage.save(ruta, content)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="No se pudo guardar el archivo. Inténtalo otra vez.") from exc
    try:
        db.add(orden)
        db.flush()
        documento = PatientDocument(
            patient_id=paciente.id, tenant_id=paciente.tenant_id, uploaded_by_user_id=user.id,
            document_type=TIPO_POR_CATEGORIA.get(category, DocumentType.OTHER),
            title=sanitize_text(f"Resultado: {orden.study_name}", 255),
            file_path=ruta,
            file_name=sanitize_text(Path(file.filename).name if file.filename else "estudio", 255),
            file_size=len(content), mime_type=mime, lab_name=proveedor,
            study_date=resulted_on.isoformat() if resulted_on else None,
        )
        db.add(documento)
        db.flush()
        resultado = DiagnosticResult(
            tenant_id=paciente.tenant_id, diagnostic_order_id=orden.id, recorded_by_user_id=user.id,
            patient_document_id=documento.id, resulted_on=resulted_on, reporting_provider=proveedor,
            review_status="received",
        )
        db.add(resultado)
        avisos_de_resultados.avisar_resultado_recibido(db, orden, paciente, user)
        db.commit()
    except HTTPException:
        db.rollback()
        default_storage.delete(ruta)
        raise
    except Exception as exc:
        db.rollback()
        default_storage.delete(ruta)
        raise HTTPException(status_code=500, detail="El archivo se subió pero no se pudo registrar el estudio. Inténtalo de nuevo.") from exc
    log_action(
        db, action="diagnostic_order.external_created", entity_type="diagnostic_order", entity_id=orden.id,
        actor_user_id=user.id, tenant_id=orden.tenant_id, patient_id=paciente.id,
        details={"patient_id": paciente.id, "patient_document_id": documento.id},
    )
    return EstudioExternoCreado(order_id=orden.id, result_id=resultado.id, patient_document_id=documento.id,
                                order_status=orden.status)


class DocumentoSinOrden(BaseModel):
    id: int
    title: str
    file_name: str
    mime_type: Optional[str] = None
    document_type: str
    created_at: str
    lab_name: Optional[str] = None
    study_date: Optional[str] = None


def _sin_orden(db: Session, user: User, patient_id: int):
    from sqlalchemy import select

    ligados = select(DiagnosticResult.patient_document_id).where(DiagnosticResult.patient_document_id.isnot(None))
    return (
        scoped_query(db.query(PatientDocument), PatientDocument, user)
        .filter(
            PatientDocument.patient_id == patient_id,
            PatientDocument.anulado_at.is_(None),
            PatientDocument.document_type.in_(TIPOS_QUE_PARECEN_RESULTADO),
            PatientDocument.id.notin_(ligados),
        )
    )


@router.get("/patients/{patient_id}/resultados-sin-orden", response_model=list[DocumentoSinOrden])
def resultados_sin_orden(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.update"))],
):
    """Los archivos tipo «Resultado de laboratorio» o «Estudio de imagen» sin orden.

    Para el aviso discreto del expediente: «3 archivos parecen resultados sin
    orden — ligarlos». Solo el médico (quien interpreta).
    """
    resolver_paciente_con_relacion_asistencial(db, patient_id, user)
    registrar_acceso(db, user, patient_id, SeccionClinica.ESTUDIOS)
    filas = _sin_orden(db, user, patient_id).order_by(PatientDocument.created_at.desc()).all()
    return [
        DocumentoSinOrden(
            id=d.id, title=d.title, file_name=d.file_name, mime_type=d.mime_type,
            document_type=getattr(d.document_type, "value", d.document_type),
            created_at=d.created_at.isoformat(), lab_name=d.lab_name, study_date=d.study_date,
        )
        for d in filas
    ]


class LigarDocumento(BaseModel):
    """Ligar a una orden pendiente (``order_id``) o marcarlo como estudio externo."""

    order_id: Optional[int] = Field(default=None, gt=0)
    externo_study_name: Optional[str] = Field(default=None, max_length=255)
    externo_category: str = Field(default="laboratory", max_length=60)
    externo_catalog_code: Optional[str] = Field(default=None, max_length=100)


@router.post("/documents/{document_id}/ligar", response_model=EstudioExternoCreado)
def ligar_documento(
    document_id: int,
    datos: LigarDocumento,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.update"))],
):
    """Le crea su resultado a un archivo viejo sin orden; el archivo no se mueve."""
    if (datos.order_id is None) == (datos.externo_study_name is None):
        raise HTTPException(status_code=422, detail="Elige su orden pendiente o márcalo como estudio de otro lugar.")
    documento = scoped_query(db.query(PatientDocument), PatientDocument, user).filter(PatientDocument.id == document_id).first()
    if documento is None:
        raise HTTPException(status_code=404, detail="No se encontró el documento.")
    paciente = resolver_paciente_con_relacion_asistencial(db, documento.patient_id, user)
    if _sin_orden(db, user, documento.patient_id).filter(PatientDocument.id == documento.id).first() is None:
        raise HTTPException(status_code=409, detail="Este archivo ya es el resultado de un estudio, o está anulado.")

    if datos.order_id is not None:
        orden = scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user).filter(
            DiagnosticOrder.id == datos.order_id, DiagnosticOrder.patient_id == documento.patient_id
        ).first()
        if orden is None:
            raise HTTPException(status_code=404, detail="No se encontró esa orden del paciente.")
        exigir_autoria_clinica(orden.doctor_id, user, detalle="Solo puedes ligar resultados a órdenes que solicitaste")
        from app.services.estudios_atrasados import ESTADOS_SIN_RESULTADO

        if orden.status not in ESTADOS_SIN_RESULTADO + ("result_received", "reviewed"):
            raise HTTPException(status_code=409, detail="Esa orden está cancelada o rechazada; elige otra.")
    else:
        orden = _orden_externa(
            paciente, _doctora_de(paciente, user), study_name=datos.externo_study_name or "",
            category=datos.externo_category, catalog_code=datos.externo_catalog_code,
            resulted_on=None, proveedor=documento.lab_name,
        )
        db.add(orden)
        db.flush()
    resultado = DiagnosticResult(
        tenant_id=documento.tenant_id, diagnostic_order_id=orden.id, recorded_by_user_id=documento.uploaded_by_user_id,
        patient_document_id=documento.id, reporting_provider=documento.lab_name, review_status="received",
    )
    db.add(resultado)
    orden.status = "result_received"
    avisos_de_resultados.avisar_resultado_recibido(db, orden, paciente, user)
    avisos_de_atrasados.cerrar_si_ya_no_hay(db, orden.doctor_id, por_user_id=user.id)
    db.commit()
    log_action(
        db, action="patient_document.linked_to_order", entity_type="patient_document", entity_id=documento.id,
        actor_user_id=user.id, tenant_id=documento.tenant_id, patient_id=documento.patient_id,
        details={"order_id": orden.id, "externo": datos.order_id is None},
    )
    return EstudioExternoCreado(order_id=orden.id, result_id=resultado.id, patient_document_id=documento.id,
                                order_status=orden.status)
