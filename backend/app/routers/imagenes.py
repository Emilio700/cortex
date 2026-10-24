"""Las imágenes de un paciente, unificadas en la pantalla (plan 32, punto 6).

Hay dos repositorios y se quedan como están: ``clinical_images`` (fotos,
ultrasonidos y procedimientos subidos en la consulta) y los documentos tipo
``imaging_study`` (rayos X, ultrasonidos o mastografías que trajo el paciente,
o el resultado de una orden de imagen). Mover archivos clínicos entre tablas
es el cambio que, si falla a la mitad, deja expedientes incompletos: aquí solo
se **leen** las dos fuentes, se juntan por fecha y se nombran con un solo
catálogo de categorías, sin cambiar lo guardado.

Permisos por origen (decisión 2 de Emilio): las fotos clínicas, solo quien las
lee (la dueña del expediente); los estudios de imagen, con la regla de
Documentos, así recepción ve solo los que ella recibió. Lo anulado no sale.
"""
from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.access_scope import filtrar_pacientes_del_alcance, resolver_paciente_de_su_duena
from app.core.deps import get_db, get_user_permissions, require_permission
from app.core.resultados_visibles import filtrar_resultados_ajenos
from app.core.tenant_scope import scoped_query
from app.models.acceso_clinico import SeccionClinica
from app.models.clinical_image import ClinicalImage
from app.models.clinical_tracking import DiagnosticOrder, DiagnosticResult
from app.models.patient import Patient
from app.models.patient_document import DocumentType, PatientDocument
from app.models.user import User
from app.services.anular_resultado import VIGENTE
from app.services.bitacora_accesos import registrar_acceso

router = APIRouter(prefix="/patients", tags=["imagenes"])

# Un solo catálogo de nombres para las dos fuentes; lo guardado no cambia.
CATEGORIAS = {
    "foto_clinica": "Foto clínica",
    "ultrasonido": "Ultrasonido",
    "rayos_x": "Rayos X",
    "mastografia": "Mastografía",
    "procedimiento": "Procedimiento",
    "referencia": "Imagen de referencia",
    "estudio_de_imagen": "Estudio de imagen",
    "otro": "Otro",
}
DE_IMAGEN_CLINICA = {
    "clinical_photo": "foto_clinica",
    "ultrasound": "ultrasonido",
    "procedure": "procedimiento",
    "reference": "referencia",
    "other": "otro",
}
TOPE_POR_FUENTE = 500


def categoria_de_estudio(nombre: str) -> str:
    """Del nombre del estudio a la categoría visible, sin tocar lo guardado."""
    texto = (nombre or "").lower()
    if "mastograf" in texto or "mamograf" in texto:
        return "mastografia"
    if texto.startswith("rx") or "rayos x" in texto or "radiograf" in texto:
        return "rayos_x"
    if "ultrason" in texto or texto.startswith("us ") or "eco" in texto:
        return "ultrasonido"
    return "estudio_de_imagen"


class ImagenDePaciente(BaseModel):
    origen: str  # consulta | documento | resultado
    id: int  # el id en su propia tabla
    categoria: str
    categoria_texto: str
    fecha: datetime
    titulo: str
    file_name: str
    mime_type: Optional[str] = None
    subido_por: Optional[str] = None
    appointment_id: Optional[int] = None
    order_id: Optional[int] = None
    # Por dónde se abre: imagen clínica o documento.
    descarga: str


