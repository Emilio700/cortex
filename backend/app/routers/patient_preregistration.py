"""Patient preregistration / intake router (Fase 6.4 - multiespecialidad)"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_db, require_permission
from app.core.tenant_scope import scoped_query
from app.models.patient import Patient
from app.models.patient_preregistration import PatientPreregistration, PreregistrationStatus
from app.models.user import User
from app.schemas.patient import PatientResponse
from app.schemas.patient_preregistration import (
    ConvertToPatientRequest,
    PreregistrationCreate,
    PreregistrationResponse,
    PreregistrationUpdate,
)
from app.services.audit_service import log_action

router = APIRouter(prefix="/patient-preregistrations", tags=["patient-preregistrations"])


@router.get("", response_model=list[PreregistrationResponse])
def list_preregistrations(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("preregistration.read"))],
    status_filter: PreregistrationStatus | None = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """List intake entries for the caller's tenant, optionally filtered by status."""
    query = scoped_query(
        db.query(PatientPreregistration), PatientPreregistration, current_user
    ).options(joinedload(PatientPreregistration.specialty))
    if status_filter:
        query = query.filter(PatientPreregistration.status == status_filter)
    return query.order_by(PatientPreregistration.created_at.desc()).offset(skip).limit(limit).all()


@router.post("", response_model=PreregistrationResponse, status_code=status.HTTP_201_CREATED)
def create_preregistration(
    data: PreregistrationCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("preregistration.create"))],
):
    """Capture a new intake entry (Secretaria/Admin only - no patient-facing
    portal exists in G.E.M.S yet, this is staff-entered at first contact)."""
    entry = PatientPreregistration(
        tenant_id=current_user.tenant_id,
        full_name=data.full_name,
        phone=data.phone,
        email=data.email,
        specialty_id=data.specialty_id,
        reason=data.reason,
        created_by_user_id=current_user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    log_action(
        db,
        action="preregistration.created",
        entity_type="patient_preregistration",
        entity_id=entry.id,
        actor_user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        details={"full_name": entry.full_name},
    )

    return entry


@router.patch("/{preregistration_id}", response_model=PreregistrationResponse)
def update_preregistration(
    preregistration_id: int,
    data: PreregistrationUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("preregistration.update"))],
):
    """Update an intake entry's data or status (e.g. mark as contacted/discarded)."""
    entry = (
        scoped_query(db.query(PatientPreregistration), PatientPreregistration, current_user)
        .filter(PatientPreregistration.id == preregistration_id)
        .first()
    )
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el prerregistro. Puede que ya lo hayan convertido o eliminado; actualiza la lista."
        )

    if entry.status == PreregistrationStatus.CONVERTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este prerregistro ya se convirtió en expediente. Haz los cambios en el expediente de la paciente.",
        )

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(entry, field, value)

    db.commit()
    db.refresh(entry)
    return entry


@router.post(
    "/{preregistration_id}/convert",
    response_model=PatientResponse,
    status_code=status.HTTP_201_CREATED,
)
def convert_to_patient(
    preregistration_id: int,
    data: ConvertToPatientRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("preregistration.convert"))],
):
    """Turn an intake entry into a real Patient record, splitting the full
    name into first/last on the first space (best-effort - staff can fix it
    afterward from the patient's own edit form, same as any manual entry)."""
    entry = (
        scoped_query(db.query(PatientPreregistration), PatientPreregistration, current_user)
        .filter(PatientPreregistration.id == preregistration_id)
        .first()
    )
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró el prerregistro. Puede que ya lo hayan convertido o eliminado; actualiza la lista."
        )

    if entry.status == PreregistrationStatus.CONVERTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este prerregistro ya se convirtió en expediente. Busca a la paciente en la lista de pacientes.",
        )

    name_parts = entry.full_name.strip().split(" ", 1)
    first_name = name_parts[0]
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    patient = Patient(
        tenant_id=current_user.tenant_id,
        first_name=first_name,
        last_name=last_name,
        date_of_birth=data.date_of_birth,
        gender=data.gender,
        phone=entry.phone,
        email=entry.email,
        address=data.address,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)

    entry.status = PreregistrationStatus.CONVERTED
    entry.converted_patient_id = patient.id
    db.commit()

    log_action(
        db,
        action="preregistration.converted",
        entity_type="patient_preregistration",
        entity_id=entry.id,
        actor_user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        details={"patient_id": patient.id},
    )

    return patient
