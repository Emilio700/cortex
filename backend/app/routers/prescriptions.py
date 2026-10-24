"""Prescriptions router"""

import json
import logging
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.access_scope import resolver_paciente_con_relacion_asistencial
from app.core.deps import get_db, require_permission
from app.core.tenant_scope import assert_owner, scoped_query
from app.db.session import utcnow
from app.models import DoctorProfile, Prescription, Triage, User
from app.models.acceso_clinico import SeccionClinica
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.schemas.prescription import PrescriptionCreate, PrescriptionResponse, PrescriptionUpdate
from app.services.audit_service import log_action
from app.services.bitacora_accesos import registrar_acceso
from app.services.email_service import send_email
from app.services.email_templates import get_clinic_info
from app.services.email_templates import prescription_email as rx_tmpl
from app.services.folio_service import generate_prescription_folio, guardar_con_folio
from app.services.specialty_service import get_default_specialty_id

router = APIRouter(prefix="/prescriptions", tags=["prescriptions"])

logger = logging.getLogger(__name__)

# Ventana dentro de la cual un segundo POST con el MISMO contenido se toma por
# reenvío y no por una receta nueva. Cinco minutos cubren lo que se vio en
# producción —dos recetas idénticas con un minuto de diferencia, la segunda
# creada al confirmar la impresión— y el reintento tras un error de red que en
# realidad sí llegó. Más allá de eso ya no es un reenvío: es la doctora
# volviendo a la consulta, y ahí su decisión manda.
VENTANA_DE_REENVIO = timedelta(minutes=5)


def _patient_in_scope(db: Session, patient_id: int, current_user: User) -> Patient:
    """Resuelve a la paciente aplicando la MISMA regla clínica que la nota de consulta.

    Antes se exigía ser la dueña de la paciente. Con tres doctoras que se cubren
    entre ellas, la que atendía la consulta veía la nota (que usa el helper
    canónico) y recibía 403 en las recetas, así que la sección se le dibujaba
    vacía sin explicación. Los roles no clínicos conservan su alcance por
    clínica: homologar la regla de la doctora no es motivo para tocar el acceso
    de recepción ni el de administración.
    """
    return resolver_paciente_con_relacion_asistencial(db, patient_id, current_user)


def _appointment_in_scope(db: Session, appointment_id: int, current_user: User) -> Appointment:
    """El acceso a la cita se deriva del acceso a la paciente, no de quién la agendó.

    Que la secretaria haya agendado con otra doctora no dice nada sobre quién
    puede atender: la relación asistencial con la paciente es la que manda.
    """
    appointment = (
        scoped_query(db.query(Appointment), Appointment, current_user)
        .filter(Appointment.id == appointment_id)
        .first()
    )
    if not appointment:
        raise HTTPException(status_code=404, detail="No se encontró la cita. Puede que la hayan eliminado; vuelve a la agenda y actualízala.")
    _patient_in_scope(db, appointment.patient_id, current_user)
    return appointment


def _prescription_in_scope(
    db: Session, prescription_id: int, current_user: User
) -> Prescription:
    """Leer la receta depende de la paciente; modificarla sigue dependiendo de quién la firmó.

    Por eso aquí ya no se exige ser la doctora que la emitió: la que cubre la
    consulta necesita poder verla y reimprimirla. ``update_prescription``
    conserva su propio ``assert_owner``, que es otra cosa: nadie edita un
    documento firmado por alguien más.
    """
    prescription = (
        scoped_query(db.query(Prescription), Prescription, current_user)
        .filter(Prescription.id == prescription_id)
        .first()
    )
    if not prescription:
        raise HTTPException(status_code=404, detail="No se encontró la receta. Puede que la hayan eliminado; actualiza el expediente.")
    _patient_in_scope(db, prescription.patient_id, current_user)
    return prescription


