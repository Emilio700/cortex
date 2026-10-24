"""Notifications router - in-app inbox (Fase 4.1)

Every endpoint here is implicitly scoped to `current_user.id`: a user only
ever sees and mutates their own notifications, regardless of role. There is
no "notifications for other users" endpoint - that would be a privacy leak,
not a feature.

Plan 27, Fase 1: «leído» y «atendido» son cosas distintas. Lo accionable se
resuelve solo cuando el servidor ve el hecho, o se descarta a mano y queda en
la bitácora; no se borra.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user, get_db, get_user_permissions
from app.db.session import utcnow
from app.models.notification import Notification, NotificationPreference, NotificationPriority
from app.models.tenant import Tenant
from app.models.user import Role, User
from app.schemas.notification import (
    AbiertosPorPrioridad,
    NotificationEstado,
    NotificationListResponse,
    NotificationPreferences,
    NotificationPreferencesUpdate,
    NotificationResponse,
)
from app.services.audit_service import log_action
from app.services.notification_service import descartar, ruta_del_aviso, tipos_silenciables_para

router = APIRouter(prefix="/notifications", tags=["Notifications"])

NO_ENCONTRADO = "No se encontró el aviso. Puede que ya lo hayan borrado; actualiza tus avisos."


def _abiertos(query):
    """Lo que sigue pidiendo algo: no informativo y sin resolver."""
    return query.filter(
        Notification.priority != NotificationPriority.INFORMATIVO,
        Notification.resolved_at.is_(None),
    )


def _nombres_de_sucursal(db: Session, avisos: list[Notification]) -> dict[int, str]:
    ids = {a.tenant_id for a in avisos}
    if not ids:
        return {}
    return dict(db.query(Tenant.id, Tenant.name).filter(Tenant.id.in_(ids)).all())


def _respuesta(
    aviso: Notification, permisos: set[str], user: User, sucursales: dict[int, str]
) -> NotificationResponse:
    respuesta = NotificationResponse.model_validate(aviso)
    respuesta.resolved_by_name = aviso.resolved_by.full_name if aviso.resolved_by else None
    respuesta.ruta = ruta_del_aviso(aviso, permisos)
    # Se muestran los avisos de todas sus sucursales (una paciente en sala en
    # la otra clínica también importa), pero el de la que no está activa dice
    # de cuál es y no lleva «Ir»: las pantallas trabajan sobre la sucursal
    # activa y la llevarían a «no se encontró». Master ve todas las sucursales
    # a la vez, así que a él sí se le ofrece.
    if aviso.tenant_id != user.tenant_id:
        respuesta.de_otra_sucursal = True
        respuesta.sucursal = sucursales.get(aviso.tenant_id)
        if user.role != Role.MASTER:
            respuesta.ruta = None
    return respuesta


def _del_usuario(db: Session, notification_id: int, user: User) -> Notification:
    aviso = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user.id)
        .first()
    )
    if not aviso:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NO_ENCONTRADO)
    return aviso


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=200)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    abiertos: bool = False,
):
    """Avisos de la persona, más los contadores de la campana.

    Con ``abiertos=true`` trae lo que sigue pidiendo algo, **del más viejo al
    más nuevo** (lo que lleva más tiempo esperando, primero): es la pestaña
    «Por atender». Sin él, el historial completo, del más nuevo al más viejo.
    """
    base_query = db.query(Notification).filter(Notification.user_id == current_user.id)

    unread_count = base_query.filter(Notification.is_read.is_(False)).count()
    abiertos_count = _abiertos(base_query).count()

    query = _abiertos(base_query) if abiertos else base_query
    total = query.count()
    orden = (
        (Notification.created_at.asc(), Notification.id.asc())
        if abiertos
        else (Notification.created_at.desc(), Notification.id.desc())
    )
    items = (
        query.options(joinedload(Notification.resolved_by))
        .order_by(*orden)
        .offset(offset)
        .limit(limit)
        .all()
    )
    permisos = get_user_permissions(current_user, db)
    sucursales = _nombres_de_sucursal(db, items)

    return NotificationListResponse(
        unread_count=unread_count,
        abiertos_count=abiertos_count,
        total=total,
        items=[_respuesta(aviso, permisos, current_user, sucursales) for aviso in items],
    )


@router.get("/estado", response_model=NotificationEstado)
def notification_state(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Consulta ligera para el sondeo de cada 15 s: si ``ultimo_id`` y
    ``ultima_resolucion`` no cambiaron, no hace falta volver a pedir la lista."""
    base_query = db.query(Notification).filter(Notification.user_id == current_user.id)
    por_prioridad = dict(
        _abiertos(db.query(Notification.priority, func.count(Notification.id)))
        .filter(Notification.user_id == current_user.id)
        .group_by(Notification.priority)
        .all()
    )
    ultimo_id, ultima_resolucion = (
        db.query(func.max(Notification.id), func.max(Notification.resolved_at))
        .filter(Notification.user_id == current_user.id)
        .one()
    )
    return NotificationEstado(
        sin_leer=base_query.filter(Notification.is_read.is_(False)).count(),
        abiertos=AbiertosPorPrioridad(
            accionable=por_prioridad.get(NotificationPriority.ACCIONABLE, 0),
            urgente=por_prioridad.get(NotificationPriority.URGENTE, 0),
        ),
        ultimo_id=ultimo_id,
        ultima_resolucion=ultima_resolucion,
        hora_servidor=utcnow(),
    )


