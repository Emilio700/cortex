"""Secure clinical-image upload and retrieval endpoints."""

from datetime import datetime
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.access_scope import (
    exigir_autoria_clinica,
    resolver_paciente_de_su_duena,
)
from app.core.deps import get_db, require_permission
from app.core.storage import default_storage, storage_response
from app.core.tenant_scope import scoped_query
from app.db.session import utcnow
from app.models.acceso_clinico import SeccionClinica
from app.models.appointment import Appointment
from app.models.clinical_episode import ClinicalEpisode
from app.models.clinical_image import ClinicalImage, ClinicalImageCategory
from app.models.patient import Patient
from app.models.user import User
from app.schemas.clinical_image import ClinicalImageResponse, ClinicalImageUpdate
from app.services.audit_service import log_action
from app.services.bitacora_accesos import registrar_acceso
from app.utils.sanitize import sanitize_text
from app.utils.uploads import (
    ALLOWED_IMAGE_MIME_TYPES,
    MAX_IMAGE_SIZE_BYTES,
    extension_for_mime,
    read_and_validate_upload,
    sanitize_clinical_photo,
)

router = APIRouter(prefix="/clinical-images", tags=["clinical-images"])


def _patient_in_scope(db: Session, patient_id: int, current_user: User) -> Patient:
    # Las imágenes clínicas siguen la variante estrecha del alcance: sólo la
    # dueña del expediente, igual que los episodios de los que cuelgan.
    return resolver_paciente_de_su_duena(
        db,
        patient_id,
        current_user,
        detalle_403="Solo puedes acceder a imágenes de tus pacientes",
    )


def _image_in_scope(db: Session, image_id: int, current_user: User) -> ClinicalImage:
    image = (
        scoped_query(db.query(ClinicalImage), ClinicalImage, current_user)
        .filter(ClinicalImage.id == image_id)
        .first()
    )
    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la imagen clínica. Puede que la hayan eliminado; actualiza el expediente."
        )
    _patient_in_scope(db, image.patient_id, current_user)
    return image


def _validate_related_resources(
    db: Session,
    *,
    patient_id: int,
    appointment_id: int | None,
    clinical_episode_id: int | None,
    current_user: User,
) -> None:
    if appointment_id is not None:
        appointment = (
            scoped_query(db.query(Appointment), Appointment, current_user)
            .filter(Appointment.id == appointment_id)
            .first()
        )
        if not appointment or appointment.patient_id != patient_id:
            raise HTTPException(status_code=422, detail="La consulta no corresponde a la paciente")
        exigir_autoria_clinica(
            appointment.doctor_id,
            current_user,
            detalle="Solo puedes asociar imágenes a tus consultas",
        )
    if clinical_episode_id is not None:
        episode = (
            scoped_query(db.query(ClinicalEpisode), ClinicalEpisode, current_user)
            .filter(ClinicalEpisode.id == clinical_episode_id)
            .first()
        )
        if not episode or episode.patient_id != patient_id:
            raise HTTPException(
                status_code=422, detail="El episodio clínico no corresponde a la paciente"
            )


@router.get("/patient/{patient_id}", response_model=list[ClinicalImageResponse])
def list_clinical_images(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.read"))],
    appointment_id: int | None = Query(default=None),
    clinical_episode_id: int | None = Query(default=None),
    include_archived: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=18, ge=1, le=60),
) -> list[ClinicalImage]:
    """List an authorized patient's clinical images without exposing filesystem paths."""
    _patient_in_scope(db, patient_id, current_user)
    registrar_acceso(db, current_user, patient_id, SeccionClinica.IMAGENES)
    query = scoped_query(db.query(ClinicalImage), ClinicalImage, current_user).filter(
        ClinicalImage.patient_id == patient_id
    )
    if appointment_id is not None:
        query = query.filter(ClinicalImage.appointment_id == appointment_id)
    if clinical_episode_id is not None:
        query = query.filter(ClinicalImage.clinical_episode_id == clinical_episode_id)
    if not include_archived:
        query = query.filter(ClinicalImage.is_archived.is_(False))
    return query.order_by(ClinicalImage.taken_at.desc()).offset(skip).limit(limit).all()


