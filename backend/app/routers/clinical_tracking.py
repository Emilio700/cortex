"""Secure endpoints for FPP history and the clinician's longitudinal plan."""

import json
import uuid
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import case, func, or_, true
from sqlalchemy.orm import Session, joinedload

from app.core.access_scope import (
    exigir_autoria_clinica,
    filtrar_por_autoria_clinica,
    resolver_paciente_con_relacion_asistencial,
    resolver_paciente_de_su_duena,
)
from app.core.deps import get_db, require_permission
from app.core.resultados_visibles import ve_todos_los_resultados
from app.core.storage import default_storage
from app.core.tenant_scope import scoped_query
from app.db.session import utcnow
from app.models.acceso_clinico import SeccionClinica
from app.models.appointment import Appointment
from app.models.clinical_tracking import (
    DiagnosticOrder,
    DiagnosticOrderFollowUp,
    DiagnosticOrderGroup,
    DiagnosticResult,
    MedicationMonitoringPlan,
    PatientImmunization,
    PregnancyMedicationExposure,
)
from app.models.patient import Patient
from app.models.patient_document import DocumentType, PatientDocument
from app.core.hora_local import hoy_local
from app.models.pregnancy import FetalAssessment, FetalRecord, Pregnancy, PregnancyDatingEvent, PregnancyStatus, PrenatalMilestone, PrenatalVisit
from app.models.user import User
from app.schemas.clinical_tracking import (
    AnulacionDeResultado,
    AnularResultado,
    DiagnosticOrderCreate,
    DiagnosticOrderGroupCreate,
    DiagnosticOrderGroupResponse,
    DiagnosticOrderResponse,
    DiagnosticOrderStatusChange,
    DiagnosticOrderUpdate,
    ESTADOS_DE_ORDEN,
    TRANSICIONES_DE_ORDEN,
    DiagnosticOrderInboxItem,
    DiagnosticOrderInboxPage,
    DiagnosticResultCreate,
    DiagnosticResultResponse,
    DiagnosticResultUpdate,
    OrdenEnHistorial,
    AdjuntoDeOrden,
    BandejaPorPacientePage,
    SeguimientoCreate,
    EventoDeRastro,
    RastroDeEstudio,
    SeguimientoDeOrden,
    ResumenDeBandeja,
    FILTROS_DE_BANDEJA,
    IncidenciaCritica,
    IncidenciasCriticasPage,
    RegistroDeImpresion,
    RegistroDeImpresionResponse,
    PuntoDeValoracion,
    ValoracionesDePaciente,
    OrdenEnBandeja,
    PacienteEnBandeja,
    OrdenPorEntregarItem,
    OrdenPorEntregarPage,
    OrdenPorRecibirItem,
    OrdenPorRecibirPage,
    EntregaOrdenResponse,
    PlantillaOrdenDetalle,
    PlantillaOrdenEstudio,
    PlantillaOrdenResumen,
    PlantillasOrdenPage,
    ResultadoAdjuntoResponse,
    FetalAssessmentCreate,
    FetalAssessmentResponse,
    FetalRecordCreate,
    FetalRecordResponse,
    ImmunizationCreate,
    ImmunizationResponse,
    MedicationExposureCreate,
    MedicationExposureResponse,
    MedicationMonitoringPlanCreate,
    MedicationMonitoringPlanResponse,
    PregnancyDatingEventCreate,
    PregnancyDatingEventResponse,
    PrenatalMilestoneCreate,
    PrenatalMilestoneResponse,
    TrackingOverview,
    ObstetricDashboardItem,
    ResultadoEnHistorial,
    PrenatalReviewBoardItem,
)
from app.services.bitacora_accesos import registrar_acceso
from app.services.folio_service import folio_de_papel_de_ordenes, folio_impreso_de
from app.services.audit_service import log_action
from app.services import avisos_de_atrasados, estudios_atrasados, rastro_de_estudio
from app.services.estudios_atrasados import condicion_atrasado
from app.services import avisos_de_resultados
from app.services import anular_resultado
from app.services.anular_resultado import VIGENTE
from app.services.correccion_documentos import es_administracion
from app.utils.sanitize import sanitize_text
from app.utils.uploads import (
    ALLOWED_DOCUMENT_MIME_TYPES,
    MAX_DOCUMENT_SIZE_BYTES,
    extension_for_mime,
    read_and_validate_upload,
)

router = APIRouter(prefix="/clinical-tracking", tags=["clinical-tracking"])


def _patient(db: Session, patient_id: int, user: User) -> Patient:
    # El seguimiento clínico comparte la variante estrecha del prenatal: dueña
    # del expediente, no equipo tratante.
    return resolver_paciente_de_su_duena(
        db, patient_id, user, detalle_403="Solo puedes acceder a expedientes de tus pacientes"
    )


def _pregnancy(db: Session, pregnancy_id: int, user: User) -> Pregnancy:
    pregnancy = scoped_query(db.query(Pregnancy), Pregnancy, user).filter(Pregnancy.id == pregnancy_id).first()
    if not pregnancy:
        raise HTTPException(status_code=404, detail="No se encontró el embarazo. Puede que lo hayan eliminado; actualiza el expediente.")
    _patient(db, pregnancy.patient_id, user)
    exigir_autoria_clinica(pregnancy.doctor_id, user, detalle="Solo puedes acceder a embarazos bajo tu seguimiento")
    return pregnancy


def _validate_context(
    db: Session, user: User, patient: Patient, pregnancy_id: int | None, appointment_id: int | None
) -> None:
    if pregnancy_id:
        pregnancy = _pregnancy(db, pregnancy_id, user)
        if pregnancy.patient_id != patient.id:
            raise HTTPException(status_code=422, detail="El embarazo no corresponde al paciente")
    if appointment_id:
        appointment = scoped_query(db.query(Appointment), Appointment, user).filter(Appointment.id == appointment_id).first()
        if not appointment or appointment.patient_id != patient.id:
            raise HTTPException(status_code=422, detail="La cita no corresponde al paciente")
        exigir_autoria_clinica(appointment.doctor_id, user, detalle="Solo puedes vincular citas asignadas a ti")


def _log(db: Session, action: str, entity_type: str, entity_id: int, user: User, tenant_id: int, patient_id: int) -> None:
    log_action(
        db, action=action, entity_type=entity_type, entity_id=entity_id,
        actor_user_id=user.id, tenant_id=tenant_id, patient_id=patient_id, details={"patient_id": patient_id},
    )


@router.get("/patient/{patient_id}/overview", response_model=TrackingOverview)
def patient_tracking_overview(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.read"))],
) -> TrackingOverview:
    _patient(db, patient_id, user)
    registrar_acceso(db, user, patient_id, SeccionClinica.ESTUDIOS)
    pregnancies = scoped_query(db.query(Pregnancy), Pregnancy, user).filter(
        Pregnancy.patient_id == patient_id, Pregnancy.status == "active"
    )
    pregnancies = filtrar_por_autoria_clinica(pregnancies, Pregnancy.doctor_id, user)
    active = pregnancies.order_by(Pregnancy.created_at.desc()).first()
    return TrackingOverview(
        active_pregnancy_id=active.id if active else None,
        immunizations=scoped_query(db.query(PatientImmunization), PatientImmunization, user).filter(PatientImmunization.patient_id == patient_id).order_by(PatientImmunization.created_at.desc()).limit(20).all(),
        medication_exposures=scoped_query(db.query(PregnancyMedicationExposure), PregnancyMedicationExposure, user).filter(PregnancyMedicationExposure.patient_id == patient_id).order_by(PregnancyMedicationExposure.created_at.desc()).limit(20).all(),
        diagnostic_orders=scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user).filter(DiagnosticOrder.patient_id == patient_id).order_by(DiagnosticOrder.created_at.desc()).limit(30).all(),
    )


@router.get("/pregnancies/{pregnancy_id}/dating-events", response_model=list[PregnancyDatingEventResponse])
def list_dating_events(pregnancy_id: int, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(require_permission("clinical_tracking.read"))]):
    pregnancy = _pregnancy(db, pregnancy_id, user)
    return scoped_query(db.query(PregnancyDatingEvent), PregnancyDatingEvent, user).filter(PregnancyDatingEvent.pregnancy_id == pregnancy.id).order_by(PregnancyDatingEvent.recorded_at.desc()).all()


@router.post("/pregnancies/{pregnancy_id}/dating-events", response_model=PregnancyDatingEventResponse, status_code=status.HTTP_201_CREATED)
def create_dating_event(pregnancy_id: int, data: PregnancyDatingEventCreate, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(require_permission("clinical_tracking.create"))]):
    pregnancy = _pregnancy(db, pregnancy_id, user)
    event = PregnancyDatingEvent(tenant_id=pregnancy.tenant_id, pregnancy_id=pregnancy.id, recorded_by_user_id=user.id, **data.model_dump())
    db.add(event)
    if data.status == "accepted":
        pregnancy.estimated_delivery_date = data.accepted_delivery_date
        pregnancy.dating_method = data.method
        pregnancy.dating_status = "confirmed"
        pregnancy.estimated_delivery_date_source = data.method
        pregnancy.estimated_delivery_date_confirmed_at = utcnow()
        pregnancy.confirmed_by_user_id = user.id
        pregnancy.dating_notes = data.reason
    db.commit(); db.refresh(event)
    _log(db, "pregnancy_dating_event.created", "pregnancy_dating_event", event.id, user, event.tenant_id, pregnancy.patient_id)
    return event


@router.get("/pregnancies/{pregnancy_id}/fetuses", response_model=list[FetalRecordResponse])
def list_fetuses(pregnancy_id: int, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(require_permission("clinical_tracking.read"))]):
    pregnancy = _pregnancy(db, pregnancy_id, user)
    return scoped_query(db.query(FetalRecord), FetalRecord, user).filter(FetalRecord.pregnancy_id == pregnancy.id).order_by(FetalRecord.sequence_number).all()


@router.post("/pregnancies/{pregnancy_id}/fetuses", response_model=FetalRecordResponse, status_code=status.HTTP_201_CREATED)
def create_fetus(pregnancy_id: int, data: FetalRecordCreate, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(require_permission("clinical_tracking.create"))]):
    pregnancy = _pregnancy(db, pregnancy_id, user)
    duplicate = scoped_query(db.query(FetalRecord), FetalRecord, user).filter(FetalRecord.pregnancy_id == pregnancy.id, FetalRecord.sequence_number == data.sequence_number).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="Ya existe un registro fetal con esa secuencia")
    fetus = FetalRecord(tenant_id=pregnancy.tenant_id, pregnancy_id=pregnancy.id, **data.model_dump())
    pregnancy.is_multiple_gestation = int(data.sequence_number > 1 or (pregnancy.fetus_count or 0) > 1)
    pregnancy.fetus_count = max(pregnancy.fetus_count or 0, data.sequence_number)
    db.add(fetus); db.commit(); db.refresh(fetus)
    _log(db, "fetal_record.created", "fetal_record", fetus.id, user, fetus.tenant_id, pregnancy.patient_id)
    return fetus


@router.get("/fetuses/{fetus_id}/assessments", response_model=list[FetalAssessmentResponse])
def list_fetal_assessments(fetus_id: int, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(require_permission("clinical_tracking.read"))]):
    fetus = scoped_query(db.query(FetalRecord), FetalRecord, user).filter(FetalRecord.id == fetus_id).first()
    if not fetus: raise HTTPException(status_code=404, detail="No se encontró el registro del feto. Puede que lo hayan eliminado; actualiza el seguimiento del embarazo.")
    _pregnancy(db, fetus.pregnancy_id, user)
    return scoped_query(db.query(FetalAssessment), FetalAssessment, user).filter(FetalAssessment.fetal_record_id == fetus.id).order_by(FetalAssessment.assessed_on.desc()).all()


@router.post("/fetuses/{fetus_id}/assessments", response_model=FetalAssessmentResponse, status_code=status.HTTP_201_CREATED)
def create_fetal_assessment(fetus_id: int, data: FetalAssessmentCreate, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(require_permission("clinical_tracking.create"))]):
    fetus = scoped_query(db.query(FetalRecord), FetalRecord, user).filter(FetalRecord.id == fetus_id).first()
    if not fetus: raise HTTPException(status_code=404, detail="No se encontró el registro del feto. Puede que lo hayan eliminado; actualiza el seguimiento del embarazo.")
    pregnancy = _pregnancy(db, fetus.pregnancy_id, user)
    _validate_context(db, user, _patient(db, pregnancy.patient_id, user), None, data.appointment_id)
    assessment = FetalAssessment(tenant_id=fetus.tenant_id, fetal_record_id=fetus.id, recorded_by_user_id=user.id, **data.model_dump())
    db.add(assessment); db.commit(); db.refresh(assessment)
    _log(db, "fetal_assessment.created", "fetal_assessment", assessment.id, user, assessment.tenant_id, pregnancy.patient_id)
    return assessment


@router.get("/pregnancies/{pregnancy_id}/milestones", response_model=list[PrenatalMilestoneResponse])
def list_milestones(pregnancy_id: int, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(require_permission("clinical_tracking.read"))]):
    pregnancy = _pregnancy(db, pregnancy_id, user)
    return scoped_query(db.query(PrenatalMilestone), PrenatalMilestone, user).filter(PrenatalMilestone.pregnancy_id == pregnancy.id).order_by(PrenatalMilestone.due_on.asc()).all()


@router.post("/pregnancies/{pregnancy_id}/milestones", response_model=PrenatalMilestoneResponse, status_code=status.HTTP_201_CREATED)
def create_milestone(pregnancy_id: int, data: PrenatalMilestoneCreate, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(require_permission("clinical_tracking.create"))]):
    pregnancy = _pregnancy(db, pregnancy_id, user)
    milestone = PrenatalMilestone(tenant_id=pregnancy.tenant_id, pregnancy_id=pregnancy.id, created_by_user_id=user.id, **data.model_dump())
    if data.status == "completed": milestone.completed_at = utcnow()
    db.add(milestone); db.commit(); db.refresh(milestone)
    _log(db, "prenatal_milestone.created", "prenatal_milestone", milestone.id, user, milestone.tenant_id, pregnancy.patient_id)
    return milestone


