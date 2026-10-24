"""Payments router - Recording charges (Fase 3.2, plan 23)

A recorded payment is a financial record: it is never edited nor deleted,
because the "corte de caja" already handed over has to be reproducible. A
wrong charge is voided (``POST /payments/{id}/anular``) with a reason, and the
correct one is captured.

Todo lo que lee pagos pasa por ``filtrar_pagos_del_alcance``: lista, detalle,
historial del paciente, corte y recibo. Un médico ve el ingreso que es
suyo; recepción y administración, la sucursal.
"""
from datetime import date, datetime, time
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased, joinedload

from app.core.access_scope import (
    alcance_operativo_acotado,
    corte_acotado_a_asignadas,
    filtrar_corte_del_alcance,
    filtrar_pagos_del_alcance,
    solo_pagos_vigentes,
)
from app.core.deps import get_db, get_user_permissions, require_permission
from app.core.hora_local import ahora_local, dia_local_en_utc, hoy_local, local_a_utc, utc_a_local
from app.core.tenant_scope import scoped_query
from app.db.session import utcnow
from app.models.appointment import Appointment, AppointmentOrigen, AppointmentStatus, AppointmentType
from app.models.patient import Patient
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.payment import (
    AnularPago,
    CashCutDoctorBreakdown,
    CashCutMethodBreakdown,
    CashCutReceivedByBreakdown,
    CajaDeQuienRecibe,
    CashCutReport,
    ConsultaExpressCreate,
    DoctoraDelCorte,
    PaymentCreate,
    PaymentResponse,
)
from app.services import avisos_de_citas, cobro_service
from app.services.audit_service import log_action
from app.services.email_service import send_email
from app.services.email_templates import payment_receipt as pay_tmpl, get_clinic_info
from app.utils.tratamiento import nombre_con_tratamiento

router = APIRouter(prefix="/payments", tags=["Payments"])

PAYMENT_METHOD_LABELS = {
    PaymentMethod.CASH: "Efectivo",
    PaymentMethod.CARD: "Tarjeta",
    PaymentMethod.TRANSFER: "Transferencia",
    PaymentMethod.OTHER: "Otro",
}

ETIQUETA_ESTADO_CITA = {
    AppointmentStatus.AGENDADA: "agendada",
    AppointmentStatus.CONFIRMADA: "confirmada",
    AppointmentStatus.EN_SALA: "en sala",
    AppointmentStatus.EN_CONSULTA: "en consulta",
    AppointmentStatus.ATENDIDA: "atendida",
}

PAGO_NO_ENCONTRADO = "No se encontró el pago. Puede que lo hayan eliminado; actualiza la lista de pagos."


def _con_nombres(query):
    """Carga doctora, quien recibió, paciente y servicio en la misma consulta (evita N+1)."""
    return query.options(
        joinedload(Payment.doctor),
        joinedload(Payment.received_by),
        joinedload(Payment.patient),
        joinedload(Payment.service),
        joinedload(Payment.appointment),
    )


def _registrar_alta(db: Session, pago: Payment, user: User, *, origen: str, adicional: bool) -> None:
    log_action(
        db,
        action="payment.created",
        entity_type="payment",
        entity_id=pago.id,
        actor_user_id=user.id,
        tenant_id=pago.tenant_id,
        patient_id=pago.patient_id,
        details={
            "origen": origen,
            "appointment_id": pago.appointment_id,
            "doctor_id": pago.doctor_id,
            "amount": str(pago.amount),
            "method": pago.method.value,
            "cobro_adicional": adicional,
        },
    )


