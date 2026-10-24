"""SOAP Notes router"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.access_scope import exigir_relacion_asistencial
from app.core.deps import get_db, require_permission
from app.core.tenant_scope import assert_owner, scoped_query
from app.models import SOAPNote, User
from app.models.acceso_clinico import SeccionClinica
from app.models.appointment import Appointment
from app.schemas.soap_note import SOAPNoteCreate, SOAPNoteResponse, SOAPNoteUpdate
from app.services.audit_service import log_action
from app.services.bitacora_accesos import registrar_acceso

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/soap-notes", tags=["soap-notes"])


@router.post("", response_model=SOAPNoteResponse, status_code=status.HTTP_201_CREATED)
def create_soap_note(
    *,
    db: Session = Depends(get_db),
    soap_note_in: SOAPNoteCreate,
    current_user: User = Depends(require_permission("soap_notes.create")),
) -> SOAPNote:
    """Create SOAP note for an appointment (doctor only)"""
    appointment = (
        scoped_query(db.query(Appointment), Appointment, current_user)
        .filter(Appointment.id == soap_note_in.appointment_id)
        .first()
    )
    if not appointment:
        raise HTTPException(status_code=404, detail="No se encontró la cita. Puede que la hayan eliminado; vuelve a la agenda y actualízala.")

    # El acceso se deriva de la relación con el paciente, no de quién agendó la
    # cita. Antes esto exigía ser el médico asignado, y como leer la nota sí
    # usaba la regla del paciente, quedaba un hueco absurdo: el médico que
    # cubre a otra podía abrir el expediente y emitir la receta, pero se topaba
    # con un 403 justo al escribir la nota de lo que acababa de atender.
    exigir_relacion_asistencial(db, appointment.patient_id, current_user)

    # Verify SOAP note doesn't already exist for this appointment
    existing = (
        scoped_query(db.query(SOAPNote), SOAPNote, current_user)
        .filter(SOAPNote.appointment_id == soap_note_in.appointment_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Esta cita ya tiene una nota de consulta. Abre la que ya existe para completarla.")

    try:
        # Create SOAP note
        db_soap_note = SOAPNote(
            **soap_note_in.model_dump(),
            doctor_id=current_user.id,
            tenant_id=current_user.tenant_id,
        )
        db.add(db_soap_note)
        db.commit()
        db.refresh(db_soap_note)
    except Exception as exc:
        # Se registra el error real antes de responder. Sin esto, el fallo que
        # impidio guardar notas durante casi dos meses nunca aparecio en los
        # registros: solo se veia el 500 generico, que no dice nada.
        logger.exception(
            "Fallo al guardar la nota de consulta de la cita %s", soap_note_in.appointment_id
        )
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="No se pudo guardar la nota de consulta. Vuelve a intentarlo; si sigue fallando, avisa al equipo de soporte.",
        ) from exc

    # Fuera del try a propósito: la nota ya quedó guardada, y si la bitácora
    # cayera dentro, su fallo se reportaría como «no se pudo guardar la nota»
    # y el médico la volvería a escribir sobre una que sí existe.
    log_action(
        db,
        action="soap_note.created",
        entity_type="soap_note",
        entity_id=db_soap_note.id,
        actor_user_id=current_user.id,
        tenant_id=db_soap_note.tenant_id,
        patient_id=appointment.patient_id,
        details={"appointment_id": appointment.id},
    )
    return db_soap_note


@router.get("/{soap_note_id}", response_model=SOAPNoteResponse)
def get_soap_note(
    *,
    db: Session = Depends(get_db),
    soap_note_id: int,
    current_user: User = Depends(require_permission("soap_notes.read")),
) -> SOAPNote:
    """Get SOAP note by ID"""
    soap_note = (
        scoped_query(db.query(SOAPNote), SOAPNote, current_user)
        .filter(SOAPNote.id == soap_note_id)
        .first()
    )
    if not soap_note:
        raise HTTPException(status_code=404, detail="No se encontró la nota de consulta. Puede que la hayan eliminado; actualiza la consulta.")

    exigir_relacion_asistencial(db, soap_note.appointment.patient_id, current_user)

    return soap_note


@router.get(
    "/appointment/{appointment_id}",
    response_model=SOAPNoteResponse,
    responses={
        204: {"description": "La cita existe y hay acceso, pero todavía no tiene nota de consulta"},
        403: {"description": "Sin relación asistencial activa con el paciente de la cita"},
        404: {"description": "No se encontró la cita"},
    },
)
def get_soap_note_by_appointment(
    *,
    db: Session = Depends(get_db),
    appointment_id: int,
    current_user: User = Depends(require_permission("soap_notes.read")),
) -> SOAPNote | Response:
    """Get SOAP note for a specific appointment.

    Los tres códigos son distintos a propósito: el cliente no puede adivinar
    por el texto del mensaje. 404 = la cita no existe, 403 = no hay acceso a la
    paciente, 204 = la cita existe pero aún no se documenta la nota.
    """
    # Verify appointment exists and belongs to user's tenant
    appointment = (
        scoped_query(db.query(Appointment), Appointment, current_user)
        .filter(Appointment.id == appointment_id)
        .first()
    )
    if not appointment:
        raise HTTPException(status_code=404, detail="No se encontró la cita. Puede que la hayan eliminado; vuelve a la agenda y actualízala.")

    # El 403 que levanta este helper tiene que llegar tal cual al cliente: si se
    # degradara a 404, la consulta se dibujaría como un formulario vacío y
    # editable encima de una nota que sí existe.
    exigir_relacion_asistencial(db, appointment.patient_id, current_user)

    # Get SOAP note
    soap_note = (
        scoped_query(db.query(SOAPNote), SOAPNote, current_user)
        .filter(SOAPNote.appointment_id == appointment_id)
        .first()
    )
    if not soap_note:
        # Ausencia confirmada, no fallo: el 404 de antes era indistinguible de
        # un problema de acceso o de un error, y el cliente los trataba igual.
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return soap_note


@router.put("/{soap_note_id}", response_model=SOAPNoteResponse)
def update_soap_note(
    *,
    db: Session = Depends(get_db),
    soap_note_id: int,
    soap_note_in: SOAPNoteUpdate,
    current_user: User = Depends(require_permission("soap_notes.update")),
) -> SOAPNote:
    """Update SOAP note (doctor only, only their own notes)"""
    soap_note = (
        scoped_query(db.query(SOAPNote), SOAPNote, current_user)
        .filter(SOAPNote.id == soap_note_id)
        .first()
    )
    if not soap_note:
        raise HTTPException(status_code=404, detail="No se encontró la nota de consulta. Puede que la hayan eliminado; actualiza la consulta.")

    assert_owner(soap_note.doctor_id, current_user, detail="Solo puedes modificar las notas de consulta que tú escribiste.")

    # Update fields
    update_data = soap_note_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(soap_note, field, value)

    db.add(soap_note)
    db.commit()
    db.refresh(soap_note)
    # Sólo los nombres de los campos: la bitácora dice quién tocó la nota y
    # qué apartados, sin volverse una segunda copia del expediente.
    log_action(
        db,
        action="soap_note.updated",
        entity_type="soap_note",
        entity_id=soap_note.id,
        actor_user_id=current_user.id,
        tenant_id=soap_note.tenant_id,
        patient_id=soap_note.appointment.patient_id,
        details={
            "appointment_id": soap_note.appointment_id,
            "changed_fields": sorted(update_data.keys()),
        },
    )
    return soap_note


@router.get("/patient/{patient_id}/all", response_model=list[SOAPNoteResponse])
def get_patient_soap_notes(
    *,
    db: Session = Depends(get_db),
    patient_id: int,
    current_user: User = Depends(require_permission("soap_notes.read")),
) -> list[SOAPNote]:
    """Get all SOAP notes for a specific patient (history)"""
    exigir_relacion_asistencial(db, patient_id, current_user)
    registrar_acceso(db, current_user, patient_id, SeccionClinica.CONSULTAS)
    soap_notes = (
        scoped_query(db.query(SOAPNote).join(Appointment), SOAPNote, current_user)
        .filter(Appointment.patient_id == patient_id)
        .order_by(SOAPNote.created_at.desc())
        .all()
    )
    return soap_notes