@router.post("/immunizations", response_model=ImmunizationResponse, status_code=status.HTTP_201_CREATED)
def create_immunization(data: ImmunizationCreate, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(require_permission("clinical_tracking.create"))]):
    patient = _patient(db, data.patient_id, user); _validate_context(db, user, patient, data.pregnancy_id, data.appointment_id)
    item = PatientImmunization(tenant_id=patient.tenant_id, recorded_by_user_id=user.id, **data.model_dump())
    db.add(item); db.commit(); db.refresh(item)
    _log(db, "patient_immunization.created", "patient_immunization", item.id, user, item.tenant_id, patient.id)
    return item


@router.post("/medication-exposures", response_model=MedicationExposureResponse, status_code=status.HTTP_201_CREATED)
def create_medication_exposure(data: MedicationExposureCreate, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(require_permission("clinical_tracking.create"))]):
    patient = _patient(db, data.patient_id, user); _validate_context(db, user, patient, data.pregnancy_id, data.appointment_id)
    item = PregnancyMedicationExposure(tenant_id=patient.tenant_id, recorded_by_user_id=user.id, **data.model_dump())
    db.add(item); db.commit(); db.refresh(item)
    _log(db, "medication_exposure.created", "medication_exposure", item.id, user, item.tenant_id, patient.id)
    return item


@router.post("/medication-exposures/{exposure_id}/monitoring-plans", response_model=MedicationMonitoringPlanResponse, status_code=status.HTTP_201_CREATED)
def create_monitoring_plan(exposure_id: int, data: MedicationMonitoringPlanCreate, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(require_permission("clinical_tracking.create"))]):
    exposure = scoped_query(db.query(PregnancyMedicationExposure), PregnancyMedicationExposure, user).filter(PregnancyMedicationExposure.id == exposure_id).first()
    if not exposure: raise HTTPException(status_code=404, detail="No se encontró el medicamento registrado en el embarazo. Actualiza el seguimiento.")
    _patient(db, exposure.patient_id, user)
    item = MedicationMonitoringPlan(tenant_id=exposure.tenant_id, exposure_id=exposure.id, created_by_user_id=user.id, **data.model_dump())
    db.add(item); db.commit(); db.refresh(item)
    _log(db, "medication_monitoring_plan.created", "medication_monitoring_plan", item.id, user, item.tenant_id, exposure.patient_id)
    return item


# Una sola definición de incidencia crítica abierta (plan 26, D-8), la misma
# para el dashboard (/critical-results) y para el filtro «críticos» de la
# bandeja: crítico y sin cerrar. Se cierra al comunicarlo al paciente o al
# revisarlo en una consulta suya; revisarlo desde la bandeja no la cierra.
# Un resultado anulado (plan 29, lote 9) no tiene incidencia: no cuenta.
INCIDENCIA_ABIERTA = (
    DiagnosticResult.is_critical.is_(True), DiagnosticResult.incidencia_cerrada_at.is_(None), VIGENTE,
)


def _cerrar_incidencias(db: Session, order: DiagnosticOrder, user: User, *, por: str) -> None:
    """Cierra las incidencias críticas abiertas de TODA la orden.

    El médico revisa o comunica la orden de una vez, aunque traiga varios
    archivos; si sólo se cerrara el resultado que tocó, un crítico de un
    archivo anterior se quedaría abierto sin manera de cerrarlo desde la
    pantalla. Se anota cómo y quién la cerró.
    """
    db.flush()
    ahora = utcnow()
    for resultado in db.query(DiagnosticResult).filter(
        DiagnosticResult.diagnostic_order_id == order.id, *INCIDENCIA_ABIERTA
    ):
        resultado.incidencia_cerrada_at = ahora
        resultado.incidencia_cerrada_por = por
        resultado.incidencia_cerrada_by_user_id = user.id


def _cita_de_revision(
    db: Session, user: User, order: DiagnosticOrder, appointment_id: int | None, hay_revision: bool,
) -> tuple[Appointment | None, str | None]:
    """La cita con la que se revisa el resultado y si sirve para cerrar la incidencia (D-8).

    Devuelve ``(cita, cierre)``. La revisión se guarda SIEMPRE: la cita sólo
    decide si cierra la incidencia crítica. Antes una cita que no era de hoy
    daba 422 y el médico no podía guardar nada en una consulta de ayer que
    seguía abierta, en una reabierta, o en la de las 23:30 revisada a las
    00:05 (tercera revisión del plan 26).

    - Cita de otro paciente, de otro médico, cancelada o inexistente: 422,
      porque eso sí es un error de la pantalla.
    - De hoy (Mazatlán), o de ayer y todavía en sala: cierra (``"aplicada"``).
      Puede ser otra que la de la orden: el estudio de hace un mes se revisa
      en la consulta de hoy.
    - De cualquier otro día: guarda sin cerrar (``"cita_de_otro_dia"``). Una
      cita de hace meses o futura no prueba que el paciente esté enfrente.
    - Sin revisión (sólo valoración, o «recibido»), la cita se ignora.
    """
    if not appointment_id or not hay_revision:
        return None, None
    from datetime import timedelta as _timedelta

    from app.models.appointment import AppointmentStatus

    cita = scoped_query(db.query(Appointment), Appointment, user).filter(Appointment.id == appointment_id).first()
    estado = getattr(cita.status, "value", cita.status) if cita else None
    if not cita or cita.patient_id != order.patient_id or cita.doctor_id != user.id or estado == AppointmentStatus.CANCELADA.value:
        raise HTTPException(
            status_code=422,
            detail="La consulta indicada no es una cita vigente tuya con este paciente. Actualiza la consulta.",
        )
    # ``scheduled_at`` se guarda en hora local del consultorio.
    hoy = hoy_local()
    dia = cita.scheduled_at.date() if cita.scheduled_at else None
    # «En consulta» también es una consulta que sigue abierta (plan 28, D-3).
    en_curso_desde_ayer = dia == hoy - _timedelta(days=1) and estado in (
        AppointmentStatus.EN_SALA.value,
        AppointmentStatus.EN_CONSULTA.value,
    )
    if dia == hoy or en_curso_desde_ayer:
        return cita, "aplicada"
    return cita, "cita_de_otro_dia"


# La prioridad se guarda como texto, y ordenarla como texto la deja
# «urgent» > «routine» > «preferential»: una preferente caía detrás de todas
# las rutinarias, en la página 2 (plan 26, B-5). El orden clínico va explícito.
RANGO_DE_PRIORIDAD = case(
    (DiagnosticOrder.priority == "urgent", 0),
    (DiagnosticOrder.priority == "preferential", 1),
    else_=2,
)


def _filtrar_por_palabras(query, search: str | None):
    """Cada palabra tiene que aparecer en el estudio, el nombre o los apellidos.

    «KENIA PERAZA» buscado como una sola frase no encontraba a nadie, porque
    el nombre y los apellidos viven en columnas distintas (plan 26, B-8). Es
    la misma regla que la búsqueda de recepción; un número también encuentra
    la orden por su folio, que es lo que viene impreso en el papel.
    """
    for palabra in (search or "").split():
        term = f"%{palabra}%"
        condiciones = [DiagnosticOrder.study_name.ilike(term), Patient.first_name.ilike(term), Patient.last_name.ilike(term)]
        if palabra.isdigit():
            condiciones.append(DiagnosticOrder.id == int(palabra))
        query = query.filter(or_(*condiciones))
    return query


@router.get("/orders/inbox", response_model=DiagnosticOrderInboxPage)
def orders_inbox(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.read"))],
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status", max_length=40),
    search: str | None = Query(None, max_length=100),
):
    """Doctor work queue for orders that still require a result or follow-up."""
    active_statuses = ["ordered", "accepted", "scheduled", "collected", "in_process", "result_received"]
    query = scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user).join(
        Patient, Patient.id == DiagnosticOrder.patient_id
    )
    query = filtrar_por_autoria_clinica(query, DiagnosticOrder.doctor_id, user)
    if status_filter:
        # Un filtro con un estado que no existe devolvería una bandeja vacía y
        # el médico creería que no tiene pendientes: mejor decirlo.
        if status_filter not in ESTADOS_DE_ORDEN:
            raise HTTPException(status_code=422, detail=f"Estado desconocido: {status_filter}")
        query = query.filter(DiagnosticOrder.status == status_filter)
    else:
        query = query.filter(DiagnosticOrder.status.in_(active_statuses))
    query = _filtrar_por_palabras(query, search)
    total = query.count()
    orders = query.order_by(RANGO_DE_PRIORIDAD, DiagnosticOrder.requested_on.asc(), DiagnosticOrder.id.asc()).offset(skip).limit(limit).all()
    items = []
    for order in orders:
        latest = db.query(DiagnosticResult).filter(DiagnosticResult.diagnostic_order_id == order.id, VIGENTE).order_by(DiagnosticResult.created_at.desc()).first()
        items.append(DiagnosticOrderInboxItem(
            order=DiagnosticOrderResponse.model_validate(order),
            patient_name=f"{order.patient.first_name} {order.patient.last_name}".strip(),
            latest_result=_resultado_con_archivo(latest) if latest else None,
        ))
    return DiagnosticOrderInboxPage(items=items, total=total, skip=skip, limit=limit)


def _resultado_con_archivo(resultado: DiagnosticResult) -> DiagnosticResultResponse:
    """La respuesta de un resultado con el nombre y el MIME de su archivo (B-4)."""
    respuesta = DiagnosticResultResponse.model_validate(resultado)
    # El estado de la orden después del cambio, para que la pantalla no lo deduzca.
    respuesta.order_status = resultado.diagnostic_order.status if resultado.diagnostic_order else None
    documento = resultado.patient_document if resultado.patient_document_id else None
    if documento is not None:
        respuesta.document_file_name = documento.file_name
        respuesta.document_mime_type = documento.mime_type
    return respuesta


def _resultados_por_orden(db: Session, user: User, order_ids: list[int]) -> dict[int, list[ResultadoEnHistorial]]:
    """Todos los resultados de esas órdenes con su archivo, en UNA consulta.

    Los anulados (plan 29, lote 9) solo los ve la administración, con su
    motivo; para el médico y recepción ya no existen.
    """
    por_orden: dict[int, list[ResultadoEnHistorial]] = {order_id: [] for order_id in order_ids}
    if not order_ids:
        return por_orden
    filas = (
        scoped_query(db.query(DiagnosticResult, PatientDocument.file_name, PatientDocument.mime_type), DiagnosticResult, user)
        .outerjoin(PatientDocument, PatientDocument.id == DiagnosticResult.patient_document_id)
        .filter(DiagnosticResult.diagnostic_order_id.in_(order_ids))
        .filter(true() if es_administracion(user) else VIGENTE)
        .order_by(DiagnosticResult.created_at.desc(), DiagnosticResult.id.desc())
        .all()
    )
    # Los autores de toda la página en una sola consulta (plan 32, punto 3).
    nombres = rastro_de_estudio.nombres_de_usuarios(db, {
        uid
        for resultado, _, _ in filas
        for uid in (
            resultado.recorded_by_user_id, resultado.reviewed_by_user_id, resultado.communicated_by_user_id,
            resultado.interpretacion_escrita_por_user_id, resultado.interpretacion_editada_por_user_id,
        )
    })
    for resultado, nombre, mime in filas:
        item = ResultadoEnHistorial.model_validate(resultado)
        item.document_file_name, item.document_mime_type = nombre, mime
        item.recorded_by_nombre = nombres.get(resultado.recorded_by_user_id)
        item.reviewed_by_nombre = nombres.get(resultado.reviewed_by_user_id)
        item.communicated_by_nombre = nombres.get(resultado.communicated_by_user_id)
        item.interpretacion_escrita_por_nombre = nombres.get(resultado.interpretacion_escrita_por_user_id)
        item.interpretacion_editada_por_nombre = nombres.get(resultado.interpretacion_editada_por_user_id)
        por_orden[resultado.diagnostic_order_id].append(item)
    return por_orden


# Se recalculan al construir la respuesta; pasarlos de vuelta al constructor
# sería pasarle algo que no acepta.
CAMPOS_CALCULADOS_DE_ORDEN = {"allowed_transitions", "estado_visible", "acciones_de_estado"}


ESTADOS_SIN_RESULTADO = ("ordered", "accepted", "scheduled", "collected", "in_process")
NOMBRE_DE_RANGO = {0: "urgent", 1: "preferential", 2: "routine"}


def _condiciones_de_bandeja(db: Session, user: User) -> dict:
    """Qué entra en cada filtro de la bandeja. Las comparten la lista y el resumen,
    para que el número de la franja y lo que se ve al tocarla sean lo mismo."""
    from sqlalchemy import and_, select

    comunicadas = select(DiagnosticResult.diagnostic_order_id).where(DiagnosticResult.communicated_at.isnot(None), VIGENTE)
    criticas = select(DiagnosticResult.diagnostic_order_id).where(*INCIDENCIA_ABIERTA)
    condiciones = {
        "pendientes": DiagnosticOrder.status.in_(ESTADOS_SIN_RESULTADO),
        "por_revisar": DiagnosticOrder.status == "result_received",
        "sin_comunicar": and_(DiagnosticOrder.status == "reviewed", DiagnosticOrder.id.notin_(comunicadas)),
        "criticos": and_(
            DiagnosticOrder.status.notin_(tuple(ESTADOS_DE_ORDEN_NO_IMPRIMIBLES)), DiagnosticOrder.id.in_(criticas)
        ),
    }
    condiciones["activas"] = or_(*condiciones.values())
    condiciones["todos"] = DiagnosticOrder.status != "draft"
    # Subconjuntos de «pendientes»: no entran en «activas», que ya los contiene.
    condiciones["atrasados"] = condicion_atrasado(plazos=estudios_atrasados.plazos_por_doctora(db, user.tenant_id))
    condiciones["urgentes"] = and_(
        DiagnosticOrder.status.in_(ESTADOS_SIN_RESULTADO),
        DiagnosticOrder.priority.in_(("urgent", "preferential")),
    )
    return condiciones


