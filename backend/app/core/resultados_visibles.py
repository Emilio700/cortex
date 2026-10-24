"""Qué archivos de resultado de estudio puede abrir quien no lleva lo clínico.

Plan 32, punto 7 (C2). Cada resultado de una orden se guarda también como
``PatientDocument`` («Resultado: {estudio}»), y ``/documents`` solo pedía
``documents.read``: recepción podía listar y abrir el resultado de cualquier
paciente de la sucursal.

Decisión de Emilio (plan 32, punto 6, decisión 2): recepción sí ve el archivo
del resultado que **ella** recibió o subió («si le llegaron primero, que sí los
vea»), pero no navega por los resultados de cualquier paciente. La
interpretación, la valoración y las notas de la doctora viven en
``DiagnosticResult`` y ``/documents`` nunca las devuelve.

Quien tiene ``clinical_tracking.read`` (la doctora, la administración) ve
todos: es el permiso que ya abre la bandeja de resultados.
"""
from __future__ import annotations

from sqlalchemy import and_, exists, or_
from sqlalchemy.orm import Query, Session

from app.core.deps import get_user_permissions
from app.models.clinical_tracking import DiagnosticResult
from app.models.patient_document import PatientDocument
from app.models.user import User

PERMISO_DE_RESULTADOS = "clinical_tracking.read"


def ve_todos_los_resultados(db: Session, user: User) -> bool:
    return PERMISO_DE_RESULTADOS in get_user_permissions(user, db)


def _resultado_de_otra_persona(user: User):
    """El documento es archivo de un resultado que no registró esta persona."""
    return exists().where(
        and_(
            DiagnosticResult.patient_document_id == PatientDocument.id,
            DiagnosticResult.recorded_by_user_id != user.id,
        )
    )


def filtrar_resultados_ajenos(query: Query, db: Session, user: User) -> Query:
    """Quita de una consulta de ``PatientDocument`` los resultados que no le tocan."""
    if ve_todos_los_resultados(db, user):
        return query
    return query.filter(
        or_(PatientDocument.uploaded_by_user_id == user.id, ~_resultado_de_otra_persona(user))
    )


def puede_abrir_documento(db: Session, documento: PatientDocument, user: User) -> bool:
    if ve_todos_los_resultados(db, user) or documento.uploaded_by_user_id == user.id:
        return True
    ajeno = (
        db.query(DiagnosticResult.id)
        .filter(
            DiagnosticResult.patient_document_id == documento.id,
            DiagnosticResult.recorded_by_user_id != user.id,
        )
        .first()
    )
    return ajeno is None
