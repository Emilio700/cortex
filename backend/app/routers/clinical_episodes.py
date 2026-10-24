"""Clinical record endpoints for gynecology episodes and follow-up."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.access_scope import resolver_paciente_de_su_duena
from app.core.deps import get_current_user, get_db, require_permission
from app.core.hora_local import hoy_local
from app.core.tenant_scope import scoped_query
from app.db.session import utcnow
from app.models.acceso_clinico import SeccionClinica
from app.models.appointment import Appointment, AppointmentStatus
from app.models.clinical_episode import ClinicalEpisode, ClinicalEpisodeStatus
from app.models.patient import Patient
from app.models.user import User
from app.schemas.clinical_episode import (
    ClinicalEpisodeCreate,
    ClinicalEpisodePage,
    ClinicalEpisodeResponse,
    ClinicalEpisodeUpdate,
    ClinicalRecordSummary,
)
from app.services.audit_service import log_action
from app.services.bitacora_accesos import registrar_acceso

router = APIRouter(prefix="/clinical-episodes", tags=["clinical-record"])


def _patient_in_scope(db: Session, patient_id: int, current_user: User) -> Patient:
    # El episodio ginecológico sigue la variante estrecha del alcance clínico:
    # sólo la dueña del expediente. Se delega en access_scope para que deje de
    # ser una decisión de este router.
    return resolver_paciente_de_su_duena(
        db,
        patient_id,
        current_user,
        detalle_403="Solo puedes acceder a expedientes de tus pacientes",
    )


def _episode_in_scope(db: Session, episode_id: int, current_user: User) -> ClinicalEpisode:
    episode = (
        scoped_query(db.query(ClinicalEpisode), ClinicalEpisode, current_user)
        .filter(ClinicalEpisode.id == episode_id)
        .first()
    )
    if not episode:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el episodio clínico. Puede que lo hayan eliminado; actualiza el expediente."
        )
    _patient_in_scope(db, episode.patient_id, current_user)
    return episode


@router.get("/patient/{patient_id}", response_model=ClinicalEpisodePage)
def list_patient_episodes(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_episodes.read"))],
    episode_status: Optional[ClinicalEpisodeStatus] = Query(default=None, alias="status"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=30, ge=1, le=100),
) -> ClinicalEpisodePage:
    """Return a paginated timeline of one authorized patient's episodes."""
    _patient_in_scope(db, patient_id, current_user)
    registrar_acceso(db, current_user, patient_id, SeccionClinica.EPISODIOS)
    query = scoped_query(db.query(ClinicalEpisode), ClinicalEpisode, current_user).filter(
        ClinicalEpisode.patient_id == patient_id
    )
    if episode_status:
        query = query.filter(ClinicalEpisode.status == episode_status.value)
    total = query.count()
    items = (
        query.order_by(
            ClinicalEpisode.follow_up_on.asc().nullslast(), ClinicalEpisode.started_on.desc()
        )
        .offset(skip)
        .limit(limit)
        .all()
    )
    return ClinicalEpisodePage(items=items, total=total)


@router.get("/patient/{patient_id}/summary", response_model=ClinicalRecordSummary)
def get_clinical_record_summary(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_episodes.read"))],
) -> ClinicalRecordSummary:
    """Provide the compact, safe-to-render summary used by the doctor workspace."""
    _patient_in_scope(db, patient_id, current_user)
    registrar_acceso(db, current_user, patient_id, SeccionClinica.EPISODIOS)
    base = scoped_query(db.query(ClinicalEpisode), ClinicalEpisode, current_user).filter(
        ClinicalEpisode.patient_id == patient_id
    )
    active = base.filter(
        ClinicalEpisode.status.in_(
            [ClinicalEpisodeStatus.ACTIVE.value, ClinicalEpisodeStatus.MONITORING.value]
        )
    )
    active_episodes = (
        active.order_by(
            ClinicalEpisode.follow_up_on.asc().nullslast(), ClinicalEpisode.updated_at.desc()
        )
        .limit(8)
        .all()
    )
    open_follow_ups = active.filter(ClinicalEpisode.follow_up_on.isnot(None)).count()
    appointment_base = scoped_query(db.query(Appointment), Appointment, current_user).filter(
        Appointment.patient_id == patient_id
    )
    now = utcnow()
    last_appointment = (
        appointment_base.filter(Appointment.scheduled_at <= now)
        .order_by(Appointment.scheduled_at.desc())
        .first()
    )
    next_appointment = (
        appointment_base.filter(
            Appointment.scheduled_at >= now,
            Appointment.status.in_(
                [
                    AppointmentStatus.AGENDADA,
                    AppointmentStatus.CONFIRMADA,
                    AppointmentStatus.EN_SALA,
                    AppointmentStatus.EN_CONSULTA,
                ]
            ),
        )
        .order_by(Appointment.scheduled_at.asc())
        .first()
    )
    return ClinicalRecordSummary(
        patient_id=patient_id,
        active_episodes=active_episodes,
        last_appointment_at=last_appointment.scheduled_at if last_appointment else None,
        next_appointment_at=next_appointment.scheduled_at if next_appointment else None,
        open_follow_ups=open_follow_ups,
    )


@router.post("", response_model=ClinicalEpisodeResponse, status_code=status.HTTP_201_CREATED)
def create_clinical_episode(
    data: ClinicalEpisodeCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_episodes.create"))],
) -> ClinicalEpisode:
    """Open a patient-specific episode. Clinical labels never imply a diagnosis."""
    patient = _patient_in_scope(db, data.patient_id, current_user)
    episode = ClinicalEpisode(
        # A MASTER user may operate across tenants; the episode must always
        # inherit the patient's tenant rather than the actor's home tenant.
        tenant_id=patient.tenant_id,
        created_by_user_id=current_user.id,
        **data.model_dump(),
    )
    db.add(episode)
    db.commit()
    db.refresh(episode)
    log_action(
        db,
        action="clinical_episode.created",
        entity_type="clinical_episode",
        entity_id=episode.id,
        actor_user_id=current_user.id,
        tenant_id=episode.tenant_id,
        details={"patient_id": episode.patient_id, "episode_type": episode.episode_type},
    )
    return episode


@router.patch("/{episode_id}", response_model=ClinicalEpisodeResponse)
def update_clinical_episode(
    episode_id: int,
    data: ClinicalEpisodeUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_episodes.update"))],
) -> ClinicalEpisode:
    """Update follow-up details while preserving an audit event."""
    episode = _episode_in_scope(db, episode_id, current_user)
    changes = data.model_dump(exclude_unset=True)
    if (
        changes.get("status") in {ClinicalEpisodeStatus.RESOLVED, ClinicalEpisodeStatus.ARCHIVED}
        and "resolved_on" not in changes
    ):
        # El día del consultorio, no el del contenedor (UTC): el episodio que
        # se cerraba después de las 17:00 quedaba resuelto "mañana".
        changes["resolved_on"] = hoy_local()
    for field, value in changes.items():
        setattr(episode, field, value.value if isinstance(value, ClinicalEpisodeStatus) else value)
    db.commit()
    db.refresh(episode)
    log_action(
        db,
        action="clinical_episode.updated",
        entity_type="clinical_episode",
        entity_id=episode.id,
        actor_user_id=current_user.id,
        tenant_id=episode.tenant_id,
        details={"changed_fields": sorted(changes.keys())},
    )
    return episode
