"""El aviso diario de estudios atrasados (plan 32, punto 3).

Al médico que pidió los estudios, **uno solo por día y agrupado**: «Tienes
5 estudios atrasados». Uno por estudio llenaría la campana y se dejaría de
leer, que es justo lo que este aviso viene a evitar.

Es accionable (plan 27): se queda hasta que el servidor ve que ya no tiene
atrasados (registró el resultado o un seguimiento con su «volver a revisar»)
o ella lo descarta. Mientras está abierto, la corrida del día solo le
actualiza el número; no abre otro.

Lo que vuelve a contar al pasar su «volver a revisar» entra solo en la corrida
de ese día: no hace falta un aviso aparte por fecha.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.hora_local import hoy_local
from app.models.clinical_tracking import DiagnosticOrder
from app.models.notification import Notification, NotificationType
from app.models.user import Role, User
from app.services import estudios_atrasados
from app.services.notification_service import notify, resolver

log = logging.getLogger(__name__)

ENTIDAD = "estudios_atrasados"


def _clave(doctora_id: int) -> str:
    return f"estudios-atrasados:{doctora_id}"


def _textos(n: int) -> tuple[str, str]:
    if n == 1:
        return (
            "1 estudio atrasado",
            "Un estudio sigue sin resultado después de su plazo. Revisa por qué en Órdenes y resultados.",
        )
    return (
        f"{n} estudios atrasados",
        f"{n} estudios siguen sin resultado después de su plazo. Revisa por qué en Órdenes y resultados.",
    )


def atrasados_por_doctora(db: Session, hoy: date | None = None) -> dict[int, tuple[int, int]]:
    """doctora → (sucursal, cuántos atrasados), con los plazos de cada una."""
    hoy = hoy or hoy_local()
    plazos = estudios_atrasados.plazos_por_doctora(db)
    filas = (
        db.query(DiagnosticOrder.doctor_id, DiagnosticOrder.tenant_id, func.count(DiagnosticOrder.id))
        .filter(estudios_atrasados.condicion_atrasado(hoy, plazos))
        .group_by(DiagnosticOrder.doctor_id, DiagnosticOrder.tenant_id)
        .all()
    )
    return {doctora: (sucursal, n) for doctora, sucursal, n in filas}


@dataclass
class Resumen:
    nuevos: int = 0
    actualizados: int = 0
    cerrados: int = 0


def ejecutar(db: Session, hoy: date | None = None) -> Resumen:
    """La corrida del día. Idempotente: repetirla no abre un segundo aviso."""
    resumen = Resumen()
    conteos = atrasados_por_doctora(db, hoy)
    activas = {
        uid
        for (uid,) in db.query(User.id).filter(
            User.id.in_(list(conteos) or [-1]), User.is_active.is_(True), User.role == Role.DOCTOR
        )
    }
    for doctora, (sucursal, n) in conteos.items():
        if doctora not in activas:
            continue
        titulo, mensaje = _textos(n)
        abierto = (
            db.query(Notification)
            .filter(
                Notification.user_id == doctora,
                Notification.dedupe_key == _clave(doctora),
                Notification.resolved_at.is_(None),
            )
            .first()
        )
        if abierto is not None:
            if abierto.title != titulo:
                abierto.title, abierto.message = titulo, mensaje
                resumen.actualizados += 1
            continue
        if notify(
            db, tenant_id=sucursal, user_id=doctora, type=NotificationType.STUDIES_OVERDUE, title=titulo,
            message=mensaje, entity_type=ENTIDAD, entity_id=doctora, dedupe_key=_clave(doctora),
        ):
            resumen.nuevos += 1
    # Las que ya no tienen atrasados: su aviso abierto deja de pedir algo.
    abiertas = {
        uid
        for (uid,) in db.query(Notification.user_id).filter(
            Notification.type == NotificationType.STUDIES_OVERDUE, Notification.resolved_at.is_(None)
        )
    }
    for doctora in abiertas - set(conteos):
        resumen.cerrados += resolver(
            db, tipos=[NotificationType.STUDIES_OVERDUE], entity_type=ENTIDAD, entity_id=doctora
        )
    db.commit()
    return resumen


def cerrar_si_ya_no_hay(db: Session, doctora_id: int, por_user_id: int | None = None) -> None:
    """Tras un seguimiento o un resultado: si ya no le queda nada atrasado, el aviso se cierra.

    No confirma: va en la transacción del cambio que lo provocó.
    """
    db.flush()
    plazos = estudios_atrasados.plazos_por_doctora(db)
    queda = (
        db.query(DiagnosticOrder.id)
        .filter(DiagnosticOrder.doctor_id == doctora_id, estudios_atrasados.condicion_atrasado(plazos=plazos))
        .first()
    )
    if queda is None:
        resolver(
            db, tipos=[NotificationType.STUDIES_OVERDUE], entity_type=ENTIDAD, entity_id=doctora_id,
            por_user_id=por_user_id,
        )


def lineas_resumen(resumen: Resumen) -> list[str]:
    return [
        f"Estudios atrasados: {resumen.nuevos} avisos nuevos, {resumen.actualizados} actualizados, "
        f"{resumen.cerrados} cerrados."
    ]