def _preferencias(db: Session, user: User) -> NotificationPreferences:
    pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == user.id).first()
    return NotificationPreferences(
        sonido=bool(pref and pref.sonido),
        navegador=bool(pref and pref.navegador),
        recordatorio_una_hora=bool(pref and pref.recordatorio_una_hora),
        tipos_silenciados=list(pref.tipos_silenciados or []) if pref else [],
        tipos_silenciables=list(tipos_silenciables_para(user)),
    )


@router.get("/preferencias", response_model=NotificationPreferences)
def get_preferences(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Preferencias de avisos de la persona. Sin fila, todo lo ruidoso apagado."""
    return _preferencias(db, current_user)


@router.put("/preferencias", response_model=NotificationPreferences)
def update_preferences(
    datos: NotificationPreferencesUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Guarda las preferencias en el servidor, para que sigan a la persona.

    Sólo se silencian tipos informativos: un accionable silenciado sería un
    «paciente en sala» que nadie ve (422 si se intenta).
    """
    if datos.tipos_silenciados is not None:
        no_silenciables = sorted(set(datos.tipos_silenciados) - set(tipos_silenciables_para(current_user)))
        if no_silenciables:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Ese aviso no se puede silenciar: o pide hacer algo (de esos sólo se apaga el sonido), o no te llega.",
            )
    pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == current_user.id).first()
    if pref is None:
        pref = NotificationPreference(user_id=current_user.id, tipos_silenciados=[])
        db.add(pref)
    for campo in ("sonido", "navegador", "recordatorio_una_hora"):
        valor = getattr(datos, campo)
        if valor is not None:
            setattr(pref, campo, valor)
    if datos.tipos_silenciados is not None:
        pref.tipos_silenciados = sorted(set(datos.tipos_silenciados))
    db.commit()
    return _preferencias(db, current_user)


@router.patch("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_notifications_read(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Mark every unread notification for the current user as read.

    Leer no resuelve: lo accionable sigue «por atender» aunque se haya leído.
    """
    db.query(Notification).filter(
        Notification.user_id == current_user.id, Notification.is_read.is_(False)
    ).update({"is_read": True})
    db.commit()
    return None


# Va antes de ``/{notification_id}``: si no, «read» se intentaba leer como id
# y «Borrar leídas» respondía 422 sin borrar nada.
@router.delete("/read", status_code=status.HTTP_204_NO_CONTENT)
def delete_read_notifications(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Borra las informativas leídas. Lo que pedía algo se conserva (con quién
    lo atendió y cuándo) hasta la purga, al año."""
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read.is_(True),
        Notification.priority == NotificationPriority.INFORMATIVO,
    ).delete(synchronize_session="fetch")
    db.commit()
    return None


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Marca un aviso como leído. No lo da por atendido."""
    notification = _del_usuario(db, notification_id, current_user)
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return _respuesta(
        notification, get_user_permissions(current_user, db), current_user,
        _nombres_de_sucursal(db, [notification]),
    )


@router.patch("/{notification_id}/descartar", response_model=NotificationResponse)
def dismiss_notification(
    notification_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """La persona da por atendido un aviso sin que el servidor haya visto el
    hecho (D-10). Queda quién y cuándo en el aviso y en la bitácora.

    Sólo los suyos (un aviso ajeno es 404, igual que uno que no existe) y sólo
    lo que pedía algo: lo informativo se lee, no se descarta. Descartar uno ya
    resuelto no cambia nada y no se vuelve a registrar.
    """
    aviso = _del_usuario(db, notification_id, current_user)
    if aviso.priority == NotificationPriority.INFORMATIVO:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este aviso sólo informa; no hay nada que descartar.",
        )
    ya_estaba = aviso.resolved_at is not None
    descartar(db, aviso, current_user)
    db.commit()
    if not ya_estaba:
        log_action(
            db,
            action="notification.dismissed",
            entity_type="notification",
            entity_id=aviso.id,
            actor_user_id=current_user.id,
            tenant_id=aviso.tenant_id,
            details={"type": aviso.type, "entity_type": aviso.entity_type, "entity_id": aviso.entity_id},
        )
    db.refresh(aviso)
    return _respuesta(
        aviso, get_user_permissions(current_user, db), current_user, _nombres_de_sucursal(db, [aviso])
    )


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(
    notification_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Borra un aviso informativo propio.

    Lo que pedía algo no se borra: abierto, se descarta (y queda registrado);
    resuelto, se conserva como constancia de quién lo atendió.
    """
    notification = _del_usuario(db, notification_id, current_user)
    if notification.priority != NotificationPriority.INFORMATIVO:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Los avisos que piden hacer algo no se borran. Si ya no aplica, descártalo.",
        )
    db.delete(notification)
    db.commit()
    return None