@router.post("/upload", response_model=ClinicalImageResponse, status_code=status.HTTP_201_CREATED)
async def upload_clinical_image(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.upload"))],
    patient_id: int = Form(...),
    category: ClinicalImageCategory = Form(...),
    consent_obtained: bool = Form(...),
    file: UploadFile = File(...),
    appointment_id: int | None = Form(default=None),
    clinical_episode_id: int | None = Form(default=None),
    body_region: str | None = Form(default=None),
    caption: str | None = Form(default=None),
    taken_at: datetime | None = Form(default=None),
    is_reference: bool = Form(default=False),
) -> ClinicalImage:
    """Store a JPEG/PNG after explicit consent and relationship validation."""
    if not consent_obtained:
        raise HTTPException(
            status_code=422,
            detail="Se requiere confirmar el consentimiento para almacenar la imagen clínica",
        )
    patient = _patient_in_scope(db, patient_id, current_user)
    _validate_related_resources(
        db,
        patient_id=patient_id,
        appointment_id=appointment_id,
        clinical_episode_id=clinical_episode_id,
        current_user=current_user,
    )
    content, detected_mime = await read_and_validate_upload(
        file,
        allowed_mime_types=ALLOWED_IMAGE_MIME_TYPES,
        max_size_bytes=MAX_IMAGE_SIZE_BYTES,
    )
    content, thumbnail, detected_mime = sanitize_clinical_photo(content, detected_mime)
    filename = f"{uuid4()}{extension_for_mime(detected_mime)}"
    relative_path = f"uploads/clinical_images/{filename}"
    thumbnail_path = f"uploads/clinical_images/thumbnails/{uuid4()}.jpg"
    try:
        default_storage.save(relative_path, content)
        default_storage.save(thumbnail_path, thumbnail)
    except Exception as error:
        default_storage.delete(relative_path)
        default_storage.delete(thumbnail_path)
        raise HTTPException(
            status_code=500, detail="No fue posible guardar la imagen clínica"
        ) from error

    image = ClinicalImage(
        tenant_id=patient.tenant_id,
        patient_id=patient_id,
        appointment_id=appointment_id,
        clinical_episode_id=clinical_episode_id,
        uploaded_by_user_id=current_user.id,
        category=category.value,
        body_region=sanitize_text(body_region, 100) if body_region else None,
        caption=sanitize_text(caption, 2000) if caption else None,
        taken_at=taken_at or utcnow(),
        consent_obtained=True,
        consent_recorded_at=utcnow(),
        is_reference=is_reference,
        file_path=relative_path,
        thumbnail_path=thumbnail_path,
        file_name=sanitize_text(Path(file.filename or "imagen-clinica").name, 255),
        file_size=len(content),
        mime_type=detected_mime,
    )
    try:
        db.add(image)
        db.commit()
        db.refresh(image)
    except Exception as error:
        db.rollback()
        default_storage.delete(relative_path)
        default_storage.delete(thumbnail_path)
        raise HTTPException(
            status_code=500, detail="No fue posible registrar la imagen clínica"
        ) from error
    log_action(
        db,
        action="clinical_image.uploaded",
        entity_type="clinical_image",
        entity_id=image.id,
        actor_user_id=current_user.id,
        tenant_id=image.tenant_id,
        patient_id=patient_id,
        details={
            "patient_id": patient_id,
            "category": image.category,
            "appointment_id": appointment_id,
        },
    )
    return image


@router.patch("/{image_id}", response_model=ClinicalImageResponse)
def update_clinical_image(
    image_id: int,
    data: ClinicalImageUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.update"))],
) -> ClinicalImage:
    image = _image_in_scope(db, image_id, current_user)
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(image, field, value)
    db.commit()
    db.refresh(image)
    log_action(
        db,
        action="clinical_image.updated",
        entity_type="clinical_image",
        entity_id=image.id,
        actor_user_id=current_user.id,
        tenant_id=image.tenant_id,
        details={"changed_fields": sorted(changes.keys())},
    )
    return image


@router.get("/{image_id}/download")
def download_clinical_image(
    image_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.read"))],
) -> Response:
    image = _image_in_scope(db, image_id, current_user)
    if image.is_archived:
        raise HTTPException(status_code=404, detail="No se encontró la imagen clínica. Puede que la hayan eliminado; actualiza el expediente.")
    if not default_storage.exists(image.file_path):
        raise HTTPException(status_code=404, detail="El archivo de la imagen ya no está guardado en el sistema. Vuelve a subirla desde el expediente.")
    log_action(
        db,
        action="clinical_image.downloaded",
        entity_type="clinical_image",
        entity_id=image.id,
        actor_user_id=current_user.id,
        tenant_id=image.tenant_id,
        details={"patient_id": image.patient_id},
    )
    return storage_response(image.file_path, filename=image.file_name, media_type=image.mime_type)


@router.get("/{image_id}/thumbnail")
def clinical_image_thumbnail(
    image_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_images.read"))],
) -> Response:
    image = _image_in_scope(db, image_id, current_user)
    path = image.thumbnail_path or image.file_path
    if image.is_archived or not default_storage.exists(path):
        raise HTTPException(status_code=404, detail="No se encontró la imagen clínica. Puede que la hayan eliminado; actualiza el expediente.")
    return storage_response(
        path,
        filename=f"miniatura-{image.id}.jpg" if image.thumbnail_path else image.file_name,
        media_type="image/jpeg" if image.thumbnail_path else image.mime_type,
        inline=True,
    )