@router.get("/orders/inbox-summary", response_model=ResumenDeBandeja)
def orders_inbox_summary(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.read"))],
):
    """Cuántas órdenes hay en cada segmento de la franja (plan 32, punto 3).

    Sobre TODAS las páginas, con el mismo alcance que la bandeja (sucursal y
    autoría): contar la página visible haría pasar 20 por el total. Una sola
    consulta con un SUM por segmento.
    """
    condiciones = _condiciones_de_bandeja(db, user)
    campos = ("pendientes", "por_revisar", "sin_comunicar", "criticos", "atrasados", "urgentes", "activas")
    query = scoped_query(
        db.query(*(func.coalesce(func.sum(case((condiciones[c], 1), else_=0)), 0).label(c) for c in campos))
        .select_from(DiagnosticOrder),
        DiagnosticOrder,
        user,
    )
    fila = filtrar_por_autoria_clinica(query, DiagnosticOrder.doctor_id, user).one()
    return ResumenDeBandeja(**{c: int(getattr(fila, c)) for c in campos})


@router.get("/orders/inbox-by-patient", response_model=BandejaPorPacientePage)
def orders_inbox_by_patient(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.read"))],
    filtro: str = Query("activas", max_length=20, description=" | ".join(FILTROS_DE_BANDEJA)),
    search: str | None = Query(None, max_length=100),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
):
    """La bandeja del médico agrupada por paciente (plan 26, B-1).

    Pagina PACIENTES, no órdenes: con la paginación por orden un paciente
    quedaba partida entre páginas, y agruparla en la pantalla no lo arregla.
    Los pacientes con un resultado crítico sin comunicar van primero (D-3);
    luego la prioridad más alta y la solicitud más antigua.

    Son cinco consultas por página sin importar cuántas órdenes haya: el
    conteo de pacientes, la página de pacientes con sus totales, sus nombres,
    sus órdenes y todos los resultados de esas órdenes con su archivo (antes era una
    consulta por orden, B-9).

    Filtros:

    - ``pendientes``: sin resultado (solicitada y los estados del laboratorio);
    - ``por_revisar``: con resultado recibido;
    - ``sin_comunicar``: revisadas, sin ningún resultado comunicado (B-7);
    - ``criticos``: con un resultado crítico sin comunicar;
    - ``activas`` (por omisión): cualquiera de las cuatro anteriores;
    - ``todos``: todo menos los borradores.
    """
    from sqlalchemy import and_, select

    if filtro not in FILTROS_DE_BANDEJA:
        # Un filtro mal escrito daría una bandeja vacía y el médico creería
        # que no tiene pendientes: mejor decirlo.
        raise HTTPException(status_code=422, detail=f"Filtro desconocido: {filtro}. Usa uno de: {', '.join(FILTROS_DE_BANDEJA)}.")

    condiciones = _condiciones_de_bandeja(db, user)
    criticas = select(DiagnosticResult.diagnostic_order_id).where(*INCIDENCIA_ABIERTA)

    query = scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user).join(
        Patient, Patient.id == DiagnosticOrder.patient_id
    )
    query = filtrar_por_autoria_clinica(query, DiagnosticOrder.doctor_id, user)
    query = _filtrar_por_palabras(query.filter(condiciones[filtro]), search)

    ids_filtrados = query.with_entities(DiagnosticOrder.id).subquery()
    es_critica = case((DiagnosticOrder.id.in_(criticas), 1), else_=0)
    por_paciente = (
        db.query(
            DiagnosticOrder.patient_id.label("patient_id"),
            func.max(es_critica).label("critica"),
            func.min(RANGO_DE_PRIORIDAD).label("rango"),
            func.min(DiagnosticOrder.requested_on).label("antigua"),
            func.count(DiagnosticOrder.id).label("total"),
            func.sum(case((DiagnosticOrder.status == "result_received", 1), else_=0)).label("por_revisar"),
        )
        .filter(DiagnosticOrder.id.in_(select(ids_filtrados.c.id)))
        .group_by(DiagnosticOrder.patient_id)
    )
    total = por_paciente.count()
    pagina = (
        por_paciente.order_by(
            func.max(es_critica).desc(), func.min(RANGO_DE_PRIORIDAD).asc(),
            func.min(DiagnosticOrder.requested_on).asc(), DiagnosticOrder.patient_id.asc(),
        )
        .offset(skip)
        .limit(limit)
        .all()
    )
    ids_paciente = [fila.patient_id for fila in pagina]
    if not ids_paciente:
        return BandejaPorPacientePage(items=[], total=total, skip=skip, limit=limit)

    ordenes = (
        query.filter(DiagnosticOrder.patient_id.in_(ids_paciente))
        .order_by(RANGO_DE_PRIORIDAD, DiagnosticOrder.requested_on.asc(), DiagnosticOrder.id.asc())
        .all()
    )
    resultados = _resultados_por_orden(db, user, [orden.id for orden in ordenes])
    nombres = {
        pid: f"{nombre} {apellidos}".strip()
        for pid, nombre, apellidos in scoped_query(
            db.query(Patient.id, Patient.first_name, Patient.last_name), Patient, user
        ).filter(Patient.id.in_(ids_paciente))
    }
    citas = _citas_de_las_ordenes(db, user, ordenes)
    ordenes_por_paciente: dict[int, list[OrdenEnBandeja]] = {pid: [] for pid in ids_paciente}
    for orden in ordenes:
        item = _orden_con_resultados(orden, resultados[orden.id])
        if orden.appointment_id in citas:
            item.cita_fecha, item.cita_estado = citas[orden.appointment_id]
        ordenes_por_paciente[orden.patient_id].append(item)
    _marcar_atrasos(db, user, ordenes, [i for lista in ordenes_por_paciente.values() for i in lista])

    items = [
        PacienteEnBandeja(
            patient_id=fila.patient_id,
            patient_name=nombres.get(fila.patient_id, ""),
            total_ordenes=fila.total,
            por_revisar=int(fila.por_revisar or 0),
            tiene_criticos=bool(fila.critica),
            prioridad_maxima=NOMBRE_DE_RANGO.get(fila.rango, "routine"),
            solicitada_mas_antigua=fila.antigua,
            orders=ordenes_por_paciente[fila.patient_id],
        )
        for fila in pagina
    ]
    return BandejaPorPacientePage(items=items, total=total, skip=skip, limit=limit)


def _citas_de_las_ordenes(db: Session, user: User, ordenes: list[DiagnosticOrder]) -> dict[int, tuple]:
    """Fecha y estado de la cita de cada orden, en una sola consulta.

    Con el alcance de la sesión: una cita de otra sucursal no se describe.
    """
    ids = {orden.appointment_id for orden in ordenes if orden.appointment_id}
    if not ids:
        return {}
    filas = scoped_query(
        db.query(Appointment.id, Appointment.scheduled_at, Appointment.status), Appointment, user
    ).filter(Appointment.id.in_(ids))
    return {
        cid: (cuando, getattr(estado, "value", estado))
        for cid, cuando, estado in filas
    }


def _ultimos_seguimientos(db: Session, user: User, order_ids: list[int]) -> dict[int, SeguimientoDeOrden]:
    """El seguimiento más reciente de cada orden, con el nombre de quien lo escribió."""
    if not order_ids:
        return {}
    filas = (
        scoped_query(db.query(DiagnosticOrderFollowUp, User.full_name), DiagnosticOrderFollowUp, user)
        .join(User, User.id == DiagnosticOrderFollowUp.registrado_por_user_id)
        .filter(DiagnosticOrderFollowUp.diagnostic_order_id.in_(order_ids))
        .order_by(DiagnosticOrderFollowUp.created_at.asc(), DiagnosticOrderFollowUp.id.asc())
        .all()
    )
    return {seg.diagnostic_order_id: _seguimiento(seg, nombre) for seg, nombre in filas}


def _seguimiento(seg: DiagnosticOrderFollowUp, nombre: str | None) -> SeguimientoDeOrden:
    respuesta = SeguimientoDeOrden.model_validate(seg)
    respuesta.motivo_texto = estudios_atrasados.MOTIVOS_DE_SEGUIMIENTO.get(seg.motivo, seg.motivo)
    respuesta.registrado_por_nombre = nombre
    return respuesta


def _marcar_atrasos(db: Session, user: User, ordenes: list[DiagnosticOrder], items: list) -> None:
    """Pone «atrasada», los días sin resultado y el último seguimiento en cada fila.

    Con la misma regla que el filtro (``estudios_atrasados``), para que la
    insignia de la fila y el segmento «Atrasados» digan lo mismo.
    """
    if not ordenes:
        return
    hoy = hoy_local()
    plazos = estudios_atrasados.plazos_por_doctora(db, user.tenant_id)
    ultimos = _ultimos_seguimientos(db, user, [o.id for o in ordenes])
    por_id = {o.id: o for o in ordenes}
    # La última actualización de cada fila con quién la hizo (plan 32, punto 3).
    con_fecha = {}
    for item in items:
        orden = por_id.get(getattr(item, "id", None) if hasattr(item, "results") else None)
        if orden is not None:
            con_fecha[orden.id] = rastro_de_estudio.ultima_actualizacion_de_fila(
                orden, item.results, ultimos.get(orden.id)
            )
    autores = rastro_de_estudio.nombres_de_usuarios(db, {quien for _, quien in con_fecha.values()})
    for item in items:
        orden = por_id.get(item.id if hasattr(item, "id") else item.order_id)
        if orden is None:
            continue
        if orden.id in con_fecha:
            cuando, quien = con_fecha[orden.id]
            item.ultima_actualizacion_at = cuando
            item.ultima_actualizacion_por = autores.get(quien)
        ultimo = ultimos.get(orden.id)
        item.ultimo_seguimiento = ultimo
        item.atrasada = estudios_atrasados.esta_atrasada(
            orden,
            plazos.get(orden.doctor_id, estudios_atrasados.PLAZOS_DE_FABRICA),
            ultimo.revisar_el if ultimo else None,
            hoy,
        )
        if orden.status in estudios_atrasados.ESTADOS_SIN_RESULTADO:
            item.dias_sin_resultado = estudios_atrasados.dias_sin_resultado(orden, hoy)


def _orden_con_resultados(order: DiagnosticOrder, resultados: list[ResultadoEnHistorial]) -> OrdenEnBandeja:
    return OrdenEnBandeja(
        **DiagnosticOrderResponse.model_validate(order).model_dump(exclude=CAMPOS_CALCULADOS_DE_ORDEN),
        results=resultados,
        comunicada=any(r.communicated_at for r in resultados),
        critico_sin_comunicar=any(r.incidencia_abierta for r in resultados),
        incidencia_abierta=any(r.incidencia_abierta for r in resultados),
    )


@router.get("/patient/{patient_id}/orders", response_model=list[OrdenEnBandeja])
def list_orders(
    patient_id: int,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.read"))],
    appointment_id: int | None = Query(default=None, gt=0),
    por_atender: bool = Query(False, description="Sólo lo que el médico tiene que atender: resultado recibido o incidencia crítica abierta"),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
):
    """Historial de estudios del paciente para el expediente (O-08).

    Cada orden viene con todos sus resultados y el enlace a su archivo. Son
    tres consultas por página sin importar cuántas órdenes o resultados haya
    (el conteo, la página y todos los resultados de la página de una vez):
    un paciente con años de control prenatal no debe volver lenta la ficha.
    El total va en ``X-Total-Count``, como en recetas y certificados.

    Con ``por_atender`` (N3 del plan 26) es lo que la consulta tiene que
    revisar con el paciente enfrente, de cualquier cita: órdenes del médico
    con el resultado recibido o con una incidencia crítica abierta. Primero las
    incidencias, luego la prioridad y luego lo más antiguo.
    """
    from sqlalchemy import select

    _patient(db, patient_id, user)
    registrar_acceso(db, user, patient_id, SeccionClinica.ESTUDIOS)
    query = scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user).filter(DiagnosticOrder.patient_id == patient_id)
    if appointment_id: query = query.filter(DiagnosticOrder.appointment_id == appointment_id)
    if por_atender:
        abiertas = select(DiagnosticResult.diagnostic_order_id).where(*INCIDENCIA_ABIERTA)
        query = filtrar_por_autoria_clinica(query, DiagnosticOrder.doctor_id, user).filter(
            DiagnosticOrder.status.notin_(tuple(ESTADOS_DE_ORDEN_NO_IMPRIMIBLES)),
            or_(DiagnosticOrder.status == "result_received", DiagnosticOrder.id.in_(abiertas)),
        )
        orden = (case((DiagnosticOrder.id.in_(abiertas), 0), else_=1), RANGO_DE_PRIORIDAD,
                 DiagnosticOrder.requested_on.asc(), DiagnosticOrder.id.asc())
    else:
        orden = (DiagnosticOrder.created_at.desc(), DiagnosticOrder.id.desc())
    response.headers["X-Total-Count"] = str(query.count())
    orders = query.order_by(*orden).offset(skip).limit(limit).all()

    resultados_por_orden = _resultados_por_orden(db, user, [order.id for order in orders])
    items = [_orden_con_resultados(order, resultados_por_orden[order.id]) for order in orders]
    _marcar_atrasos(db, user, orders, items)
    return items


@router.get("/patient/{patient_id}/valoraciones", response_model=ValoracionesDePaciente)
def patient_valoraciones(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.read"))],
):
    """Las valoraciones de los resultados del paciente en el tiempo (plan 26, D-9).

    Es la serie de la gráfica de progreso del expediente: una fila por
    resultado valorado, de la más antigua a la más reciente. La fecha es la
    del resultado y, si no la tiene, la del día (en hora de Mazatlán) en que se
    registró. Se agrupa por estudio en la pantalla. Misma regla de acceso que
    el historial de estudios del paciente.
    """
    from app.core.hora_local import utc_a_local

    _patient(db, patient_id, user)
    registrar_acceso(db, user, patient_id, SeccionClinica.ESTUDIOS)
    filas = (
        scoped_query(
            db.query(
                DiagnosticResult.id, DiagnosticResult.diagnostic_order_id, DiagnosticResult.resulted_on,
                DiagnosticResult.created_at, DiagnosticResult.valoracion, DiagnosticOrder.study_name,
                DiagnosticOrder.catalog_code, DiagnosticOrder.category,
            ),
            DiagnosticResult, user,
        )
        .join(DiagnosticOrder, DiagnosticOrder.id == DiagnosticResult.diagnostic_order_id)
        .filter(DiagnosticOrder.patient_id == patient_id, DiagnosticResult.valoracion.isnot(None), VIGENTE)
        .all()
    )
    puntos = [
        PuntoDeValoracion(
            result_id=fila[0], order_id=fila[1], fecha=fila[2] or utc_a_local(fila[3]).date(),
            valoracion=fila[4], study_name=fila[5], catalog_code=fila[6], category=fila[7],
        )
        for fila in filas
    ]
    puntos.sort(key=lambda punto: (punto.fecha, punto.result_id))
    return ValoracionesDePaciente(items=puntos)