def _normalizar(valor: Any) -> Any:
    """Forma canónica de un valor del JSON de medicamentos.

    Se compara por CONTENIDO y no por el texto crudo: el mismo medicamento
    enviado dos veces puede serializarse con las llaves en otro orden, con
    espacios de más o con una llave opcional ausente en un envío y vacía en el
    otro. Nada de eso hace distinta a la receta. Es el mismo criterio de
    ``scripts/reporte_recetas_duplicadas.py``, a propósito: lo que aquí se
    rechaza tiene que ser lo mismo que aquel reporte cuenta como duplicado.
    """
    if isinstance(valor, dict):
        canonico = {}
        for llave, contenido in valor.items():
            normalizado = _normalizar(contenido)
            # Una llave con valor vacío es lo mismo que la llave ausente.
            if normalizado in (None, "", [], {}):
                continue
            canonico[str(llave).strip().casefold()] = normalizado
        return canonico
    if isinstance(valor, list):
        return [_normalizar(elemento) for elemento in valor]
    if isinstance(valor, str):
        return " ".join(valor.split()).casefold()
    return valor


def _huella_de_receta(medications: Any, instructions: Any, diagnosis: Any = None) -> tuple:
    """Huella de contenido: medicamentos como CONJUNTO, indicaciones y motivo.

    El orden de la lista no tiene significado clínico —no es una secuencia de
    administración, es el orden en que se tecleó—, así que se ordenan las
    huellas de cada medicamento. Se ordenan las huellas y no el conjunto para
    que repetir dos veces el mismo fármaco siga siendo distinto de listarlo una.

    El motivo entra en la huella: encenderlo despues de guardar y volver a
    guardar NO es un reenvio, es un cambio, y tiene que guardarse. Si no
    estuviera aqui, el alta devolveria la receta anterior —sin el motivo— y la
    pantalla diria que si se guardo.
    """
    normalizados = _normalizar(medications or [])
    if isinstance(normalizados, list):
        huellas = sorted(json.dumps(m, sort_keys=True, ensure_ascii=False) for m in normalizados)
    else:  # defensivo: un cliente podría mandar algo que no sea lista
        huellas = [json.dumps(normalizados, sort_keys=True, ensure_ascii=False)]
    return (
        json.dumps(huellas, sort_keys=True, ensure_ascii=False),
        _normalizar(instructions or ""),
        _normalizar(diagnosis or ""),
    )


def _receta_ya_emitida(
    db: Session, prescription_in: PrescriptionCreate, current_user: User
) -> Prescription | None:
    """Devuelve la receta idéntica reciente de esta misma consulta, si la hay.

    Se compara en Python y no en SQL porque ``medications`` es JSON y su texto
    crudo no es comparable entre motores ni entre dos envíos del mismo
    formulario. Son a lo sumo un puñado de filas: las de una consulta.

    Deliberadamente NO se pone una restricción única en la tabla. Dos recetas
    DISTINTAS en la misma consulta son clínicamente válidas —la interfaz ya las
    rotula "Receta 1 de 2"— y un falso positivo aquí le negaría a la doctora una
    receta legítima a media consulta. Se exige que coincida todo: la cita, la
    doctora, los medicamentos, las indicaciones, el motivo y que esté dentro de
    la ventana.
    """
    huella = _huella_de_receta(
        prescription_in.medications, prescription_in.instructions, prescription_in.diagnosis
    )
    candidatas = (
        db.query(Prescription)
        .filter(
            Prescription.tenant_id == current_user.tenant_id,
            Prescription.appointment_id == prescription_in.appointment_id,
            Prescription.doctor_id == current_user.id,
            Prescription.created_at >= utcnow() - VENTANA_DE_REENVIO,
        )
        # La más antigua primero: si ya hubo un duplicado, el que se conserva es
        # el primero, igual que en la limpieza de los datos que ya están en PROD.
        .order_by(Prescription.created_at, Prescription.id)
        .all()
    )
    for candidata in candidatas:
        if (
            _huella_de_receta(
                candidata.medications, candidata.instructions, candidata.diagnosis
            )
            == huella
        ):
            return candidata
    return None


