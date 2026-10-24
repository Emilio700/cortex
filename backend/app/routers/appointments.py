"""Appointments router - CRUD and status management"""
from datetime import date, datetime, timedelta
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.access_scope import (
    alcance_operativo_acotado,
    exigir_agenda_propia,
    exigir_relacion_asistencial,
    filtrar_citas_del_alcance,
)
from app.core.deps import get_current_user, get_db, get_user_permissions, require_permission
from app.core.tenant_scope import scoped_query
from app.db.session import utcnow
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.models.patient import Patient
from app.models.user import Role, User
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentResponse,
    AppointmentStatusUpdate,
    AppointmentUpdate,
    DoctorInAppointment,
    PatientInAppointment,
    ReenvioConfirmacionResponse,
)
from app.services.appointment_service import (
    can_transition_to_en_sala,
    check_appointment_collision,
    check_outside_working_hours,
    check_schedule_block_collision,
    find_room_collision,
    resolve_room_for_appointment,
    room_collision_message,
)
from app.services.appointment_confirmation_service import (
    reenviar_confirmacion_de_cita,
    send_appointment_confirmation,
)
from app.services.audit_service import log_action
from app.services.datos_de_cita import semanas_por_cita
from app.services.consulta_en_curso import (
    es_salida_sin_cerrar,
    preparar_salida_de_consulta,
    registrar_salida_de_consulta,
    validar_cambio_manual,
)
from app.services.cobro_service import (
    ETIQUETA_METODO,
    bloquear_cita,
    buscar_por_solicitud,
    corregir_doctora_al_atender,
    crear_pago,
    doctora_de_la_cita,
    exigir_misma_solicitud,
    exigir_sin_pagos_vigentes,
    formatear_importe,
    quien_atendio,
    resumen_de_cobros,
    validar_servicio,
)
from app.services import avisos_de_citas
from app.utils.sanitize import sanitize_text
from app.utils.tratamiento import nombre_con_tratamiento

router = APIRouter(prefix="/appointments", tags=["Appointments"])


def _respuestas(
    db: Session, citas: list[Appointment], user: Optional[User] = None
) -> list[AppointmentResponse]:
    """Arma la respuesta de las citas con sus datos anidados y su estado de cobro.

    El cobro se calcula con una sola consulta para toda la lista: la agenda y el
    modal de recepción piden cien citas a la vez. Con ``user``, también las
    semanas de gestación que esa sesión puede ver (plan 28, D-4).
    """
    cobros = resumen_de_cobros(db, citas)
    semanas = semanas_por_cita(db, citas, user)
    # La nota postoperatoria es de la doctora y es clínica: viaja con la nota
    # de consulta, no con la agenda (plan 32, revisión del punto 7). Sin
    # ``user`` (llamadas internas) no se recorta nada.
    ve_clinico = user is None or "soap_notes.read" in get_user_permissions(user, db)
    resultado = []
    for apt in citas:
        apt_dict = AppointmentResponse.model_validate(apt).model_dump()
        apt_dict["patient"] = PatientInAppointment.model_validate(apt.patient) if apt.patient else None
        apt_dict["doctor"] = DoctorInAppointment.model_validate(apt.doctor) if apt.doctor else None
        apt_dict["has_triage"] = apt.triage is not None
        apt_dict["room_name"] = apt.room.name if apt.room else None
        apt_dict.update(cobros[apt.id])
        if apt.id in semanas:
            apt_dict["semanas_gestacion"], apt_dict["dias_gestacion"] = semanas[apt.id]
        if not ve_clinico:
            apt_dict["postop_notes"] = None
        resultado.append(AppointmentResponse(**apt_dict))
    return resultado


def _respuesta(db: Session, cita: Appointment, user: Optional[User] = None) -> AppointmentResponse:
    return _respuestas(db, [cita], user)[0]


def _aviso_de_cierre(db: Session, cita: Appointment, quien_cierra: User) -> tuple[str, str]:
    """Qué le dice a secretaría el aviso de consulta finalizada.

    Se decide por el estado REAL del cobro ya registrado en la transacción, no
    por lo que pidió la pantalla: una cita ya cobrada que se cierra sin bloque de cobro
    (reapertura) diría "pendiente de cobro", y es justo así como se cobra dos
    veces. Si el sistema no cobró, el aviso no dice que sí, y viceversa.
    """
    paciente = f"{cita.patient.first_name} {cita.patient.last_name}"
    # La médica que atendió, no quien apretó el botón: si cierra recepción, el
    # aviso decía "Dr. <nombre de la secretaria>". Con su tratamiento
    # capturado ("Dra. Cintia Castro"), o el nombre solo si no lo hay.
    medico = nombre_con_tratamiento(cita.attended_by or cita.doctor or quien_cierra)
    cobro = resumen_de_cobros(db, [cita])[cita.id]
    if cobro["estado_cobro"] == "cobrada":
        pagos = cobro["cobro_resumen"]
        metodos = ", ".join(dict.fromkeys(ETIQUETA_METODO.get(p["method"], "otro medio") for p in pagos))
        receptores = ", ".join(dict.fromkeys(p["received_by_name"] or "otra persona" for p in pagos))
        return (
            "Consulta finalizada — ya cobrada",
            f"{paciente} — {medico}. Ya la cobró {receptores} "
            f"({formatear_importe(cobro['total_cobrado'])}, {metodos}). No volver a cobrar.",
        )
    if cobro["estado_cobro"] == "sin_cargo":
        return (
            "Consulta finalizada — sin cargo",
            f"{paciente} — {medico}. Sin cargo: {cita.cobro_sin_cargo_motivo}. No hay nada que cobrar.",
        )
    return (
        "Consulta finalizada — pendiente de cobro",
        f"{paciente} — {medico}. Puede proceder al registro del pago.",
    )