# --- Plantillas de orden (O-03) ---------------------------------------------
# Semilla en código (como el catálogo de estudios), de sólo lectura: la pregunta
# 2.3 —quién administra las plantillas— sigue abierta, así que hoy no se editan
# desde la interfaz. Precargan estudios en el formulario de la orden agrupada
# (O-02); el médico revisa y confirma. Nada se crea sin esa confirmación.
RUTA_PLANTILLAS = Path(__file__).resolve().parent.parent / "data" / "plantillas_orden.json"


@lru_cache(maxsize=1)
def _cargar_plantillas() -> dict:
    """Se lee una sola vez: es un archivo fijo del despliegue."""
    with RUTA_PLANTILLAS.open(encoding="utf-8") as archivo:
        return json.load(archivo)


@router.get("/order-templates", response_model=PlantillasOrdenPage)
def list_order_templates(user: Annotated[User, Depends(require_permission("clinical_tracking.create"))]):
    """Índice de plantillas clínicas para precargar una orden (O-03).

    Mismo permiso que crear órdenes (``clinical_tracking.create``, sólo la
    doctora por defecto): la plantilla sólo le sirve a quien puede pedir estudios.
    No toca ningún expediente; es contenido genérico.
    """
    datos = _cargar_plantillas()
    plantillas = [
        PlantillaOrdenResumen(
            clave=p["clave"], nombre=p["nombre"], descripcion=p["descripcion"],
            num_estudios=len(p["estudios"]),
        )
        for p in datos["plantillas"]
    ]
    return PlantillasOrdenPage(version=datos["version"], plantillas=plantillas)


@router.get("/order-templates/{clave}", response_model=PlantillaOrdenDetalle)
def get_order_template(clave: str, user: Annotated[User, Depends(require_permission("clinical_tracking.create"))]):
    """Una plantilla con sus estudios, para precargar la orden agrupada (O-03).

    El frontend copia estos estudios al formulario de O-02; el médico los revisa
    y confirma con ``POST /order-groups``. La plantilla no crea nada.
    """
    datos = _cargar_plantillas()
    plantilla = next((p for p in datos["plantillas"] if p["clave"] == clave), None)
    if plantilla is None:
        raise HTTPException(status_code=404, detail="No se encontró la plantilla de estudios.")
    return PlantillaOrdenDetalle(
        clave=plantilla["clave"], nombre=plantilla["nombre"], descripcion=plantilla["descripcion"],
        indicacion_sugerida=plantilla.get("indicacion_sugerida"),
        estudios=[PlantillaOrdenEstudio(**e) for e in plantilla["estudios"]],
    )


@router.post("/orders", response_model=DiagnosticOrderResponse, status_code=status.HTTP_201_CREATED)
def create_order(data: DiagnosticOrderCreate, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(require_permission("clinical_tracking.create"))]):
    patient = _patient(db, data.patient_id, user); _validate_context(db, user, patient, data.pregnancy_id, data.appointment_id)
    if data.fetal_record_id:
        fetus = scoped_query(db.query(FetalRecord), FetalRecord, user).filter(FetalRecord.id == data.fetal_record_id).first()
        if not fetus or not data.pregnancy_id or fetus.pregnancy_id != data.pregnancy_id:
            raise HTTPException(status_code=422, detail="El feto no corresponde al embarazo de la orden")
    datos = data.model_dump()
    # La fecha de «hoy» la pone el servidor con la hora del consultorio: el
    # navegador la calculaba en UTC y después de las 17:00 de Mazatlán
    # guardaba la de mañana (plan 26, F-1).
    datos["requested_on"] = datos["requested_on"] or hoy_local()
    item = DiagnosticOrder(tenant_id=patient.tenant_id, doctor_id=user.id, **datos)
    db.add(item); db.commit(); db.refresh(item)
    _log(db, "diagnostic_order.created", "diagnostic_order", item.id, user, item.tenant_id, patient.id)
    return item


# Cómo se nombra cada estado en los mensajes de error, que la UI muestra tal cual.
ETIQUETAS_DE_ESTADO = {
    "draft": "borrador", "ordered": "solicitada", "accepted": "aceptada", "scheduled": "programada",
    "collected": "muestra tomada", "in_process": "en proceso", "result_received": "resultado recibido",
    "reviewed": "revisada", "cancelled": "cancelada", "rejected": "rechazada",
}


# Una orden cancelada, rechazada o en borrador no se imprime: el papel es lo
# que el paciente lleva al laboratorio, y un papel de un estudio que el médico
# ya no quiere es un estudio que alguien termina haciéndose (y pagando).
ESTADOS_DE_ORDEN_NO_IMPRIMIBLES = {"draft", "cancelled", "rejected"}


def _perfil_para_orden(db: Session, doctor_id: int):
    """El membrete del médico que pidió el estudio, sin escribir nada en la base.

    La receta crea un perfil de relleno cuando el médico no tiene uno; aquí no,
    porque la orden la reimprime también recepción y una reimpresión no debe
    dejar filas nuevas a nombre del médico. Sin perfil sale su nombre con
    su tratamiento y el resto del membrete en blanco.

    El sustituto lleva TODOS los campos que lee el membrete de la receta
    (plan 24): sin ellos se perdían las credenciales, el nombre impreso y los
    colores que el médico configuró (plan 26, P-3).
    """
    from types import SimpleNamespace

    from app.models.doctor_profile import DoctorProfile

    perfil = db.query(DoctorProfile).filter(DoctorProfile.user_id == doctor_id).first()
    if perfil and perfil.specialty is not None and perfil.user is not None:
        return perfil
    doctora = db.query(User).filter(User.id == doctor_id).first()
    campos = (
        "logo_url", "signature_url", "professional_id", "university", "clinic_address", "phone",
        "general_registry", "specialty_license", "health_registry", "council_cert",
        "prescription_display_name", "prescription_settings", "prescription_accent_color",
        "prescription_signature_style", "order_settings",
    )
    return SimpleNamespace(
        user=doctora,
        specialty=SimpleNamespace(name=""),
        **{campo: getattr(perfil, campo, None) for campo in campos},
    )


@router.get("/orders/{order_id}/pdf")
def diagnostic_order_pdf(
    order_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.print_order"))],
):
    """PDF de la orden de estudio para imprimirla o descargarla (O-01).

    Quién la saca: el médico con relación asistencial con el paciente (la
    misma regla que la receta) y recepción o administración de la sucursal,
    que la reimprimen. Recepción no necesita ``clinical_tracking.read``: el
    permiso es sólo el de imprimir.
    """
    from io import BytesIO

    from fastapi.responses import StreamingResponse

    from app.models.tenant import Tenant
    from app.utils.pdf import generate_diagnostic_order_pdf

    order = scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user).filter(DiagnosticOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="No se encontró la orden de estudio. Puede que la hayan eliminado; actualiza la lista de estudios.")
    patient = resolver_paciente_con_relacion_asistencial(db, order.patient_id, user)
    if order.origen == "externo":
        # Un estudio de otro lugar no tiene papel de GEMS que entregar.
        raise HTTPException(status_code=409, detail="Este estudio se hizo en otro lugar: no tiene orden que imprimir.")
    if order.status in ESTADOS_DE_ORDEN_NO_IMPRIMIBLES:
        raise HTTPException(
            status_code=409,
            detail="Esta orden está cancelada o no se ha emitido, así que no se imprime. Si el paciente sí necesita el estudio, crea una orden nueva.",
        )

    tenant = db.query(Tenant).filter(Tenant.id == order.tenant_id).first()
    pdf = generate_diagnostic_order_pdf(
        order, _perfil_para_orden(db, order.doctor_id), patient, tenant_name=tenant.name if tenant else ""
    )
    log_action(
        db, action="diagnostic_order.pdf_generated", entity_type="diagnostic_order", entity_id=order.id,
        actor_user_id=user.id, tenant_id=order.tenant_id, patient_id=order.patient_id,
        details={"patient_id": order.patient_id},
    )
    # Sin el nombre del paciente en el archivo: una descarga se queda en la
    # carpeta de la computadora de recepción, y el id basta para encontrarla.
    headers = {"Content-Disposition": f'attachment; filename="Orden_de_estudio_{order.id}.pdf"'}
    return StreamingResponse(BytesIO(pdf.read()), media_type="application/pdf", headers=headers)


@router.post("/orders/print-record", response_model=RegistroDeImpresionResponse, status_code=status.HTTP_201_CREATED)
def record_order_print(
    data: RegistroDeImpresion,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.print_order"))],
):
    """Registra que el papel se imprimió o se descargó de verdad (M2 de la revisión final).

    La vista previa es obligatoria (D-2): generar el PDF ya no es imprimirlo,
    y la bitácora decía «impresa» cada vez que alguien sólo lo miraba. Los GET
    del PDF registran ahora ``pdf_generated``; esto lo llama la pantalla al
    pulsar Imprimir o Descargar. Mismo permiso y alcance que generar el papel.
    """
    ordenes = (
        scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user)
        .filter(DiagnosticOrder.id.in_(data.order_ids))
        .all()
    )
    if len(ordenes) != len(data.order_ids):
        raise HTTPException(status_code=404, detail="No se encontró alguna de las órdenes. Actualiza la lista de estudios.")
    pacientes = {orden.patient_id for orden in ordenes}
    if len(pacientes) != 1:
        raise HTTPException(status_code=422, detail="Un papel es de una sola paciente: las órdenes son de pacientes distintas.")
    patient = resolver_paciente_con_relacion_asistencial(db, pacientes.pop(), user)

    # La pantalla manda el folio que conocía (``C-``, ``G-``); el papel salió
    # con el que decidió el servidor al generarlo (plan 32). Se anota ése.
    folio = folio_impreso_de(db, ordenes[0].tenant_id, [orden.id for orden in ordenes]) or data.folio
    detalles = {"patient_id": patient.id, "order_ids": data.order_ids, "folio": folio, "accion": data.accion}
    if len(ordenes) == 1:
        log_action(
            db, action="diagnostic_order.printed", entity_type="diagnostic_order", entity_id=ordenes[0].id,
            actor_user_id=user.id, tenant_id=ordenes[0].tenant_id, patient_id=patient.id, details=detalles,
        )
    else:
        log_action(
            db, action="diagnostic_order.batch_printed", entity_type="patient", entity_id=patient.id,
            actor_user_id=user.id, tenant_id=ordenes[0].tenant_id, patient_id=patient.id, details=detalles,
        )
    return RegistroDeImpresionResponse(registrado=True, order_ids=data.order_ids, accion=data.accion)


MENSAJE_LOTE_NO_ENCONTRADO = "No se encontró la orden de estudios. Puede que la hayan eliminado; actualiza la lista de estudios."


@router.post("/order-groups", response_model=DiagnosticOrderGroupResponse, status_code=status.HTTP_201_CREATED)
def create_order_group(
    data: DiagnosticOrderGroupCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.create"))],
):
    """Varios estudios bajo un mismo papel, en una sola llamada (O-02).

    Todo o nada: si un estudio no se puede guardar no queda ninguno, porque un
    lote a medias es un papel al que le falta un estudio que el médico sí
    pidió. Cada estudio es una orden normal (con su estado y sus resultados) y
    las mismas reglas que ``POST /orders``: dueña del expediente, cita suya.
    """
    patient = _patient(db, data.patient_id, user)
    _validate_context(db, user, patient, data.pregnancy_id, data.appointment_id)
    # Igual que la orden suelta: sin fecha, la del consultorio (plan 26, F-1).
    requested_on = data.requested_on or hoy_local()

    group = DiagnosticOrderGroup(
        tenant_id=patient.tenant_id,
        patient_id=patient.id,
        doctor_id=user.id,
        appointment_id=data.appointment_id,
        clinical_indication=data.clinical_indication,
        requested_on=requested_on,
    )
    try:
        db.add(group)
        db.flush()
        for estudio in data.studies:
            db.add(DiagnosticOrder(
                tenant_id=patient.tenant_id,
                patient_id=patient.id,
                pregnancy_id=data.pregnancy_id,
                appointment_id=data.appointment_id,
                clinical_episode_id=data.clinical_episode_id,
                order_group_id=group.id,
                doctor_id=user.id,
                category=estudio.category,
                study_name=estudio.study_name,
                catalog_code=estudio.catalog_code,
                clinical_indication=estudio.clinical_indication or data.clinical_indication,
                priority=estudio.priority or data.priority,
                requested_on=requested_on,
                desired_on=estudio.desired_on or data.desired_on,
                preparation_instructions=estudio.preparation_instructions,
                specimen_or_body_site=estudio.specimen_or_body_site,
                destination=estudio.destination or data.destination,
                status="ordered",
            ))
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(group)

    log_action(
        db, action="diagnostic_order_group.created", entity_type="diagnostic_order_group", entity_id=group.id,
        actor_user_id=user.id, tenant_id=group.tenant_id, patient_id=patient.id,
        details={"patient_id": patient.id, "order_ids": [orden.id for orden in group.orders]},
    )
    # Cada estudio deja también su propio alta, igual que una orden suelta: la
    # bitácora de una orden no debe depender de cómo se pidió.
    for orden in group.orders:
        _log(db, "diagnostic_order.created", "diagnostic_order", orden.id, user, orden.tenant_id, patient.id)
    return group


def _lote_del_alcance(db: Session, group_id: int, user: User) -> DiagnosticOrderGroup:
    group = scoped_query(db.query(DiagnosticOrderGroup), DiagnosticOrderGroup, user).filter(DiagnosticOrderGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail=MENSAJE_LOTE_NO_ENCONTRADO)
    return group


@router.get("/order-groups/{group_id}", response_model=DiagnosticOrderGroupResponse)
def get_order_group(
    group_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.read"))],
):
    """El lote con cada estudio y su estado. Misma regla que listar las órdenes del paciente."""
    group = _lote_del_alcance(db, group_id, user)
    _patient(db, group.patient_id, user)
    return group