def _get_or_create_doctor_profile(db: Session, user_id: int) -> DoctorProfile:
    """Resolve a DoctorProfile for the given user, creating a fallback if needed."""
    profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == user_id).first()
    if not profile:
        profile = DoctorProfile(
            user_id=user_id,
            specialty_id=get_default_specialty_id(db),
            professional_id="SIN-CEDULA",
            university="Universidad no registrada",
        )
        try:
            db.add(profile)
            db.commit()
            db.refresh(profile)
        except Exception as exc:
            logger.exception("No se pudo crear el perfil de doctor por omision para la receta")
            raise HTTPException(status_code=500, detail="No se pudo preparar tu perfil de doctor para la receta. Complétalo en Mi Perfil e inténtalo de nuevo.") from exc
    # Ensure user relationship is loaded
    if not getattr(profile, "user", None):
        profile.user = db.query(User).filter(User.id == user_id).first()
    return profile


def _build_prescription_pdf(db: Session, prescription: Prescription, watermark_text: str = "") -> tuple[bytes, Patient]:
    """Shared setup for both the download and send-by-email endpoints:
    resolve doctor profile, patient, triage, and SOAP note, then render the PDF."""
    from app.models.soap_note import SOAPNote
    from app.utils.pdf import generate_prescription_pdf

    doctor_profile = _get_or_create_doctor_profile(db, prescription.doctor_id)

    patient = db.query(Patient).filter(Patient.id == prescription.patient_id).first()
    triage = db.query(Triage).filter(Triage.appointment_id == prescription.appointment_id).first()
    soap_note = db.query(SOAPNote).filter(SOAPNote.appointment_id == prescription.appointment_id).first()

    pdf_buffer = generate_prescription_pdf(prescription, doctor_profile, patient, triage, soap_note=soap_note, watermark_text=watermark_text)
    return pdf_buffer.read(), patient


@router.post("", response_model=PrescriptionResponse, status_code=status.HTTP_201_CREATED)
def create_prescription(
    *,
    db: Session = Depends(get_db),
    prescription_in: PrescriptionCreate,
    current_user: User = Depends(require_permission("prescriptions.create")),
) -> Prescription:
    """Create prescription for a patient (doctor only)"""
    # Verify appointment exists and belongs to current doctor
    appointment = _appointment_in_scope(db, prescription_in.appointment_id, current_user)
    patient = _patient_in_scope(db, prescription_in.patient_id, current_user)
    if appointment.patient_id != patient.id:
        raise HTTPException(status_code=422, detail="La consulta no corresponde a la paciente")

    # Reenvío del mismo contenido: se devuelve la receta que ya existe en vez de
    # crear otra. No es un error —el cliente pidió algo que ya está hecho— así
    # que responde igual que un alta normal y la doctora se queda con el folio
    # que ya tenía en pantalla, en vez de con dos folios del mismo tratamiento.
    ya_emitida = _receta_ya_emitida(db, prescription_in, current_user)
    if ya_emitida:
        return ya_emitida

    try:
        db_prescription = guardar_con_folio(
            db,
            generar_folio=lambda: generate_prescription_folio(
                db, current_user.tenant_id, user_id=current_user.id, patient_id=prescription_in.patient_id
            ),
            construir=lambda folio: Prescription(
                **prescription_in.model_dump(),
                doctor_id=current_user.id,
                tenant_id=current_user.tenant_id,
                folio_number=folio,
            ),
        )
        return db_prescription
    except Exception as exc:
        logger.exception("No se pudo crear la receta")
        db.rollback()
        raise HTTPException(status_code=500, detail="No se pudo guardar la receta. Inténtalo de nuevo; si vuelve a fallar, avisa al equipo de soporte.") from exc


