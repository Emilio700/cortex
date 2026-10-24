"""Avisos dentro del sistema (ver ``app.models.notification``).

Desde el plan 27, Fase 1, tres reglas gobiernan este módulo:

1. **El aviso se escribe en la transacción del evento.** ``notify`` ya no
   confirma: lo hace quien llama, junto con el evento. Antes el aviso se
   confirmaba aparte, después del evento; si fallaba, la acción ya estaba
   guardada pero la petición devolvía 500, recepción reintentaba y el evento se
   duplicaba (M-4). Ahora existen los dos o ninguno.
2. **Leído no es atendido.** Lo accionable se resuelve cuando el servidor ve que
   ya pasó lo que pedía (``resolver``), o cuando alguien lo descarta a mano y
   queda registrado (``descartar``).
3. **El registro de tipos vive aquí, no en el frontend.** Qué tan urgente es
   cada tipo y a qué pantalla lleva se decide en ``TIPOS``; un tipo nuevo del
   backend ya no nace mudo porque alguien olvidó agregarlo a una lista de la
   interfaz (M-3).
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import utcnow
from app.models.notification import (
    Notification,
    NotificationPreference,
    NotificationPriority,
    NotificationResolution,
    NotificationType,
)
from app.models.secretaria_doctora import SecretariaDoctora
from app.models.user import Role, User

# ---------------------------------------------------------------------------
# Registro de tipos
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TipoDeAviso:
    """Lo que el sistema sabe de un tipo de aviso.

    ``destinos`` son las pantallas a las que lleva «Ir», en orden de
    preferencia, cada una con los permisos que la abren (basta uno; los mismos
    ``requires`` de ``frontend/src/routes.tsx``). Se ofrece la primera que la
    persona puede abrir; si no puede abrir ninguna, el aviso no lleva «Ir».
    """

    prioridad: str
    destinos: tuple[tuple[str, tuple[str, ...]], ...] = field(default_factory=tuple)


_AGENDA = (
    ("/doctor/appointments", ("doctor.appointments.read",)),
    ("/secretaria/agenda", ("appointments.read",)),
)

TIPOS: dict[str, TipoDeAviso] = {
    NotificationType.PATIENT_ARRIVED: TipoDeAviso(
        NotificationPriority.ACCIONABLE,
        (("/doctor/consultation/{entity_id}", ("doctor.appointments.read",)),),
    ),
    NotificationType.CONSULTATION_COMPLETED: TipoDeAviso(
        NotificationPriority.ACCIONABLE,
        (("/finanzas/pagos", ("payments.read",)),),
    ),
    NotificationType.PRENATAL_REVIEW_DUE: TipoDeAviso(
        NotificationPriority.ACCIONABLE,
        (("/secretaria/agenda", ("appointments.read",)),),
    ),
    NotificationType.DIAGNOSTIC_RESULT_RECEIVED: TipoDeAviso(
        NotificationPriority.ACCIONABLE,
        (
            ("/doctor/results", ("clinical_tracking.read",)),
            ("/secretaria/resultados", ("clinical_tracking.deliver_order", "clinical_tracking.attach_result")),
        ),
    ),
    # Cancelación y reprogramación: accionables sólo si caen hoy o mañana; el
    # que llama decide la prioridad con ``prioridad_por_cercania``.
    NotificationType.APPOINTMENT_CANCELLED: TipoDeAviso(NotificationPriority.INFORMATIVO, _AGENDA),
    NotificationType.APPOINTMENT_RESCHEDULED: TipoDeAviso(NotificationPriority.INFORMATIVO, _AGENDA),
    NotificationType.APPOINTMENT_SCHEDULED: TipoDeAviso(NotificationPriority.INFORMATIVO, _AGENDA),
    NotificationType.APPOINTMENT_TODAY: TipoDeAviso(NotificationPriority.INFORMATIVO, _AGENDA),
    NotificationType.APPOINTMENT_REMINDER: TipoDeAviso(NotificationPriority.INFORMATIVO, _AGENDA),
    # Accionable: se queda hasta que el servicio vuelve (lo resuelve el mismo
    # healthcheck) o el admin lo descarta. Sin «Ir»: se arregla en el servidor.
    NotificationType.SYSTEM_ALERT: TipoDeAviso(NotificationPriority.ACCIONABLE),
    NotificationType.STUDIES_OVERDUE: TipoDeAviso(
        NotificationPriority.ACCIONABLE,
        (("/doctor/results?filtro=atrasados", ("clinical_tracking.read",)),),
    ),
    NotificationType.DOCUMENT_UPLOADED: TipoDeAviso(
        NotificationPriority.INFORMATIVO,
        (("/secretaria/documentos", ("documents.read",)),),
    ),
}

# Lo que se puede silenciar por tipo: sólo lo informativo. Un «paciente en
# sala» silenciado es exactamente el aviso perdido que este plan corrige.
TIPOS_SILENCIABLES = tuple(t for t, info in TIPOS.items() if info.prioridad == NotificationPriority.INFORMATIVO)

# Quién recibe cada tipo informativo. Todos los de la agenda y los documentos
# van a la doctora de la cita (``appointments.doctor_id`` sólo admite cuentas
# con rol de doctora). Ofrecerle a recepción «Citas que te agenda alguien más»
# era un interruptor de algo que nunca le llega (plan 29, N-1).
_INFORMATIVOS_DE_LA_DOCTORA = frozenset(TIPOS_SILENCIABLES)


def tipos_silenciables_para(user: User) -> tuple[str, ...]:
    """Los tipos informativos que esa persona puede recibir, y por tanto silenciar."""
    if user.role == Role.DOCTOR:
        return tuple(t for t in TIPOS_SILENCIABLES if t in _INFORMATIVOS_DE_LA_DOCTORA)
    return ()


def prioridad_de(tipo: str) -> str:
    info = TIPOS.get(tipo)
    return info.prioridad if info else NotificationPriority.INFORMATIVO


def ruta_del_aviso(aviso: Notification, permisos: set[str]) -> Optional[str]:
    """La pantalla del «Ir» para quien tiene esos permisos, o ``None``."""
    info = TIPOS.get(aviso.type)
    if info is None:
        return None
    for plantilla, requeridos in info.destinos:
        if "{entity_id}" in plantilla and aviso.entity_id is None:
            continue
        if any(p in permisos for p in requeridos):
            return plantilla.format(entity_id=aviso.entity_id)
    return None


# ---------------------------------------------------------------------------
# Crear
# ---------------------------------------------------------------------------


def _silenciado(db: Session, user_id: int, tipo: str, prioridad: str) -> bool:
    if prioridad != NotificationPriority.INFORMATIVO:
        return False
    pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == user_id).first()
    return bool(pref and tipo in (pref.tipos_silenciados or []))


def notify(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    type: str,
    title: str,
    message: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    priority: Optional[str] = None,
    dedupe_key: Optional[str] = None,
) -> Optional[Notification]:
    """Agrega un aviso a la transacción en curso. **No confirma.**

    Devuelve ``None`` si no se escribió: la persona silenció ese tipo
    informativo, o ya tiene abierto un aviso con la misma ``dedupe_key``.
    """
    prioridad = priority or prioridad_de(type)
    if _silenciado(db, user_id, type, prioridad):
        return None

    if dedupe_key:
        db.flush()
        abierto = (
            db.query(Notification.id)
            .filter(
                Notification.user_id == user_id,
                Notification.dedupe_key == dedupe_key,
                Notification.resolved_at.is_(None),
            )
            .first()
        )
        if abierto is not None:
            return None

    entry = Notification(
        tenant_id=tenant_id,
        user_id=user_id,
        type=type,
        title=title[:255],
        message=message[:500],
        entity_type=entity_type,
        entity_id=entity_id,
        priority=prioridad,
        dedupe_key=dedupe_key,
    )
    if not dedupe_key:
        db.add(entry)
        db.flush()
        return entry

    # Dos peticiones simultáneas pueden pasar la revisión de arriba a la vez;
    # el índice único deja entrar una. El punto de guardado hace que la otra
    # pierda sólo su aviso repetido y no el evento que lo provocó.
    try:
        with db.begin_nested():
            db.add(entry)
            db.flush()
    except IntegrityError:
        return None
    return entry


# ---------------------------------------------------------------------------
# Resolver
# ---------------------------------------------------------------------------


def resolver(
    db: Session,
    *,
    tipos: Iterable[str],
    entity_type: str,
    entity_id: int,
    por_user_id: Optional[int] = None,
    resolucion: str = NotificationResolution.AUTO,
) -> int:
    """Cierra los avisos abiertos de esos tipos sobre esa entidad, **para todas
    las destinatarias**, en la transacción en curso. No confirma.

    Para todas porque el hecho es uno: si una asistente cobró, a la otra ya no
    le sirve un «puede proceder al registro del pago» (riesgo de cobrar dos
    veces). Se marcan también como leídos: ya no piden nada.
    """
    db.flush()
    abiertos = (
        db.query(Notification)
        .filter(
            Notification.type.in_(list(tipos)),
            Notification.entity_type == entity_type,
            Notification.entity_id == entity_id,
            Notification.resolved_at.is_(None),
            # Lo informativo no se «atiende», se lee: resolverlo lo daría por
            # leído sin que nadie lo hubiera visto.
            Notification.priority != NotificationPriority.INFORMATIVO,
        )
        .all()
    )
    ahora = utcnow()
    for aviso in abiertos:
        aviso.resolved_at = ahora
        aviso.resolved_by_user_id = por_user_id
        aviso.resolution = resolucion
        aviso.is_read = True
    if abiertos:
        db.flush()
    return len(abiertos)


def descartar(db: Session, aviso: Notification, user: User) -> Notification:
    """La persona lo quita sin que el servidor haya visto el hecho (D-10).

    Sólo cierra el suyo, no el de las demás: que una lo dé por perdido no dice
    nada de lo que ve la otra. El registro en bitácora lo hace el router.
    """
    if aviso.resolved_at is None:
        aviso.resolved_at = utcnow()
        aviso.resolved_by_user_id = user.id
        aviso.resolution = NotificationResolution.DESCARTADO
        aviso.is_read = True
    return aviso


# ---------------------------------------------------------------------------
# Destinatarios
# ---------------------------------------------------------------------------


def destinatarios_de_recepcion(
    db: Session,
    *,
    tenant_id: int,
    permiso: str,
    doctor_id: Optional[int] = None,
    excluir_user_id: Optional[int] = None,
) -> list[User]:
    """Quién es «recepción» para un aviso, en un solo lugar (D-a, D-b, D-5).

    Antes se resolvía con ``role == SECRETARIA`` en dos sitios, y un perfil de
    recepción con rol personalizado (plan 20) no recibía nada. Ahora cuenta el
    permiso que el aviso pide ejercer (cobrar, agendar), en cuentas activas de
    la sucursal que no son doctoras, ni master, ni administración sin perfil
    operativo propio: el administrador también tiene permiso de cobrar, pero
    no está en el mostrador.

    Si se da ``doctor_id`` y esa doctora tiene asistentes asignadas
    (``SecretariaDoctora``), sólo a ellas: con dos doctoras, cada asistente
    recibía los cierres de la otra. Si no tiene ninguna, a toda la recepción
    de la sucursal, para que el aviso no se pierda.
    """
    from app.core.deps import get_user_permissions

    candidatas = (
        db.query(User)
        .filter(
            User.tenant_id == tenant_id,
            User.is_active.is_(True),
            User.role.notin_([Role.DOCTOR, Role.MASTER]),
            or_(User.role == Role.SECRETARIA, User.custom_role_id.isnot(None)),
        )
        .order_by(User.id)
        .all()
    )
    candidatas = [
        u for u in candidatas
        if u.id != excluir_user_id and permiso in get_user_permissions(u, db)
    ]
    if doctor_id is None or not candidatas:
        return candidatas

    asignadas = {
        fila.secretaria_id
        for fila in db.query(SecretariaDoctora.secretaria_id).filter(
            SecretariaDoctora.doctor_id == doctor_id,
            SecretariaDoctora.is_active.is_(True),
        )
    }
    de_la_doctora = [u for u in candidatas if u.id in asignadas]
    return de_la_doctora or candidatas


# ---------------------------------------------------------------------------
# Purga (D-9)
# ---------------------------------------------------------------------------

RETENCION_INFORMATIVAS_LEIDAS = timedelta(days=90)
RETENCION_RESUELTAS = timedelta(days=365)


def purgar(db: Session, ahora: Optional[datetime] = None) -> int:
    """Borra lo que ya no le sirve a nadie y confirma.

    Informativas leídas: 90 días. Las que pedían algo y ya se resolvieron: un
    año. Lo legal lo guarda la bitácora de auditoría, no esta tabla. Nada
    abierto se borra nunca, por viejo que sea: sigue pidiendo algo.
    """
    ahora = ahora or utcnow()
    borradas = (
        db.query(Notification)
        .filter(
            or_(
                and_(
                    Notification.priority == NotificationPriority.INFORMATIVO,
                    Notification.is_read.is_(True),
                    Notification.created_at < ahora - RETENCION_INFORMATIVAS_LEIDAS,
                ),
                and_(
                    Notification.priority != NotificationPriority.INFORMATIVO,
                    Notification.resolved_at.isnot(None),
                    Notification.resolved_at < ahora - RETENCION_RESUELTAS,
                ),
            )
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return borradas
