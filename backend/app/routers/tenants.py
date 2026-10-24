"""Router de sucursales (tenants): alta, edición, activación y cambio de sucursal."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, get_db, require_role
from app.models.doctor_clinic import DoctorClinic
from app.models.tenant import Tenant
from app.models.user import User, Role
from app.routers.auth import _create_session, _issue_session_tokens
from app.schemas.tenant import (
    TenantCreate,
    TenantResponse,
    TenantStatusUpdate,
    TenantSwitchResponse,
    TenantUpdate,
)
from app.services.audit_service import log_action

router = APIRouter(prefix="/tenants", tags=["Tenants"])

# Alta, edición y activación de sucursales son tareas de dirección: solo master.
MasterUser = Annotated[User, Depends(require_role(Role.MASTER))]


def _active_tenant_count(db: Session, exclude_id: int | None = None) -> int:
    """Sucursales activas. Las desactivadas no consumen cupo."""
    query = db.query(func.count(Tenant.id)).filter(Tenant.is_active.is_(True))
    if exclude_id is not None:
        query = query.filter(Tenant.id != exclude_id)
    return query.scalar() or 0


def _assert_capacity_available(db: Session, exclude_id: int | None = None) -> None:
    if _active_tenant_count(db, exclude_id=exclude_id) >= settings.MAX_TENANTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Se alcanzó el máximo de {settings.MAX_TENANTS} sucursales activas. "
                "Desactive una sucursal o solicite ampliar el límite."
            ),
        )


def _assert_name_available(db: Session, name: str, exclude_id: int | None = None) -> None:
    query = db.query(Tenant.id).filter(func.lower(Tenant.name) == name.lower())
    if exclude_id is not None:
        query = query.filter(Tenant.id != exclude_id)
    if query.first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe una sucursal con ese nombre.",
        )


def _assert_codigo_folio_available(db: Session, codigo: str | None, exclude_id: int | None = None) -> None:
    """Dos sucursales con el mismo código imprimirían folios que no se distinguen."""
    if not codigo:
        return
    query = db.query(Tenant).filter(Tenant.codigo_folio == codigo)
    if exclude_id is not None:
        query = query.filter(Tenant.id != exclude_id)
    if query.first() is not None:
        raise HTTPException(status_code=400, detail=f"El código de folio «{codigo}» ya lo usa otra sucursal.")


def _get_tenant_or_404(db: Session, tenant_id: int) -> Tenant:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
    return tenant


@router.get("", response_model=list[TenantResponse])
def list_tenants(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    include_inactive: Annotated[
        bool, Query(description="Solo master: incluir sucursales desactivadas")
    ] = False,
):
    """Lista sucursales.

    master ve todas; un doctor ve la suya mas las que tenga asignadas en
    ``doctor_clinics`` (atiende en varias clinicas); el resto solo la suya.
    Sin esto, el selector de sucursal no le ofrece a donde cambiar aunque el
    cambio si este permitido.
    """
    query = db.query(Tenant)
    if current_user.role == Role.MASTER:
        if not include_inactive:
            query = query.filter(Tenant.is_active.is_(True))
        return query.order_by(Tenant.name).all()

    permitidas = {current_user.tenant_id}
    if current_user.role == Role.DOCTOR:
        asignadas = (
            db.query(DoctorClinic.tenant_id)
            .filter(
                DoctorClinic.doctor_id == current_user.id,
                DoctorClinic.is_active.is_(True),
            )
            .all()
        )
        permitidas.update(fila[0] for fila in asignadas)

    return (
        query.filter(Tenant.id.in_(permitidas), Tenant.is_active.is_(True))
        .order_by(Tenant.name)
        .all()
    )


@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
def create_tenant(
    payload: TenantCreate,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: MasterUser,
):
    """Da de alta una sucursal. Solo master, hasta settings.MAX_TENANTS activas."""
    _assert_capacity_available(db)
    _assert_name_available(db, payload.name)
    _assert_codigo_folio_available(db, payload.codigo_folio)

    tenant = Tenant(
        name=payload.name,
        address=payload.address,
        phone=payload.phone,
        email=payload.email,
        codigo_folio=payload.codigo_folio,
        is_active=True,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    log_action(
        db,
        action="tenant.create",
        entity_type="tenant",
        entity_id=tenant.id,
        actor_user_id=current_user.id,
        tenant_id=tenant.id,
        details={"name": tenant.name},
        request=request,
    )
    return tenant


@router.put("/{tenant_id}", response_model=TenantResponse)
def update_tenant(
    tenant_id: int,
    payload: TenantUpdate,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: MasterUser,
):
    """Edita los datos de una sucursal. Solo master."""
    tenant = _get_tenant_or_404(db, tenant_id)
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes:
        if changes["name"] is None:
            raise HTTPException(
                status_code=400, detail="El nombre de la sucursal es obligatorio."
            )
        _assert_name_available(db, changes["name"], exclude_id=tenant.id)
    if "codigo_folio" in changes:
        # Cambiarlo no renumera nada: lo ya emitido conserva su folio y la
        # serie del año sigue su consecutivo con el código nuevo.
        _assert_codigo_folio_available(db, changes["codigo_folio"], exclude_id=tenant.id)

    for field, value in changes.items():
        setattr(tenant, field, value)
    db.commit()
    db.refresh(tenant)

    log_action(
        db,
        action="tenant.update",
        entity_type="tenant",
        entity_id=tenant.id,
        actor_user_id=current_user.id,
        tenant_id=tenant.id,
        details={"fields": sorted(changes)},
        request=request,
    )
    return tenant


@router.put("/{tenant_id}/status", response_model=TenantResponse)
def set_tenant_status(
    tenant_id: int,
    payload: TenantStatusUpdate,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: MasterUser,
):
    """Activa o desactiva una sucursal. No existe borrado físico: de una sucursal
    cuelgan pacientes e historial clínico que deben conservarse."""
    tenant = _get_tenant_or_404(db, tenant_id)

    if payload.is_active and not tenant.is_active:
        _assert_capacity_available(db, exclude_id=tenant.id)
    elif not payload.is_active and tenant.is_active:
        if tenant.id == current_user.tenant_id:
            raise HTTPException(
                status_code=400,
                detail="No puede desactivar la sucursal en la que está trabajando.",
            )
        if _active_tenant_count(db, exclude_id=tenant.id) == 0:
            raise HTTPException(
                status_code=400, detail="Debe quedar al menos una sucursal activa."
            )

    tenant.is_active = payload.is_active
    db.commit()
    db.refresh(tenant)

    log_action(
        db,
        action="tenant.activate" if payload.is_active else "tenant.deactivate",
        entity_type="tenant",
        entity_id=tenant.id,
        actor_user_id=current_user.id,
        tenant_id=tenant.id,
        details={"name": tenant.name, "is_active": tenant.is_active},
        request=request,
    )
    return tenant


def _assert_can_switch_to(db: Session, user: User, tenant_id: int) -> None:
    """Valida la pertenencia del usuario a la sucursal destino.

    master cambia a cualquier sucursal; doctor a las que tenga asignadas en
    doctor_clinics (además de la suya); admin y secretaria solo a la suya.
    """
    if user.role == Role.MASTER:
        return
    if user.role == Role.DOCTOR:
        if tenant_id == user.tenant_id:
            return
        assignment = (
            db.query(DoctorClinic)
            .filter(
                DoctorClinic.doctor_id == user.id,
                DoctorClinic.tenant_id == tenant_id,
                DoctorClinic.is_active.is_(True),
            )
            .first()
        )
        if assignment:
            return
        raise HTTPException(
            status_code=403,
            detail="No tienes asignada esta sucursal. Agrégala desde Mi Perfil.",
        )
    if tenant_id != user.tenant_id:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta sucursal")


@router.put("/{tenant_id}/switch", response_model=TenantSwitchResponse)
def switch_tenant(
    tenant_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Cambia la sucursal activa del usuario y devuelve tokens nuevos.

    Los tokens se emiten con los mismos helpers que el login, de modo que el
    access token lleva el claim ``sid`` que exige ``get_current_user``. Sin él
    la sesión quedaba muerta y el usuario era expulsado al login.
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id, Tenant.is_active.is_(True)).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")

    _assert_can_switch_to(db, current_user, tenant_id)

    old_tenant_id = current_user.tenant_id
    current_user.tenant_id = tenant_id
    db.commit()
    db.refresh(current_user)

    log_action(
        db,
        action="tenant.switch",
        entity_type="user",
        entity_id=current_user.id,
        actor_user_id=current_user.id,
        tenant_id=tenant_id,
        details={
            "from_tenant_id": old_tenant_id,
            "to_tenant_id": tenant_id,
            "to_tenant_name": tenant.name,
        },
        request=request,
    )

    session = _create_session(db, current_user, request)
    tokens = _issue_session_tokens(current_user, session)

    return TenantSwitchResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        tenant_id=tenant_id,
        tenant_name=tenant.name,
    )