def _filtrar_por_dias_locales(query, fecha_desde: Optional[date], fecha_hasta: Optional[date]):
    """Recorta a días completos del consultorio (plan 28).

    ``scheduled_at`` guarda la hora local del consultorio sin zona. Pedir el
    día como fecha (``AAAA-MM-DD``) evita que el navegador lo traduzca a UTC y
    que, cerca de la medianoche, «hoy» traiga citas de ayer o deje fuera las de
    la noche.
    """
    if fecha_desde:
        query = query.filter(Appointment.scheduled_at >= datetime.combine(fecha_desde, datetime.min.time()))
    if fecha_hasta:
        query = query.filter(
            Appointment.scheduled_at < datetime.combine(fecha_hasta + timedelta(days=1), datetime.min.time())
        )
    return query


def _solo_digitos(columna):
    """El teléfono guardado sin espacios, guiones ni paréntesis."""
    for caracter in (" ", "-", "(", ")", "."):
        columna = func.replace(columna, caracter, "")
    return columna


def _filtrar_por_paciente(query, texto: str):
    """Busca la paciente por nombre, n.º de expediente o teléfono.

    El expediente es el id de la paciente (el mismo que la clave del sistema
    anterior), así que un término numérico también se compara exacto contra él.
    En los teléfonos se ignoran espacios y guiones de lo escrito: la doctora
    teclea «669 123 4567» y en la ficha está «6691234567».
    """
    query = query.join(Patient, Appointment.patient_id == Patient.id)
    for palabra in texto.split():
        escapada = palabra.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        patron = f"%{escapada}%"
        condiciones = [
            Patient.first_name.ilike(patron, escape="\\"),
            Patient.last_name.ilike(patron, escape="\\"),
        ]
        digitos = "".join(c for c in palabra if c.isdigit())
        if digitos and len(digitos) == len(palabra.replace("-", "").replace("(", "").replace(")", "")):
            # Un teléfono completo no cabe en el id: solo se compara si puede ser expediente.
            if len(digitos) <= 9:
                condiciones.append(Patient.id == int(digitos))
            # Con menos de cuatro cifras casi cualquier teléfono coincide y el
            # expediente buscado se perdería entre ruido.
            if len(digitos) >= 4:
                condiciones.append(_solo_digitos(Patient.phone).like(f"%{digitos}%"))
                condiciones.append(_solo_digitos(Patient.cell_phone).like(f"%{digitos}%"))
        query = query.filter(or_(*condiciones))
    return query


@router.get("/my-appointments", response_model=list[AppointmentResponse])
def list_my_appointments(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("doctor.appointments.read"))],
    start_date: Optional[datetime] = Query(None, description="Filter by start date"),
    end_date: Optional[datetime] = Query(None, description="Filter by end date"),
    status: Optional[AppointmentStatus] = Query(None, description="Filter by status"),
    room_id: Optional[int] = Query(None, description="Filtrar por sala de consulta"),
    fecha_desde: Optional[date] = Query(None, description="Primer día local (AAAA-MM-DD), inclusive"),
    fecha_hasta: Optional[date] = Query(None, description="Último día local (AAAA-MM-DD), inclusive"),
    appointment_type: Optional[AppointmentType] = Query(None, description="consulta, cirugia o procedimiento"),
    q: Optional[str] = Query(
        None, max_length=100, description="Paciente por nombre, n.º de expediente o teléfono"
    ),
    orden: Optional[Literal["asc", "desc"]] = Query(
        None, description="asc: más antigua primero; desc: más reciente primero"
    ),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    """
    List appointments for the logged-in doctor

    El total de lo que cumple los filtros va en ``X-Total-Count`` (como en
    recetas y certificados) y no en un sobre ``{items, total}``: el inicio y
    el calendario de la doctora leen esta misma lista y seguirían funcionando
    sin cambiar. Sin el total, Mis Consultas no podía pasar de la consulta 100.

    Available filters:
    - Date range (start_date, end_date)
    - Status

    Returns only appointments assigned to the current doctor
    """
    query = scoped_query(db.query(Appointment), Appointment, current_user).options(
        joinedload(Appointment.patient), joinedload(Appointment.doctor), joinedload(Appointment.triage), joinedload(Appointment.room)
    )

    # Doctors see only their own appointments. MASTER sees ALL appointments
    # (consistent with master's global visibility — useful for demo/supervision).
    if current_user.role != Role.MASTER:
        query = query.filter(Appointment.doctor_id == current_user.id)

    # Apply filters
    if start_date:
        query = query.filter(Appointment.scheduled_at >= start_date)
    if end_date:
        query = query.filter(Appointment.scheduled_at <= end_date)
    if status:
        query = query.filter(Appointment.status == status)
    if room_id:
        query = query.filter(Appointment.room_id == room_id)
    if appointment_type:
        query = query.filter(Appointment.appointment_type == appointment_type)
    query = _filtrar_por_dias_locales(query, fecha_desde, fecha_hasta)
    if q and q.strip():
        query = _filtrar_por_paciente(query, q)

    # Date-filtered views are chronological so a doctor can work through a
    # day/range. The unfiltered history is newest first; otherwise the API
    # limit would return the oldest records and make recent consultations
    # appear to be missing.
    # El orden explícito manda. El id desempata: con dos citas a la misma hora,
    # sin él una podría repetirse en dos páginas y la otra no salir en ninguna.
    ascendente = orden == "asc" if orden else bool(start_date or end_date or fecha_desde or fecha_hasta)
    if ascendente:
        query = query.order_by(Appointment.scheduled_at.asc(), Appointment.id.asc())
    else:
        query = query.order_by(Appointment.scheduled_at.desc(), Appointment.id.desc())

    # El conteo usa los mismos filtros sin paginar, para que «de N» sea exacto.
    response.headers["X-Total-Count"] = str(query.order_by(None).count())
    appointments = query.offset(skip).limit(limit).all()

    return _respuestas(db, appointments, current_user)


