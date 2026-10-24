"""Datos clínicos que acompañan a una cita en la agenda (plan 28, D-4).

Decisión de Emilio (2026-10-04): cada cita de una paciente con embarazo activo
muestra sus semanas de gestación, calculadas **al día de la cita**. La doctora
lee «Control prenatal · 28.3 SDG» en su agenda sin abrir el expediente.

Se calcula con la misma regla que el expediente
(``frontend/src/modules/doctor/utils/embarazo.ts``, ``resumirEmbarazo``): la
FUR registrada y, si no hay, la implícita en la FPP (FPP − 280 días). Si la
agenda y el expediente contaran distinto, la doctora vería dos edades
gestacionales para la misma paciente.

Las semanas son dato clínico: solo las recibe quien puede leer embarazos
(``prenatal.read``) y, si es doctora, de los embarazos que lleva ella, como el
resto del seguimiento obstétrico (``filtrar_por_autoria_clinica``). Recepción,
por omisión, no las ve.
"""
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.access_scope import filtrar_por_autoria_clinica
from app.core.deps import get_user_permissions
from app.core.tenant_scope import scoped_query
from app.models.appointment import Appointment
from app.models.pregnancy import Pregnancy, PregnancyStatus
from app.models.user import User

DIAS_NAEGELE = 280
# Más allá de 45 semanas la datación ya no es de un embarazo en curso: es uno
# viejo que nadie cerró. Mismo tope que el expediente (``DIAS_MAX_PLAUSIBLE``).
DIAS_MAX_PLAUSIBLE = 45 * 7


def edad_gestacional(
    fur: Optional[date], fpp: Optional[date], referencia: date
) -> Optional[tuple[int, int]]:
    """``(semanas, días sueltos)`` a la fecha de referencia, o ``None``.

    ``None`` cuando no hay datación, cuando la referencia es anterior a la FUR
    (la cita es de antes del embarazo) o cuando la datación ya no es plausible.
    No se inventa una edad gestacional.
    """
    inicio = fur or (fpp - timedelta(days=DIAS_NAEGELE) if fpp else None)
    if inicio is None:
        return None
    dias = (referencia - inicio).days
    if dias < 0 or dias > DIAS_MAX_PLAUSIBLE:
        return None
    return dias // 7, dias % 7


def semanas_por_cita(
    db: Session, citas: list[Appointment], user: Optional[User]
) -> dict[int, tuple[int, int]]:
    """Edad gestacional de cada cita que la tenga, en una sola consulta."""
    if user is None or not citas:
        return {}
    if "prenatal.read" not in get_user_permissions(user, db):
        return {}
    pacientes = {c.patient_id for c in citas}
    consulta = scoped_query(db.query(Pregnancy), Pregnancy, user).filter(
        Pregnancy.patient_id.in_(pacientes),
        Pregnancy.status == PregnancyStatus.ACTIVE.value,
    )
    consulta = filtrar_por_autoria_clinica(consulta, Pregnancy.doctor_id, user)
    # Si una paciente tuviera dos embarazos activos (no debería), manda el más
    # reciente: es el que el expediente muestra arriba.
    activo: dict[int, Pregnancy] = {}
    for embarazo in consulta.order_by(Pregnancy.created_at.asc(), Pregnancy.id.asc()).all():
        activo[embarazo.patient_id] = embarazo

    resultado: dict[int, tuple[int, int]] = {}
    for cita in citas:
        embarazo = activo.get(cita.patient_id)
        if embarazo is None or cita.scheduled_at is None:
            continue
        edad = edad_gestacional(
            embarazo.last_menstrual_period,
            embarazo.estimated_delivery_date,
            cita.scheduled_at.date(),
        )
        if edad is not None:
            resultado[cita.id] = edad
    return resultado