@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
def create_payment(
    payment_data: PaymentCreate,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("payments.create"))],
):
    """Registrar un cobro: de una cita o suelto (sin cita).

    - Cita ya cobrada → 409 con ``cobro_existente``, salvo ``cobro_adicional``.
    - Mismo ``client_request_id`` que un cobro anterior → ese mismo pago (200).
    """
    previo = cobro_service.buscar_por_solicitud(db, payment_data.client_request_id)
    if previo is not None:
        response.status_code = status.HTTP_200_OK
        return cobro_service.exigir_misma_solicitud(previo, current_user)

    patient = scoped_query(db.query(Patient), Patient, current_user).filter(Patient.id == payment_data.patient_id).first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró al paciente. Puede que la hayan eliminado; actualiza la lista de pacientes.")

    cita = None
    if payment_data.appointment_id is not None:
        cita = (
            scoped_query(db.query(Appointment), Appointment, current_user)
            .filter(Appointment.id == payment_data.appointment_id)
            .first()
        )
        if not cita:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la cita. Puede que la hayan eliminado; vuelve a la agenda y actualízala.")
        # El médico cobra sus propias citas; la de una colega no es suya ni
        # siquiera para saber que existe (mismo 404 que la agenda).
        if alcance_operativo_acotado(current_user) and current_user.id not in (
            cita.doctor_id,
            cita.attended_by_user_id,
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la cita. Puede que la hayan eliminado; vuelve a la agenda y actualízala.")
        if cita.patient_id != patient.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La cita no es de este paciente. Vuelve a elegir la cita que vas a cobrar.",
            )
    elif payment_data.service_id is None and not payment_data.description:
        # Un cobro suelto sin concepto no se puede explicar después en el corte.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Indica el concepto del cobro: un servicio del catálogo o una descripción.",
        )

    cobro_service.validar_servicio(db, payment_data.service_id, current_user)

    if cita is not None:
        cobro_service.bloquear_cita(db, cita.id)
        db.refresh(cita)
        cobro_service.exigir_cita_sin_cobro(db, cita, cobro_adicional=payment_data.cobro_adicional)
        doctor_id = cobro_service.doctora_de_la_cita(cita)
    else:
        doctor_id = cobro_service.resolver_doctora_del_cobro_suelto(
            db, current_user, payment_data.doctor_id, patient.tenant_id
        )

    try:
        pago = cobro_service.crear_pago(
            db,
            current_user,
            tenant_id=patient.tenant_id,
            patient_id=patient.id,
            doctor_id=doctor_id,
            amount=payment_data.amount,
            method=payment_data.method,
            appointment_id=cita.id if cita else None,
            service_id=payment_data.service_id,
            description=payment_data.description,
            notes=payment_data.notes,
            referencia=payment_data.referencia,
            client_request_id=payment_data.client_request_id,
        )
        if cita is not None:
            # El «pendiente de cobro» se cierra para todas las asistentes en la
            # misma transacción: si no, la otra seguiría leyendo «puede proceder
            # al registro del pago» y cobraría dos veces (plan 27, §3.4).
            avisos_de_citas.resolver_cobro_pendiente(db, cita.id, current_user)
        db.commit()
    except IntegrityError:
        # Dos envíos del mismo intento llegaron a la vez: el índice único dejó
        # pasar uno. Se devuelve ése, que es el que la pantalla quería.
        db.rollback()
        previo = cobro_service.buscar_por_solicitud(db, payment_data.client_request_id)
        if previo is None:
            raise
        response.status_code = status.HTTP_200_OK
        return cobro_service.exigir_misma_solicitud(previo, current_user)

    db.refresh(pago)
    _registrar_alta(
        db,
        pago,
        current_user,
        origen="cita" if cita else "suelto",
        adicional=payment_data.cobro_adicional,
    )
    return pago


# Duración corta y fija: la consulta ya pasó, sólo hace falta que ocupe un
# lugar visible en la agenda del día. 15 es el mínimo que acepta una cita.
DURACION_EXPRESS_MIN = 15


