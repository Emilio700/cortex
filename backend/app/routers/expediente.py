"""El expediente único del paciente (plan 32, punto 6).

El expediente es el único lugar donde está todo de un paciente; Pacientes es
el directorio y las bandejas son filas de trabajo. Una sola página para todos
los roles, pero **el servidor decide qué pestañas ve cada quien**: la vista de
recepción no depende de esconder botones.

Aquí viven solo las piezas nuevas del expediente: su encabezado clínico, el
resumen («fotografía clínica actual») y el estado de los consentimientos para
quien no lee su contenido. Cada pestaña reusa el endpoint que ya tenía su
información, con sus propios permisos.
"""
from datetime import datetime, time, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.access_scope import filtrar_pacientes_del_alcance, filtrar_por_autoria_clinica
from app.core.deps import get_db, get_user_permissions, require_permission
from app.core.hora_local import ahora_local, hoy_local
from app.core.tenant_scope import scoped_query
from app.models.acceso_clinico import SeccionClinica
from app.models.appointment import Appointment, AppointmentStatus
from app.models.clinical_consent import ClinicalConsent, ConsentStatus
from app.models.clinical_episode import ClinicalEpisode, ClinicalEpisodeStatus
from app.models.clinical_tracking import DiagnosticOrder, DiagnosticResult
from app.models.patient import Patient
from app.models.pregnancy import Pregnancy, PregnancyStatus
from app.models.user import User
from app.services import estudios_atrasados
from app.services.anular_resultado import VIGENTE
from app.services.bitacora_accesos import registrar_acceso
from app.services.datos_de_cita import edad_gestacional

router = APIRouter(prefix="/patients", tags=["expediente"])

# Qué abre cada pestaña. Basta uno de los permisos; el endpoint de la
# pestaña vuelve a revisar el suyo.
PESTANAS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("resumen", ("patients.read",)),
    ("consultas", ("patients.read",)),
    ("estudios", ("clinical_tracking.read", "clinical_tracking.attach_result")),
    ("documentos", ("documents.read",)),
    # Recepción ve aquí los estudios de imagen que ella recibió (decisión 2), no las fotos clínicas.
    ("imagenes", ("clinical_images.read", "documents.read")),
    ("embarazo", ("prenatal.read",)),
    ("consentimientos", ("clinical_consents.read", "patients.read")),
    ("equipo", ("patient_care_team.read",)),
    # Escalas neurológicas (Cortex, feat/escalas-neuro): la gráfica de evolución.
    ("escalas", ("clinical_scales.read",)),
)

PENDIENTES = (
    AppointmentStatus.AGENDADA,
    AppointmentStatus.CONFIRMADA,
    AppointmentStatus.EN_SALA,
    AppointmentStatus.EN_CONSULTA,
)


class CitaBreve(BaseModel):
    id: int
    scheduled_at: datetime
    status: str
    motivo: Optional[str] = None


class EmbarazoBreve(BaseModel):
    semanas: Optional[int] = None
    dias: Optional[int] = None
    fpp: Optional[str] = None


class AlertasClinicas(BaseModel):
    criticos: int = 0
    atrasados: int = 0
    por_revisar: int = 0
    pendientes: int = 0


class EncabezadoExpediente(BaseModel):
    patient_id: int
    nombre: str
    first_name: str
    last_name: str
    date_of_birth: Optional[str] = None
    phone: Optional[str] = None
    cell_phone: Optional[str] = None
    allergies: Optional[str] = None
    # Señales de neurocirugía (Cortex): son clínicas, así que solo viajan a
    # quien lee el expediente clínico, igual que el resto de antecedentes.
    implanted_devices: Optional[str] = None
    anticoagulants: Optional[str] = None
    owner_doctor_id: Optional[int] = None
    pestanas: list[str]
    # Solo para quien lee lo clínico; ``None`` = no aplica a esta sesión.
    vista_clinica: bool
    embarazo: Optional[EmbarazoBreve] = None
    alertas: Optional[AlertasClinicas] = None
    # «Abrir la consulta de hoy»: la cita de hoy de ESTA doctora con el paciente.
    cita_de_hoy: Optional[CitaBreve] = None
    proxima_cita: Optional[CitaBreve] = None


def _paciente(db: Session, patient_id: int, user: User) -> Patient:
    """El paciente con el mismo alcance que el directorio (``GET /patients``)."""
    paciente = filtrar_pacientes_del_alcance(
        scoped_query(db.query(Patient), Patient, user), user
    ).filter(Patient.id == patient_id).first()
    if not paciente:
        raise HTTPException(status_code=404, detail="No se encontró el paciente.")
    return paciente


def _citas(db: Session, user: User, patient_id: int):
    return scoped_query(db.query(Appointment), Appointment, user).filter(Appointment.patient_id == patient_id)


