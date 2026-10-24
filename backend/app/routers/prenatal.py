"""Secure, auditable pregnancy and prenatal-visit endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.access_scope import (
    exigir_autoria_clinica,
    filtrar_por_autoria_clinica,
    resolver_paciente_de_su_duena,
)
from app.core.deps import get_db, require_permission
from app.core.tenant_scope import scoped_query
from app.db.session import utcnow
from app.models.acceso_clinico import SeccionClinica
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.pregnancy import Pregnancy, PregnancyStatus, PrenatalVisit
from app.models.user import User
from app.schemas.pregnancy import (
    PregnancyCreate,
    PregnancyPage,
    PregnancyResponse,
    PregnancyUpdate,
    PrenatalVisitCreate,
    PrenatalVisitPage,
    PrenatalVisitResponse,
    PrenatalVisitUpdate,
)
from app.services.audit_service import log_action
from app.services.bitacora_accesos import registrar_acceso

router = APIRouter(prefix="/prenatal", tags=["prenatal"])


def _patient_in_scope(db: Session, patient_id: int, user: User) -> Patient:
    # El control prenatal se acota a la dueña del expediente: el embarazo lo
    # lleva una titular, no el equipo tratante completo.
    return resolver_paciente_de_su_duena(
        db,
        patient_id,
        user,
        detalle_403="Solo puedes acceder a expedientes de tus pacientes",
    )


def _pregnancy_in_scope(db: Session, pregnancy_id: int, user: User) -> Pregnancy:
    pregnancy = (
        scoped_query(db.query(Pregnancy), Pregnancy, user)
        .filter(Pregnancy.id == pregnancy_id)
        .first()
    )
    if not pregnancy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el embarazo. Puede que lo hayan eliminado; actualiza el expediente.")
    _patient_in_scope(db, pregnancy.patient_id, user)
    exigir_autoria_clinica(
        pregnancy.doctor_id, user, detalle="Solo puedes acceder a embarazos bajo tu seguimiento"
    )
    return pregnancy


def _visit_in_scope(db: Session, visit_id: int, user: User) -> PrenatalVisit:
    visit = (
        scoped_query(db.query(PrenatalVisit), PrenatalVisit, user)
        .filter(PrenatalVisit.id == visit_id)
        .first()
    )
    if not visit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la visita prenatal. Puede que la hayan eliminado; actualiza el control prenatal."
        )
    _pregnancy_in_scope(db, visit.pregnancy_id, user)
    exigir_autoria_clinica(
        visit.doctor_id, user, detalle="Solo puedes acceder a visitas bajo tu seguimiento"
    )
    return visit


def _validate_appointment(
    db: Session, appointment_id: int | None, pregnancy: Pregnancy, user: User
) -> None:
    if appointment_id is None:
        return
    appointment = (
        scoped_query(db.query(Appointment), Appointment, user)
        .filter(Appointment.id == appointment_id)
        .first()
    )
    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la cita. Puede que la hayan eliminado; vuelve a la agenda y actualízala.")
    if appointment.patient_id != pregnancy.patient_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La cita no corresponde a la paciente del embarazo",
        )
    exigir_autoria_clinica(
        appointment.doctor_id, user, detalle="Solo puedes vincular citas asignadas a ti"
    )


def _registrar_ajuste_de_revision(
    pregnancy: Pregnancy, changes: dict, user: User
) -> None:
    """Deja constancia de quien movio la fecha de la proxima revision.

    Se compara contra la sugerida y no contra el valor anterior porque lo que
    interesa saber es si la doctora corrigio a la regla, no cuantas veces
    toco el campo. Si la fecha vuelve a coincidir con la sugerida, la marca
    de ajuste se borra: seguir diciendo que esta ajustada seria mentir.
    """
    if "next_review_on" not in changes and "next_review_suggested_on" not in changes:
        return
    if pregnancy.next_review_on is None:
        pregnancy.next_review_adjusted_by_user_id = None
        pregnancy.next_review_adjusted_at = None
        return
    if pregnancy.next_review_on == pregnancy.next_review_suggested_on:
        pregnancy.next_review_adjusted_by_user_id = None
        pregnancy.next_review_adjusted_at = None
        return
    pregnancy.next_review_adjusted_by_user_id = user.id
    pregnancy.next_review_adjusted_at = utcnow()

@router.get("/patient/{patient_id}/pregnancies", response_model=PregnancyPage)
def list_patient_pregnancies(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("prenatal.read"))],
    pregnancy_status: PregnancyStatus | None = Query(default=None, alias="status"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=30, ge=1, le=100),
) -> PregnancyPage:
    _patient_in_scope(db, patient_id, user)
    registrar_acceso(db, user, patient_id, SeccionClinica.EMBARAZO)
    query = scoped_query(db.query(Pregnancy), Pregnancy, user).filter(
        Pregnancy.patient_id == patient_id
    )
    query = filtrar_por_autoria_clinica(query, Pregnancy.doctor_id, user)
    if pregnancy_status:
        query = query.filter(Pregnancy.status == pregnancy_status.value)
    return PregnancyPage(
        items=query.order_by(Pregnancy.created_at.desc()).offset(skip).limit(limit).all(),
        total=query.count(),
    )


@router.post("/pregnancies", response_model=PregnancyResponse, status_code=status.HTTP_201_CREATED)
def create_pregnancy(
    data: PregnancyCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("prenatal.create"))],
) -> Pregnancy:
    patient = _patient_in_scope(db, data.patient_id, user)
    pregnancy = Pregnancy(tenant_id=patient.tenant_id, doctor_id=user.id, **data.model_dump())
    db.add(pregnancy)
    db.commit()
    db.refresh(pregnancy)
    log_action(
        db,
        action="pregnancy.created",
        entity_type="pregnancy",
        entity_id=pregnancy.id,
        actor_user_id=user.id,
        tenant_id=pregnancy.tenant_id,
        details={"patient_id": pregnancy.patient_id},
    )
    return pregnancy


@router.get("/pregnancies/{pregnancy_id}", response_model=PregnancyResponse)
def get_pregnancy(
    pregnancy_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("prenatal.read"))],
) -> Pregnancy:
    return _pregnancy_in_scope(db, pregnancy_id, user)


@router.patch("/pregnancies/{pregnancy_id}", response_model=PregnancyResponse)
def update_pregnancy(
    pregnancy_id: int,
    data: PregnancyUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("prenatal.update"))],
) -> Pregnancy:
    pregnancy = _pregnancy_in_scope(db, pregnancy_id, user)
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(pregnancy, field, value.value if isinstance(value, PregnancyStatus) else value)
    # El validador del schema solo ve el cuerpo del PATCH; la FUM casi nunca
    # viaja en el mismo envio, asi que la coherencia real se comprueba aqui,
    # contra lo que el embarazo ya tiene guardado.
    if (
        pregnancy.next_review_on
        and pregnancy.last_menstrual_period
        and pregnancy.next_review_on < pregnancy.last_menstrual_period
    ):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La próxima revisión no puede ser anterior a la fecha de última menstruación.",
        )
    _registrar_ajuste_de_revision(pregnancy, changes, user)
    db.commit()
    db.refresh(pregnancy)
    log_action(
        db,
        action="pregnancy.updated",
        entity_type="pregnancy",
        entity_id=pregnancy.id,
        actor_user_id=user.id,
        tenant_id=pregnancy.tenant_id,
        details={"changed_fields": sorted(changes.keys())},
    )
    return pregnancy


@router.get("/pregnancies/{pregnancy_id}/visits", response_model=PrenatalVisitPage)
def list_prenatal_visits(
    pregnancy_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("prenatal.read"))],
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=30, ge=1, le=100),
) -> PrenatalVisitPage:
    pregnancy = _pregnancy_in_scope(db, pregnancy_id, user)
    query = scoped_query(db.query(PrenatalVisit), PrenatalVisit, user).filter(
        PrenatalVisit.pregnancy_id == pregnancy.id
    )
    query = filtrar_por_autoria_clinica(query, PrenatalVisit.doctor_id, user)
    return PrenatalVisitPage(
        items=query.order_by(PrenatalVisit.visit_date.desc()).offset(skip).limit(limit).all(),
        total=query.count(),
    )


@router.post(
    "/pregnancies/{pregnancy_id}/visits",
    response_model=PrenatalVisitResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_prenatal_visit(
    pregnancy_id: int,
    data: PrenatalVisitCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("prenatal.create"))],
) -> PrenatalVisit:
    pregnancy = _pregnancy_in_scope(db, pregnancy_id, user)
    _validate_appointment(db, data.appointment_id, pregnancy, user)
    if (
        data.appointment_id
        and scoped_query(db.query(PrenatalVisit), PrenatalVisit, user)
        .filter(PrenatalVisit.appointment_id == data.appointment_id)
        .first()
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La cita ya tiene una visita prenatal registrada",
        )
    visit = PrenatalVisit(
        tenant_id=pregnancy.tenant_id,
        pregnancy_id=pregnancy.id,
        doctor_id=user.id,
        **data.model_dump(),
    )
    db.add(visit)
    db.commit()
    db.refresh(visit)
    log_action(
        db,
        action="prenatal_visit.created",
        entity_type="prenatal_visit",
        entity_id=visit.id,
        actor_user_id=user.id,
        tenant_id=visit.tenant_id,
        details={"pregnancy_id": visit.pregnancy_id, "appointment_id": visit.appointment_id},
    )
    return visit


@router.patch("/visits/{visit_id}", response_model=PrenatalVisitResponse)
def update_prenatal_visit(
    visit_id: int,
    data: PrenatalVisitUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission("prenatal.update"))],
) -> PrenatalVisit:
    visit = _visit_in_scope(db, visit_id, user)
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(visit, field, value)
    db.commit()
    db.refresh(visit)
    log_action(
        db,
        action="prenatal_visit.updated",
        entity_type="prenatal_visit",
        entity_id=visit.id,
        actor_user_id=user.id,
        tenant_id=visit.tenant_id,
        details={"changed_fields": sorted(changes.keys())},
    )
    return visit
