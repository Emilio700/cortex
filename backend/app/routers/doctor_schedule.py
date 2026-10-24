"""Doctor working hours and schedule blocks router (Fase 5.1/5.2 - multidoctor)"""
from datetime import date as date_type
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.core.access_scope import alcance_operativo_acotado, exigir_agenda_propia
from app.core.deps import get_current_user, get_db, require_permission
from app.core.tenant_scope import scoped_query
from app.models.doctor_profile import DoctorProfile
from app.models.doctor_schedule import DoctorWorkingHours, ScheduleBlock
from app.models.user import Role, User
from app.schemas.doctor_schedule import (
    DiaDisponible,
    DisponibilidadResponse,
    DoctorAvailabilityResponse,
    FranjaDisponible,
    ScheduleBlockCreate,
    ScheduleBlockResponse,
    WorkingHoursCreate,
    WorkingHoursResponse,
)
from app.services.availability_service import PASO_POR_DEFECTO, dias_del_mes, franjas_del_dia
from app.services.audit_service import log_action

router = APIRouter(prefix="/doctor-schedule", tags=["doctor-schedule"])


@router.get("/doctors", response_model=List[DoctorAvailabilityResponse])
def list_doctors_for_scheduling(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """List active doctors in the caller's tenant, with specialty, for the
    agenda's doctor selector (Fase 5.3). Any authenticated user can call
    this (same access level as GET /users?role=doctor), it just also
    resolves each doctor's specialty in one call."""
    doctors = (
        scoped_query(db.query(User), User, current_user)
        .filter(User.role == Role.DOCTOR, User.is_active.is_(True))
        .all()
    )

    profiles_by_doctor = {
        p.user_id: p
        for p in (
            db.query(DoctorProfile)
            .options(joinedload(DoctorProfile.specialty))
            .filter(DoctorProfile.user_id.in_([d.id for d in doctors]))
            .all()
        )
    }

    return [
        DoctorAvailabilityResponse(
            id=doctor.id,
            full_name=doctor.full_name,
            email=doctor.email,
            specialty=profiles_by_doctor[doctor.id].specialty.name if doctor.id in profiles_by_doctor else None,
        )
        for doctor in doctors
    ]


@router.get("/availability", response_model=DisponibilidadResponse)
def get_availability(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    doctor_id: int = Query(..., description="Doctor cuya agenda se consulta"),
    fecha: date_type = Query(..., description="Día cuyas franjas se quieren, AAAA-MM-DD"),
    duration_minutes: int = Query(30, ge=5, le=480, description="Duración de la cita a encajar"),
    step_minutes: int = Query(PASO_POR_DEFECTO, ge=5, le=120, description="Cada cuánto se ofrece franja"),
    room_id: Optional[int] = Query(None, description="Sala concreta; sin ella, basta con que quede alguna libre"),
    exclude_appointment_id: Optional[int] = Query(
        None, description="Cita que se está editando: su propio hueco no debe contar como ocupado"
    ),
    incluir_mes: bool = Query(
        False, description="Añade la disponibilidad de todos los días del mes de `fecha`"
    ),
    tenant_id: Optional[int] = Query(None, description="Sucursal (sólo MASTER); por defecto, la propia"),
):
    """Qué horarios de un día (y opcionalmente qué días del mes) admiten cita.

    Es lo que sostiene la rejilla de "Horarios disponibles" y la leyenda
    "Disponible / No disponible" del modal de cita: sin esto la pantalla
    ofrecería horas que ``POST /appointments`` rechaza al guardar.

    Compone **las mismas cuatro reglas** que valida el servidor al agendar
    (empalme del doctor, bloqueos de agenda, horario de atención y choque de
    sala) y las citas canceladas no ocupan. Las horas van en hora local del
    consultorio, sin zona, igual que ``scheduled_at``.

    Dos matices que conviene saber:

    * Si el doctor no tiene horario de atención configurado ese día, el
      servidor no restringe nada; aquí se ofrece la jornada del consultorio
      (07:00-20:00) y se avisa con ``jornada_por_defecto``.
    * Las horas ya pasadas se devuelven como no disponibles aunque el servidor
      las aceptaría: no tiene sentido ofrecerlas en el modal.
    """
    alcance_tenant = tenant_id if (tenant_id and current_user.role == Role.MASTER) else current_user.tenant_id

    doctor = (
        scoped_query(db.query(User), User, current_user)
        .filter(User.id == doctor_id, User.role == Role.DOCTOR)
        .first()
    )
    if not doctor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró al doctor.")

    franjas, jornada_por_defecto = franjas_del_dia(
        db,
        doctor_id=doctor_id,
        tenant_id=alcance_tenant,
        dia=fecha,
        duracion_minutos=duration_minutes,
        paso_minutos=step_minutes,
        room_id=room_id,
        excluir_cita_id=exclude_appointment_id,
    )

    dias: list[DiaDisponible] = []
    if incluir_mes:
        dias = [
            DiaDisponible(fecha=d.fecha, disponible=d.disponible, huecos=d.huecos)
            for d in dias_del_mes(
                db,
                doctor_id=doctor_id,
                tenant_id=alcance_tenant,
                anio=fecha.year,
                mes=fecha.month,
                duracion_minutos=duration_minutes,
                paso_minutos=step_minutes,
                room_id=room_id,
                excluir_cita_id=exclude_appointment_id,
            )
        ]

    return DisponibilidadResponse(
        doctor_id=doctor_id,
        fecha=fecha,
        duration_minutes=duration_minutes,
        step_minutes=step_minutes,
        room_id=room_id,
        jornada_por_defecto=jornada_por_defecto,
        franjas=[
            FranjaDisponible(
                inicio=f.inicio,
                hora=f.hora,
                meridiano=f.meridiano,
                disponible=f.disponible,
                motivo=f.motivo,
            )
            for f in franjas
        ],
        dias=dias,
    )


def _resolve_target_doctor_id(current_user: User, doctor_id: Optional[int]) -> int:
    """A doctor manages their own schedule implicitly; Admin/Secretaria must
    pass doctor_id explicitly to manage someone else's."""
    if alcance_operativo_acotado(current_user):
        return current_user.id
    if doctor_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Elige primero el doctor cuya agenda quieres consultar.",
        )
    return doctor_id