def _consultas_de_hoy(db: Session, patient_id: int, doctor_id: int) -> list[Appointment]:
    """Consultas de hoy del paciente con esa doctora que ya ocurrieron o están en curso.

    Cuenta la que ya empezó (su hora ya pasó) o la que ya está en sala o
    atendida aunque sea más tarde (llegó temprano). Una cita agendada para más
    tarde no es "la misma consulta" que se está cobrando: contarla hacía que la
    express de las 10:00 chocara con la revisión de las 18:00 y mandaba a
    cobrar algo que todavía no pasa. Las canceladas no cuentan.

    ``scheduled_at`` se guarda en hora local, así que se compara contra la hora
    local directamente, sin pasar por UTC.
    """
    ahora = ahora_local()
    inicio = datetime.combine(ahora.date(), time.min)
    fin = datetime.combine(ahora.date(), time.max)
    return (
        db.query(Appointment)
        .filter(
            Appointment.patient_id == patient_id,
            Appointment.doctor_id == doctor_id,
            Appointment.status != AppointmentStatus.CANCELADA,
            Appointment.scheduled_at >= inicio,
            Appointment.scheduled_at <= fin,
            or_(
                Appointment.scheduled_at <= ahora,
                Appointment.status.in_(cobro_service.ESTADOS_QUE_SE_COBRAN),
            ),
        )
        .order_by(Appointment.scheduled_at.asc())
        .all()
    )


@router.post("/consulta-express", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
def create_consulta_express(
    datos: ConsultaExpressCreate,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("payments.create"))],
):
    """Cobrar una consulta rápida que no se agendó: cita express + pago, juntos.

    Emilio pidió que la consulta sin cita deje rastro en la agenda (plan 23,
    ajustes del 2026-09-28). La cita se crea ya ``atendida``, a la hora de
    ahora, con ``origen = express`` para que nadie la confunda con una
    agendada. No se revisan choques de sala ni de horario (ya ocurrió) y no se
    avisa "paciente en sala" (nadie está esperando).

    Todo en UNA transacción: si falla el pago, no queda la cita, y al revés.
    Mismo ``client_request_id`` → el mismo pago, sin otra cita.
    """
    previo = cobro_service.buscar_por_solicitud(db, datos.client_request_id)
    if previo is not None:
        response.status_code = status.HTTP_200_OK
        return cobro_service.exigir_misma_solicitud(previo, current_user)

    # Crear la cita es agendar: sin ese permiso, cobrar no puede servir de
    # puerta trasera a la agenda.
    if "appointments.create" not in get_user_permissions(current_user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para registrar consultas en la agenda. Cóbralo como «Otro concepto» o pídele a recepción que lo registre.",
        )

    patient = scoped_query(db.query(Patient), Patient, current_user).filter(Patient.id == datos.patient_id).first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró al paciente. Puede que la hayan eliminado; actualiza la lista de pacientes.")

    cobro_service.validar_servicio(db, datos.service_id, current_user)
    doctor_id = cobro_service.resolver_doctora_del_cobro_suelto(
        db, current_user, datos.doctor_id, patient.tenant_id
    )

    # Se bloquea la fila del paciente antes de revisar sus consultas del
    # día: dos personas registrando la misma express a la vez no pueden ver,
    # las dos, que no había nada. En SQLite no hace nada.
    (
        db.query(Patient.id)
        .filter(Patient.id == patient.id)
        .with_for_update(of=Patient)
        .first()
    )
    if not datos.confirmar_otra_consulta:
        de_hoy = _consultas_de_hoy(db, patient.id, doctor_id)
        if de_hoy:
            previa = de_hoy[-1]
            vigentes = cobro_service.pagos_vigentes_de_cita(db, previa.id)
            hora = previa.scheduled_at.strftime("%H:%M")
            if vigentes:
                detalle = (
                    f"Este paciente ya tiene una consulta hoy a las {hora} con esa doctora. "
                    + cobro_service.describir_cobro(vigentes[0])
                    + " Si de verdad fue otra consulta, confírmalo."
                )
            elif previa.status in cobro_service.ESTADOS_QUE_SE_COBRAN:
                # Sólo se manda a «Cobro de cita» si ahí va a aparecer: esa
                # lista trae las citas en sala y atendidas de hoy.
                detalle = (
                    f"Este paciente ya tiene una consulta hoy a las {hora} con esa doctora, sin cobrar. "
                    "Cóbrala desde «Cobro de cita»; si de verdad fue otra consulta, confírmalo."
                )
            else:
                # Agendada o confirmada y ya pasó su hora: nadie la pasó a sala,
                # así que no está en «Cobro de cita». Mandarla ahí era dejar a
                # recepción sin salida y empujarla a registrar otra consulta.
                detalle = (
                    f"Este paciente tiene una cita hoy a las {hora} con esa doctora que sigue "
                    f"«{ETIQUETA_ESTADO_CITA.get(previa.status, previa.status.value)}» en la agenda. "
                    "Si es esta consulta, pásala a sala desde la agenda y cóbrala en «Cobro de cita»; "
                    "si de verdad fue otra consulta, confírmalo."
                )
            raise cobro_service.CobroDobleError(
                detalle,
                cobro_service.serializar_pago(vigentes[0]) if vigentes else None,
                {
                    "id": previa.id,
                    "scheduled_at": previa.scheduled_at.isoformat(),
                    "status": previa.status.value,
                    "origen": AppointmentOrigen(previa.origen or AppointmentOrigen.AGENDA).value,
                },
            )

    try:
        cita = Appointment(
            tenant_id=patient.tenant_id,
            patient_id=patient.id,
            doctor_id=doctor_id,
            scheduled_at=ahora_local().replace(second=0, microsecond=0),
            duration_minutes=DURACION_EXPRESS_MIN,
            status=AppointmentStatus.ATENDIDA,
            appointment_type=AppointmentType.CONSULTA,
            origen=AppointmentOrigen.EXPRESS,
            attended_by_user_id=doctor_id,
            motivo_extra="CONSULTA EXPRESS",
        )
        db.add(cita)
        db.flush()
        pago = cobro_service.crear_pago(
            db,
            current_user,
            tenant_id=patient.tenant_id,
            patient_id=patient.id,
            doctor_id=doctor_id,
            amount=datos.amount,
            method=datos.method,
            appointment_id=cita.id,
            service_id=datos.service_id,
            description=datos.description or "CONSULTA EXPRESS",
            notes=datos.notes,
            referencia=datos.referencia,
            client_request_id=datos.client_request_id,
        )
        db.commit()
    except IntegrityError:
        # Dos envíos del mismo intento a la vez: el índice único dejó pasar
        # uno, con su cita. Éste se deshace entero y se devuelve aquél.
        db.rollback()
        previo = cobro_service.buscar_por_solicitud(db, datos.client_request_id)
        if previo is None:
            raise
        response.status_code = status.HTTP_200_OK
        return cobro_service.exigir_misma_solicitud(previo, current_user)
    except Exception:
        # Nada a medias: ni cita sin pago ni pago sin cita.
        db.rollback()
        raise

    db.refresh(pago)
    log_action(
        db,
        action="appointment.express_created",
        entity_type="appointment",
        entity_id=cita.id,
        actor_user_id=current_user.id,
        tenant_id=cita.tenant_id,
        patient_id=cita.patient_id,
        details={
            "doctor_id": doctor_id,
            "payment_id": pago.id,
            "registrada_por_user_id": current_user.id,
            "confirmo_otra_consulta": datos.confirmar_otra_consulta,
        },
    )
    _registrar_alta(db, pago, current_user, origen="express", adicional=False)
    return pago