def _breve(cita: Appointment | None, con_motivo: bool) -> Optional[CitaBreve]:
    if cita is None:
        return None
    return CitaBreve(
        id=cita.id,
        scheduled_at=cita.scheduled_at,
        status=getattr(cita.status, "value", cita.status),
        motivo=(cita.notes or None) if con_motivo else None,
    )


def _proxima(db: Session, user: User, patient_id: int) -> Optional[Appointment]:
    # ``scheduled_at`` es hora local del consultorio: se compara con el reloj
    # local, no con UTC (con UTC, por la tarde «próxima» traía la de hace horas).
    return (
        _citas(db, user, patient_id)
        .filter(Appointment.scheduled_at >= ahora_local(), Appointment.status.in_(PENDIENTES))
        .order_by(Appointment.scheduled_at.asc())
        .first()
    )


def _alertas(db: Session, user: User, patient_id: int) -> AlertasClinicas:
    from sqlalchemy import case, func, select

    from app.routers.clinical_tracking import INCIDENCIA_ABIERTA

    criticas = select(DiagnosticResult.diagnostic_order_id).where(*INCIDENCIA_ABIERTA)
    plazos = estudios_atrasados.plazos_por_doctora(db, user.tenant_id)
    query = filtrar_por_autoria_clinica(
        scoped_query(db.query(DiagnosticOrder), DiagnosticOrder, user), DiagnosticOrder.doctor_id, user
    ).filter(DiagnosticOrder.patient_id == patient_id)
    suma = lambda condicion: func.coalesce(func.sum(case((condicion, 1), else_=0)), 0)  # noqa: E731
    fila = query.with_entities(
        suma(DiagnosticOrder.id.in_(criticas)),
        suma(estudios_atrasados.condicion_atrasado(plazos=plazos)),
        suma(DiagnosticOrder.status == "result_received"),
        suma(DiagnosticOrder.status.in_(estudios_atrasados.ESTADOS_SIN_RESULTADO)),
    ).one()
    return AlertasClinicas(criticos=int(fila[0]), atrasados=int(fila[1]), por_revisar=int(fila[2]), pendientes=int(fila[3]))


@router.get("/{patient_id}/expediente", response_model=EncabezadoExpediente)
def encabezado_del_expediente(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("patients.read"))],
):
    """El encabezado del expediente y las pestañas que esta sesión puede abrir.

    Recepción recibe ficha, contacto, alergias (dato de seguridad, plan 32
    opción C) y la próxima cita; lo clínico (embarazo, alertas de estudios)
    solo viaja a quien tiene su permiso.
    """
    paciente = _paciente(db, patient_id, user)
    permisos = get_user_permissions(user, db)
    pestanas = [p for p, requeridos in PESTANAS if any(r in permisos for r in requeridos)]
    clinica = "medical_history.read" in permisos

    embarazo = None
    if "prenatal.read" in permisos:
        activo = (
            scoped_query(db.query(Pregnancy), Pregnancy, user)
            .filter(Pregnancy.patient_id == patient_id, Pregnancy.status == PregnancyStatus.ACTIVE.value)
            .order_by(Pregnancy.id.desc())
            .first()
        )
        if activo is not None:
            edad = edad_gestacional(activo.last_menstrual_period, activo.estimated_delivery_date, hoy_local())
            embarazo = EmbarazoBreve(
                semanas=edad[0] if edad else None,
                dias=edad[1] if edad else None,
                fpp=activo.estimated_delivery_date.isoformat() if activo.estimated_delivery_date else None,
            )

    cita_de_hoy = None
    if "doctor.appointments.read" in permisos:
        inicio = datetime.combine(hoy_local(), time())
        cita_de_hoy = (
            _citas(db, user, patient_id)
            .filter(
                Appointment.doctor_id == user.id,
                Appointment.scheduled_at >= inicio,
                Appointment.scheduled_at < inicio + timedelta(days=1),
                Appointment.status.in_(PENDIENTES + (AppointmentStatus.ATENDIDA,)),
            )
            .order_by(Appointment.scheduled_at.asc())
            .first()
        )

    if clinica:
        registrar_acceso(db, user, patient_id, SeccionClinica.RESUMEN_CLINICO)

    return EncabezadoExpediente(
        patient_id=paciente.id,
        nombre=f"{paciente.first_name} {paciente.last_name}".strip(),
        first_name=paciente.first_name,
        last_name=paciente.last_name,
        date_of_birth=paciente.date_of_birth.isoformat() if paciente.date_of_birth else None,
        phone=paciente.phone,
        cell_phone=paciente.cell_phone,
        allergies=paciente.allergies,
        implanted_devices=paciente.implanted_devices if clinica else None,
        anticoagulants=paciente.anticoagulants if clinica else None,
        owner_doctor_id=paciente.owner_doctor_id,
        pestanas=pestanas,
        vista_clinica=clinica,
        embarazo=embarazo,
        alertas=_alertas(db, user, patient_id) if "clinical_tracking.read" in permisos else None,
        cita_de_hoy=_breve(cita_de_hoy, con_motivo=False),
        proxima_cita=_breve(_proxima(db, user, patient_id), con_motivo=False),
    )