@router.get("/working-hours", response_model=List[WorkingHoursResponse])
def list_working_hours(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    doctor_id: Optional[int] = Query(None, description="Required for non-doctor roles"),
):
    """List a doctor's recurring working-hours windows."""
    target_doctor_id = _resolve_target_doctor_id(current_user, doctor_id)
    return (
        scoped_query(db.query(DoctorWorkingHours), DoctorWorkingHours, current_user)
        .filter(DoctorWorkingHours.doctor_id == target_doctor_id)
        .order_by(DoctorWorkingHours.weekday, DoctorWorkingHours.start_time)
        .all()
    )


@router.post("/working-hours", response_model=WorkingHoursResponse, status_code=status.HTTP_201_CREATED)
def create_working_hours(
    data: WorkingHoursCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("schedule.working_hours"))],
    doctor_id: Optional[int] = Query(None, description="Required for Admin"),
):
    """Add a recurring working-hours window (Doctor manages their own; Admin can manage any doctor's)."""
    target_doctor_id = _resolve_target_doctor_id(current_user, doctor_id)

    entry = DoctorWorkingHours(
        tenant_id=current_user.tenant_id,
        doctor_id=target_doctor_id,
        weekday=data.weekday,
        start_time=data.start_time,
        end_time=data.end_time,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    log_action(
        db,
        action="working_hours.created",
        entity_type="doctor_working_hours",
        entity_id=entry.id,
        actor_user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        details={"doctor_id": target_doctor_id, "weekday": data.weekday},
    )

    return entry


@router.delete("/working-hours/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_working_hours(
    entry_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("schedule.working_hours"))],
):
    """Remove a working-hours window (Doctor can only remove their own; Admin any)."""
    entry = (
        scoped_query(db.query(DoctorWorkingHours), DoctorWorkingHours, current_user)
        .filter(DoctorWorkingHours.id == entry_id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró ese horario de atención. Puede que lo hayan eliminado; actualiza la pantalla de horarios.")

    exigir_agenda_propia(
        entry.doctor_id,
        current_user,
        detalle="No se encontró ese horario de atención. Puede que lo hayan eliminado; actualiza la pantalla de horarios.",
        status_code=status.HTTP_404_NOT_FOUND,
    )

    db.delete(entry)
    db.commit()


@router.get("/blocks", response_model=List[ScheduleBlockResponse])
def list_schedule_blocks(
    db: Annotated[Session, Depends(get_db)],
    # ``schedule.blocks.read`` ya existía y los tres roles lo traen; la lectura
    # simplemente no lo pedía (B-03).
    current_user: Annotated[User, Depends(require_permission("schedule.blocks.read"))],
    doctor_id: Optional[int] = Query(None, description="Required for non-doctor roles"),
):
    """List a doctor's one-off unavailability blocks."""
    target_doctor_id = _resolve_target_doctor_id(current_user, doctor_id)
    return (
        scoped_query(db.query(ScheduleBlock), ScheduleBlock, current_user)
        .filter(ScheduleBlock.doctor_id == target_doctor_id)
        .order_by(ScheduleBlock.start_at.desc())
        .all()
    )


@router.post("/blocks", response_model=ScheduleBlockResponse, status_code=status.HTTP_201_CREATED)
def create_schedule_block(
    data: ScheduleBlockCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("schedule.blocks"))],
):
    """Create a one-off unavailability block (vacation, personal appointment, etc.).

    A doctor may only block their own agenda; Secretaria/Admin can block any
    doctor's on their behalf (e.g. registering a doctor's reported absence).
    """
    exigir_agenda_propia(
        data.doctor_id,
        current_user,
        detalle="Cada doctor solo puede bloquear su propia agenda. Pídele el bloqueo a administración.",
    )

    doctor = (
        scoped_query(db.query(User), User, current_user)
        .filter(User.id == data.doctor_id, User.role == Role.DOCTOR)
        .first()
    )
    if not doctor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró al doctor. Actualiza la lista de doctores.")

    block = ScheduleBlock(
        tenant_id=current_user.tenant_id,
        doctor_id=data.doctor_id,
        start_at=data.start_at,
        end_at=data.end_at,
        reason=data.reason,
        created_by_user_id=current_user.id,
    )
    db.add(block)
    db.commit()
    db.refresh(block)

    log_action(
        db,
        action="schedule_block.created",
        entity_type="schedule_block",
        entity_id=block.id,
        actor_user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        details={"doctor_id": data.doctor_id, "start_at": str(data.start_at), "end_at": str(data.end_at)},
    )

    return block


@router.delete("/blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule_block(
    block_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("schedule.blocks"))],
):
    """Remove a schedule block (Doctor can only remove their own; Secretaria/Admin any)."""
    block = (
        scoped_query(db.query(ScheduleBlock), ScheduleBlock, current_user)
        .filter(ScheduleBlock.id == block_id)
        .first()
    )
    if not block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró ese bloqueo de agenda. Puede que ya lo hayan quitado; actualiza la pantalla.")

    exigir_agenda_propia(
        block.doctor_id,
        current_user,
        detalle="No se encontró ese bloqueo de agenda. Puede que ya lo hayan quitado; actualiza la pantalla.",
        status_code=status.HTTP_404_NOT_FOUND,
    )

    db.delete(block)
    db.commit()