# Cómo se imprime un papel con varios estudios (plan 26, D-2). Sin valor,
# manda el que el médico autora dejó en su perfil.
ModoDeImpresion = Literal["separado", "una_hoja"]
DESCRIPCION_MODO = "«separado»: una hoja por destino (laboratorio, imagen, otros); «una_hoja»: todo junto. Sin valor, el del perfil del médico."


@router.get("/order-groups/{group_id}/pdf")
def diagnostic_order_group_pdf(
    group_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.print_order"))],
    modo: ModoDeImpresion | None = Query(None, description=DESCRIPCION_MODO),
):
    """Un solo papel con todos los estudios del lote (O-02 sobre O-01).

    Mismos permisos y alcance que el papel de una orden suelta. Los estudios
    cancelados, rechazados o en borrador no salen en el papel, por la misma
    razón que una orden cancelada no se imprime; si no queda ninguno, 409.
    """
    from io import BytesIO

    from fastapi.responses import StreamingResponse

    from app.models.tenant import Tenant
    from app.utils.pdf import generate_diagnostic_order_group_pdf

    group = _lote_del_alcance(db, group_id, user)
    patient = resolver_paciente_con_relacion_asistencial(db, group.patient_id, user)
    imprimibles = [orden for orden in group.orders if orden.status not in ESTADOS_DE_ORDEN_NO_IMPRIMIBLES]
    if not imprimibles:
        raise HTTPException(
            status_code=409,
            detail="Todos los estudios de esta orden están cancelados o sin emitir, así que no se imprime. Si el paciente sí necesita algún estudio, crea una orden nueva.",
        )

    from app.utils.orden_config import resolver_modo

    tenant = db.query(Tenant).filter(Tenant.id == group.tenant_id).first()
    perfil = _perfil_para_orden(db, group.doctor_id)
    modo = resolver_modo(modo, perfil)
    folio = folio_de_papel_de_ordenes(
        db, tenant_id=group.tenant_id,
        clave_origen=f"G-{group.id}|" + ",".join(str(i) for i in sorted(orden.id for orden in imprimibles)),
        folio_anterior=f"G-{group.id}", entity_type="diagnostic_order_group", entity_id=group.id,
        user_id=user.id, patient_id=group.patient_id,
    )
    pdf = generate_diagnostic_order_group_pdf(
        group, imprimibles, perfil, patient, tenant_name=tenant.name if tenant else "", modo=modo, folio=folio,
    )
    log_action(
        db, action="diagnostic_order_group.pdf_generated", entity_type="diagnostic_order_group", entity_id=group.id,
        actor_user_id=user.id, tenant_id=group.tenant_id, patient_id=group.patient_id,
        details={"patient_id": group.patient_id, "order_ids": [orden.id for orden in imprimibles], "folio": folio, "modo": modo},
    )
    # X-Folio: el nombre de la descarga sale del folio que de verdad se imprimió.
    headers = {"Content-Disposition": f'attachment; filename="Orden_de_estudios_{folio}.pdf"', "X-Folio": folio}
    return StreamingResponse(BytesIO(pdf.read()), media_type="application/pdf", headers=headers)


def _papel_consolidado(
    db: Session,
    user: User,
    ordenes: list[DiagnosticOrder],
    patient: Patient,
    *,
    folio: str,
    modo: str | None,
    entity_type: str,
    entity_id: int,
):
    """Arma y registra el papel de varias órdenes de un paciente (plan 26, D-2 y D-5).

    Mismas reglas que el papel del lote: no salen los estudios cancelados,
    rechazados o en borrador, y si no queda ninguno es 409. Además, el papel
    lleva UNA firma: si las órdenes son de doctoras distintas no se imprime
    junto, porque un médico estaría firmando estudios que no pidió.
    """
    from io import BytesIO

    from fastapi.responses import StreamingResponse

    from app.models.tenant import Tenant
    from app.utils.orden_config import resolver_modo
    from app.utils.pdf import generate_consolidated_order_pdf

    imprimibles = [orden for orden in ordenes if orden.status not in ESTADOS_DE_ORDEN_NO_IMPRIMIBLES]
    if not imprimibles:
        raise HTTPException(
            status_code=409,
            detail="No hay estudios para imprimir: los que hay están cancelados o sin emitir. Si el paciente sí necesita algún estudio, crea una orden nueva.",
        )
    doctoras = {orden.doctor_id for orden in imprimibles}
    if len(doctoras) > 1:
        raise HTTPException(
            status_code=409,
            detail="Estos estudios los pidieron doctoras distintas y el papel lleva una sola firma. Imprime la orden de cada médico por separado.",
        )

    # Si todo es de un mismo lote, su indicación común se imprime una vez.
    grupos = {orden.order_group_id for orden in imprimibles}
    indicacion_comun = None
    if len(grupos) == 1 and None not in grupos and imprimibles[0].order_group is not None:
        indicacion_comun = imprimibles[0].order_group.clinical_indication

    # El folio que recibe es el de antes (``C-``, ``G-``, ``P-``); el papel
    # sale con el homologado ``ORD`` salvo que ya se hubiera impreso con aquél.
    folio = folio_de_papel_de_ordenes(
        db, tenant_id=imprimibles[0].tenant_id,
        clave_origen=f"{folio}|" + ",".join(str(i) for i in sorted(orden.id for orden in imprimibles)),
        folio_anterior=folio, entity_type=entity_type, entity_id=entity_id,
        user_id=user.id, patient_id=patient.id,
    )
    tenant = db.query(Tenant).filter(Tenant.id == imprimibles[0].tenant_id).first()
    perfil = _perfil_para_orden(db, imprimibles[0].doctor_id)
    modo = resolver_modo(modo, perfil)
    pdf = generate_consolidated_order_pdf(
        imprimibles, perfil, patient, tenant.name if tenant else "", folio=folio, modo=modo,
        indicacion_comun=indicacion_comun,
    )
    log_action(
        db, action="diagnostic_order.batch_pdf_generated", entity_type=entity_type, entity_id=entity_id,
        actor_user_id=user.id, tenant_id=imprimibles[0].tenant_id, patient_id=patient.id,
        details={"patient_id": patient.id, "order_ids": [orden.id for orden in imprimibles], "folio": folio, "modo": modo},
    )
    headers = {
        "Content-Disposition": f'attachment; filename="Orden_de_estudios_{folio}.pdf"',
        # El folio impreso (ORD o el de antes), para nombrar la descarga.
        "X-Folio": folio,
        # Lo que de verdad salió en el papel, para registrar la impresión.
        "X-Order-Ids": ",".join(str(orden.id) for orden in imprimibles),
    }
    return StreamingResponse(BytesIO(pdf.read()), media_type="application/pdf", headers=headers)


@router.get("/appointments/{appointment_id}/orders/pdf")
def appointment_orders_pdf(
    appointment_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.print_order"))],
    modo: ModoDeImpresion | None = Query(None, description=DESCRIPCION_MODO),
):
    """Un papel con todos los estudios pedidos en una consulta, con folio ``ORD`` (plan 32).

    El que se imprimió antes de la 1.2.0 conserva su ``C-{cita}``.

    Junta las órdenes sueltas y los lotes de esa cita: el médico imprime una
    vez por consulta y no hoja por estudio (plan 26, C-4). Mismo permiso y
    alcance que reimprimir una orden.
    """
    appointment = scoped_query(db.query(Appointment), Appointment, user).filter(Appointment.id == appointment_id).first()
    if not appointment:
        raise HTTPException(status_code=404, detail="No se encontró la consulta. Puede que la hayan eliminado; actualiza la agenda.")
    patient = resolver_paciente_con_relacion_asistencial(db, appointment.patient_id, user)
    ordenes = (
        scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user)
        .filter(DiagnosticOrder.appointment_id == appointment.id, DiagnosticOrder.patient_id == patient.id)
        .order_by(DiagnosticOrder.id.asc())
        .all()
    )
    return _papel_consolidado(
        db, user, ordenes, patient, folio=f"C-{appointment.id}", modo=modo,
        entity_type="appointment", entity_id=appointment.id,
    )


def _ids_de_orden(texto: str) -> list[int]:
    ids: list[int] = []
    for parte in texto.split(","):
        parte = parte.strip()
        if not parte:
            continue
        if not parte.isdigit() or int(parte) <= 0:
            raise HTTPException(status_code=422, detail=f"«{parte}» no es un número de orden válido.")
        if int(parte) not in ids:
            ids.append(int(parte))
    if not ids:
        raise HTTPException(status_code=422, detail="Indica qué órdenes imprimir (order_ids=1,2,3).")
    if len(ids) > 100:
        raise HTTPException(status_code=422, detail="No se pueden imprimir más de 100 órdenes en un solo papel.")
    return ids


@router.get("/patients/{patient_id}/orders/pdf")
def patient_orders_pdf(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.print_order"))],
    order_ids: str | None = Query(None, max_length=1000, description="Números de orden separados por coma"),
    pendientes: bool = Query(False, description="Todas las órdenes pendientes del paciente con esa doctora"),
    doctor_id: int | None = Query(None, gt=0, description="El médico de las órdenes pendientes (obligatorio con pendientes)"),
    modo: ModoDeImpresion | None = Query(None, description=DESCRIPCION_MODO),
):
    """Un papel con varias órdenes de un paciente, aunque no tengan cita.

    Dos formas de decir cuáles:

    - ``order_ids``: las que la pantalla eligió;
    - ``pendientes=true&doctor_id=``: TODAS las pendientes de resultado de la
      paciente con esa doctora. Recepción imprimía sólo lo de la página que
      tenía a la vista, porque su lista pagina por orden (M5). Va por doctora
      porque el papel lleva una sola firma.

    Folio homologado ``ORD`` (plan 32): reimprimir las mismas órdenes da el
    mismo folio. Lo impreso antes de la 1.2.0 conserva el suyo, ``G-{lote}``
    si todas eran del mismo lote o ``P-{paciente}-{AAAAMMDD}``. Cada renglón
    conserva su número de orden, que es con lo que se liga el resultado
    (plan 26, D-5). Los números impresos van en ``X-Order-Ids``,
    para registrar la impresión con ``POST /orders/print-record``.
    """
    if pendientes and order_ids:
        raise HTTPException(status_code=422, detail="Pide las órdenes por número o las pendientes, no las dos cosas.")
    if pendientes and not doctor_id:
        raise HTTPException(status_code=422, detail="Indica de qué doctora son las órdenes pendientes: el papel lleva una sola firma.")
    if not pendientes and not order_ids:
        raise HTTPException(status_code=422, detail="Indica qué órdenes imprimir (order_ids=1,2,3) o pide las pendientes.")
    patient = resolver_paciente_con_relacion_asistencial(db, patient_id, user)
    if pendientes:
        ordenes = (
            scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user)
            .filter(
                DiagnosticOrder.patient_id == patient.id,
                DiagnosticOrder.doctor_id == doctor_id,
                DiagnosticOrder.status.in_(ESTADOS_SIN_RESULTADO),
            )
            .order_by(DiagnosticOrder.id.asc())
            .all()
        )
        if not ordenes:
            raise HTTPException(status_code=409, detail="Este paciente no tiene estudios pendientes con esa doctora.")
    else:
        ids = _ids_de_orden(order_ids)
        ordenes = (
            scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user)
            .filter(DiagnosticOrder.id.in_(ids))
            .order_by(DiagnosticOrder.id.asc())
            .all()
        )
        if len(ordenes) != len(ids) or any(orden.patient_id != patient.id for orden in ordenes):
            raise HTTPException(
                status_code=422,
                detail="Alguna de las órdenes no existe o no es de este paciente. Actualiza la lista de estudios.",
            )
    imprimibles = [orden for orden in ordenes if orden.status not in ESTADOS_DE_ORDEN_NO_IMPRIMIBLES]
    grupos = {orden.order_group_id for orden in imprimibles}
    if len(grupos) == 1 and None not in grupos:
        folio = f"G-{next(iter(grupos))}"
    else:
        fechas = [orden.requested_on for orden in imprimibles if orden.requested_on]
        folio = f"P-{patient.id}-{max(fechas).strftime('%Y%m%d')}" if fechas else f"P-{patient.id}"
    return _papel_consolidado(
        db, user, ordenes, patient, folio=folio, modo=modo, entity_type="patient", entity_id=patient.id,
    )


@router.patch("/orders/{order_id}", response_model=DiagnosticOrderResponse)
def update_order(order_id: int, data: DiagnosticOrderUpdate, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(require_permission("clinical_tracking.update"))]):
    """Corregir una orden que todavía es borrador (O-05).

    Una orden emitida no se edita: se cancela con motivo y se crea otra
    (plan 14 §10). El papel ya salió con lo que decía; si el sistema dijera
    otra cosa, el laboratorio y el expediente no coincidirían. El estado ya no
    se cambia por aquí sino con ``POST /orders/{id}/status``, que valida el
    ciclo y exige motivo al cancelar.
    """
    item = scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user).filter(DiagnosticOrder.id == order_id).first()
    if not item: raise HTTPException(status_code=404, detail="No se encontró la orden de estudio. Puede que la hayan eliminado; actualiza la lista de estudios.")
    _patient(db, item.patient_id, user)
    exigir_autoria_clinica(item.doctor_id, user, detalle="Solo puedes actualizar órdenes que solicitaste")
    cambios = data.model_dump(exclude_unset=True)
    if "status" in cambios:
        raise HTTPException(status_code=422, detail="El estado de la orden se cambia con «Cambiar estado» (POST /clinical-tracking/orders/{id}/status), no editándola.")
    if item.status != "draft":
        raise HTTPException(
            status_code=409,
            detail="Esta orden ya se emitió y no se edita. Si algo cambió, cancélala con el motivo y crea una nueva.",
        )
    for field, value in cambios.items(): setattr(item, field, value)
    db.commit(); db.refresh(item)
    _log(db, "diagnostic_order.updated", "diagnostic_order", item.id, user, item.tenant_id, item.patient_id)
    return item


