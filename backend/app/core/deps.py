"""FastAPI dependencies for dependency injection"""
from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, HTTPException, Response, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal, utcnow
from app.models.permission import ALL_PERMISSIONS, Permission, get_default_permissions
from app.models.user import Role, User
from app.models.user_session import UserSession

# OAuth2 scheme for JWT token. tokenUrl only affects Swagger's interactive
# "Authorize" button (which endpoint it POSTs credentials to) - actual token
# validation just reads the Authorization header regardless of path - but it
# must match the real, prefixed login route or the docs UI breaks.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_PREFIX}/auth/login")


def get_db() -> Generator[Session, None, None]:
    """
    Database session dependency

    Yields a database session and ensures it's closed after use
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


PERMISSIONS_VERSION_HEADER = "X-Permissions-Version"


def get_current_user(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    token: Annotated[str, Depends(oauth2_scheme)],
) -> User:
    """
    Get the current authenticated user from JWT token

    Cada respuesta autenticada lleva ``X-Permissions-Version``: es la forma que
    tiene una pantalla ya abierta de enterarse de que sus permisos cambiaron sin
    que haya que cerrarle la sesion. Se resuelve aqui, y no en un middleware,
    porque este es el unico punto por el que pasan todas las peticiones
    autenticadas y ninguna de las anonimas.

    Args:
        response: Respuesta en curso, para anexarle la version de permisos
        db: Database session
        token: JWT token from Authorization header

    Returns:
        Current user object

    Raises:
        HTTPException: If token is invalid or user not found
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Tu sesión no es válida o expiró. Vuelve a iniciar sesión.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: int | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        if payload.get("type") != "access":
            raise credentials_exception
        session_id = payload.get("sid")
        if not session_id:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Tu usuario está desactivado. Contacta al administrador.")

    session = (
        db.query(UserSession)
        .filter(UserSession.id == session_id, UserSession.user_id == user.id)
        .first()
    )
    if session is None or session.revoked_at is not None or session.expires_at <= utcnow():
        raise credentials_exception

    response.headers[PERMISSIONS_VERSION_HEADER] = str(user.permissions_version or 1)
    # La bitacora de accesos agrupa por sesion (plan 32, punto 7). Atributo
    # de Python, no columna: vive lo que vive esta peticion.
    user.sesion_actual_id = session.id

    return user


def get_user_permissions(user: User, db: Session) -> set[str]:
    """
    Resolve effective permissions for a user.

    MASTER bypass: returns all known permissions immediately.
    For other users: starts with role defaults, then applies per-user
    overrides (granted → add, denied → remove).
    """
    if user.role.value == "master":
        return set(ALL_PERMISSIONS.keys())

    effective = set(get_default_permissions(user.role.value))

    # Apply per-user overrides
    overrides = (
        db.query(Permission)
        .filter(Permission.user_id == user.id)
        .all()
    )
    for p in overrides:
        if p.is_granted:
            effective.add(p.action)
        else:
            effective.discard(p.action)

    return effective


def require_role(*allowed_roles: Role):
    """
    Dependency factory for role-based access control

    Args:
        *allowed_roles: Roles that are allowed to access the endpoint

    Returns:
        Dependency function that checks user role

    Example:
        @router.get("/admin", dependencies=[Depends(require_role(Role.ADMIN))])
    """
    # Flatten roles in case a list was passed instead of variadic args
    # This handles both require_role(Role.DOCTOR) and require_role([Role.DOCTOR])
    flattened_roles = []
    for role in allowed_roles:
        if isinstance(role, list):
            flattened_roles.extend(role)
        else:
            flattened_roles.append(role)

    def role_checker(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        if current_user.role not in flattened_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para realizar esta acción.",
            )
        return current_user

    return role_checker


def require_permission(action: str):
    """
    Dependency factory for granular permission-based access control.

    MASTER role bypasses all checks automatically.
    For other users, resolves effective permissions (role defaults + user overrides).

    Args:
        action: The permission string to check (e.g. ``"patients.create"``).

    Returns:
        Dependency function that checks the user has the required permission.

    Example:
        @router.post("/patients", dependencies=[Depends(require_permission("patients.create"))])
    """
    def permission_checker(
        current_user: Annotated[User, Depends(get_current_user)],
        db: Annotated[Session, Depends(get_db)],
    ) -> User:
        # MASTER bypass
        if current_user.role.value == "master":
            return current_user

        permissions = get_user_permissions(current_user, db)
        if action not in permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para realizar esta acción.",
            )
        return current_user

    return permission_checker