def _leer_fecha(texto: Optional[str], *, fin_de_dia: bool) -> Optional[datetime]:
    """Lee un filtro de fecha tal como lo manda la pantalla y lo deja en UTC.

    - ``YYYY-MM-DD`` (el ``<input type="date">``) es el día COMPLETO en hora
      local: como inicio, las 00:00; como fin, el último instante del día. Leer
      el fin como las 00:00 dejaba fuera todo el último día del periodo.
    - Con hora y sin zona, es hora local del consultorio.
    - Con zona (``Z`` u offset), se respeta.
    """
    if not texto:
        return None
    texto = texto.strip()
    try:
        if len(texto) == 10:
            dia = date.fromisoformat(texto)
            momento = datetime.combine(dia, time.max if fin_de_dia else time.min)
        else:
            momento = datetime.fromisoformat(texto.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La fecha del filtro no es válida. Elige la fecha de nuevo.",
        )
    return local_a_utc(momento)


def _periodo_local(
    start_date: Optional[str], end_date: Optional[str]
) -> tuple[datetime, datetime, datetime, datetime]:
    """Periodo pedido → (inicio_local, fin_local, inicio_utc, fin_utc); sin fechas, hoy local."""
    hoy_inicio_utc, hoy_fin_utc = dia_local_en_utc(hoy_local())
    inicio_utc = _leer_fecha(start_date, fin_de_dia=False) or hoy_inicio_utc
    fin_utc = _leer_fecha(end_date, fin_de_dia=True) or hoy_fin_utc
    return utc_a_local(inicio_utc), utc_a_local(fin_utc), inicio_utc, fin_utc