@router.post("/orders/{order_id}/status", response_model=DiagnosticOrderResponse)
def change_order_status(
    order_id: int,
    data: DiagnosticOrderStatusChange,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.update"))],
):
    """Mover la orden por su ciclo: aceptada, programada, tomada, en proceso, cancelada o rechazada (O-05).

    Las transiciones válidas son las de ``TRANSICIONES_DE_ORDEN``; cualquier
    otra es 409 con el estado actual, para que la pantalla que quedó vieja lo
    diga en vez de fingir que cambió. La misma regla que editar: el médico
    que pidió la orden, dueña del expediente.
    """
    item = scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user).filter(DiagnosticOrder.id == order_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="No se encontró la orden de estudio. Puede que la hayan eliminado; actualiza la lista de estudios.")
    _patient(db, item.patient_id, user)
    exigir_autoria_clinica(item.doctor_id, user, detalle="Solo puedes cambiar el estado de órdenes que solicitaste")

    anterior = item.status
    if data.status == anterior:
        raise HTTPException(status_code=409, detail=f"La orden ya está en «{ETIQUETAS_DE_ESTADO.get(anterior, anterior)}». Actualiza la lista de estudios.")
    if data.status not in TRANSICIONES_DE_ORDEN.get(anterior, ()):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Una orden en «{ETIQUETAS_DE_ESTADO.get(anterior, anterior)}» no puede pasar a "
                f"«{ETIQUETAS_DE_ESTADO.get(data.status, data.status)}». Actualiza la lista de estudios; "
                "si hay que pedir el estudio otra vez, crea una orden nueva."
            ),
        )

    item.status = data.status
    item.status_reason = data.reason
    item.status_changed_at = utcnow()
    item.status_changed_by_user_id = user.id
    avisos_de_resultados.resolver_resultado_si_ya_no_espera(db, item, user)
    # Cancelada o rechazada ya no espera resultado: si era su último atrasado, el aviso se cierra.
    avisos_de_atrasados.cerrar_si_ya_no_hay(db, item.doctor_id, por_user_id=user.id)
    db.commit(); db.refresh(item)
    log_action(
        db, action="diagnostic_order.status_changed", entity_type="diagnostic_order", entity_id=item.id,
        actor_user_id=user.id, tenant_id=item.tenant_id, patient_id=item.patient_id, reason=data.reason,
        details={"patient_id": item.patient_id, "from": anterior, "to": data.status},
    )
    return item


@router.post("/orders/{order_id}/results", response_model=DiagnosticResultResponse, status_code=status.HTTP_201_CREATED)
def create_result(order_id: int, data: DiagnosticResultCreate, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(require_permission("clinical_tracking.update"))]):
    order = scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user).filter(DiagnosticOrder.id == order_id).first()
    if not order: raise HTTPException(status_code=404, detail="No se encontró la orden de estudio. Puede que la hayan eliminado; actualiza la lista de estudios.")
    _patient(db, order.patient_id, user)
    # La misma regla que revisar (``update_result``): interpreta el resultado
    # quien pidió el estudio. Hoy no se notaba porque la bandeja ya filtra por
    # autoría, pero la ruta quedaba abierta a cualquier doctora con el
    # expediente (plan 26, B-10).
    exigir_autoria_clinica(order.doctor_id, user, detalle="Solo puedes registrar resultados de órdenes que solicitaste")
    # Un resultado sobre una orden cancelada la "descancelaba" en silencio al
    # pasarla a result_received (O-05).
    if order.status in ESTADOS_DE_ORDEN_NO_IMPRIMIBLES:
        raise HTTPException(
            status_code=409,
            detail="Esta orden está cancelada o no se ha emitido, así que no se le registra un resultado. Si el paciente sí se hizo el estudio, crea una orden nueva.",
        )
    if data.patient_document_id:
        document = scoped_query(db.query(PatientDocument), PatientDocument, user).filter(PatientDocument.id == data.patient_document_id).first()
        if not document or document.patient_id != order.patient_id:
            raise HTTPException(status_code=422, detail="El documento no corresponde al paciente de la orden")
    cita, cierre = _cita_de_revision(db, user, order, data.appointment_id, hay_revision=data.review_status != "received")
    item = DiagnosticResult(tenant_id=order.tenant_id, diagnostic_order_id=order.id, recorded_by_user_id=user.id, **data.model_dump(exclude={"appointment_id"}))
    if data.review_status in {"reviewed", "requires_action", "communicated"}:
        item.reviewed_at = utcnow(); item.reviewed_by_user_id = user.id
    if data.review_status == "communicated":
        item.communicated_at = utcnow(); item.communicated_by_user_id = user.id
    if cita:
        item.reviewed_in_appointment_id = cita.id
    order.status = "result_received" if data.review_status == "received" else "reviewed"
    db.add(item)
    if data.review_status != "received":
        _cerrar_recibidos_de_la_orden(db, order, user, excepto=None)
    if data.review_status == "communicated":
        _cerrar_incidencias(db, order, user, por="comunicacion")
    elif cierre == "aplicada":
        _cerrar_incidencias(db, order, user, por="consulta")
    # Capturado sin archivo también es «llegó tu resultado»: antes sólo avisaba
    # la ruta que sube el archivo (plan 27, §2.5).
    if order.status == "result_received":
        avisos_de_resultados.avisar_resultado_recibido(db, order, _patient(db, order.patient_id, user), user)
    else:
        avisos_de_resultados.resolver_resultado_si_ya_no_espera(db, order, user)
    avisos_de_atrasados.cerrar_si_ya_no_hay(db, order.doctor_id, por_user_id=user.id)
    db.commit(); db.refresh(item)
    _log(db, "diagnostic_result.created", "diagnostic_result", item.id, user, item.tenant_id, order.patient_id)
    respuesta = _resultado_con_archivo(item)
    respuesta.cierre_en_consulta = cierre
    return respuesta


# Órdenes que todavía esperan (o pueden recibir) el archivo del laboratorio.
# ``result_received`` sigue en la lista porque a veces el laboratorio entrega
# el reporte en dos partes; ``reviewed`` no, porque ahí ya se cerró el ciclo.
ESTADOS_POR_RECIBIR_RESULTADO = ("ordered", "accepted", "scheduled", "collected", "in_process", "result_received")

# El expediente separa laboratorio de imagen; se decide por la categoría de la
# orden para que el archivo aparezca donde el médico lo buscaría.
TIPO_DE_DOCUMENTO_POR_CATEGORIA = {
    "laboratory": DocumentType.LAB_RESULT,
    "gynecology": DocumentType.LAB_RESULT,
    "breast": DocumentType.IMAGING_STUDY,
    "obstetric": DocumentType.IMAGING_STUDY,
}


def _nombre_de_doctora(nombre: str | None, tratamiento: str | None) -> str:
    """«Dra. Yara Gutiérrez»: recepción agrupa por doctora para imprimir el
    papel de cada una por separado (M5), porque el papel lleva una sola firma."""
    from types import SimpleNamespace

    from app.utils.receta_config import anteponer_tratamiento

    return anteponer_tratamiento(nombre or "", SimpleNamespace(tratamiento=tratamiento))


@router.get("/orders/awaiting-result", response_model=OrdenPorRecibirPage)
def orders_awaiting_result(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.attach_result"))],
    patient_id: int | None = Query(None, gt=0),
    search: str | None = Query(None, max_length=100),
    solo_atrasadas: bool = Query(False, description="Solo los estudios atrasados (plan 32, punto 3)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
):
    """Las órdenes a las que recepción puede ligar un resultado (O-04).

    Devuelve sólo con qué reconocer la orden: paciente, estudio, fecha y folio.
    La búsqueda acepta el folio (número de la orden) porque es lo que viene
    impreso en el papel que el paciente trae de regreso.
    """
    from sqlalchemy import func

    adjuntos = (
        db.query(DiagnosticResult.diagnostic_order_id.label("order_id"), func.count(DiagnosticResult.id).label("n"))
        .filter(DiagnosticResult.patient_document_id.isnot(None), VIGENTE)
        .group_by(DiagnosticResult.diagnostic_order_id)
        .subquery()
    )
    query = scoped_query(
        db.query(
            DiagnosticOrder.id, DiagnosticOrder.order_group_id, DiagnosticOrder.patient_id,
            DiagnosticOrder.study_name, DiagnosticOrder.requested_on, DiagnosticOrder.status,
            Patient.first_name, Patient.last_name, func.coalesce(adjuntos.c.n, 0),
            DiagnosticOrder.priority, DiagnosticOrder.doctor_id, User.full_name, User.tratamiento,
        ),
        DiagnosticOrder, user,
    ).join(Patient, Patient.id == DiagnosticOrder.patient_id).join(
        User, User.id == DiagnosticOrder.doctor_id
    ).outerjoin(
        adjuntos, adjuntos.c.order_id == DiagnosticOrder.id
    ).filter(DiagnosticOrder.status.in_(ESTADOS_POR_RECIBIR_RESULTADO))
    query = filtrar_por_autoria_clinica(query, DiagnosticOrder.doctor_id, user)
    if patient_id:
        query = query.filter(DiagnosticOrder.patient_id == patient_id)
    if solo_atrasadas:
        query = query.filter(condicion_atrasado(plazos=estudios_atrasados.plazos_por_doctora(db, user.tenant_id)))
    for palabra in (search or "").split():
        term = f"%{palabra}%"
        condiciones = [DiagnosticOrder.study_name.ilike(term), Patient.first_name.ilike(term), Patient.last_name.ilike(term)]
        if palabra.isdigit():
            condiciones.append(DiagnosticOrder.id == int(palabra))
        query = query.filter(or_(*condiciones))

    total = query.count()
    # Lo urgente primero (plan 26, D-10): la resonancia que el médico marcó
    # urgente no puede quedar en la página 2 detrás de las rutinarias.
    filas = query.order_by(RANGO_DE_PRIORIDAD, DiagnosticOrder.requested_on.desc(), DiagnosticOrder.id.desc()).offset(skip).limit(limit).all()
    # Los archivos de toda la página en una sola consulta: recepción tiene que
    # poder abrir lo que subió para notar el sobre equivocado (plan 26, R-1).
    adjuntos: dict[int, list[AdjuntoDeOrden]] = {fila[0]: [] for fila in filas}
    if adjuntos:
        consulta_adjuntos = (
            scoped_query(
                db.query(
                    DiagnosticResult.id, DiagnosticResult.diagnostic_order_id, PatientDocument.id,
                    PatientDocument.file_name, PatientDocument.mime_type, PatientDocument.created_at,
                ),
                DiagnosticResult, user,
            )
            .join(PatientDocument, PatientDocument.id == DiagnosticResult.patient_document_id)
            .filter(DiagnosticResult.diagnostic_order_id.in_(list(adjuntos)), VIGENTE)
        )
        # Solo los archivos que esta persona puede abrir (plan 32, C2): listar
        # uno que luego da 404 sería prometer lo que no hay. El conteo
        # ``attachments`` sigue completo para no subir dos veces el sobre.
        if not ve_todos_los_resultados(db, user):
            consulta_adjuntos = consulta_adjuntos.filter(
                or_(DiagnosticResult.recorded_by_user_id == user.id, PatientDocument.uploaded_by_user_id == user.id)
            )
        for resultado_id, orden_id, documento_id, nombre, mime, subido in (
            consulta_adjuntos
            .order_by(PatientDocument.created_at.asc(), PatientDocument.id.asc())
            .all()
        ):
            adjuntos[orden_id].append(AdjuntoDeOrden(
                result_id=resultado_id, patient_document_id=documento_id, file_name=nombre,
                mime_type=mime, uploaded_at=subido,
            ))
    items = [
        OrdenPorRecibirItem(
            order_id=fila[0], order_group_id=fila[1], patient_id=fila[2], study_name=fila[3],
            requested_on=fila[4], status=fila[5], patient_name=f"{fila[6]} {fila[7]}".strip(), attachments=fila[8],
            adjuntos=adjuntos[fila[0]], priority=fila[9], doctor_id=fila[10],
            doctor_name=_nombre_de_doctora(fila[11], fila[12]),
        )
        for fila in filas
    ]
    if items:
        ordenes = scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user).filter(
            DiagnosticOrder.id.in_([i.order_id for i in items])
        ).all()
        _marcar_atrasos(db, user, ordenes, items)
    return OrdenPorRecibirPage(items=items, total=total, skip=skip, limit=limit)


@router.get("/orders/{order_id}/rastro", response_model=RastroDeEstudio)
def rastro_de_la_orden(
    order_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.read"))],
):
    """La línea de tiempo del estudio, con fecha y autor de cada paso (plan 32, punto 3).

    Mismo alcance que el historial de estudios del paciente, y queda en la
    bitácora de accesos como lectura de «estudios» (plan 32, punto 7).
    """
    order = scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user).filter(DiagnosticOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="No se encontró la orden de estudio. Actualiza la lista de estudios.")
    _patient(db, order.patient_id, user)
    eventos = rastro_de_estudio.eventos_de_orden(db, order, incluir_anulados=es_administracion(user))
    nombres = rastro_de_estudio.nombres_de_usuarios(db, {e.autor_id for e in eventos})
    registrar_acceso(db, user, order.patient_id, SeccionClinica.ESTUDIOS)
    salida = [
        EventoDeRastro(
            tipo=e.tipo, titulo=e.titulo, cuando=e.cuando, solo_fecha=e.solo_fecha,
            autor=nombres.get(e.autor_id), detalle=e.detalle,
        )
        for e in eventos
    ]
    ultimo = rastro_de_estudio.ultima_actualizacion(eventos)
    return RastroDeEstudio(
        order_id=order.id,
        ultima_actualizacion=salida[eventos.index(ultimo)] if ultimo else None,
        eventos=salida,
    )


def _orden_para_seguimiento(db: Session, order_id: int, user: User) -> DiagnosticOrder:
    """La orden, con el mismo alcance que subir su resultado."""
    order = scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user).filter(DiagnosticOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="No se encontró la orden de estudio. Actualiza la lista.")
    resolver_paciente_con_relacion_asistencial(db, order.patient_id, user)
    return order


@router.get("/orders/{order_id}/seguimientos", response_model=list[SeguimientoDeOrden])
def list_follow_ups(
    order_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.follow_up"))],
):
    """Todos los seguimientos del estudio, del más reciente al más antiguo."""
    _orden_para_seguimiento(db, order_id, user)
    filas = (
        scoped_query(db.query(DiagnosticOrderFollowUp, User.full_name), DiagnosticOrderFollowUp, user)
        .join(User, User.id == DiagnosticOrderFollowUp.registrado_por_user_id)
        .filter(DiagnosticOrderFollowUp.diagnostic_order_id == order_id)
        .order_by(DiagnosticOrderFollowUp.created_at.desc(), DiagnosticOrderFollowUp.id.desc())
        .all()
    )
    return [_seguimiento(seg, nombre) for seg, nombre in filas]


