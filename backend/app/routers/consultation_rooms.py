"""Router de salas de consulta: listado, alta, edición y activación.

Sigue el patrón de ``app/routers/tenants.py``, que ya resuelve lo mismo para
sucursales. Consultar las salas es dato operativo (cualquier rol autenticado
necesita saber en qué sala está cada cita); gestionarlas es tarea de
dirección: solo master o admin.

**No existe borrado físico**: de una sala pueden colgar citas, así que una
sala que ya no se usa se desactiva.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_role
from app.models.consultation_room import ConsultationRoom
from app.models.tenant import Tenant
from app.models.user import Role, User
from app.schemas.consultation_room import (
    ConsultationRoomCreate,
    ConsultationRoomResponse,
    ConsultationRoomStatusUpdate,
    ConsultationRoomUpdate,
)
from app.services.audit_service import log_action

router = APIRouter(prefix="/consultation-rooms", tags=["Consultation Rooms"])

# Alta, edición y activación de salas: dirección (master o admin).
ManagerUser = Annotated[User, Depends(require_role(Role.MASTER, Role.ADMIN))]


def _resolve_tenant_id(current_user: User, tenant_id: int | None) -> int:
    """Sucursal sobre la que se opera.

    Solo master puede pedir otra sucursal distinta a la suya activa; el resto
    trabaja siempre sobre la propia, se pida lo que se pida.
    """
    if tenant_id is None or current_user.role != Role.MASTER:
        return current_user.tenant_id
    return tenant_id


def _get_room_or_404(db: Session, room_id: int, current_user: User) -> ConsultationRoom:
    query = db.query(ConsultationRoom).filter(ConsultationRoom.id == room_id)
    if current_user.role != Role.MASTER:
        query = query.filter(ConsultationRoom.tenant_id == current_user.tenant_id)
    room = query.first()
    if not room:
        raise HTTPException(status_code=404, detail="No se encontró la sala.")
    return room


def _assert_name_available(
    db: Session, tenant_id: int, name: str, exclude_id: int | None = None
) -> None:
    query = db.query(ConsultationRoom.id).filter(
        ConsultationRoom.tenant_id == tenant_id,
        func.lower(ConsultationRoom.name) == name.lower(),
    )
    if exclude_id is not None:
        query = query.filter(ConsultationRoom.id != exclude_id)
    if query.first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe una sala con ese nombre en esta sucursal.",
        )


@router.get("", response_model=list[ConsultationRoomResponse])
def list_consultation_rooms(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    include_inactive: Annotated[
        bool, Query(description="Incluir salas desactivadas (para la pantalla de gestión)")
    ] = False,
    tenant_id: Annotated[
        int | None, Query(description="Solo master: consultar otra sucursal")
    ] = None,
):
    """Salas de la sucursal activa. Cualquier rol autenticado: es dato operativo."""
    objetivo = _resolve_tenant_id(current_user, tenant_id)
    query = db.query(ConsultationRoom).filter(ConsultationRoom.tenant_id == objetivo)
    if not include_inactive:
        query = query.filter(ConsultationRoom.is_active.is_(True))
    return query.order_by(ConsultationRoom.display_order, ConsultationRoom.name).all()


@router.post("", response_model=ConsultationRoomResponse, status_code=status.HTTP_201_CREATED)
def create_consultation_room(
    payload: ConsultationRoomCreate,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: ManagerUser,
    tenant_id: Annotated[
        int | None, Query(description="Solo master: dar de alta en otra sucursal")
    ] = None,
):
    """Da de alta una sala en la sucursal. Solo master o admin."""
    objetivo = _resolve_tenant_id(current_user, tenant_id)
    if not db.query(Tenant.id).filter(Tenant.id == objetivo).first():
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")

    _assert_name_available(db, objetivo, payload.name)

    room = ConsultationRoom(
        tenant_id=objetivo,
        name=payload.name,
        display_order=payload.display_order,
        is_active=True,
    )
    db.add(room)
    db.commit()
    db.refresh(room)

    log_action(
        db,
        action="consultation_room.create",
        entity_type="consultation_room",
        entity_id=room.id,
        actor_user_id=current_user.id,
        tenant_id=room.tenant_id,
        details={"name": room.name},
        request=request,
    )
    return room


@router.put("/{room_id}", response_model=ConsultationRoomResponse)
def update_consultation_room(
    room_id: int,
    payload: ConsultationRoomUpdate,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: ManagerUser,
):
    """Edita el nombre o el orden de una sala. Solo master o admin."""
    room = _get_room_or_404(db, room_id, current_user)
    changes = payload.model_dump(exclude_unset=True)

    if "name" in changes:
        if changes["name"] is None:
            raise HTTPException(
                status_code=400, detail="El nombre de la sala es obligatorio."
            )
        _assert_name_available(db, room.tenant_id, changes["name"], exclude_id=room.id)

    for field, value in changes.items():
        if value is None and field == "display_order":
            continue
        setattr(room, field, value)
    db.commit()
    db.refresh(room)

    log_action(
        db,
        action="consultation_room.update",
        entity_type="consultation_room",
        entity_id=room.id,
        actor_user_id=current_user.id,
        tenant_id=room.tenant_id,
        details={"fields": sorted(changes)},
        request=request,
    )
    return room


@router.put("/{room_id}/status", response_model=ConsultationRoomResponse)
def set_consultation_room_status(
    room_id: int,
    payload: ConsultationRoomStatusUpdate,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: ManagerUser,
):
    """Activa o desactiva una sala.

    No hay borrado físico: una sala con citas colgando no se borra. Desactivar
    la deja fuera del selector y de la validación de choques, pero las citas
    históricas conservan su ``room_id`` y siguen mostrando el nombre.
    """
    room = _get_room_or_404(db, room_id, current_user)
    room.is_active = payload.is_active
    db.commit()
    db.refresh(room)

    log_action(
        db,
        action="consultation_room.activate" if payload.is_active else "consultation_room.deactivate",
        entity_type="consultation_room",
        entity_id=room.id,
        actor_user_id=current_user.id,
        tenant_id=room.tenant_id,
        details={"name": room.name, "is_active": room.is_active},
        request=request,
    )
    return room
