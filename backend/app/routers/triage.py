"""Tr iage router - Vital signs management"""
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.access_scope import (
    alcance_clinico_acotado,
    alcance_operativo_acotado,
    exigir_relacion_asistencial,
)
from app.core.deps import get_current_user, get_db, require_permission
from app.core.tenant_scope import scoped_query
from app.models.acceso_clinico import SeccionClinica
from app.models.appointment import Appointment
from app.models.triage import Triage
from app.models.user import Role, User
from app.schemas.triage import TriageCreate, TriageResponse, TriageUpdate
from app.services.audit_service import log_action
from app.services.bitacora_accesos import registrar_acceso
from app.services.triage_service import calculate_bmi

router = APIRouter(prefix="/triage", tags=["Triage"])


def _exigir_alcance_de_captura(db: Session, patient_id: int, user: User) -> None:
    """El médico captura signos sólo de sus pacientes; recepción, de la clínica.

    Recepción toma signos de todas las citas de su sucursal y así se queda. La
    doctora los toma cuando nadie lo hizo en la sala de espera, dentro de la
    consulta, y ahí rige la misma regla que la nota de esa consulta: si no
    puede escribir la nota, tampoco los signos que van con ella.
    """
    if alcance_operativo_acotado(user):
        exigir_relacion_asistencial(db, patient_id, user)


def _exigir_alcance_de_lectura(db: Session, patient_id: int, user: User) -> None:
    """Leer los signos pide lo mismo que leer la nota de esa consulta.

    Antes bastaba con ser del mismo tenant, así que cualquier doctora de la
    sucursal podía abrir el historial de signos de un paciente ajena aunque
    su nota le diera 403. Se acota por el eje clínico (es lectura del
    expediente) y sólo a quien lo tiene acotado: recepción toma los signos de
    toda la sucursal y tiene que poder volver a abrirlos para corregirlos, así
    que ella, administración y master leen como antes.
    """
    if alcance_clinico_acotado(user):
        exigir_relacion_asistencial(db, patient_id, user)


@router.post("", response_model=TriageResponse, status_code=status.HTTP_201_CREATED)
def create_triage(
    triage_data: TriageCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("triage.create"))],
):
    """
    Create triage for appointment (recepción, o el médico desde la consulta)

    Validates:
    - Appointment exists and belongs to current tenant
    - No existing triage for this appointment
    """
    # Verify appointment exists and belongs to tenant
    appointment = (
        scoped_query(db.query(Appointment), Appointment, current_user)
        .filter(Appointment.id == triage_data.appointment_id)
        .first()
    )

    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la cita. Puede que la hayan eliminado; vuelve a la agenda y actualízala.")

    _exigir_alcance_de_captura(db, appointment.patient_id, current_user)

    # Check if triage already exists
    existing_triage = db.query(Triage).filter(Triage.appointment_id == triage_data.appointment_id).first()

    if existing_triage:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Esta cita ya tiene signos vitales registrados. Abre los que ya existen y corrígelos ahí, en lugar de capturarlos otra vez.")

    # Create triage
    triage_dict = triage_data.model_dump(exclude={"appointment_id"})
    new_triage = Triage(appointment_id=triage_data.appointment_id, created_by_user_id=current_user.id, **triage_dict)

    db.add(new_triage)
    db.commit()
    db.refresh(new_triage)
    # El registro dice quién tomó los signos: recepción en la sala de espera o
    # el médico dentro de la consulta. Sin él no hay forma de saberlo después.
    log_action(
        db,
        action="triage.created",
        entity_type="triage",
        entity_id=new_triage.id,
        actor_user_id=current_user.id,
        tenant_id=appointment.tenant_id,
        patient_id=appointment.patient_id,
        details={"appointment_id": appointment.id},
    )

    # Build response with calculated BMI
    response = TriageResponse.model_validate(new_triage)
    response.bmi = calculate_bmi(new_triage.weight_kg, new_triage.height_cm)

    return response


@router.get(
    "/appointment/{appointment_id}",
    response_model=TriageResponse,
    responses={
        204: {"description": "La cita existe, pero todavía no tiene signos vitales registrados"},
        404: {"description": "No se encontró la cita"},
    },
)
def get_triage_by_appointment(
    appointment_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("triage.read"))],
):
    """Signos vitales de una cita.

    Mismo contrato que el resto de las lecturas del expediente: 404 = la cita
    no existe, 204 = la cita existe pero nadie le ha tomado los signos. Este
    endpoint era el último que contestaba 404 para las dos cosas, y el cliente
    tenía que traducirlo antes de clasificarlo: una inconsistencia del servidor
    tapada desde el navegador.
    """
    # Verify appointment belongs to tenant
    appointment = scoped_query(db.query(Appointment), Appointment, current_user).filter(Appointment.id == appointment_id).first()

    if not appointment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la cita. Puede que la hayan eliminado; vuelve a la agenda y actualízala.")

    # Antes de mirar si hay signos: con el 204 primero, un médico ajeno podría
    # enterarse de si al paciente ya la pasaron por triage.
    _exigir_alcance_de_lectura(db, appointment.patient_id, current_user)

    triage = db.query(Triage).filter(Triage.appointment_id == appointment_id).first()

    if not triage:
        # Ausencia confirmada, no fallo. Con 404 era indistinguible de "la cita
        # no existe", y la consulta se dibujaba sin presión ni peso igual que si
        # la lectura se hubiera caído.
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # Build response with calculated BMI
    response = TriageResponse.model_validate(triage)
    response.bmi = calculate_bmi(triage.weight_kg, triage.height_cm)

    return response


@router.put("/{triage_id}", response_model=TriageResponse)
def update_triage(
    triage_id: int,
    triage_data: TriageUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("triage.create"))],
):
    """Update existing triage (recepción, o el médico desde la consulta)"""
    triage = scoped_query(db.query(Triage).join(Appointment), Appointment, current_user).filter(Triage.id == triage_id).first()

    if not triage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontraron los signos vitales. Puede que los hayan eliminado; actualiza la cita.")

    _exigir_alcance_de_captura(db, triage.appointment.patient_id, current_user)

    # Update fields
    update_data = triage_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(triage, field, value)

    db.commit()
    db.refresh(triage)
    log_action(
        db,
        action="triage.updated",
        entity_type="triage",
        entity_id=triage.id,
        actor_user_id=current_user.id,
        tenant_id=triage.appointment.tenant_id,
        patient_id=triage.appointment.patient_id,
        details={
            "appointment_id": triage.appointment_id,
            "changed_fields": sorted(update_data.keys()),
        },
    )

    # Build response with calculated BMI
    response = TriageResponse.model_validate(triage)
    response.bmi = calculate_bmi(triage.weight_kg, triage.height_cm)

    return response


@router.get("/patient/{patient_id}/all", response_model=List[TriageResponse])
def get_patient_triage_history(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("triage.read"))],
):
    """Get all triage records for a specific patient (history)"""
    _exigir_alcance_de_lectura(db, patient_id, current_user)
    registrar_acceso(db, current_user, patient_id, SeccionClinica.CONSULTAS)
    triages = (
        scoped_query(db.query(Triage).join(Appointment), Appointment, current_user)
        .filter(Appointment.patient_id == patient_id)
        .order_by(Triage.created_at.desc())
        .all()
    )

    # Calculate BMI for each record
    results = []
    for triage in triages:
        response = TriageResponse.model_validate(triage)
        response.bmi = calculate_bmi(triage.weight_kg, triage.height_cm)
        results.append(response)

    return results
