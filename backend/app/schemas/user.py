"""User schemas"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.models.user import Role
from app.utils.tratamiento import normalizar_tratamiento


class _ConTratamiento(BaseModel):
    """"Dr.", "Dra." o vacío. Vacío llega como ``None``: sin prefijo."""

    tratamiento: str | None = None

    @field_validator("tratamiento", mode="before")
    @classmethod
    def _tratamiento(cls, v):
        return normalizar_tratamiento(v)


class UserBase(BaseModel):
    """Base user schema"""

    email: EmailStr
    full_name: str
    role: Role


class UserCreate(_ConTratamiento, UserBase):
    """User creation schema.

    No ``tenant_id`` field: the created user always belongs to the caller's
    own tenant (see ``routers.users.create_user``), so accepting one from the
    client would be misleading at best and a cross-tenant write at worst.
    """

    password: str
    personal_email: str | None = None


class UserUpdate(_ConTratamiento):
    """User update schema"""

    full_name: str | None = None
    role: Role | None = None
    is_active: bool | None = None
    personal_email: str | None = None


class UserResponse(UserBase):
    """User response schema"""

    id: int
    tenant_id: int
    custom_role_id: int | None = None
    tratamiento: str | None = None
    is_active: bool
    personal_email: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserMeResponse(UserResponse):
    """Perfil propio, con los permisos efectivos ya resueltos.

    Va aparte de ``UserResponse`` a proposito: el listado de usuarios no resuelve
    permisos, y un campo que a veces trae la verdad y a veces una lista vacia es
    peor que no tenerlo. El frontend decide que mostrar con ``permissions``; el
    ``role`` se conserva como respaldo mientras quedan pantallas sin migrar.
    """

    permissions: list[str] = []
    # Con que version se calcularon esos permisos. El frontend la guarda y la
    # compara contra la que viene en cada respuesta: si cambio, recarga el
    # perfil en vez de seguir con un menu que ya no corresponde.
    permissions_version: int = 1


class UserDirectoryResponse(BaseModel):
    """Minimal user identity for clinical and scheduling selectors."""

    id: int
    full_name: str
    role: Role
    # Para que cada selector y cada aviso nombre igual a la doctora.
    tratamiento: str | None = None

    model_config = ConfigDict(from_attributes=True)


class DoctorasQueApoyaUpdate(BaseModel):
    """Qué doctoras apoya una secretaria y si puede ver el corte de ellas.

    Se guardan juntas porque son una sola decisión para quien administra: una
    asignación sin permiso no le muestra nada, y el permiso sin asignaciones
    le muestra una pantalla que dice que no tiene doctoras.
    """

    doctor_ids: list[int] = []
    puede_ver_corte: bool = False


class DoctorasQueApoyaResponse(BaseModel):
    """Lo que quedó guardado, leído de la base y no repetido de la petición."""

    secretaria_id: int
    doctor_ids: list[int]
    puede_ver_corte: bool
    permissions_version: int