@router.post("/orders/{order_id}/seguimientos", response_model=SeguimientoDeOrden, status_code=status.HTTP_201_CREATED)
def create_follow_up(
    order_id: int,
    datos: SeguimientoCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.follow_up"))],
):
    """Registra por qué el estudio sigue sin resultado y cuándo volver a revisarlo.

    Hasta esa fecha sale de «Atrasados». Lo registra el médico o recepción
    (decisión de Emilio, 2026-10-05). Solo para estudios que siguen esperando
    resultado: a uno que ya lo tiene no le falta nada.
    """
    order = _orden_para_seguimiento(db, order_id, user)
    if order.status not in estudios_atrasados.ESTADOS_SIN_RESULTADO:
        raise HTTPException(
            status_code=409,
            detail="Este estudio ya no espera resultado, así que no lleva seguimiento. Actualiza la lista.",
        )
    seg = DiagnosticOrderFollowUp(
        tenant_id=order.tenant_id,
        diagnostic_order_id=order.id,
        motivo=datos.motivo,
        nota=datos.nota,
        revisar_el=datos.revisar_el,
        registrado_por_user_id=user.id,
    )
    db.add(seg)
    db.flush()
    avisos_de_atrasados.cerrar_si_ya_no_hay(db, order.doctor_id, por_user_id=user.id)
    db.commit()
    db.refresh(seg)
    log_action(
        db, actor_user_id=user.id, tenant_id=user.tenant_id, action="CREATE",
        entity_type="diagnostic_order_follow_up", entity_id=seg.id, patient_id=order.patient_id,
        details={"order_id": order.id, "motivo": seg.motivo, "revisar_el": seg.revisar_el.isoformat()},
    )
    return _seguimiento(seg, user.full_name)


@router.get("/orders/to-deliver", response_model=OrdenPorEntregarPage)
def orders_to_deliver(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.deliver_order"))],
    fecha: date | None = Query(None, description="Día a listar; por defecto hoy (hora local)."),
    include_delivered: bool = Query(False, description="Incluir también las ya entregadas de ese día."),
    search: str | None = Query(None, max_length=100),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
):
    """Órdenes emitidas del día que recepción tiene que entregar (O-09).

    La otra mitad de la vista de mostrador («resultados por recibir») es
    ``GET /orders/awaiting-result`` (O-04); no se duplica aquí. Esta lista sólo
    trae las órdenes emitidas del día por sucursal, con lo justo para
    reconocerlas (paciente, estudio, folio, estado). No trae la indicación
    clínica ni el expediente: recepción entrega el papel, no lo lee.

    Por defecto muestra las que faltan por entregar; con ``include_delivered``
    salen también las ya entregadas del día, para consultarlas sin volver a
    marcarlas.
    """
    dia = fecha or hoy_local()
    query = scoped_query(
        db.query(
            DiagnosticOrder.id, DiagnosticOrder.order_group_id, DiagnosticOrder.patient_id,
            DiagnosticOrder.study_name, DiagnosticOrder.requested_on, DiagnosticOrder.status,
            DiagnosticOrder.delivered_at, Patient.first_name, Patient.last_name,
            DiagnosticOrder.doctor_id, User.full_name, User.tratamiento, DiagnosticOrder.priority,
        ),
        DiagnosticOrder, user,
    ).join(Patient, Patient.id == DiagnosticOrder.patient_id).join(
        User, User.id == DiagnosticOrder.doctor_id
    ).filter(
        DiagnosticOrder.requested_on == dia,
        DiagnosticOrder.status.notin_(tuple(ESTADOS_DE_ORDEN_NO_IMPRIMIBLES)),
    )
    # El médico que tiene el permiso sólo ve las órdenes que ella pidió; recepción
    # y administración, todas las de su sucursal (el filtro no las acota).
    query = filtrar_por_autoria_clinica(query, DiagnosticOrder.doctor_id, user)
    if not include_delivered:
        query = query.filter(DiagnosticOrder.delivered_at.is_(None))
    for palabra in (search or "").split():
        term = f"%{palabra}%"
        condiciones = [DiagnosticOrder.study_name.ilike(term), Patient.first_name.ilike(term), Patient.last_name.ilike(term)]
        if palabra.isdigit():
            condiciones.append(DiagnosticOrder.id == int(palabra))
        query = query.filter(or_(*condiciones))

    total = query.count()
    # Lo urgente primero, igual que en «por recibir» (plan 26, D-10): la
    # paciente con la resonancia urgente es la primera a la que se le entrega.
    filas = query.order_by(RANGO_DE_PRIORIDAD, DiagnosticOrder.requested_on.desc(), DiagnosticOrder.id.desc()).offset(skip).limit(limit).all()
    items = [
        OrdenPorEntregarItem(
            order_id=fila[0], order_group_id=fila[1], patient_id=fila[2], study_name=fila[3],
            requested_on=fila[4], status=fila[5], delivered=fila[6] is not None, delivered_at=fila[6],
            patient_name=f"{fila[7]} {fila[8]}".strip(), doctor_id=fila[9],
            doctor_name=_nombre_de_doctora(fila[10], fila[11]), priority=fila[12] or "routine",
        )
        for fila in filas
    ]
    return OrdenPorEntregarPage(items=items, total=total, skip=skip, limit=limit)


@router.post("/orders/{order_id}/delivered", response_model=EntregaOrdenResponse)
def mark_order_delivered(
    order_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.deliver_order"))],
):
    """Marca que la orden ya se le entregó al paciente en el mostrador (O-09).

    Es contabilidad de recepción, no cambia el ciclo clínico de la orden. Es
    idempotente: si otra persona ya la marcó, se responde con la entrega que ya
    había (``ya_estaba_entregada``) y no se duplica la bitácora, para que la
    interfaz no diga «entregada ahora» dos veces.
    """
    order = scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user).filter(DiagnosticOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="No se encontró la orden de estudio. Puede que la hayan eliminado; actualiza la lista de estudios.")
    # El médico sólo entrega las órdenes que ella pidió; recepción y
    # administración, cualquiera de su sucursal.
    exigir_autoria_clinica(order.doctor_id, user, detalle="No se encontró la orden de estudio. Puede que la hayan eliminado; actualiza la lista de estudios.")
    if order.status in ESTADOS_DE_ORDEN_NO_IMPRIMIBLES:
        raise HTTPException(
            status_code=409,
            detail="Esta orden está cancelada o no se ha emitido, así que no se entrega. Si el paciente sí necesita el estudio, pídele al médico una orden nueva.",
        )

    if order.delivered_at is not None:
        # Ya estaba entregada: no se reescribe quién ni cuándo, ni se vuelve a auditar.
        return EntregaOrdenResponse(
            order_id=order.id, delivered=True, delivered_at=order.delivered_at,
            delivered_by_user_id=order.delivered_by_user_id, ya_estaba_entregada=True,
        )

    order.delivered_at = utcnow()
    order.delivered_by_user_id = user.id
    db.commit()
    db.refresh(order)

    log_action(
        db, action="diagnostic_order.delivered", entity_type="diagnostic_order", entity_id=order.id,
        actor_user_id=user.id, tenant_id=order.tenant_id, patient_id=order.patient_id,
        details={"patient_id": order.patient_id},
    )
    return EntregaOrdenResponse(
        order_id=order.id, delivered=True, delivered_at=order.delivered_at,
        delivered_by_user_id=order.delivered_by_user_id, ya_estaba_entregada=False,
    )


@router.post("/orders/{order_id}/result-attachment", response_model=ResultadoAdjuntoResponse, status_code=status.HTTP_201_CREATED)
async def attach_result_file(
    order_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.attach_result"))],
    file: UploadFile = File(...),
    resulted_on: date | None = Form(None),
    reporting_provider: str | None = Form(None, max_length=255),
):
    """Sube el PDF o la foto del resultado y lo liga a su orden (O-04).

    Decisión de Emilio: recepción lo sube, el médico lo interpreta y lo marca
    revisado. Por eso aquí nace un resultado en ``received``, sin texto ni
    interpretación, y la orden pasa a ``result_received`` para que aparezca en
    la bandeja del médico. No se sobrescribe nada: un segundo archivo es un
    resultado nuevo (plan 14 §10, los originales no se sobrescriben), y si la
    orden ya estaba revisada vuelve a la bandeja, porque hay algo que no ha visto.

    Alcance: recepción y administración, cualquier orden de su sucursal; la
    doctora, las de pacientes con las que tiene relación asistencial.
    """
    order = scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user).filter(DiagnosticOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="No se encontró la orden de estudio. Puede que la hayan eliminado; actualiza la lista de estudios.")
    patient = resolver_paciente_con_relacion_asistencial(db, order.patient_id, user)
    if order.status in ESTADOS_DE_ORDEN_NO_IMPRIMIBLES:
        raise HTTPException(
            status_code=409,
            detail="Esta orden está cancelada o no se ha emitido, así que no se le liga un resultado. Súbelo como documento del paciente o pregúntale al médico.",
        )

    content, detected_mime = await read_and_validate_upload(
        file, allowed_mime_types=ALLOWED_DOCUMENT_MIME_TYPES, max_size_bytes=MAX_DOCUMENT_SIZE_BYTES,
    )
    relative_path = f"uploads/patient_documents/{uuid.uuid4()}{extension_for_mime(detected_mime)}"
    try:
        default_storage.save(relative_path, content)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="No se pudo guardar el archivo. Inténtalo otra vez; si vuelve a fallar, avisa al equipo de soporte.") from exc

    proveedor = sanitize_text(reporting_provider, 255) if reporting_provider else None
    try:
        document = PatientDocument(
            patient_id=order.patient_id,
            tenant_id=order.tenant_id,
            uploaded_by_user_id=user.id,
            document_type=TIPO_DE_DOCUMENTO_POR_CATEGORIA.get(order.category, DocumentType.OTHER),
            title=sanitize_text(f"Resultado: {order.study_name}", 255),
            file_path=relative_path,
            file_name=sanitize_text(Path(file.filename).name if file.filename else "resultado", 255),
            file_size=len(content),
            mime_type=detected_mime,
            lab_name=proveedor,
            study_date=resulted_on.isoformat() if resulted_on else None,
        )
        db.add(document)
        db.flush()
        result = DiagnosticResult(
            tenant_id=order.tenant_id,
            diagnostic_order_id=order.id,
            recorded_by_user_id=user.id,
            patient_document_id=document.id,
            resulted_on=resulted_on,
            reporting_provider=proveedor,
            review_status="received",
        )
        db.add(result)
        order.status = "result_received"
        # En la misma transacción que el archivo (plan 27, M-4).
        avisos_de_resultados.avisar_resultado_recibido(db, order, patient, user)
        avisos_de_atrasados.cerrar_si_ya_no_hay(db, order.doctor_id, por_user_id=user.id)
        db.commit()
    except Exception as exc:
        # Sin registro no hay archivo: uno suelto en disco que nadie encuentra
        # es peor que pedir que lo vuelvan a subir.
        db.rollback()
        default_storage.delete(relative_path)
        raise HTTPException(status_code=500, detail="El archivo se subió pero no se pudo ligar a la orden. Inténtalo de nuevo; si vuelve a fallar, avisa al equipo de soporte.") from exc
    db.refresh(result)
    db.refresh(document)

    log_action(
        db, action="diagnostic_result.attachment_uploaded", entity_type="diagnostic_result", entity_id=result.id,
        actor_user_id=user.id, tenant_id=order.tenant_id, patient_id=order.patient_id,
        details={"patient_id": order.patient_id, "order_id": order.id, "patient_document_id": document.id},
    )
    return ResultadoAdjuntoResponse(
        result_id=result.id, order_id=order.id, order_status=order.status, patient_document_id=document.id,
        file_name=document.file_name, mime_type=document.mime_type, file_size=document.file_size,
        uploaded_at=document.created_at,
    )


def _cerrar_recibidos_de_la_orden(db: Session, order: DiagnosticOrder, user: User, *, excepto: int | None) -> None:
    """Al revisar la orden, sus otros archivos todavía «recibidos» quedan revisados.

    Una orden puede traer varios archivos (el PDF del reporte y las imágenes,
    plan 26 D-2), cada uno con su resultado. El médico los revisa juntos en
    el visor y deja UNA interpretación; si los demás se quedaran en
    «recibido», la orden diría «revisada» mientras un crítico de un archivo
    anterior seguiría abierto en su dashboard, sin manera de cerrarlo desde
    la pantalla. No se toca lo que ya estaba revisado ni comunicado, ni la
    marca de crítico: queda en el expediente quién revisó y cuándo.
    """
    pendientes = (
        db.query(DiagnosticResult)
        .filter(DiagnosticResult.diagnostic_order_id == order.id, DiagnosticResult.review_status == "received", VIGENTE)
        .all()
    )
    for otro in pendientes:
        if otro.id == excepto:
            continue
        otro.review_status = "reviewed"
        otro.reviewed_at = utcnow()
        otro.reviewed_by_user_id = user.id