@router.get("", response_model=List[PaymentResponse])
def list_payments(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("payments.read"))],
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD (día completo, hora local) o fecha y hora"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD (día completo, hora local) o fecha y hora"),
    doctor_id: Optional[int] = Query(None, description="Sólo el ingreso de esta doctora"),
    method: Optional[PaymentMethod] = Query(None, description="Filter by payment method"),
    status_filter: Optional[PaymentStatus] = Query(None, alias="status", description="vigente | anulado"),
    patient_id: Optional[int] = Query(None, description="Filter by patient"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    """El libro de pagos, con filtros; incluye anulados (se muestran tachados)."""
    query = _con_nombres(filtrar_pagos_del_alcance(db.query(Payment), current_user))

    inicio_utc = _leer_fecha(start_date, fin_de_dia=False)
    fin_utc = _leer_fecha(end_date, fin_de_dia=True)
    if inicio_utc:
        query = query.filter(Payment.paid_at >= inicio_utc)
    if fin_utc:
        query = query.filter(Payment.paid_at <= fin_utc)
    # Al médico el alcance ya la fijó a lo suyo: su doctor_id se ignora en
    # vez de confiar en él.
    if doctor_id and not alcance_operativo_acotado(current_user):
        query = query.filter(Payment.doctor_id == doctor_id)
    if method:
        query = query.filter(Payment.method == method)
    if status_filter:
        query = query.filter(Payment.status == status_filter)
    if patient_id:
        query = query.filter(Payment.patient_id == patient_id)

    query = query.order_by(Payment.paid_at.desc(), Payment.id.desc())
    return query.offset(skip).limit(limit).all()


@router.get("/cash-cut", response_model=CashCutReport)
def get_cash_cut(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("payments.cashcut"))],
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD o fecha y hora; por omisión, hoy local"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD o fecha y hora; por omisión, hoy local"),
    doctor_id: Optional[int] = Query(None, description="Sólo el ingreso de esta doctora"),
):
    """Corte de caja: totales por método, por doctora y por quién recibió.

    Los tres desgloses salen de la MISMA consulta base que el total, así que
    cada uno suma exactamente el total. Los anulados no cuentan.

    La secretaria ve el corte de los médicos que apoya y de nadie más (la
    asignación la hace administración); con ``doctor_id`` puede ver el de una
    de ellas, nunca el de otra.
    """
    inicio_local, fin_local, inicio_utc, fin_utc = _periodo_local(start_date, end_date)
    if fin_utc < inicio_utc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La fecha final no puede ser anterior a la inicial. Corrige el periodo.")

    query_alcance, asignadas = filtrar_corte_del_alcance(db, db.query(Payment), current_user)
    base_query = solo_pagos_vigentes(query_alcance).filter(
        Payment.paid_at >= inicio_utc, Payment.paid_at <= fin_utc
    )

    doctor_filtrado = None
    if alcance_operativo_acotado(current_user):
        doctor_filtrado = current_user.id
    elif doctor_id:
        if asignadas is not None and doctor_id not in asignadas:
            # 403 con la razón y no un corte en ceros: un cero haría creer que
            # esa doctora no cobró nada en el día.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Esa doctora no está entre las que apoyas. Pídele a administración que te la asigne.",
            )
        doctor_filtrado = doctor_id
        base_query = base_query.filter(Payment.doctor_id == doctor_id)

    if alcance_operativo_acotado(current_user):
        alcance = "propio"
    elif asignadas is not None:
        alcance = "asignadas"
    else:
        alcance = "sucursal"
    doctoras_del_alcance = None
    if asignadas is not None:
        nombres = dict(
            db.query(User.id, User.full_name).filter(User.id.in_(asignadas)).all()
        ) if asignadas else {}
        doctoras_del_alcance = [
            DoctoraDelCorte(doctor_id=i, doctor_name=nombres.get(i, ""))
            for i in sorted(asignadas, key=lambda i: nombres.get(i, ""))
        ]

    total_amount, total_count = base_query.with_entities(
        func.coalesce(func.sum(Payment.amount), 0),
        func.count(Payment.id),
    ).first()

    by_method = [
        CashCutMethodBreakdown(method=method, total_amount=amount, count=count)
        for method, amount, count in (
            base_query.with_entities(Payment.method, func.sum(Payment.amount), func.count(Payment.id))
            .group_by(Payment.method)
            .order_by(Payment.method)
            .all()
        )
    ]

    doctora = aliased(User)
    by_doctor = [
        CashCutDoctorBreakdown(
            doctor_id=did,
            doctor_name=nombre or cobro_service.SIN_DOCTORA,
            total_amount=amount,
            count=count,
        )
        for did, nombre, amount, count in (
            base_query.outerjoin(doctora, Payment.doctor_id == doctora.id)
            .with_entities(Payment.doctor_id, doctora.full_name, func.sum(Payment.amount), func.count(Payment.id))
            .group_by(Payment.doctor_id, doctora.full_name)
            .order_by(func.sum(Payment.amount).desc())
            .all()
        )
    ]

    receptor = aliased(User)
    by_received_by = [
        CashCutReceivedByBreakdown(user_id=uid, user_name=nombre, total_amount=amount, count=count)
        for uid, nombre, amount, count in (
            base_query.join(receptor, Payment.received_by_user_id == receptor.id)
            .with_entities(Payment.received_by_user_id, receptor.full_name, func.sum(Payment.amount), func.count(Payment.id))
            .group_by(Payment.received_by_user_id, receptor.full_name)
            .order_by(func.sum(Payment.amount).desc())
            .all()
        )
    ]

    mi_caja = None
    if corte_acotado_a_asignadas(current_user):
        mi_caja = _caja_de(db, current_user, inicio_utc, fin_utc)

    return CashCutReport(
        start_date=inicio_local,
        end_date=fin_local,
        doctor_id=doctor_filtrado,
        total_amount=total_amount,
        total_count=total_count,
        by_method=by_method,
        by_doctor=by_doctor,
        by_received_by=by_received_by,
        alcance=alcance,
        doctoras_del_alcance=doctoras_del_alcance,
        mi_caja=mi_caja,
    )


