"""User management router (Admin only)"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core import security
from app.core.deps import get_current_user, get_db, get_user_permissions, require_permission
from app.core.tenant_scope import scoped_query
from app.db.session import utcnow
from app.models.user import Role, User
from app.models.user_session import UserSession
from app.models.permission import Permission
from app.models.secretaria_doctora import SecretariaDoctora
from app.schemas.user import (
    DoctorasQueApoyaResponse,
    DoctorasQueApoyaUpdate,
    UserCreate,
    UserDirectoryResponse,
    UserResponse,
    UserUpdate,
)
from app.services.audit_service import log_action

router = APIRouter(prefix="/users", tags=["Users"])


def _assert_can_manage_role(
    current_user: User, requested_role: Role | None, existing_role: Role | None = None
) -> None:
    """Protect the platform-level MASTER role on both create and update."""
    if current_user.role != Role.MASTER and (
        requested_role == Role.MASTER or existing_role == Role.MASTER
    ):
        raise HTTPException(status_code=403, detail="Solo una cuenta MASTER puede crear o modificar otras cuentas MASTER.")


@router.get(
    "",
    response_model=list[UserResponse],
    dependencies=[Depends(require_permission("users.read"))],
)
def list_users(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    role: Role | None = Query(None, description="Filter users by role"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    """
    List users within the current user's tenant.

    Administrative directory with account and contact metadata. Clinical and
    scheduling selectors must use ``/users/directory`` instead.

    Args:
        db: Database session
        current_user: Authenticated user (used for tenant scoping)
        role: Optional role filter
        skip: Number of records to skip
        limit: Maximum number of records to return

    Returns:
        List of users in the caller's tenant
    """
    query = scoped_query(db.query(User), User, current_user)

    if role is not None:
        query = query.filter(User.role == role)

    users = query.offset(skip).limit(limit).all()
    return users


@router.get(
    "/directory",
    response_model=list[UserDirectoryResponse],
    dependencies=[Depends(require_permission("appointments.read"))],
)
def list_user_directory(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    role: Role | None = Query(None, description="Filter users by role"),
):
    """Return only the identity fields needed by appointment/record pickers."""
    query = scoped_query(db.query(User), User, current_user).filter(User.is_active.is_(True))
    if role is not None:
        query = query.filter(User.role == role)
    return query.order_by(User.full_name.asc()).limit(500).all()


@router.post("", response_model=UserResponse, dependencies=[Depends(require_permission("users.create"))])
def create_user(
    user_data: UserCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Create a new user (Admin only), always within the caller's own tenant.

    Args:
        user_data: User creation data
        db: Database session
        current_user: Authenticated admin (recorded as the actor in the audit log)

    Returns:
        Created user

    Raises:
        HTTPException: If email already exists
    """
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Ese correo ya está registrado en otra cuenta. Usa un correo distinto.")

    _assert_can_manage_role(current_user, user_data.role)

    # Create new user - tenant_id is always the caller's own tenant, never the
    # client-supplied `user_data.tenant_id`. Trusting that field let any Admin
    # create a user in an arbitrary tenant, breaking tenant isolation.
    hashed_password = security.get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        tratamiento=user_data.tratamiento,
        role=user_data.role,
        tenant_id=current_user.tenant_id,
        personal_email=user_data.personal_email,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    log_action(
        db,
        action="user.created",
        entity_type="user",
        entity_id=new_user.id,
        actor_user_id=current_user.id,
        tenant_id=new_user.tenant_id,
        details={"email": new_user.email, "role": new_user.role.value},
    )

    return new_user