@router.patch("/results/{result_id}", response_model=DiagnosticResultResponse)
def update_result(result_id: int, data: DiagnosticResultUpdate, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(require_permission("clinical_tracking.update"))]):
    result = scoped_query(db.query(DiagnosticResult), DiagnosticResult, user).filter(DiagnosticResult.id == result_id).first()
    if not result: raise HTTPException(status_code=404, detail="No se encontró el resultado del estudio. Puede que lo hayan eliminado; actualiza la lista de estudios.")
    if result.anulado_at is not None:
        raise HTTPException(status_code=409, detail="Este resultado está anulado; ya no se revisa. Actualiza la orden.")
    order = scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user).filter(DiagnosticOrder.id == result.diagnostic_order_id).first()
    if not order: raise HTTPException(status_code=404, detail="No se encontró la orden de estudio. Puede que la hayan eliminado; actualiza la lista de estudios.")
    _patient(db, order.patient_id, user)
    exigir_autoria_clinica(order.doctor_id, user, detalle="Solo puedes revisar resultados de órdenes que solicitaste")
    cita, cierre = _cita_de_revision(
        db, user, order, data.appointment_id,
        hay_revision=data.review_status in {"reviewed", "requires_action", "communicated"},
    )
    cambios = data.model_dump(exclude_unset=True)
    cambios.pop("appointment_id", None)
    if cambios.get("review_status", "") is None:
        cambios.pop("review_status")
    # La valoración manda sobre la casilla de crítico (D-9); si sólo viene la
    # casilla, se traduce: marcarla es «crítico», quitarla borra «crítico».
    if "valoracion" in cambios:
        cambios["is_critical"] = cambios["valoracion"] == "critico"
    elif "is_critical" in cambios and cambios["is_critical"] is not None:
        if cambios["is_critical"]:
            cambios["valoracion"] = "critico"
        elif result.valoracion == "critico":
            cambios["valoracion"] = None
    if cambios.get("is_critical") is None:
        cambios.pop("is_critical", None)
    # Un resultado que vuelve a ser crítico después de cerrada su incidencia
    # la reabre: es un hallazgo nuevo que nadie le ha comunicado al paciente.
    # Re-mandar «crítico» a uno que ya lo era no la reabre (la pantalla
    # reenvía la valoración en cada guardado).
    reabre = bool(cambios.get("is_critical")) and not result.is_critical and result.incidencia_cerrada_at is not None
    cerrada_antes = (result.incidencia_cerrada_at, result.incidencia_cerrada_por)
    interpretacion_antes = result.clinician_interpretation
    for field, value in cambios.items(): setattr(result, field, value)
    # Quién escribió la interpretación y quién la cambió después (plan 32,
    # punto 3). Re-mandar el mismo texto no es editarla.
    nueva = result.clinician_interpretation
    if (nueva or "").strip() != (interpretacion_antes or "").strip() and (nueva or "").strip():
        if result.interpretacion_escrita_at is None and not (interpretacion_antes or "").strip():
            result.interpretacion_escrita_at, result.interpretacion_escrita_por_user_id = utcnow(), user.id
        else:
            result.interpretacion_editada_at, result.interpretacion_editada_por_user_id = utcnow(), user.id
    if reabre:
        result.incidencia_cerrada_at = None
        result.incidencia_cerrada_por = None
        result.incidencia_cerrada_by_user_id = None
    if data.review_status in {"reviewed", "requires_action", "communicated"}:
        result.reviewed_at = result.reviewed_at or utcnow(); result.reviewed_by_user_id = user.id
        order.status = "reviewed"
        _cerrar_recibidos_de_la_orden(db, order, user, excepto=result.id)
    if data.review_status == "communicated":
        result.communicated_at = utcnow(); result.communicated_by_user_id = user.id
    if cita:
        result.reviewed_in_appointment_id = cita.id
    # Revisar desde la bandeja, sin el paciente, no cierra la incidencia (D-8).
    if data.review_status == "communicated":
        _cerrar_incidencias(db, order, user, por="comunicacion")
    elif cierre == "aplicada":
        _cerrar_incidencias(db, order, user, por="consulta")
    avisos_de_resultados.resolver_resultado_si_ya_no_espera(db, order, user)
    db.commit(); db.refresh(result)
    _log(db, "diagnostic_result.updated", "diagnostic_result", result.id, user, result.tenant_id, order.patient_id)
    if reabre:
        log_action(
            db, action="diagnostic_result.critical_reopened", entity_type="diagnostic_result", entity_id=result.id,
            actor_user_id=user.id, tenant_id=result.tenant_id, patient_id=order.patient_id,
            details={
                "patient_id": order.patient_id, "order_id": order.id,
                "cerrada_at": cerrada_antes[0].isoformat() if cerrada_antes[0] else None,
                "cerrada_por": cerrada_antes[1],
            },
        )
    respuesta = _resultado_con_archivo(result)
    respuesta.cierre_en_consulta = cierre
    return respuesta


@router.post("/results/{result_id}/anular", response_model=AnulacionDeResultado)
def anular_resultado_de_orden(
    result_id: int,
    datos: AnularResultado,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.read"))],
):
    """Anula un resultado subido por error, con su archivo (plan 29, lote 9).

    Solo el médico que pidió el estudio o la administración. Las reglas de
    estado e incidencia están en ``app.services.anular_resultado``.
    """
    from app.schemas.clinical_tracking import ESTADO_VISIBLE_DE_ORDEN

    result = scoped_query(db.query(DiagnosticResult), DiagnosticResult, user).filter(DiagnosticResult.id == result_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="No se encontró el resultado del estudio. Actualiza la orden.")
    order = scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user).filter(DiagnosticOrder.id == result.diagnostic_order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="No se encontró la orden de estudio. Actualiza la lista de estudios.")
    if not es_administracion(user):
        _patient(db, order.patient_id, user)
    hecho = anular_resultado.anular(db, result, order, user, datos.motivo)
    return AnulacionDeResultado(
        result_id=result.id, order_id=order.id, estado_anterior=hecho.estado_anterior,
        order_status=hecho.estado_nuevo, estado_visible=ESTADO_VISIBLE_DE_ORDEN.get(hecho.estado_nuevo, hecho.estado_nuevo),
        resultados_vigentes=hecho.resultados_vigentes, documento_anulado=hecho.documento_anulado,
        incidencia=hecho.incidencia,
    )


@router.get("/critical-results", response_model=IncidenciasCriticasPage)
def critical_results(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.read"))],
    limit: int = Query(50, ge=1, le=100),
):
    """Resultados críticos que el médico autora todavía no revisa (plan 26, D-3).

    Marcar «crítico» no hacía nada más que pintar un badge, aunque la casilla
    prometía atención prioritaria (B-6). Ahora es una incidencia en el
    dashboard del médico que pidió el estudio, y se queda ahí hasta que
    ella lo revisa. Recepción no recibe aviso (decisión de Emilio).

    Abierta = crítico y sin cerrar (``INCIDENCIA_ABIERTA``, la misma regla
    del filtro «críticos» de la bandeja). Se cierra al documentar la
    comunicación al paciente con su medio o al revisarlo en una consulta
    suya (D-8); revisarlo desde la bandeja no la cierra. La más antigua
    primero: es la que lleva más tiempo esperando.
    """
    query = (
        scoped_query(
            db.query(
                DiagnosticResult.id, DiagnosticResult.diagnostic_order_id, DiagnosticResult.review_status,
                DiagnosticResult.resulted_on, DiagnosticResult.created_at, DiagnosticResult.patient_document_id,
                DiagnosticOrder.patient_id, DiagnosticOrder.study_name, Patient.first_name, Patient.last_name,
                PatientDocument.file_name, PatientDocument.mime_type, DiagnosticResult.valoracion,
                DiagnosticResult.reviewed_at,
            ),
            DiagnosticResult, user,
        )
        .join(DiagnosticOrder, DiagnosticOrder.id == DiagnosticResult.diagnostic_order_id)
        .join(Patient, Patient.id == DiagnosticOrder.patient_id)
        .outerjoin(PatientDocument, PatientDocument.id == DiagnosticResult.patient_document_id)
        .filter(*INCIDENCIA_ABIERTA, DiagnosticOrder.status.notin_(tuple(ESTADOS_DE_ORDEN_NO_IMPRIMIBLES)))
    )
    # Sólo las del médico autora: es ella quien tiene que revisarlo.
    query = filtrar_por_autoria_clinica(query, DiagnosticOrder.doctor_id, user)
    total = query.count()
    filas = query.order_by(DiagnosticResult.created_at.asc(), DiagnosticResult.id.asc()).limit(limit).all()
    items = [
        IncidenciaCritica(
            result_id=fila[0], order_id=fila[1], review_status=fila[2], resulted_on=fila[3], created_at=fila[4],
            patient_document_id=fila[5], patient_id=fila[6], study_name=fila[7],
            patient_name=f"{fila[8]} {fila[9]}".strip(), document_file_name=fila[10], document_mime_type=fila[11],
            valoracion=fila[12], reviewed_at=fila[13],
        )
        for fila in filas
    ]
    return IncidenciasCriticasPage(items=items, total=total)


@router.get("/obstetric-dashboard", response_model=list[ObstetricDashboardItem])
def obstetric_dashboard(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.read"))],
    days: int = Query(default=30, ge=1, le=60),
    dias_vencida: int = Query(default=14, ge=0, le=60, description="Hasta cuántos días atrás se muestran FPP ya pasadas"),
):
    """Non-diagnostic work list of active FPPs and their last requested follow-up.

    El horizonte se cuenta desde hoy en el consultorio: con la fecha
    del contenedor (UTC), después de las 17:00 de Mazatlán ya era mañana y el
    tablero alcanzaba un día de más (plan 26, D-12).

    Límite inferior (plan 28): antes entraba toda FPP pasada de cualquier
    embarazo que nadie cerró, y «partos próximos» se llenaba con pacientes de
    hace meses. Ahora solo las vencidas de las últimas ``dias_vencida``
    jornadas, marcadas ``vencida``: ésas sí piden atención.
    """
    hoy = hoy_local()
    until = hoy + timedelta(days=days)
    desde = hoy - timedelta(days=dias_vencida)
    query = (
        scoped_query(db.query(Pregnancy), Pregnancy, user)
        .options(joinedload(Pregnancy.patient))
        .filter(
            Pregnancy.status == "active",
            Pregnancy.estimated_delivery_date.isnot(None),
            Pregnancy.estimated_delivery_date >= desde,
            Pregnancy.estimated_delivery_date <= until,
        )
    )
    query = filtrar_por_autoria_clinica(query, Pregnancy.doctor_id, user)
    pregnancies = query.order_by(Pregnancy.estimated_delivery_date.asc()).limit(100).all()
    # Una sola consulta para la próxima revisión de todos los embarazos, en vez
    # de una por embarazo dentro del bucle (B-07): el máximo ``next_visit_on``
    # de cada uno, agrupado.
    ids = [p.id for p in pregnancies]
    proxima_por_embarazo: dict[int, date] = {}
    if ids:
        filas = (
            scoped_query(
                db.query(PrenatalVisit.pregnancy_id, func.max(PrenatalVisit.next_visit_on)),
                PrenatalVisit, user,
            )
            .filter(PrenatalVisit.pregnancy_id.in_(ids), PrenatalVisit.next_visit_on.isnot(None))
            .group_by(PrenatalVisit.pregnancy_id)
            .all()
        )
        proxima_por_embarazo = {pregnancy_id: proxima for pregnancy_id, proxima in filas}
    items = [
        ObstetricDashboardItem(
            pregnancy_id=pregnancy.id, patient_id=pregnancy.patient_id,
            patient_full_name=(
                f"{pregnancy.patient.first_name} {pregnancy.patient.last_name}".strip()
                if pregnancy.patient else None
            ),
            estimated_delivery_date=pregnancy.estimated_delivery_date,
            vencida=pregnancy.estimated_delivery_date < hoy,
            dating_status=pregnancy.dating_status,
            next_visit_on=proxima_por_embarazo.get(pregnancy.id),
        )
        for pregnancy in pregnancies
    ]
    return items


@router.get("/prenatal-review-board", response_model=list[PrenatalReviewBoardItem])
def prenatal_review_board(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("clinical_tracking.read"))],
    dias: int = Query(default=14, ge=1, le=60, description="Cuánto hacia adelante mirar"),
    atraso_maximo: int = Query(default=90, ge=1, le=365, description="Hasta cuánto atrás"),
):
    """Controles prenatales vencidos o próximos que nadie agendó todavía.

    Es lo que Emilio aprobó de la Fase 7 junto con el recordatorio, y lo que
    deliberadamente NO es: no agenda nada, no elige hora ni sala y no le manda
    un aviso al médico. Es una lista que se consulta. La regla de Emilio:
    una notificación significa "haz algo"; si significa "entérate", va en una
    lista.

    Comparte con el trabajo de recordatorio la definición de "ya está citada"
    (``scripts.aviso_proxima_revision._tiene_cita``) y eso es a propósito: si
    las dos divergieran, el médico vería aquí pacientes de las que recepción
    nunca supo, o al revés, y no habría manera de saber cuál de las dos miente.

    El ``atraso_maximo`` acota hacia atrás porque un embarazo que quedó activo
    con una revisión de hace ocho meses no es un pendiente, es un registro que
    nadie cerró: llenar el tablero con eso lo vuelve inservible el primer día.
    """
    from scripts.aviso_proxima_revision import _embarazos_ya_citados

    hoy = hoy_local()
    desde = hoy - timedelta(days=atraso_maximo)
    hasta = hoy + timedelta(days=dias)

    query = scoped_query(db.query(Pregnancy), Pregnancy, user).filter(
        Pregnancy.status == PregnancyStatus.ACTIVE.value,
        Pregnancy.next_review_on.isnot(None),
        Pregnancy.next_review_on >= desde,
        Pregnancy.next_review_on <= hasta,
    )
    query = filtrar_por_autoria_clinica(query, Pregnancy.doctor_id, user)

    embarazos = query.order_by(Pregnancy.next_review_on.asc()).limit(200).all()
    # Dos consultas fijas para todo el lote, en vez de 2–3 por embarazo (B-07):
    # quiénes ya tienen cita, y los pacientes en un solo IN.
    citados = _embarazos_ya_citados(db, embarazos, hoy)
    ids_paciente = {e.patient_id for e in embarazos if e.id not in citados}
    pacientes = {
        p.id: p
        for p in scoped_query(db.query(Patient), Patient, user)
        .filter(Patient.id.in_(ids_paciente))
        .all()
    } if ids_paciente else {}

    items: list[PrenatalReviewBoardItem] = []
    for embarazo in embarazos:
        if embarazo.id in citados:
            continue
        paciente = pacientes.get(embarazo.patient_id)
        if not paciente:
            continue
        items.append(
            PrenatalReviewBoardItem(
                pregnancy_id=embarazo.id,
                patient_id=embarazo.patient_id,
                patient_full_name=" ".join(
                    filter(None, [paciente.first_name, paciente.last_name])
                ),
                next_review_on=embarazo.next_review_on,
                dias_de_atraso=(hoy - embarazo.next_review_on).days,
                vencida=embarazo.next_review_on < hoy,
                estimated_delivery_date=embarazo.estimated_delivery_date,
                avisado_a_recepcion=(
                    embarazo.next_review_reminded_on == embarazo.next_review_on
                ),
            )
        )
    return items