@router.post("/preview")
def preview_prescription_pdf(
    *,
    db: Session = Depends(get_db),
    prescription_in: PrescriptionCreate,
    current_user: User = Depends(require_permission("prescriptions.create")),
):
    """Generate a preview PDF for a prescription (in-memory)"""
    from dataclasses import dataclass
    from datetime import datetime
    from typing import Any

    from fastapi.responses import StreamingResponse

    from app.models import Triage
    from app.utils.pdf import generate_prescription_pdf

    try:
        # Mock object to mimic SQLAlchemy model structure for the PDF generator
        @dataclass
        class MockPrescription:
            id: str
            created_at: datetime
            medications: list[Any]
            instructions: str | None

        appointment = _appointment_in_scope(db, prescription_in.appointment_id, current_user)
        patient = _patient_in_scope(db, prescription_in.patient_id, current_user)
        if appointment.patient_id != patient.id:
            raise HTTPException(status_code=422, detail="La consulta no corresponde a la paciente")

        # Get Doctor Profile (reuses fallback helper)
        doctor_profile = _get_or_create_doctor_profile(db, current_user.id)

        # Get Triage if available (for vitals)
        triage = db.query(Triage).filter(Triage.appointment_id == prescription_in.appointment_id).first()

        # Get SOAP note if available (for printing S/O/A/P on the prescription)
        from app.models.soap_note import SOAPNote
        soap_note = db.query(SOAPNote).filter(SOAPNote.appointment_id == prescription_in.appointment_id).first()

        # Validate and convert medications to dicts
        medications_data = []
        for med in prescription_in.medications:
            if isinstance(med, dict):
                medications_data.append(med)
            else:
                medications_data.append(med.model_dump())

        # Create mock prescription object
        mock_prescription = MockPrescription(
            id="PREVIEW",
            # En UTC, como una receta guardada: el PDF la pasa a la hora de
            # Mazatlán. Antes se mandaba ya en hora local y, cuando el PDF
            # empezó a convertir (plan 26, D-12), se habría movido dos veces.
            created_at=utcnow(),
            medications=medications_data,
            instructions=prescription_in.instructions
        )

        # Generate PDF
        pdf_buffer = generate_prescription_pdf(mock_prescription, doctor_profile, patient, triage, soap_note=soap_note)

        headers = {
            'Content-Disposition': 'inline; filename="preview.pdf"'
        }

        return StreamingResponse(pdf_buffer, media_type="application/pdf", headers=headers)

    except Exception as exc:
        logger.exception("No se pudo generar la vista previa del PDF de la receta")
        raise HTTPException(status_code=500, detail="No se pudo generar el PDF de la receta. Inténtalo de nuevo; si vuelve a fallar, avisa al equipo de soporte.") from exc


@router.get("/{prescription_id}", response_model=PrescriptionResponse)
def get_prescription(
    *,
    db: Session = Depends(get_db),
    prescription_id: int,
    current_user: User = Depends(require_permission("prescriptions.read")),
) -> Prescription:
    """Get prescription by ID"""
    return _prescription_in_scope(db, prescription_id, current_user)


@router.get("/{prescription_id}/pdf")
def generate_prescription_pdf_endpoint(
    *,
    db: Session = Depends(get_db),
    prescription_id: int,
    current_user: User = Depends(require_permission("prescriptions.read")),
):
    """Generate and download prescription PDF"""
    from io import BytesIO

    from fastapi.responses import StreamingResponse

    prescription = _prescription_in_scope(db, prescription_id, current_user)

    pdf_bytes, patient = _build_prescription_pdf(db, prescription)

    headers = {
        'Content-Disposition': f'attachment; filename="Receta_{patient.first_name}_{prescription.created_at.strftime("%Y%m%d")}.pdf"'
    }

    log_action(
        db,
        action="prescription.downloaded",
        entity_type="prescription",
        entity_id=prescription.id,
        actor_user_id=current_user.id,
        tenant_id=prescription.tenant_id,
        details={"patient_id": prescription.patient_id},
    )

    return StreamingResponse(BytesIO(pdf_bytes), media_type="application/pdf", headers=headers)


