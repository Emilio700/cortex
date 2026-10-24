"""Corrección de documentos clínicos subidos al paciente equivocada (plan 29, lote 7).

Diseño aprobado por Emilio (delegado en el orquestador), que manda:

- **Nunca borrado físico.** «Anular» saca el documento de las vistas normales
  con motivo, quién y cuándo; el archivo y el registro se conservan y la
  anulación se puede revertir.
- **Mover** a otro paciente, con motivo: queda de quién venía
  (``movido_desde_patient_id``) y la bitácora lo registra en las DOS pacientes.
- **Quién:** permiso ``documents.correct`` (de fábrica doctora y
  administración; recepción no) o quien lo subió, solo en las primeras 24 h.
  Siempre con el mismo alcance de sucursal y de relación asistencial que el
  resto de documentos.
- **Ver anulados y revertir:** solo administración (y Master).
- **Documento que es el archivo de un resultado de orden:** no se anula ni se
  mueve desde aquí. Moverlo dejaría la orden (y la bandeja, la incidencia
  crítica y el expediente) apuntando al estudio de otro paciente; anularlo
  dejaría el resultado sin su archivo diciendo que lo tiene. Se corrige desde
  la orden con «Anular resultado» (plan 29, lote 9), que anula el resultado y
  su archivo juntos; el de un resultado ya anulado no se bloquea.
"""
from datetime import timedelta
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_user_permissions
from app.db.session import utcnow
from app.models.clinical_tracking import DiagnosticResult
from app.models.notification import Notification, NotificationType
from app.models.patient_document import PatientDocument
from app.models.user import Role, User
from app.services.audit_service import log_action

PERMISO = "documents.correct"
VENTANA_DE_QUIEN_LO_SUBIO = timedelta(hours=24)

NO_ENCONTRADO = "No se encontró el documento. Puede que lo hayan corregido; actualiza la lista de documentos."


def es_administracion(user: User) -> bool:
    return user.role in (Role.ADMIN, Role.MASTER)


def puede_corregir(db: Session, documento: PatientDocument, user: User) -> bool:
    """Con el permiso, o quien lo subió dentro de las primeras 24 h."""
    if PERMISO in get_user_permissions(user, db):
        return True
    reciente = documento.created_at is not None and utcnow() - documento.created_at <= VENTANA_DE_QUIEN_LO_SUBIO
    return documento.uploaded_by_user_id == user.id and reciente


def exigir_que_pueda_corregir(db: Session, documento: PatientDocument, user: User) -> None:
    if not puede_corregir(db, documento, user):
        detalle = (
            "Ya pasaron 24 horas desde que lo subiste: pide la corrección al médico o a la administración."
            if documento.uploaded_by_user_id == user.id
            else "No tienes permiso para corregir documentos. Pídeselo al médico o a la administración."
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detalle)


def exigir_que_no_sea_resultado(db: Session, documento: PatientDocument) -> None:
    """Un archivo de resultado de orden no se toca desde Documentos (ver arriba)."""
    resultado = (
        db.query(DiagnosticResult)
        .filter(DiagnosticResult.patient_document_id == documento.id, DiagnosticResult.anulado_at.is_(None))
        .order_by(DiagnosticResult.id.asc())
        .first()
    )
    if resultado is None:
        return
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=(
            f"Este archivo es el resultado de la orden n.º {resultado.diagnostic_order_id} de este paciente. "
            "No se anula ni se mueve desde Documentos, para que la orden y la bandeja de resultados no queden "
            "apuntando a un archivo equivocado. Ábrelo desde la orden y usa «Anular resultado»: anula el "
            "resultado y este archivo juntos (el médico que pidió el estudio o la administración)."
        ),
    )


def _retirar_avisos(db: Session, documento: PatientDocument, user: User) -> None:
    """Los avisos de «Nuevo documento» de este archivo dejan de pedir que se vea.

    Son informativos, así que el resolutor general no los toca; aquí sí: el
    documento ya no está donde el aviso dice.
    """
    ahora = utcnow()
    for aviso in (
        db.query(Notification)
        .filter(
            Notification.type == NotificationType.DOCUMENT_UPLOADED,
            Notification.entity_type == "patient_document",
            Notification.entity_id == documento.id,
            Notification.resolved_at.is_(None),
        )
        .all()
    ):
        aviso.resolved_at = ahora
        aviso.resolved_by_user_id = user.id
        aviso.resolution = "retirado"
        aviso.is_read = True


def anular(db: Session, documento: PatientDocument, user: User, motivo: str) -> PatientDocument:
    if documento.anulado_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este documento ya estaba anulado.")
    exigir_que_pueda_corregir(db, documento, user)
    exigir_que_no_sea_resultado(db, documento)
    documento.anulado_at = utcnow()
    documento.anulado_por_user_id = user.id
    documento.anulado_motivo = motivo
    _retirar_avisos(db, documento, user)
    db.commit()
    db.refresh(documento)
    log_action(
        db,
        action="document.voided",
        entity_type="patient_document",
        entity_id=documento.id,
        actor_user_id=user.id,
        tenant_id=documento.tenant_id,
        patient_id=documento.patient_id,
        reason=motivo,
        details={"title": documento.title, "file_name": documento.file_name},
    )
    return documento


def revertir_anulacion(db: Session, documento: PatientDocument, user: User, motivo: str) -> PatientDocument:
    if not es_administracion(user) or PERMISO not in get_user_permissions(user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo la administración puede revertir la anulación de un documento.",
        )
    if documento.anulado_at is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este documento no está anulado.")
    anterior = {"anulado_at": documento.anulado_at.isoformat(), "anulado_motivo": documento.anulado_motivo}
    documento.anulado_at = None
    documento.anulado_por_user_id = None
    documento.anulado_motivo = None
    db.commit()
    db.refresh(documento)
    log_action(
        db,
        action="document.void_reverted",
        entity_type="patient_document",
        entity_id=documento.id,
        actor_user_id=user.id,
        tenant_id=documento.tenant_id,
        patient_id=documento.patient_id,
        reason=motivo,
        details=anterior,
    )
    return documento


def mover(
    db: Session,
    documento: PatientDocument,
    user: User,
    destino_patient_id: int,
    motivo: str,
    destino_tenant_id: Optional[int],
) -> PatientDocument:
    if documento.anulado_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este documento está anulado. Revierte la anulación antes de moverlo.",
        )
    if destino_patient_id == documento.patient_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El documento ya es de ese paciente.")
    if destino_tenant_id != documento.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se puede mover a un paciente de la misma sucursal.",
        )
    exigir_que_pueda_corregir(db, documento, user)
    exigir_que_no_sea_resultado(db, documento)
    origen = documento.patient_id
    documento.movido_desde_patient_id = origen
    documento.patient_id = destino_patient_id
    documento.movido_at = utcnow()
    documento.movido_por_user_id = user.id
    documento.movido_motivo = motivo
    _retirar_avisos(db, documento, user)
    db.commit()
    db.refresh(documento)
    detalles = {"desde_patient_id": origen, "hacia_patient_id": destino_patient_id, "title": documento.title}
    # En las dos pacientes: en la de origen se ve que salió, y a dónde; en la
    # de destino, que llegó y de dónde.
    for patient_id, accion in ((origen, "document.moved_out"), (destino_patient_id, "document.moved_in")):
        log_action(
            db,
            action=accion,
            entity_type="patient_document",
            entity_id=documento.id,
            actor_user_id=user.id,
            tenant_id=documento.tenant_id,
            patient_id=patient_id,
            reason=motivo,
            details=detalles,
        )
    return documento
