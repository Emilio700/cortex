"""Cuándo un estudio está atrasado, y su seguimiento (plan 32, punto 3).

Un estudio sin resultado está atrasado si ya pasó su «realizar a más tardar»
(``desired_on``) o, si no lo tiene, cuando desde que se pidió pasaron más días
que el plazo de su prioridad. Los de fábrica los fijó Emilio (2026-10-05):
urgente 7, preferente 15, rutinaria 30; cada médico los cambia en su perfil
y se miden con los del médico que pidió el estudio.

Un seguimiento con «volver a revisar el …» lo saca de atrasados hasta esa
fecha: alguien ya está sobre él. Al llegar la fecha vuelve a contar.

«Hoy» es el del consultorio (Mazatlán): con la fecha del contenedor, por la
noche un estudio se volvía atrasado un día antes.
"""
from datetime import date, timedelta

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.hora_local import hoy_local
from app.models.clinical_tracking import DiagnosticOrder, DiagnosticOrderFollowUp
from app.models.doctor_profile import DoctorProfile

PLAZOS_DE_FABRICA = {"urgent": 7, "preferential": 15, "routine": 30}
PLAZO_MINIMO, PLAZO_MAXIMO = 1, 365
ESTADOS_SIN_RESULTADO = ("ordered", "accepted", "scheduled", "collected", "in_process")

MOTIVOS_DE_SEGUIMIENTO = {
    "no_se_lo_ha_hecho": "El paciente no se lo ha hecho",
    "en_proceso_laboratorio": "Está en proceso en el laboratorio",
    "reagendado": "Se reagendó",
    "no_se_localiza": "No se localiza al paciente",
    "otro": "Otro",
}


def normalizar_plazos(datos) -> dict[str, int]:
    """Los plazos completos: lo guardado válido sobre los de fábrica."""
    plazos = dict(PLAZOS_DE_FABRICA)
    if isinstance(datos, dict):
        for prioridad in PLAZOS_DE_FABRICA:
            valor = datos.get(prioridad)
            if isinstance(valor, int) and not isinstance(valor, bool) and PLAZO_MINIMO <= valor <= PLAZO_MAXIMO:
                plazos[prioridad] = valor
    return plazos


def plazos_por_doctora(db: Session, tenant_id: int | None = None) -> dict[int, dict[str, int]]:
    """Los plazos de los médicos que los cambiaron; las demás usan los de fábrica."""
    query = db.query(DoctorProfile.user_id, DoctorProfile.plazos_atrasado).filter(
        DoctorProfile.plazos_atrasado.isnot(None)
    )
    if tenant_id is not None:
        from app.models.user import User

        query = query.join(User, User.id == DoctorProfile.user_id).filter(User.tenant_id == tenant_id)
    return {uid: normalizar_plazos(datos) for uid, datos in query}


def _por_plazo(plazos: dict[str, int], hoy: date):
    return or_(
        *(
            and_(DiagnosticOrder.priority == prioridad, DiagnosticOrder.requested_on < hoy - timedelta(days=dias))
            for prioridad, dias in plazos.items()
        ),
        # Una prioridad desconocida se mide como rutinaria: no se pierde.
        and_(
            DiagnosticOrder.priority.notin_(tuple(plazos)),
            DiagnosticOrder.requested_on < hoy - timedelta(days=plazos["routine"]),
        ),
    )


def condicion_pospuesto(hoy: date | None = None):
    """Su seguimiento MÁS RECIENTE pide volver a revisar después de hoy.

    El más reciente manda, no cualquiera: si recepción primero puso «revisar
    en un mes» y luego «en tres días», lo que vale es lo segundo.
    """
    hoy = hoy or hoy_local()
    ultimo = (
        select(DiagnosticOrderFollowUp.revisar_el)
        .where(DiagnosticOrderFollowUp.diagnostic_order_id == DiagnosticOrder.id)
        .order_by(DiagnosticOrderFollowUp.created_at.desc(), DiagnosticOrderFollowUp.id.desc())
        .limit(1)
        .correlate(DiagnosticOrder)
        .scalar_subquery()
    )
    return and_(ultimo.isnot(None), ultimo > hoy)


def condicion_atrasado(hoy: date | None = None, plazos: dict[int, dict[str, int]] | None = None):
    """La condición SQL de «atrasado», para filtrar o contar en el servidor.

    ``plazos`` es el de ``plazos_por_doctora``: cada orden se mide con los de
    su médico, y la que no los cambió, con los de fábrica.
    """
    hoy = hoy or hoy_local()
    plazos = plazos or {}
    por_doctora = [
        and_(DiagnosticOrder.doctor_id == doctora, _por_plazo(suyos, hoy)) for doctora, suyos in plazos.items()
    ]
    de_fabrica = _por_plazo(PLAZOS_DE_FABRICA, hoy)
    if plazos:
        de_fabrica = and_(DiagnosticOrder.doctor_id.notin_(tuple(plazos)), de_fabrica)
    return and_(
        DiagnosticOrder.status.in_(ESTADOS_SIN_RESULTADO),
        or_(
            DiagnosticOrder.desired_on < hoy,
            and_(DiagnosticOrder.desired_on.is_(None), or_(de_fabrica, *por_doctora)),
        ),
        ~condicion_pospuesto(hoy),
    )


def esta_atrasada(orden, plazos: dict[str, int], pospuesta_hasta: date | None, hoy: date | None = None) -> bool:
    """Lo mismo que ``condicion_atrasado``, para una orden ya cargada (la fila)."""
    hoy = hoy or hoy_local()
    if orden.status not in ESTADOS_SIN_RESULTADO:
        return False
    if pospuesta_hasta is not None and pospuesta_hasta > hoy:
        return False
    if orden.desired_on is not None:
        return orden.desired_on < hoy
    dias = plazos.get(orden.priority, plazos["routine"])
    return orden.requested_on is not None and orden.requested_on < hoy - timedelta(days=dias)


def dias_sin_resultado(orden, hoy: date | None = None) -> int | None:
    hoy = hoy or hoy_local()
    return (hoy - orden.requested_on).days if orden.requested_on else None