def _caja_de(db: Session, user: User, inicio_utc: datetime, fin_utc: datetime) -> CajaDeQuienRecibe:
    """Todo lo que ``user`` recibió en el periodo en su sucursal, de cualquier doctora.

    Sale de la misma base que la lista de cobros (``scoped_query`` a la
    sucursal, sólo vigentes), no del corte acotado: es el arqueo de su caja, y
    el efectivo que cobró para un médico que no apoya también está en el
    cajón.
    """
    base = solo_pagos_vigentes(scoped_query(db.query(Payment), Payment, user)).filter(
        Payment.received_by_user_id == user.id,
        Payment.paid_at >= inicio_utc,
        Payment.paid_at <= fin_utc,
    )
    total, cuantos = base.with_entities(
        func.coalesce(func.sum(Payment.amount), 0), func.count(Payment.id)
    ).first()
    por_metodo = [
        CashCutMethodBreakdown(method=metodo, total_amount=importe, count=n)
        for metodo, importe, n in (
            base.with_entities(Payment.method, func.sum(Payment.amount), func.count(Payment.id))
            .group_by(Payment.method)
            .order_by(Payment.method)
            .all()
        )
    ]
    return CajaDeQuienRecibe(
        user_id=user.id,
        user_name=user.full_name,
        total_amount=total,
        count=cuantos,
        by_method=por_metodo,
    )