@router.get("/{patient_id}/imagenes", response_model=list[ImagenDePaciente])
def imagenes_de_paciente(
    patient_id: int,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("patients.read"))],
    categoria: Optional[str] = Query(None, max_length=40),
    anio: Optional[int] = Query(None, ge=1900, le=2100),
    skip: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
):
    """Fotos clínicas y estudios de imagen en una sola lista, de lo más nuevo a lo más viejo."""
    paciente = filtrar_pacientes_del_alcance(scoped_query(db.query(Patient), Patient, user), user).filter(
        Patient.id == patient_id
    ).first()
    if paciente is None:
        raise HTTPException(status_code=404, detail="No se encontró el paciente.")
    if categoria is not None and categoria not in CATEGORIAS:
        raise HTTPException(status_code=422, detail=f"Categoría desconocida: {categoria}.")
    permisos = get_user_permissions(user, db)
    items: list[ImagenDePaciente] = []
    nombres: dict[int, str] = {}

    if "clinical_images.read" in permisos:
        try:
            resolver_paciente_de_su_duena(db, patient_id, user, detalle_403="")
            ve_fotos = True
        except HTTPException:
            ve_fotos = False
        if ve_fotos:
            for img in (
                scoped_query(db.query(ClinicalImage), ClinicalImage, user)
                .filter(ClinicalImage.patient_id == patient_id, ClinicalImage.is_archived.is_(False))
                .order_by(ClinicalImage.taken_at.desc())
                .limit(TOPE_POR_FUENTE)
            ):
                clave = DE_IMAGEN_CLINICA.get(img.category, "otro")
                items.append(ImagenDePaciente(
                    origen="consulta", id=img.id, categoria=clave, categoria_texto=CATEGORIAS[clave],
                    fecha=img.taken_at, titulo=img.caption or img.body_region or CATEGORIAS[clave],
                    file_name=img.file_name, mime_type=img.mime_type, appointment_id=img.appointment_id,
                    descarga=f"/clinical-images/{img.id}/download",
                    subido_por=str(img.uploaded_by_user_id),
                ))

    if "documents.read" in permisos or "clinical_tracking.read" in permisos:
        filas = (
            filtrar_resultados_ajenos(scoped_query(db.query(PatientDocument), PatientDocument, user), db, user)
            .filter(
                PatientDocument.patient_id == patient_id,
                PatientDocument.document_type == DocumentType.IMAGING_STUDY,
                PatientDocument.anulado_at.is_(None),
            )
            .order_by(PatientDocument.created_at.desc())
            .limit(TOPE_POR_FUENTE)
            .all()
        )
        ordenes = {
            doc_id: (order_id, study_name)
            for doc_id, order_id, study_name in db.query(
                DiagnosticResult.patient_document_id, DiagnosticOrder.id, DiagnosticOrder.study_name
            )
            .join(DiagnosticOrder, DiagnosticOrder.id == DiagnosticResult.diagnostic_order_id)
            .filter(DiagnosticResult.patient_document_id.in_([d.id for d in filas] or [-1]), VIGENTE)
        }
        for doc in filas:
            orden = ordenes.get(doc.id)
            clave = categoria_de_estudio(orden[1] if orden else doc.title)
            items.append(ImagenDePaciente(
                origen="resultado" if orden else "documento", id=doc.id, categoria=clave,
                categoria_texto=CATEGORIAS[clave], fecha=doc.created_at,
                titulo=orden[1] if orden else doc.title, file_name=doc.file_name, mime_type=doc.mime_type,
                order_id=orden[0] if orden else None, descarga=f"/documents/{doc.id}/download",
                subido_por=str(doc.uploaded_by_user_id),
            ))

    # Los nombres de quien subió, en una sola consulta.
    ids = {int(i.subido_por) for i in items if i.subido_por}
    if ids:
        nombres = {uid: nombre for uid, nombre in db.query(User.id, User.full_name).filter(User.id.in_(ids))}
    for i in items:
        i.subido_por = nombres.get(int(i.subido_por)) if i.subido_por else None

    if categoria:
        items = [i for i in items if i.categoria == categoria]
    if anio:
        items = [i for i in items if i.fecha.year == anio]
    items.sort(key=lambda i: (i.fecha, i.origen, i.id), reverse=True)
    response.headers["X-Total-Count"] = str(len(items))
    if items:
        registrar_acceso(db, user, patient_id, SeccionClinica.IMAGENES)
    return items[skip : skip + limit]