ESTADOS_PENDIENTES_DEL_DIA = (
    AppointmentStatus.AGENDADA,
    AppointmentStatus.CONFIRMADA,
    AppointmentStatus.EN_SALA,
    AppointmentStatus.EN_CONSULTA,
)


@router.get("/my-appointments/resumen-del-dia", response_model=dict)
def resumen_del_dia(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("doctor.appointments.read"))],
    fecha: Optional[date] = Query(None, description="Día local (AAAA-MM-DD); por omisión, hoy en el consultorio"),
):
    """Cuántas consultas tiene la doctora ese día, cuántas faltan y cuántas atendió.

    Para el encabezado de Mis Consultas (plan 32, punto 4). Lo cuenta el
    servidor con el mismo alcance que la lista: contar la página visible
    daría un número falso en cuanto el día tenga más de una página. Las
    canceladas no cuentan como consultas del día.
    """
    from sqlalchemy import case, func

    from app.core.hora_local import hoy_local

    dia = fecha or hoy_local()
    query = scoped_query(db.query(Appointment), Appointment, current_user)
    if current_user.role != Role.MASTER:
        query = query.filter(Appointment.doctor_id == current_user.id)
    query = _filtrar_por_dias_locales(query, dia, dia).filter(Appointment.status != AppointmentStatus.CANCELADA)
    total, pendientes, atendidas = query.with_entities(
        func.count(Appointment.id),
        func.coalesce(func.sum(case((Appointment.status.in_(ESTADOS_PENDIENTES_DEL_DIA), 1), else_=0)), 0),
        func.coalesce(func.sum(case((Appointment.status == AppointmentStatus.ATENDIDA, 1), else_=0)), 0),
    ).one()
    return {"fecha": dia.isoformat(), "total": int(total), "pendientes": int(pendientes), "atendidas": int(atendidas)}


@router.get("/ocupacion-salas", response_model=list[dict])
def ocupacion_de_salas(
    db: Annotated[Session, Depends(get_db)],
    # Que no traiga datos de la paciente no lo vuelve público: dice quién
    # atiende a qué hora, y eso es agenda (B-03).
    current_user: Annotated[User, Depends(require_permission("appointments.read"))],
    fecha: Annotated[date, Query(description="Dia a consultar (AAAA-MM-DD)")],
):
    """Que salas estan ocupadas ese dia, en TODA la sucursal.

    Existe porque ``GET /appointments`` acota al doctor a sus propias citas, y
    asi una doctora no veia que un companero ya tenia tomada la sala. Para
    repartirse dos salas entre cuatro doctores hace falta ver la ocupacion
    ajena.

    **No devuelve ningun dato de la paciente**: solo sala, hora, duracion y de
    quien es la cita. Lo que se necesita para no pisarse, y nada mas.
    """
    inicio = datetime.combine(fecha, datetime.min.time())
    fin = inicio + timedelta(days=1)

    citas = (
        scoped_query(db.query(Appointment), Appointment, current_user)
        .options(joinedload(Appointment.doctor), joinedload(Appointment.room))
        .filter(
            Appointment.scheduled_at >= inicio,
            Appointment.scheduled_at < fin,
            Appointment.room_id.isnot(None),
            Appointment.status != AppointmentStatus.CANCELADA,
        )
        .order_by(Appointment.scheduled_at)
        .all()
    )
    return [
        {
            "appointment_id": c.id,
            "room_id": c.room_id,
            "room_name": c.room.name if c.room else None,
            "scheduled_at": c.scheduled_at.isoformat(),
            "duration_minutes": c.duration_minutes,
            "doctor_id": c.doctor_id,
            "doctor_name": c.doctor.full_name if c.doctor else None,
            "es_mia": c.doctor_id == current_user.id,
            "status": c.status.value if hasattr(c.status, "value") else c.status,
        }
        for c in citas
    ]