def _pago_del_alcance(db: Session, payment_id: int, user: User) -> Payment:
    pago = (
        _con_nombres(filtrar_pagos_del_alcance(db.query(Payment), user))
        .filter(Payment.id == payment_id)
        .first()
    )
    if not pago:
        # 404 y no 403 para el pago de otro médico: no se confirma que existe.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PAGO_NO_ENCONTRADO)
    return pago


@router.get("/{payment_id}", response_model=PaymentResponse)
def get_payment(
    payment_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("payments.read"))],
):
    """Get a payment by ID."""
    return _pago_del_alcance(db, payment_id, current_user)


@router.post("/{payment_id}/anular", response_model=PaymentResponse)
def void_payment(
    payment_id: int,
    datos: AnularPago,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("payments.create"))],
):
    """Anular un cobro mal capturado, con motivo.

    Anula quien lo registró, el mismo día (hora local): es quien sabe que se
    equivocó y todavía no se entrega el corte. Después, o para cobros ajenos,
    sólo administración: un corte ya entregado no se mueve sin supervisión.
    """
    pago = _pago_del_alcance(db, payment_id, current_user)
    if pago.status == PaymentStatus.ANULADO:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este pago ya estaba anulado.")

    if not cobro_service.puede_anular(pago, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sólo quien registró el cobro puede anularlo, y sólo el mismo día. Pide a administración que lo anule.",
        )

    express = None
    if datos.cancelar_consulta_express:
        # Todo se revisa ANTES de tocar nada: o se anula el pago y se cancela
        # la consulta, o no pasa ninguna de las dos.
        express = _express_cancelable(db, pago, current_user)

    pago.status = PaymentStatus.ANULADO
    pago.void_reason = datos.motivo
    pago.voided_at = utcnow()
    pago.voided_by_user_id = current_user.id
    if express is not None:
        express.status = AppointmentStatus.CANCELADA
        express.cancellation_reason = datos.motivo
        express.cancelled_by_user_id = current_user.id
        express.cancelled_at = utcnow()
    elif pago.appointment_id is not None:
        cita_del_pago = db.get(Appointment, pago.appointment_id)
        if cita_del_pago is not None:
            avisos_de_citas.avisar_cobro_anulado(db, cita_del_pago, current_user)
    db.commit()
    db.refresh(pago)

    if express is not None:
        log_action(
            db,
            action="appointment.cancelled",
            entity_type="appointment",
            entity_id=express.id,
            actor_user_id=current_user.id,
            tenant_id=express.tenant_id,
            patient_id=express.patient_id,
            reason=datos.motivo,
            details={"origen": "express", "al_anular_pago_id": pago.id},
        )

    log_action(
        db,
        action="payment.voided",
        entity_type="payment",
        entity_id=pago.id,
        actor_user_id=current_user.id,
        tenant_id=pago.tenant_id,
        patient_id=pago.patient_id,
        reason=datos.motivo,
        details={"amount": str(pago.amount), "appointment_id": pago.appointment_id},
    )
    return pago


def _express_cancelable(db: Session, pago: Payment, user: User) -> Appointment:
    """La consulta express del pago, si se puede cancelar junto con él; si no, un error claro.

    Sólo aplica a la cita que se creó al cobrar (``origen = express``), que no
    tenga otros cobros vigentes (un cobro adicional sí fue real) ni nota,
    receta o certificado: si el médico ya la documentó, ocurrió, y cancelarla
    escondería información clínica.
    """
    from app.models.medical_certificate import MedicalCertificate
    from app.models.prescription import Prescription
    from app.models.soap_note import SOAPNote

    if "appointments.cancel" not in get_user_permissions(user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para cancelar citas. Anula sólo el cobro y pide a recepción que cancele la consulta express.",
        )
    cita = db.get(Appointment, pago.appointment_id) if pago.appointment_id else None
    if cita is None or cita.origen != AppointmentOrigen.EXPRESS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este cobro no es de una consulta express. Anúlalo sin cancelar ninguna consulta.",
        )
    if cita.status == AppointmentStatus.CANCELADA:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La consulta express ya estaba cancelada. Anula sólo el cobro.",
        )
    otros = [p for p in cobro_service.pagos_vigentes_de_cita(db, cita.id) if p.id != pago.id]
    if otros:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La consulta express tiene otros cobros vigentes, así que sí ocurrió. Anula sólo este cobro.",
        )
    documentada = (
        db.query(SOAPNote.id).filter(SOAPNote.appointment_id == cita.id).first()
        or db.query(Prescription.id).filter(Prescription.appointment_id == cita.id).first()
        or db.query(MedicalCertificate.id).filter(MedicalCertificate.appointment_id == cita.id).first()
    )
    if documentada:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La consulta express ya tiene nota, receta o certificado: no se cancela. Anula sólo el cobro.",
        )
    return cita


