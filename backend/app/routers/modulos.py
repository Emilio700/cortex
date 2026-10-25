"""Módulos opcionales del consultorio y estado de los servicios auxiliares.

- ``GET /modulos``: cualquier usuario autenticado; el menú lo necesita para
  saber qué pintar. Solo lista los módulos ya construidos (``disponible``).
- ``PUT /modulos/{id}``: enciende o apaga un módulo en el consultorio de quien
  lo pide. Exige ``modulos.manage`` (admin y master) y deja huella en la bitácora.
  Apagar no borra nada: solo cambia ``activo``.
- ``GET /servicios/estado``: exige ``servicios.read``.
"""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core import modulos as catalogo
from app.core.deps import get_current_user, get_db, require_permission
from app.db.session import utcnow
from app.models.tenant_modulo import TenantModulo
from app.models.user import User
from app.services import audit_service, estado_servicios

router = APIRouter(prefix="/modulos", tags=["Módulos"])
router_servicios = APIRouter(prefix="/servicios", tags=["Servicios"])


class ModuloItem(BaseModel):
    id: str
    nombre: str
    descripcion: str
    servicio_requerido: Optional[str]
    servicio_configurado: bool
    activo: bool


class ModulosRespuesta(BaseModel):
    # Lo que lee el menú: ids encendidos en este consultorio.
    activos: list[str]
    # Lo que lee la pantalla de configuración.
    modulos: list[ModuloItem]


class CambioModulo(BaseModel):
    activo: bool


class EstadoServicioItem(BaseModel):
    id: str
    nombre: str
    para_que: str
    estado: str
    detalle: str


def _item(modulo: catalogo.ModuloOpcional, activo: bool) -> ModuloItem:
    return ModuloItem(
        id=modulo.id,
        nombre=modulo.nombre,
        descripcion=modulo.descripcion,
        servicio_requerido=modulo.servicio_requerido,
        servicio_configurado=catalogo.servicio_configurado(modulo.servicio_requerido),
        activo=activo,
    )


@router.get("", response_model=ModulosRespuesta)
def listar_modulos(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    estados = catalogo.estados_del_consultorio(db, current_user.tenant_id)
    return ModulosRespuesta(
        activos=sorted(m for m, activo in estados.items() if activo),
        modulos=[_item(catalogo.MODULOS_OPCIONALES[m], activo) for m, activo in estados.items()],
    )


@router.put(
    "/{modulo_id}",
    response_model=ModuloItem,
    dependencies=[Depends(require_permission("modulos.manage"))],
)
def cambiar_modulo(
    modulo_id: str,
    cambio: CambioModulo,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    modulo = catalogo.MODULOS_OPCIONALES.get(modulo_id)
    if modulo is None or not modulo.disponible:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ese módulo no existe o todavía no está instalado.",
        )
    if cambio.activo and not catalogo.servicio_configurado(modulo.servicio_requerido):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se puede encender «{modulo.nombre}»: falta configurar su servicio "
            "en el servidor.",
        )

    tenant_id = current_user.tenant_id
    anterior = catalogo.modulo_activo(db, tenant_id, modulo_id)
    if anterior == cambio.activo:
        return _item(modulo, anterior)

    fila = (
        db.query(TenantModulo)
        .filter(TenantModulo.tenant_id == tenant_id, TenantModulo.modulo == modulo_id)
        .first()
    )
    if fila is None:
        fila = TenantModulo(tenant_id=tenant_id, modulo=modulo_id)
        db.add(fila)
    fila.activo = cambio.activo
    fila.activado_por = current_user.id
    fila.activado_en = utcnow()
    db.flush()
    # log_action hace el commit: el cambio y su huella se guardan juntos.
    audit_service.log_action(
        db,
        action="modulo.activado" if cambio.activo else "modulo.desactivado",
        entity_type="tenant_modulo",
        entity_id=fila.id,
        actor_user_id=current_user.id,
        tenant_id=tenant_id,
        request=request,
        details={"modulo": modulo_id, "activo": cambio.activo, "anterior": anterior},
    )
    return _item(modulo, cambio.activo)


@router_servicios.get(
    "/estado",
    response_model=list[EstadoServicioItem],
    dependencies=[Depends(require_permission("servicios.read"))],
)
def estado_de_servicios():
    return estado_servicios.estado_de_servicios()
