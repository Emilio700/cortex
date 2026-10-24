"""Router for CustomRole (tenant-specific role definitions) — MASTER only"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db, require_permission
from app.models.custom_role import (
    SYSTEM_ROLE_LABELS,
    SYSTEM_ROLES,
    CustomRole,
)
from app.models.user import Role, User
from app.schemas.custom_role import (
    CustomRoleCreate,
    CustomRoleResponse,
    CustomRoleUpdate,
    CustomRoleWithUserCount,
    RoleAssignmentUpdate,
    SystemRoleInfo,
)
from app.services.audit_service import log_action

router = APIRouter(prefix="/custom-roles", tags=["Custom Roles"])


@router.get(
    "/system",
    response_model=list[SystemRoleInfo],
    dependencies=[Depends(require_permission("permissions.manage"))],
)
def list_system_roles(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """List all system roles with user counts for the current tenant."""
    results = []
    for role_name in SYSTEM_ROLES:
        if role_name == "master":
            continue  # Master is system-wide, not tenant-scoped
        count = (
            db.query(User)
            .filter(User.role == Role(role_name), User.tenant_id == current_user.tenant_id)
            .count()
        )
        results.append(
            SystemRoleInfo(
                name=role_name,
                label=SYSTEM_ROLE_LABELS.get(role_name, role_name),
                is_system=True,
                user_count=count,
            )
        )
    return results


@router.get(
    "",
    response_model=list[CustomRoleWithUserCount],
    dependencies=[Depends(require_permission("permissions.manage"))],
)
def list_custom_roles(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    include_inactive: bool = Query(False, alias="include_inactive"),
):
    """List all custom roles for the current tenant."""
    query = db.query(CustomRole).filter(
        CustomRole.tenant_id == current_user.tenant_id
    )
    if not include_inactive:
        query = query.filter(CustomRole.is_active.is_(True))

    roles = query.all()
    results = []
    for r in roles:
        user_count = (
            db.query(User)
            .filter(
                User.tenant_id == current_user.tenant_id,
                User.custom_role_id == r.id,
            )
            .count()
        )
        results.append(
            CustomRoleWithUserCount(
                id=r.id,
                tenant_id=r.tenant_id,
                name=r.name,
                base_role=r.base_role,
                description=r.description,
                is_active=r.is_active,
                created_at=r.created_at,
                user_count=user_count,
            )
        )
    return results


@router.post(
    "",
    response_model=CustomRoleResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("permissions.manage"))],
)
def create_custom_role(
    data: CustomRoleCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Create a new custom role for the current tenant."""
    # Validate base_role is a valid system role
    if data.base_role not in SYSTEM_ROLES or data.base_role == "master":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El rol base tiene que ser Administración, Secretaría o Doctor.",
        )

    # Check name uniqueness within tenant
    existing = (
        db.query(CustomRole)
        .filter(
            CustomRole.tenant_id == current_user.tenant_id,
            CustomRole.name == data.name,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un rol personalizado con el nombre '{data.name}' en este tenant",
        )

    role = CustomRole(
        tenant_id=current_user.tenant_id,
        name=data.name,
        base_role=data.base_role,
        description=data.description,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.patch(
    "/{role_id}",
    response_model=CustomRoleResponse,
    dependencies=[Depends(require_permission("permissions.manage"))],
)
def update_custom_role(
    role_id: int,
    data: CustomRoleUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Update a custom role."""
    role = (
        db.query(CustomRole)
        .filter(CustomRole.id == role_id, CustomRole.tenant_id == current_user.tenant_id)
        .first()
    )
    if not role:
        raise HTTPException(status_code=404, detail="No se encontró el rol personalizado. Puede que lo hayan eliminado; actualiza la lista de roles.")

    if data.name is not None:
        existing = (
            db.query(CustomRole)
            .filter(
                CustomRole.tenant_id == current_user.tenant_id,
                CustomRole.name == data.name,
                CustomRole.id != role_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Ya existe un rol con ese nombre en esta sucursal. Escribe otro nombre.")
        role.name = data.name

    if data.base_role is not None:
        if data.base_role not in SYSTEM_ROLES or data.base_role == "master":
            raise HTTPException(status_code=400, detail="El rol base no es válido. Elige Administración, Secretaría o Doctor.")
        role.base_role = data.base_role

    if data.description is not None:
        role.description = data.description

    if data.is_active is not None:
        role.is_active = data.is_active

    db.commit()
    db.refresh(role)
    return role


@router.delete(
    "/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("permissions.manage"))],
)
def delete_custom_role(
    role_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Delete a custom role."""
    role = (
        db.query(CustomRole)
        .filter(CustomRole.id == role_id, CustomRole.tenant_id == current_user.tenant_id)
        .first()
    )
    if not role:
        raise HTTPException(status_code=404, detail="No se encontró el rol personalizado. Puede que lo hayan eliminado; actualiza la lista de roles.")

    # Se cuentan también las cuentas inactivas: la FK no distingue, y reactivar
    # una cuenta cuyo rol ya no existe la dejaría con un perfil fantasma.
    en_uso = db.query(User).filter(User.custom_role_id == role.id).count()
    if en_uso:
        cuentas = "una cuenta" if en_uso == 1 else f"{en_uso} cuentas"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"No se puede eliminar el rol «{role.name}» porque lo tiene asignado {cuentas}. "
                "Asígnales otro rol primero y vuelve a intentarlo."
            ),
        )

    # Los datos del rol van en la bitácora antes de borrarlo: después ya no
    # queda fila a la que apunte el entity_id.
    datos_del_rol = {"name": role.name, "base_role": role.base_role}
    db.delete(role)
    db.commit()
    log_action(
        db,
        action="custom_role.deleted",
        entity_type="custom_role",
        entity_id=role_id,
        actor_user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        details=datos_del_rol,
    )


@router.put(
    "/assign",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permission("permissions.manage"))],
)
def assign_role(
    data: RoleAssignmentUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Assign a system or custom role to a user."""
    user = db.query(User).filter(User.id == data.user_id, User.tenant_id == current_user.tenant_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="No se encontró la cuenta de usuario. Puede que la hayan eliminado; actualiza la lista.")

    if user.role == Role.MASTER:
        raise HTTPException(status_code=403, detail="Las cuentas MASTER no se pueden modificar desde aquí.")

    # Check if it's a system role
    if data.role in SYSTEM_ROLES:
        user.role = Role(data.role)
        user.custom_role_id = None
    else:
        # It must be a custom role name
        custom_role = (
            db.query(CustomRole)
            .filter(
                CustomRole.tenant_id == current_user.tenant_id,
                CustomRole.name == data.role,
                CustomRole.is_active.is_(True),
            )
            .first()
        )
        if not custom_role:
            raise HTTPException(status_code=404, detail=f"No se encontró el rol '{data.role}'. Actualiza la lista de roles y vuelve a elegirlo.")

        # Set the base role from the custom role and store the custom_role_id
        user.role = Role(custom_role.base_role)
        user.custom_role_id = custom_role.id

    db.commit()
    return {"detail": f"Rol asignado correctamente a {user.full_name}"}