class ResultadoReciente(BaseModel):
    order_id: int
    study_name: str
    fecha: datetime
    valoracion: Optional[str] = None
    critico: bool = False


class EpisodioBreve(BaseModel):
    id: int
    title: str
    status: str
    follow_up_on: Optional[str] = None


class ResumenExpediente(BaseModel):
    ultima_consulta: Optional[CitaBreve] = None
    proxima_cita: Optional[CitaBreve] = None
    episodios_activos: list[EpisodioBreve] = []
    resultados_recientes: list[ResultadoReciente] = []
    alertas: Optional[AlertasClinicas] = None


@router.get("/{patient_id}/expediente/resumen", response_model=ResumenExpediente)
def resumen_del_expediente(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("medical_history.read"))],
):
    """La fotografía clínica actual: no otra lista, lo vigente (plan 32, punto 6).

    Última consulta y su motivo, próxima cita, episodios activos, últimos
    resultados con su valoración y las alertas de estudios.
    """
    from app.core.access_scope import resolver_paciente_con_relacion_asistencial

    resolver_paciente_con_relacion_asistencial(db, patient_id, user)
    permisos = get_user_permissions(user, db)
    ultima = (
        _citas(db, user, patient_id)
        .filter(Appointment.status == AppointmentStatus.ATENDIDA)
        .order_by(Appointment.scheduled_at.desc())
        .first()
    )
    episodios = []
    if "clinical_episodes.read" in permisos:
        episodios = [
            EpisodioBreve(
                id=e.id, title=e.title, status=e.status,
                follow_up_on=e.follow_up_on.isoformat() if e.follow_up_on else None,
            )
            for e in scoped_query(db.query(ClinicalEpisode), ClinicalEpisode, user)
            .filter(
                ClinicalEpisode.patient_id == patient_id,
                ClinicalEpisode.status.in_([ClinicalEpisodeStatus.ACTIVE.value, ClinicalEpisodeStatus.MONITORING.value]),
            )
            .order_by(ClinicalEpisode.updated_at.desc())
            .limit(6)
        ]
    recientes = []
    alertas = None
    if "clinical_tracking.read" in permisos:
        filas = (
            filtrar_por_autoria_clinica(
                scoped_query(db.query(DiagnosticResult, DiagnosticOrder.study_name, DiagnosticOrder.id), DiagnosticResult, user)
                .join(DiagnosticOrder, DiagnosticOrder.id == DiagnosticResult.diagnostic_order_id),
                DiagnosticOrder.doctor_id,
                user,
            )
            .filter(DiagnosticOrder.patient_id == patient_id, VIGENTE)
            .order_by(DiagnosticResult.created_at.desc())
            .limit(5)
            .all()
        )
        recientes = [
            ResultadoReciente(order_id=oid, study_name=nombre, fecha=r.created_at, valoracion=r.valoracion, critico=bool(r.is_critical))
            for r, nombre, oid in filas
        ]
        alertas = _alertas(db, user, patient_id)
    registrar_acceso(db, user, patient_id, SeccionClinica.RESUMEN_CLINICO)
    return ResumenExpediente(
        ultima_consulta=_breve(ultima, con_motivo="soap_notes.read" in permisos),
        proxima_cita=_breve(_proxima(db, user, patient_id), con_motivo=False),
        episodios_activos=episodios,
        resultados_recientes=recientes,
        alertas=alertas,
    )


class ConsentimientoEstado(BaseModel):
    id: int
    title: str
    status: str
    firmado: bool
    signed_at: Optional[datetime] = None


@router.get("/{patient_id}/expediente/consentimientos", response_model=list[ConsentimientoEstado])
def estado_de_consentimientos(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("patients.read"))],
):
    """Qué consentimientos existen y si están firmados, sin su contenido.

    Para recepción (decisión de Emilio, 2026-10-05): ve que existen y si están
    firmados, no el texto clínico. Quien lee el contenido usa la pestaña con
    ``clinical_consents.read``. Los borradores no se listan: todavía no son un
    consentimiento.
    """
    _paciente(db, patient_id, user)
    filas = (
        scoped_query(db.query(ClinicalConsent), ClinicalConsent, user)
        .filter(ClinicalConsent.patient_id == patient_id, ClinicalConsent.status != ConsentStatus.DRAFT.value)
        .order_by(ClinicalConsent.created_at.desc())
        .all()
    )
    return [
        ConsentimientoEstado(
            id=c.id, title=c.title, status=c.status,
            firmado=c.status == ConsentStatus.SIGNED.value, signed_at=c.patient_signed_at,
        )
        for c in filas
    ]
