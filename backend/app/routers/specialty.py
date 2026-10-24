"""Specialty catalog router (Fase 6.1 - multiespecialidad base)"""
import re
import unicodedata
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_permission
from app.models.specialty import Specialty
from app.models.user import Role, User
from app.schemas.specialty import SpecialtyCreate, SpecialtyResponse, SpecialtyUpdate
from app.services.audit_service import log_action

router = APIRouter(prefix="/specialties", tags=["specialties"])


def _slugify(name: str) -> str:
    # Strip accents (Ginecología -> Ginecologia) before collapsing to
    # ASCII, so accented specialty names still get a readable slug instead
    # of stray hyphens where each accented letter used to be.
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", normalized.strip().lower()).strip("-")
    return slug or "especialidad"


@router.get("", response_model=List[SpecialtyResponse])
def list_specialties(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("services.read"))],
):
    """List active specialties. Global catalog, not tenant-scoped (Fase 6.1).

    No hay un permiso de especialidades: el catálogo se administra con
    ``services.create``/``services.update`` y se lee con ``services.read``,
    que traen los tres roles (la doctora en su perfil, recepción en el
    prerregistro, administración en los servicios). B-03.
    """
    return db.query(Specialty).filter(Specialty.is_active.is_(True)).order_by(Specialty.name).all()


@router.post("", response_model=SpecialtyResponse, status_code=status.HTTP_201_CREATED)
def create_specialty(
    data: SpecialtyCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("services.create"))],
):
    """Create a new specialty (Admin only)."""
    slug = _slugify(data.name)
    if db.query(Specialty).filter(Specialty.slug == slug).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ya existe una especialidad con ese nombre. Escribe otro nombre.")

    specialty = Specialty(name=data.name, slug=slug, description=data.description)
    db.add(specialty)
    db.commit()
    db.refresh(specialty)

    log_action(
        db,
        action="specialty.created",
        entity_type="specialty",
        entity_id=specialty.id,
        actor_user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        details={"name": specialty.name},
    )

    return specialty


@router.patch("/{specialty_id}", response_model=SpecialtyResponse)
def update_specialty(
    specialty_id: int,
    data: SpecialtyUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("services.update"))],
):
    """Update a specialty (Admin only). Renaming does not update the slug,
    to avoid dangling references - the slug is a stable identifier."""
    specialty = db.query(Specialty).filter(Specialty.id == specialty_id).first()
    if not specialty:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la especialidad. Puede que la hayan eliminado; actualiza la lista.")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(specialty, field, value)

    db.commit()
    db.refresh(specialty)

    log_action(
        db,
        action="specialty.updated",
        entity_type="specialty",
        entity_id=specialty.id,
        actor_user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        details=update_data,
    )

    return specialty
