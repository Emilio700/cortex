"""Reports router - aggregate operational statistics (Fase 3.7)

Consolidates what a clinic actually wants to see day to day: appointment
volume/status mix over time, most-requested services, and how many patients
were actually attended - all over a date range (defaulting to the current
month). Built on top of the Fase 3.1-3.3 data (Service, Payment) and the
existing Appointment model.
"""
from datetime import datetime, time
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.access_scope import filtrar_pagos_del_alcance, solo_pagos_vigentes
from app.core.deps import get_current_user, get_db, require_permission
from app.core.hora_local import ahora_local, local_a_utc
from app.core.tenant_scope import scoped_query
from app.models.appointment import Appointment, AppointmentStatus
from app.models.payment import Payment
from app.models.service import Service
from app.models.user import Role, User
from app.schemas.report import AppointmentStatusCount, DailyCount, ReportsSummary, TopServiceRow

router = APIRouter(prefix="/reports", tags=["Reports"])


def _default_range(start_date: Optional[datetime], end_date: Optional[datetime]) -> tuple[datetime, datetime]:
    """Defaults to the current calendar month when no range is given.

    El rango por defecto se toma en hora local del consultorio, no en UTC: el
    filtro corre contra ``Appointment.scheduled_at``, que se guarda en hora
    local. Con ``utcnow`` el "hoy" del reporte se adelantaba hasta un día en las
    horas de la tarde/noche de Mazatlán y el corte del mes caía desfasado (B-08).
    """
    now = ahora_local()
    if start_date is None:
        start_date = datetime.combine(now.replace(day=1).date(), time.min)
    if end_date is None:
        end_date = datetime.combine(now.date(), time.max)
    return start_date, end_date


@router.get("/summary", response_model=ReportsSummary)
def get_reports_summary(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("reports.read"))],
    start_date: Optional[datetime] = Query(None, description="Defaults to the start of the current month"),
    end_date: Optional[datetime] = Query(None, description="Defaults to the end of today"),
    top_services_limit: int = Query(5, ge=1, le=20),
):
    """
    Aggregate operational report: appointment volume/status, most-requested
    services (by payments), and patients attended - all within a date range.

    Secretaria/Admin only, same gate as the cash-cut report (Fase 3.3).
    """
    start_date, end_date = _default_range(start_date, end_date)
    if end_date < start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La fecha final no puede ser anterior a la inicial. Corrige el periodo.")

    appt_query = scoped_query(db.query(Appointment), Appointment, current_user).filter(
        Appointment.scheduled_at >= start_date, Appointment.scheduled_at <= end_date
    )

    appointments_total = appt_query.count()

    by_status_rows = appt_query.with_entities(Appointment.status, func.count(Appointment.id)).group_by(Appointment.status).all()
    appointments_by_status = [AppointmentStatusCount(status=s, count=c) for s, c in by_status_rows]

    daily_rows = (
        appt_query.with_entities(func.date(Appointment.scheduled_at), func.count(Appointment.id))
        .group_by(func.date(Appointment.scheduled_at))
        .order_by(func.date(Appointment.scheduled_at))
        .all()
    )
    appointments_daily = [DailyCount(day=day, count=count) for day, count in daily_rows]

    # Most-requested services: derived from Payment rows that reference a
    # service (appointments alone don't carry a service_id).
    # Mismo recorte que el corte de caja (plan 23): si alguien con alcance de
    # doctora llega aquí, el top suma su ingreso y no el de la sucursal, y un
    # cobro anulado no cuenta como servicio vendido.
    # ``paid_at`` se guarda en UTC y el periodo viene en hora local: sin
    # traducirlo, a partir de las 17:00 de Mazatlán los cobros de la tarde ya
    # caían en "mañana" y desaparecían del top del mes, y en cambio la noche
    # del último día del mes anterior se colaba en éste.
    inicio_pagos_utc, fin_pagos_utc = local_a_utc(start_date), local_a_utc(end_date)
    top_services_rows = (
        solo_pagos_vigentes(filtrar_pagos_del_alcance(db.query(Payment), current_user))
        .filter(
            Payment.paid_at >= inicio_pagos_utc,
            Payment.paid_at <= fin_pagos_utc,
            Payment.service_id.isnot(None),
        )
        .join(Service, Payment.service_id == Service.id)
        .with_entities(Service.id, Service.name, func.count(Payment.id), func.sum(Payment.amount))
        .group_by(Service.id, Service.name)
        .order_by(func.count(Payment.id).desc())
        .limit(top_services_limit)
        .all()
    )
    top_services = [
        TopServiceRow(service_id=sid, service_name=name, times_charged=count, total_amount=total)
        for sid, name, count, total in top_services_rows
    ]

    attended_query = appt_query.filter(Appointment.status == AppointmentStatus.ATENDIDA)
    patients_attended_count = attended_query.with_entities(func.count(func.distinct(Appointment.patient_id))).scalar() or 0

    attended_daily_rows = (
        attended_query.with_entities(func.date(Appointment.scheduled_at), func.count(func.distinct(Appointment.patient_id)))
        .group_by(func.date(Appointment.scheduled_at))
        .order_by(func.date(Appointment.scheduled_at))
        .all()
    )
    patients_attended_daily = [DailyCount(day=day, count=count) for day, count in attended_daily_rows]

    return ReportsSummary(
        start_date=start_date,
        end_date=end_date,
        appointments_total=appointments_total,
        appointments_by_status=appointments_by_status,
        appointments_daily=appointments_daily,
        top_services=top_services,
        patients_attended_count=patients_attended_count,
        patients_attended_daily=patients_attended_daily,
    )