@router.get("", response_model=list[AppointmentResponse])
def list_appointments(
    db: Annotated[Session, Depends(get_db)],
    # Antes bastaba con haber iniciado sesión: un perfil al que se le quitó
    # la agenda la seguía leyendo entera por aquí (B-03).
    current_user: Annotated[User, Depends(require_permission("appointments.read"))],
    start_date: Optional[datetime] = Query(None, description="Filter by start date"),
    end_date: Optional[datetime] = Query(None, description="Filter by end date"),
    doctor_id: Optional[int] = Query(None, description="Filter by doctor"),
    patient_id: Optional[int] = Query(None, description="Filter by patient"),
    tenant_id: Optional[int] = Query(None, description="Filter by tenant (sucursal)"),
    room_id: Optional[int] = Query(None, description="Filtrar por sala de consulta"),
    appointment_type: Optional[AppointmentType] = Query(None, description="Filter by appointment type"),
    status: Optional[AppointmentStatus] = Query(None, description="Filter by status"),
    fecha_desde: Optional[date] = Query(None, description="Primer día local (AAAA-MM-DD), inclusive"),
    fecha_hasta: Optional[date] = Query(None, description="Último día local (AAAA-MM-DD), inclusive"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    """
    List appointments with filters

    Available filters:
    - Date range (start_date, end_date)
    - Doctor ID
    - Patient ID
    - Tenant ID (sucursal)
    - Room ID (sala de consulta)
    - Appointment type
    - Status

    Returns appointments for the current user's tenant
    """
    query = (
        scoped_query(db.query(Appointment), Appointment, current_user)
        .options(joinedload(Appointment.patient), joinedload(Appointment.doctor), joinedload(Appointment.triage), joinedload(Appointment.room))
    )

    # A doctor can only ever see their own appointments through this
    # general-purpose endpoint (Fase 5.4) - any doctor_id filter they pass is
    # ignored in favor of their own id, rather than trusted as-is.
    if alcance_operativo_acotado(current_user):
        query = filtrar_citas_del_alcance(query, Appointment.doctor_id, current_user)
    elif doctor_id:
        query = query.filter(Appointment.doctor_id == doctor_id)

    # Apply filters
    if start_date:
        query = query.filter(Appointment.scheduled_at >= start_date)
    if end_date:
        query = query.filter(Appointment.scheduled_at <= end_date)
    if patient_id:
        query = query.filter(Appointment.patient_id == patient_id)
    # The tenant filter only ever NARROWS the result set: scoped_query already
    # pinned non-MASTER users to their own tenant, so passing another tenant's
    # id simply returns nothing instead of leaking data. It is useful for
    # MASTER, who sees every sucursal and needs to look at one at a time.
    if tenant_id:
        query = query.filter(Appointment.tenant_id == tenant_id)
    if room_id:
        query = query.filter(Appointment.room_id == room_id)
    if appointment_type:
        query = query.filter(Appointment.appointment_type == appointment_type)
    if status:
        query = query.filter(Appointment.status == status)
    query = _filtrar_por_dias_locales(query, fecha_desde, fecha_hasta)

    # A date-bounded view (the agenda calendar) is read chronologically, so the
    # oldest-first order keeps the visible range intact if the limit is hit.
    # The unbounded history stays newest-first.
    if start_date or end_date or fecha_desde or fecha_hasta:
        query = query.order_by(Appointment.scheduled_at.asc())
    else:
        query = query.order_by(Appointment.scheduled_at.desc())

    appointments = query.offset(skip).limit(limit).all()

    return _respuestas(db, appointments, current_user)


@router.post("", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
def create_appointment(
    appointment_data: AppointmentCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("appointments.create"))],
):
    """
    Create new appointment (Secretaria/Admin/Doctor)

    Validates:
    - Doctor availability (no collision)
    - Patient and doctor belong to same tenant
    - Un doctor solo agenda en su propia agenda
    """
    # Una doctora agenda la proxima revision de su paciente, no reparte citas
    # en la agenda de sus colegas: el permiso "appointments.create" le alcanza
    # para crear, pero no dice para quien. Sin este guard, dárselo a una
    # doctora se lo da sobre las agendas de las otras cuatro.
    exigir_agenda_propia(
        appointment_data.doctor_id,
        current_user,
        detalle="Solo puedes agendar citas en tu propia agenda.",
    )

    # Check for collision
    if check_appointment_collision(
        db, appointment_data.doctor_id, appointment_data.scheduled_at, appointment_data.duration_minutes
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El doctor ya tiene otra cita a esa hora. Elige un horario libre.",
        )

    if check_schedule_block_collision(
        db, appointment_data.doctor_id, appointment_data.scheduled_at, appointment_data.duration_minutes
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El doctor no está disponible en ese horario (tiene un bloqueo en su agenda).",
        )

    if check_outside_working_hours(
        db, appointment_data.doctor_id, appointment_data.scheduled_at, appointment_data.duration_minutes
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ese horario está fuera del horario de atención del doctor.",
        )

    # Verify patient and doctor belong to current tenant
    from app.models.patient import Patient

    patient = scoped_query(db.query(Patient), Patient, current_user).filter(Patient.id == appointment_data.patient_id).first()

    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la paciente.")

    doctor = (
        scoped_query(db.query(User), User, current_user)
        .filter(User.id == appointment_data.doctor_id, User.role == Role.DOCTOR)
        .first()
    )

    if not doctor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró al doctor.")

    # Sala: obligatoria si la sucursal tiene mas de una activa, automatica si
    # solo tiene una, y opcional si no tiene ninguna configurada.
    try:
        room_id = resolve_room_for_appointment(
            db, current_user.tenant_id, appointment_data.room_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if room_id is not None:
        conflicto = find_room_collision(
            db, room_id, appointment_data.scheduled_at, appointment_data.duration_minutes
        )
        if conflicto is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=room_collision_message(db, room_id, conflicto),
            )

    # Create appointment
    # model_dump cubre todos los campos del schema: enumerarlos a mano hacía que
    # el tipo de cita y los datos de cirugia se perdieran en silencio al agendar.
    datos_cita = appointment_data.model_dump()
    datos_cita["room_id"] = room_id
    new_appointment = Appointment(
        **datos_cita,
        tenant_id=current_user.tenant_id,
        status=AppointmentStatus.AGENDADA,
    )

    db.add(new_appointment)
    db.flush()
    # El aviso a la doctora va en la misma transacción que la cita (plan 27).
    avisos_de_citas.avisar_cita_agendada(db, new_appointment, current_user)
    db.commit()
    db.refresh(new_appointment)

    # Load relationships
    db.refresh(new_appointment, ["patient", "doctor", "room"])

    # El correo a la paciente sí va después: no se deshace una cita porque el
    # servidor de correo no contestó.
    send_appointment_confirmation(db, new_appointment, actor_user_id=current_user.id)

    return _respuesta(db, new_appointment, current_user)


@router.get("/{appointment_id}", response_model=AppointmentResponse)
def get_appointment(
    appointment_id: int,
    db: Annotated[Session, Depends(get_db)],
    # El detalle con el mismo permiso que la lista: si no, quitar la agenda
    # dejaba abierta la cita una por una.
    current_user: Annotated[User, Depends(require_permission("appointments.read"))],
):
    """Get appointment by ID"""
    appointment = (
        scoped_query(db.query(Appointment), Appointment, current_user)
        .filter(Appointment.id == appointment_id)
        .options(joinedload(Appointment.patient), joinedload(Appointment.doctor), joinedload(Appointment.triage), joinedload(Appointment.room))
        .first()
    )

    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la cita.")

    exigir_agenda_propia(
        appointment.doctor_id,
        current_user,
        detalle="No se encontró la cita.",
        status_code=status.HTTP_404_NOT_FOUND,
    )

    return _respuesta(db, appointment, current_user)


@router.post("/{appointment_id}/confirmacion", response_model=ReenvioConfirmacionResponse)
def reenviar_confirmacion(
    appointment_id: int,
    db: Annotated[Session, Depends(get_db)],
    # Mismo permiso y alcance que leer la cita (S-05): quien puede ver la cita
    # puede reenviarle a la paciente la confirmación de su nueva hora.
    current_user: Annotated[User, Depends(require_permission("appointments.read"))],
):
    """Reenvía a la paciente el correo de confirmación de su cita (S-05).

    Pensado para el reagendado: al cambiar la fecha/hora, la paciente conserva
    por escrito la hora vieja, así que se le reenvía la nueva. Devuelve sólo lo
    que de verdad se sabe del envío (``enviado``/``motivo``); la interfaz no
    afirma «se reenvió» si el servidor de correo no lo confirmó.
    """
    appointment = (
        scoped_query(db.query(Appointment), Appointment, current_user)
        .filter(Appointment.id == appointment_id)
        .first()
    )

    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la cita.")

    exigir_agenda_propia(
        appointment.doctor_id,
        current_user,
        detalle="No se encontró la cita.",
        status_code=status.HTTP_404_NOT_FOUND,
    )

    resultado = reenviar_confirmacion_de_cita(db, appointment)

    # Se audita el intento (haya salido o no): deja rastro de que se pidió el
    # reenvío, a qué correo enmascarado y con qué desenlace, sin guardar el
    # correo completo de la paciente en la bitácora.
    log_action(
        db,
        action="appointment.confirmation_resent",
        entity_type="appointment",
        entity_id=appointment.id,
        actor_user_id=current_user.id,
        tenant_id=appointment.tenant_id,
        patient_id=appointment.patient_id,
        outcome="success" if resultado["enviado"] else "failure",
        details={"motivo": resultado["motivo"], "destinatario": resultado["destinatario"]},
    )

    return resultado


@router.put("/{appointment_id}", response_model=AppointmentResponse)
def update_appointment(
    appointment_id: int,
    appointment_data: AppointmentUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("appointments.update"))],
):
    """Update appointment (Secretaria/Admin only)"""
    appointment = (
        scoped_query(db.query(Appointment), Appointment, current_user).filter(Appointment.id == appointment_id).first()
    )

    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la cita.")

    # If rescheduling, check for collision
    update_data = appointment_data.model_dump(exclude_unset=True)

    if "scheduled_at" in update_data or "duration_minutes" in update_data or "doctor_id" in update_data:
        new_doctor_id = update_data.get("doctor_id", appointment.doctor_id)
        new_scheduled_at = update_data.get("scheduled_at", appointment.scheduled_at)
        new_duration = update_data.get("duration_minutes", appointment.duration_minutes)

        if check_appointment_collision(db, new_doctor_id, new_scheduled_at, new_duration, exclude_appointment_id=appointment_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El doctor ya tiene otra cita a esa hora. Elige un horario libre.",
            )

        if check_schedule_block_collision(db, new_doctor_id, new_scheduled_at, new_duration):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El doctor no está disponible en ese horario (tiene un bloqueo en su agenda).",
            )

        if check_outside_working_hours(db, new_doctor_id, new_scheduled_at, new_duration):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ese horario está fuera del horario de atención del doctor.",
            )

    # Sala: al reagendar (o al cambiar de sala) se revalida el choque de sala
    # con el mismo criterio de solapamiento. No se fuerza aqui la
    # obligatoriedad: una cita historica sin sala se puede seguir editando sin
    # que el sistema invente en que sala fue.
    if {"scheduled_at", "duration_minutes", "room_id"} & set(update_data):
        new_room_id = update_data.get("room_id", appointment.room_id)
        new_scheduled_at = update_data.get("scheduled_at", appointment.scheduled_at)
        new_duration = update_data.get("duration_minutes", appointment.duration_minutes)

        if new_room_id is not None and "room_id" in update_data:
            try:
                new_room_id = resolve_room_for_appointment(
                    db, appointment.tenant_id, new_room_id
                )
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
                ) from exc
            update_data["room_id"] = new_room_id

        if new_room_id is not None:
            conflicto = find_room_collision(
                db,
                new_room_id,
                new_scheduled_at,
                new_duration,
                exclude_appointment_id=appointment_id,
            )
            if conflicto is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=room_collision_message(db, new_room_id, conflicto),
                )

    # Update fields
    hora_antes, doctora_antes = appointment.scheduled_at, appointment.doctor_id
    for field, value in update_data.items():
        setattr(appointment, field, value)

    avisos_de_citas.avisar_reprogramacion(
        db, appointment, antes=hora_antes, doctora_antes=doctora_antes, actor=current_user
    )
    db.commit()
    db.refresh(appointment, ["patient", "doctor", "triage", "room"])

    return _respuesta(db, appointment, current_user)


