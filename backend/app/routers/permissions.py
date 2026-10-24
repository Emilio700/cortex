"""Router for permission management (MASTER only)"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, get_user_permissions, require_permission
from app.models.permission import ALL_PERMISSIONS, Permission, get_default_permissions
from app.models.user import Role, User
from app.schemas.permission import (
    AvailablePermission,
    PermissionOverride,
    PermissionResponse,
    PermissionUpdateResult,
    UserPermissionsResponse,
)
from app.services.audit_service import log_action

router = APIRouter(prefix="/permissions", tags=["Permissions"])


@router.get(
    "/available",
    response_model=list[AvailablePermission],
    dependencies=[Depends(require_permission("permissions.manage"))],
)
def list_available_permissions():
    """List all available permission actions with descriptions."""
    return [
        AvailablePermission(action=a, description=d)
        for a, d in ALL_PERMISSIONS.items()
    ]


@router.get(
    "/user/{user_id}",
    response_model=UserPermissionsResponse,
    dependencies=[Depends(require_permission("permissions.manage"))],
)
def get_user_permissions_endpoint(
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
):
    """Get effective permissions for a specific user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="No se encontró la cuenta de usuario. Puede que la hayan eliminado; actualiza la lista.")

    role_defaults = get_default_permissions(user.role.value)
    effective = get_user_permissions(user, db)

    overrides = (
        db.query(Permission)
        .filter(Permission.user_id == user.id)
        .all()
    )

    return UserPermissionsResponse(
        role=user.role.value,
        role_defaults=role_defaults,
        overrides=[PermissionResponse.model_validate(o) for o in overrides],
        effective_permissions=sorted(effective),
    )


@router.put(
    "/user/{user_id}",
    response_model=PermissionUpdateResult,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permission("permissions.manage"))],
)
def update_user_permissions(
    user_id: int,
    overrides: list[PermissionOverride],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Replace all per-user permission overrides for a user.

    This deletes all existing overrides for the user and creates new ones.
    Users cannot modify their own permissions.

    Devuelve los permisos efectivos resultantes, no un "listo" a secas: quien
    administra tiene que poder ver lo que quedo guardado sin confiar en que la
    pantalla y la base dicen lo mismo. Ademas sube ``permissions_version``, que
    es lo que hace que la sesion ya abierta de esa persona se entere del cambio
    sin tener que volver a entrar.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="No se encontró la cuenta de usuario. Puede que la hayan eliminado; actualiza la lista.")

    # Prevent users from modifying their own permissions
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No puedes cambiar tus propios permisos. Pídeselo a otra persona con acceso de administración.",
        )

    # Cannot modify a MASTER user
    if user.role.value == "master":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Los permisos de una cuenta MASTER no se pueden cambiar desde aquí.",
        )

    # Se resuelve antes de tocar nada: el "antes/despues" de la bitacora tiene
    # que compararse contra lo que la persona tenia, no contra lo que ya se
    # escribio en esta misma transaccion.
    antes = get_user_permissions(user, db)

    # Delete existing overrides for this user
    db.query(Permission).filter(Permission.user_id == user_id).delete()

    # Create new overrides
    for override in overrides:
        perm = Permission(
            role=user.role.value,
            action=override.action,
            is_granted=override.is_granted,
            user_id=user_id,
        )
        db.add(perm)

    # La sesion abierta de esta persona conserva el menu y los guards que
    # calculo al entrar. Subir la version es lo unico que la hace notar que
    # quedaron viejos. No se revocan sus sesiones a proposito: un cambio de
    # permisos no puede tirar a nadie a media captura clinica.
    user.permissions_version = (user.permissions_version or 1) + 1
    db.commit()
    db.refresh(user)

    despues = get_user_permissions(user, db)
    log_action(
        db,
        action="permissions.updated",
        entity_type="user",
        entity_id=user.id,
        actor_user_id=current_user.id,
        tenant_id=user.tenant_id,
        details={
            "otorgados": sorted(despues - antes),
            "retirados": sorted(antes - despues),
            "permissions_version": user.permissions_version,
        },
    )

    return PermissionUpdateResult(
        detail="Permisos actualizados correctamente",
        permissions_version=user.permissions_version,
        effective_permissions=sorted(despues),
    )