@router.post("/{payment_id}/send-receipt", status_code=status.HTTP_200_OK)
def send_payment_receipt(
    payment_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("payments.send_receipt"))],
):
    """Email a payment receipt PDF to the patient's registered email address."""
    payment = _pago_del_alcance(db, payment_id, current_user)
    if payment.status == PaymentStatus.ANULADO:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se envía recibo de un pago anulado.")

    patient = db.query(Patient).filter(Patient.id == payment.patient_id).first()
    if not patient or not patient.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El paciente no tiene un correo registrado")

    # El recibo lleva al médico a quien pertenece el ingreso. Antes ponía a
    # quien cobró, así que un recibo cobrado en recepción salía a nombre de la
    # secretaria como si fuera médica. El tratamiento es el capturado ("Dra.");
    # sin él va el nombre solo, nunca un "Dr." supuesto.
    doctor_name = nombre_con_tratamiento(payment.doctor)
    tenant = db.query(Tenant).filter(Tenant.id == payment.tenant_id).first()
    tenant_name = tenant.name if tenant else ""

    clinic = get_clinic_info(db, user_id=payment.doctor_id, tenant_id=payment.tenant_id)
    method_label = PAYMENT_METHOD_LABELS.get(payment.method, payment.method.value)
    amount_str = f"{payment.amount:,.2f}"
    # Hora del consultorio: el paciente no sabe qué es UTC.
    date_str = utc_a_local(payment.paid_at).strftime('%d/%m/%Y %H:%M')
    body_text = f"Hola {patient.first_name}, confirmamos tu pago de ${amount_str} MXN ({method_label}) el {date_str}. Gracias."
    body_html = pay_tmpl(clinic, patient.first_name, amount_str, method_label, date_str, payment.description or "")

    # Generate receipt PDF
    from app.utils.pdf import generate_receipt_pdf
    pdf_buffer = generate_receipt_pdf(payment, patient, doctor_name=doctor_name, tenant_name=tenant_name)
    pdf_bytes = pdf_buffer.getvalue() if hasattr(pdf_buffer, 'getvalue') else pdf_buffer.read()

    # La fecha del nombre, también en hora de Mazatlán (plan 26, D-12).
    filename = f"Recibo_{patient.first_name}_{utc_a_local(payment.paid_at).strftime('%Y%m%d')}.pdf"
    sent = send_email(
        to_email=patient.email,
        subject="Confirmación de pago",
        body_text=body_text,
        body_html=body_html,
        attachment_bytes=pdf_bytes,
        attachment_filename=filename,
    )

    if not sent:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="No se pudo enviar el correo")

    log_action(
        db,
        action="payment.emailed",
        entity_type="payment",
        entity_id=payment.id,
        actor_user_id=current_user.id,
        tenant_id=payment.tenant_id,
        details={"to_email": patient.email},
    )

    return {"detail": "Correo enviado", "to_email": patient.email}


@router.get("/patient/{patient_id}/all", response_model=List[PaymentResponse])
def list_patient_payments(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("payments.read"))],
):
    """Historial de pagos de un paciente, acotado al alcance de quien consulta."""
    patient = scoped_query(db.query(Patient), Patient, current_user).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró al paciente. Puede que la hayan eliminado; actualiza la lista de pacientes.")

    return (
        _con_nombres(filtrar_pagos_del_alcance(db.query(Payment), current_user))
        .filter(Payment.patient_id == patient_id)
        .order_by(Payment.paid_at.desc(), Payment.id.desc())
        .all()
    )