@router.patch("/{appointment_id}/status", response_model=AppointmentResponse)
def change_appointment_status(
    appointment_id: int,
    status_update: AppointmentStatusUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Change appointment status

    Permission check is granular:
    - ``appointments.cancel`` is required to cancel an appointment
    - ``appointments.change_status`` is required for other transitions
      (confirmar, en_sala, atendida)

    Validates:
    - Cannot move to EN_SALA without triage
    - Cancelling requires a non-empty cancellation_reason (Fase 3.5 trazabilidad)

    Reabrir (``atendida`` → ``en_sala``) es un caso aparte: quien cerró la
    consulta por error tiene que poder corregir la nota o emitir la receta que
    faltó. Se gobierna por la relación asistencial con la paciente —la misma
    regla que la nota y la receta— y queda registrado en la bitácora.
    """
    # Granular permission check: cancel requires a different permission than
    # other status transitions (confirmar, en_sala, atendida).
    effective_permissions = get_user_permissions(current_user, db)
    required_action = "appointments.cancel" if status_update.status == AppointmentStatus.CANCELADA else "appointments.change_status"
    if required_action not in effective_permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para realizar esta acción.",
        )
    appointment = (
        scoped_query(db.query(Appointment), Appointment, current_user)
        .filter(Appointment.id == appointment_id)
        .options(joinedload(Appointment.triage))
        .first()
    )

    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la cita.")

    # «En consulta» lo pone abrir la consulta y de ahí solo se cierra o se
    # vuelve al estado del que entró (plan 28, D-3; reglas en consulta_en_curso).
    estado_previo = appointment.status
    validar_cambio_manual(appointment, status_update.status)
    regresa_a_sala = es_salida_sin_cerrar(estado_previo, status_update.status)
    preparar_salida_de_consulta(appointment, status_update.status)

    # Reabrir devuelve la cita a `en_sala` y no a `confirmada` porque describe
    # lo que de verdad está pasando: la paciente sigue en la clínica y su
    # consulta volvió a manos de la doctora. Además es el estado del que se sale
    # finalizando, así que el flujo se retoma donde estaba en vez de inventar un
    # camino nuevo.
    es_reapertura = (
        appointment.status == AppointmentStatus.ATENDIDA
        and status_update.status == AppointmentStatus.EN_SALA
    )

    if es_reapertura:
        # Quién puede reabrir se resuelve con la regla que ya gobierna la nota y
        # la receta: relación asistencial con la paciente. Ser la doctora
        # asignada a la cita no es ni necesario ni suficiente — la que cubre a
        # una compañera y documentó la consulta es justo quien necesita
        # corregirla, y no tendría sentido dejarla escribir la nota pero no
        # reabrir la consulta donde va.
        exigir_relacion_asistencial(db, appointment.patient_id, current_user)
    else:
        exigir_agenda_propia(
            appointment.doctor_id,
            current_user,
            detalle="No se encontró la cita.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    # El triage es requisito para *pasar* a la paciente a sala, no para
    # devolverle a la doctora una consulta que ya atendió. Exigirlo al reabrir
    # dejaría encerradas precisamente las citas a las que nadie les capturó los
    # signos vitales, que es un descuido de recepción y no un motivo para no
    # poder corregir el expediente.
    if (
        status_update.status == AppointmentStatus.EN_SALA
        and not es_reapertura
        and not regresa_a_sala
        and not can_transition_to_en_sala(appointment)
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Primero hay que completar el triage para poder pasar a la paciente a sala.")

    if status_update.status == AppointmentStatus.CANCELADA:
        reason = sanitize_text(status_update.cancellation_reason, 2000) if status_update.cancellation_reason else ""
        if not reason:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Para cancelar la cita hay que indicar el motivo de la cancelación.")
        appointment.cancellation_reason = reason
        appointment.cancelled_by_user_id = current_user.id
        appointment.cancelled_at = utcnow()

    # Se recuerda el estado previo ANTES de pisarlo: finalizar dos veces —dos
    # clics, o un reintento tras un error de red que en realidad sí llegó— no
    # debe anexar la nota del doctor otra vez al expediente ni volver a avisar a
    # todas las secretarias. La respuesta del segundo intento sigue siendo la
    # misma cita finalizada; lo que no se repite son los efectos.
    ya_estaba_atendida = appointment.status == AppointmentStatus.ATENDIDA
    estado_anterior = appointment.status

    finaliza = status_update.status == AppointmentStatus.ATENDIDA
    cobro = status_update.cobro
    if cobro is not None and not finaliza:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El cobro sólo se registra al finalizar la consulta.",
        )

    # Primero TODAS las validaciones del cobro, sin tocar nada: si el cobro no
    # es válido la cita no puede quedar atendida (plan 23, finalizar y cobrar es
    # una sola operación).
    pago_repetido = None
    motivo_sin_cargo = None
    if finaliza and cobro is not None:
        if cobro.modo == "cobrado":
            if "payments.create" not in effective_permissions:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="No tienes permiso para registrar cobros. Elige «Lo cobra recepción».",
                )
            if cobro.amount is None or cobro.amount <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Falta el importe del cobro, y debe ser mayor que cero.",
                )
            if cobro.method is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Falta la forma de pago del cobro.",
                )
            validar_servicio(db, cobro.service_id, current_user)
            pago_repetido = buscar_por_solicitud(db, cobro.client_request_id)
            if pago_repetido is not None:
                exigir_misma_solicitud(pago_repetido, current_user)
                if pago_repetido.appointment_id != appointment.id:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Ese identificador de cobro ya se usó en otra cita. Vuelve a abrir la consulta e inténtalo de nuevo.",
                    )
        elif cobro.modo == "sin_cargo":
            motivo_sin_cargo = sanitize_text(cobro.motivo or "", 255)
            if not motivo_sin_cargo:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Para marcar la consulta sin cargo hay que indicar el motivo.",
                )

        # Bloquear la cita y revisar DESPUÉS de bloquear: si recepción cobra en
        # este mismo instante, una de las dos espera y ve el pago de la otra.
        # Un reintento del mismo cobro no se revisa: ese pago ya es éste.
        if cobro.modo in ("cobrado", "sin_cargo") and pago_repetido is None:
            bloquear_cita(db, appointment.id)
            db.refresh(appointment)
            exigir_sin_pagos_vigentes(db, appointment)

    pago_nuevo = None
    try:
        if finaliza and appointment.attended_by_user_id is None:
            # Quien cierra la consulta es quien atendió, si es doctora; si
            # cierra recepción, la titular. Es el momento en que se sabe.
            appointment.attended_by_user_id = quien_atendio(appointment, current_user)
            if not ya_estaba_atendida:
                corregir_doctora_al_atender(db, appointment, appointment.attended_by_user_id)

        if finaliza and cobro is not None:
            # La decisión de este cierre reemplaza una exención anterior (la
            # doctora reabrió y ahora sí cobró, o se lo pasa a recepción). Sin
            # bloque no se toca: un cliente viejo no sabe de exenciones.
            if cobro.modo in ("cobrado", "recepcion"):
                appointment.cobro_sin_cargo_motivo = None
                appointment.cobro_sin_cargo_por_user_id = None
                appointment.cobro_sin_cargo_at = None
            if cobro.modo == "cobrado" and pago_repetido is None:
                pago_nuevo = crear_pago(
                    db,
                    current_user,
                    tenant_id=appointment.tenant_id,
                    patient_id=appointment.patient_id,
                    doctor_id=doctora_de_la_cita(appointment),
                    amount=cobro.amount,
                    method=cobro.method,
                    appointment_id=appointment.id,
                    service_id=cobro.service_id,
                    description=sanitize_text(cobro.description, 255) if cobro.description else None,
                    referencia=sanitize_text(cobro.referencia, 60) if cobro.referencia else None,
                    client_request_id=cobro.client_request_id,
                )
            elif cobro.modo == "sin_cargo":
                appointment.cobro_sin_cargo_motivo = motivo_sin_cargo
                appointment.cobro_sin_cargo_por_user_id = current_user.id
                appointment.cobro_sin_cargo_at = utcnow()

        # La nota para secretaría viaja en la misma transacción que el cierre:
        # antes se confirmaba aparte, y un fallo entre las dos dejaba la cita
        # cerrada sin la nota del descuento.
        if finaliza and not ya_estaba_atendida and status_update.notes:
            bloque = "\n---\n💬 Nota del doctor: " + status_update.notes
            # Tras una reapertura la cita ya no está `atendida`, así que el
            # guard de arriba no cubre este caso: el borrador sigue en la
            # pantalla de la doctora y se re-envía tal cual al volver a cerrar.
            # Lo que decide es el texto y no el estado — una nota distinta sí se
            # anexa, porque en el segundo cierre puede haber algo nuevo que
            # decirle a secretaría.
            if bloque not in (appointment.notes or ""):
                appointment.notes = (appointment.notes or "") + bloque

        appointment.status = status_update.status
        # Los avisos (y el cierre de los que ya no piden nada) van en esta
        # misma transacción: si fallan, la cita no cambia, y al revés (plan 27).
        avisos_de_citas.al_cambiar_estado(
            db,
            appointment,
            anterior=estado_anterior,
            actor=current_user,
            es_reapertura=es_reapertura,
            ya_estaba_atendida=ya_estaba_atendida,
            aviso_de_cierre=lambda: _aviso_de_cierre(db, appointment, current_user),
        )
        db.commit()
    except IntegrityError:
        # Dos envíos del mismo cierre con cobro llegaron a la vez y el índice
        # único dejó pasar uno: ése ya cerró la consulta con su pago.
        db.rollback()
        previo = buscar_por_solicitud(db, cobro.client_request_id if cobro else None)
        if previo is None or previo.appointment_id != appointment.id:
            raise
        db.refresh(appointment)
        return _respuesta(db, appointment, current_user)
    except Exception:
        # Nada a medias: si algo falla aquí, ni cita atendida ni pago.
        db.rollback()
        raise

    db.refresh(appointment, ["patient", "doctor", "triage", "room"])

    if pago_nuevo is not None:
        db.refresh(pago_nuevo)
        log_action(
            db,
            action="payment.created",
            entity_type="payment",
            entity_id=pago_nuevo.id,
            actor_user_id=current_user.id,
            tenant_id=pago_nuevo.tenant_id,
            patient_id=pago_nuevo.patient_id,
            details={
                "origen": "finalizar_consulta",
                "appointment_id": appointment.id,
                "doctor_id": pago_nuevo.doctor_id,
                "amount": str(pago_nuevo.amount),
                "method": pago_nuevo.method.value,
            },
        )
    if motivo_sin_cargo:
        log_action(
            db,
            action="appointment.sin_cargo",
            entity_type="appointment",
            entity_id=appointment.id,
            actor_user_id=current_user.id,
            tenant_id=appointment.tenant_id,
            patient_id=appointment.patient_id,
            reason=motivo_sin_cargo,
        )

    if status_update.status == AppointmentStatus.CANCELADA:
        log_action(
            db,
            action="appointment.cancelled",
            entity_type="appointment",
            entity_id=appointment.id,
            actor_user_id=current_user.id,
            tenant_id=appointment.tenant_id,
            details={"reason": appointment.cancellation_reason},
        )

    registrar_salida_de_consulta(db, appointment, current_user, estado_previo)

    if es_reapertura:
        # Sin esto, una consulta cerrada, reabierta y vuelta a cerrar quedaría
        # idéntica a una que se cerró una sola vez: el expediente mostraría el
        # resultado final sin decir que alguien lo cambió después de haberlo
        # dado por terminado.
        log_action(
            db,
            action="appointment.reopened",
            entity_type="appointment",
            entity_id=appointment.id,
            actor_user_id=current_user.id,
            tenant_id=appointment.tenant_id,
            patient_id=appointment.patient_id,
            details={
                "estado_anterior": AppointmentStatus.ATENDIDA.value,
                "estado_nuevo": AppointmentStatus.EN_SALA.value,
            },
        )

    return _respuesta(db, appointment, current_user)