@router.get(
    "/{user_id}", response_model=UserResponse, dependencies=[Depends(require_permission("users.read"))]
)
def get_user(
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Get user by ID (Admin only, scoped to the admin's own tenant)

    Args:
        user_id: User ID
        db: Database session
        current_user: Authenticated admin (used for tenant scoping)

    Returns:
        User data

    Raises:
        HTTPException: If user not found in the caller's tenant
    """
    user = scoped_query(db.query(User), User, current_user).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="No se encontró la cuenta de usuario. Puede que la hayan eliminado; actualiza la lista.")

    return user


@router.put(
    "/{user_id}", response_model=UserResponse, dependencies=[Depends(require_permission("users.update"))]
)
def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Update user (Admin only, scoped to the admin's own tenant)

    Args:
        user_id: User ID
        user_data: Update data
        db: Database session
        current_user: Authenticated admin (used for tenant scoping)

    Returns:
        Updated user

    Raises:
        HTTPException: If user not found in the caller's tenant
    """
    user = scoped_query(db.query(User), User, current_user).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="No se encontró la cuenta de usuario. Puede que la hayan eliminado; actualiza la lista.")

    # Tenant administrators must never promote an account to MASTER or alter
    # an existing MASTER account. Creation already enforced the first half of
    # this invariant; update must enforce it as well.
    _assert_can_manage_role(current_user, user_data.role, user.role)

    # Update fields
    update_data = user_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    # A deactivated account must not regain any prior device session if an
    # administrator later re-enables it.
    if update_data.get("is_active") is False:
        db.query(UserSession).filter(
            UserSession.user_id == user.id,
            UserSession.revoked_at.is_(None),
        ).update({UserSession.revoked_at: utcnow()}, synchronize_session=False)

    db.commit()
    db.refresh(user)

    log_action(
        db,
        action="user.updated",
        entity_type="user",
        entity_id=user.id,
        actor_user_id=current_user.id,
        tenant_id=user.tenant_id,
        details={"updated_fields": list(update_data.keys())},
    )

    return user


# ---------------------------------------------------------------------------
# Médicos que apoya una secretaria (plan 23, ajustes del 2026-09-28)
# ---------------------------------------------------------------------------

PERMISO_CORTE = "payments.cashcut"


def _secretaria_de_la_sucursal(db: Session, user_id: int, current_user: User) -> User:
    usuaria = scoped_query(db.query(User), User, current_user).filter(User.id == user_id).first()
    if not usuaria:
        raise HTTPException(status_code=404, detail="No se encontró la cuenta de usuario. Puede que la hayan eliminado; actualiza la lista.")
    if usuaria.role != Role.SECRETARIA:
        raise HTTPException(
            status_code=400,
            detail="Sólo a una secretaria se le asignan doctoras. Cambia primero su rol.",
        )
    return usuaria


def _estado_de_apoyo(db: Session, secretaria: User) -> DoctorasQueApoyaResponse:
    ids = [
        fila.doctor_id
        for fila in db.query(SecretariaDoctora.doctor_id)
        .filter(
            SecretariaDoctora.secretaria_id == secretaria.id,
            SecretariaDoctora.is_active.is_(True),
        )
        .order_by(SecretariaDoctora.doctor_id)
        .all()
    ]
    return DoctorasQueApoyaResponse(
        secretaria_id=secretaria.id,
        doctor_ids=ids,
        puede_ver_corte=PERMISO_CORTE in get_user_permissions(secretaria, db),
        permissions_version=secretaria.permissions_version or 1,
    )


@router.get(
    "/{user_id}/doctoras-que-apoya",
    response_model=DoctorasQueApoyaResponse,
    dependencies=[Depends(require_permission("users.read"))],
)
def get_doctoras_que_apoya(
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Qué doctoras apoya la secretaria y si puede ver su corte de caja."""
    return _estado_de_apoyo(db, _secretaria_de_la_sucursal(db, user_id, current_user))


@router.put(
    "/{user_id}/doctoras-que-apoya",
    response_model=DoctorasQueApoyaResponse,
    dependencies=[Depends(require_permission("users.update"))],
)
def put_doctoras_que_apoya(
    user_id: int,
    datos: DoctorasQueApoyaUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Reemplaza los médicos que apoya la secretaria y concede o quita su corte.

    El corte (``payments.cashcut``) no es permiso del rol secretaria: se le da
    a ella, como excepción individual, y sólo abarca a los médicos de aquí.
    Se toca ÚNICAMENTE esa excepción; las demás que tenga se conservan.

    Quitar un médico desactiva la fila en vez de borrarla, y todo cambio
    queda en la bitácora con quién lo hizo.
    """
    secretaria = _secretaria_de_la_sucursal(db, user_id, current_user)

    pedidas = sorted(set(datos.doctor_ids))
    if pedidas:
        validas = {
            u.id
            for u in db.query(User.id)
            .filter(
                User.id.in_(pedidas),
                User.tenant_id == secretaria.tenant_id,
                User.role == Role.DOCTOR,
                User.is_active.is_(True),
            )
            .all()
        }
        faltan = [i for i in pedidas if i not in validas]
        if faltan:
            raise HTTPException(
                status_code=400,
                detail="Alguna de los médicos elegidas no es un médico activa de esta sucursal. Actualiza la lista y vuelve a elegir.",
            )

    antes = _estado_de_apoyo(db, secretaria)

    filas = {
        f.doctor_id: f
        for f in db.query(SecretariaDoctora)
        .filter(SecretariaDoctora.secretaria_id == secretaria.id)
        .all()
    }
    for doctor_id, fila in filas.items():
        fila.is_active = doctor_id in pedidas
    for doctor_id in pedidas:
        if doctor_id not in filas:
            db.add(
                SecretariaDoctora(
                    tenant_id=secretaria.tenant_id,
                    secretaria_id=secretaria.id,
                    doctor_id=doctor_id,
                    is_active=True,
                    created_by_user_id=current_user.id,
                )
            )

    permiso_cambia = antes.puede_ver_corte != datos.puede_ver_corte
    if permiso_cambia:
        db.query(Permission).filter(
            Permission.user_id == secretaria.id,
            Permission.action == PERMISO_CORTE,
        ).delete(synchronize_session=False)
        if datos.puede_ver_corte:
            db.add(
                Permission(
                    role=secretaria.role.value,
                    action=PERMISO_CORTE,
                    is_granted=True,
                    user_id=secretaria.id,
                )
            )
    # Cambiar a quién apoya también cambia lo que ve su corte: su sesión
    # abierta tiene que enterarse, igual que con un cambio de permisos.
    if permiso_cambia or antes.doctor_ids != pedidas:
        secretaria.permissions_version = (secretaria.permissions_version or 1) + 1

    db.commit()
    db.refresh(secretaria)
    despues = _estado_de_apoyo(db, secretaria)

    log_action(
        db,
        action="user.doctoras_que_apoya.updated",
        entity_type="user",
        entity_id=secretaria.id,
        actor_user_id=current_user.id,
        tenant_id=secretaria.tenant_id,
        details={
            "asignadas": sorted(set(despues.doctor_ids) - set(antes.doctor_ids)),
            "retiradas": sorted(set(antes.doctor_ids) - set(despues.doctor_ids)),
            "puede_ver_corte_antes": antes.puede_ver_corte,
            "puede_ver_corte_despues": despues.puede_ver_corte,
        },
    )
    return despues
