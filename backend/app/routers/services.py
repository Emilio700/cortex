"""Services router - Catalog of billable services (Fase 3.1)"""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_permission
from app.core.tenant_scope import scoped_query
from app.models.service import Service
from app.models.user import Role, User
from app.schemas.service import ServiceCreate, ServiceResponse, ServiceUpdate

router = APIRouter(prefix="/services", tags=["Services"])


@router.get("", response_model=list[ServiceResponse])
def list_services(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("services.read"))],
    include_inactive: bool = Query(False, description="Include deactivated services"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    """
    List services in the caller's tenant.

    Lo lee quien tiene ``services.read`` (los tres roles lo traen: recepción y
    el médico cobran con él). Antes bastaba con haber iniciado sesión, y
    quitar el permiso a un perfil no le cerraba el catálogo (B-03). Only
    active services are returned by default.
    """
    query = scoped_query(db.query(Service), Service, current_user)
    if not include_inactive:
        query = query.filter(Service.is_active == True)  # noqa: E712

    query = query.order_by(Service.name)
    return query.offset(skip).limit(limit).all()


@router.post("", response_model=ServiceResponse, status_code=status.HTTP_201_CREATED)
def create_service(
    service_data: ServiceCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("services.create"))],
):
    """Create a new service in the catalog (Secretaria/Admin only)"""
    new_service = Service(tenant_id=current_user.tenant_id, **service_data.model_dump())

    db.add(new_service)
    db.commit()
    db.refresh(new_service)

    return new_service


@router.get("/{service_id}", response_model=ServiceResponse)
def get_service(
    service_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("services.read"))],
):
    """Get a service by ID"""
    service = scoped_query(db.query(Service), Service, current_user).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el servicio. Revisa el catálogo de servicios.")

    return service


@router.put("/{service_id}", response_model=ServiceResponse)
def update_service(
    service_id: int,
    service_data: ServiceUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("services.update"))],
):
    """Update a service (Secretaria/Admin only)"""
    service = scoped_query(db.query(Service), Service, current_user).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el servicio. Revisa el catálogo de servicios.")

    update_data = service_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(service, field, value)

    db.commit()
    db.refresh(service)

    return service


@router.patch("/{service_id}/deactivate", response_model=ServiceResponse)
def deactivate_service(
    service_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("services.delete"))],
):
    """Deactivate a service (soft delete - Admin only)"""
    service = scoped_query(db.query(Service), Service, current_user).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el servicio. Revisa el catálogo de servicios.")

    service.is_active = False
    db.commit()
    db.refresh(service)

    return service