@router.post("/{prescription_id}/send-email", status_code=status.HTTP_200_OK)
def send_prescription_email(
    *,
    db: Session = Depends(get_db),
    prescription_id: int,
    current_user: User = Depends(require_permission("prescriptions.send_email")),
):
    """Email the prescription PDF to the patient's registered email address."""
    prescription = _prescription_in_scope(db, prescription_id, current_user)

    pdf_bytes, patient = _build_prescription_pdf(db, prescription, watermark_text="COPIA NO OFICIAL")

    if not patient.email:
        raise HTTPException(status_code=400, detail="El paciente no tiene un correo registrado")

    clinic = get_clinic_info(db, user_id=prescription.doctor_id, tenant_id=prescription.tenant_id)
    date_str = prescription.created_at.strftime('%d/%m/%Y')
    body_text = f"Hola {patient.first_name}, adjuntamos tu receta médica generada el {date_str}."
    body_html = rx_tmpl(clinic, patient.first_name, date_str)
    sent = send_email(
        to_email=patient.email,
        subject="Tu receta médica",
        body_text=body_text,
        body_html=body_html,
        attachment_bytes=pdf_bytes,
        attachment_filename=f"Receta_{patient.first_name}_{prescription.created_at.strftime('%Y%m%d')}.pdf",
    )

    if not sent:
        raise HTTPException(status_code=502, detail="No se pudo enviar el correo")

    log_action(
        db,
        action="prescription.emailed",
        entity_type="prescription",
        entity_id=prescription.id,
        actor_user_id=current_user.id,
        tenant_id=prescription.tenant_id,
        details={"to_email": patient.email},
    )

    return {"detail": "Correo enviado", "to_email": patient.email}


@router.get("/appointment/{appointment_id}/all", response_model=list[PrescriptionResponse])
def list_appointment_prescriptions(
    *,
    db: Session = Depends(get_db),
    appointment_id: int,
    current_user: User = Depends(require_permission("prescriptions.read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> list[Prescription]:
    """List all prescriptions for an appointment"""
    # Verify appointment exists and user has access
    _appointment_in_scope(db, appointment_id, current_user)

    # Get prescriptions
    prescriptions = (
        scoped_query(db.query(Prescription), Prescription, current_user)
        .filter(Prescription.appointment_id == appointment_id)
        .order_by(Prescription.created_at.desc())
        .offset(skip).limit(limit).all()
    )
    return prescriptions


@router.get("/patient/{patient_id}/all", response_model=list[PrescriptionResponse])
def list_patient_prescriptions(
    *,
    db: Session = Depends(get_db),
    patient_id: int,
    current_user: User = Depends(require_permission("prescriptions.read")),
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> list[Prescription]:
    """List all prescriptions for a patient (prescription history)"""
    # Verify patient exists and user has access
    _patient_in_scope(db, patient_id, current_user)
    registrar_acceso(db, current_user, patient_id, SeccionClinica.RECETAS)

    # Get prescriptions ordered by creation date (newest first)
    query = scoped_query(db.query(Prescription), Prescription, current_user).filter(
        Prescription.patient_id == patient_id
    )
    response.headers["X-Total-Count"] = str(query.count())
    prescriptions = (
        query
        .order_by(Prescription.created_at.desc())
        .offset(skip).limit(limit).all()
    )
    return prescriptions


@router.put("/{prescription_id}", response_model=PrescriptionResponse)
def update_prescription(
    *,
    db: Session = Depends(get_db),
    prescription_id: int,
    prescription_in: PrescriptionUpdate,
    current_user: User = Depends(require_permission("prescriptions.create")),
) -> Prescription:
    """Update prescription (doctor only, only their own prescriptions)"""
    prescription = _prescription_in_scope(db, prescription_id, current_user)
    assert_owner(prescription.doctor_id, current_user, detail="Solo puedes modificar las recetas que tú emitiste.")

    # Update fields
    update_data = prescription_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(prescription, field, value)

    db.add(prescription)
    db.commit()
    db.refresh(prescription)
    return prescription
