"""Medical Certificates router"""

import logging
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.access_scope import resolver_paciente_con_relacion_asistencial
from app.core.deps import get_db, require_permission
from app.core.tenant_scope import assert_owner, scoped_query
from app.db.session import utcnow
from app.models import DoctorProfile, MedicalCertificate, User
from app.models.acceso_clinico import SeccionClinica
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.schemas.medical_certificate import (
    MedicalCertificateCreate,
    MedicalCertificateResponse,
    MedicalCertificateUpdate,
)
from app.services.audit_service import log_action
from app.services.bitacora_accesos import registrar_acceso
from app.services.email_service import send_email
from app.services.email_templates import certificate_email as cert_tmpl
from app.services.email_templates import get_clinic_info
from app.services.folio_service import generate_certificate_folio, guardar_con_folio

router = APIRouter(prefix="/medical-certificates", tags=["medical-certificates"])

logger = logging.getLogger(__name__)

# Misma ventana que la receta y por la misma razón: el segundo envío idéntico
# es el formulario reenviado, no un certificado nuevo. Ver el comentario en
# ``prescriptions.py``.
VENTANA_DE_REENVIO = timedelta(minutes=5)


def _patient_in_scope(db: Session, patient_id: int, current_user: User) -> Patient:
    """Resuelve al paciente aplicando la MISMA regla clínica que la nota de consulta.

    Antes se exigía ser la dueña del paciente, igual que en las recetas y con
    la misma consecuencia: el médico que cubría la consulta veía la nota y
    recibía 403 en los certificados. Los roles no clínicos conservan su alcance
    por clínica.
    """
    return resolver_paciente_con_relacion_asistencial(db, patient_id, current_user)


def _appointment_in_scope(db: Session, appointment_id: int, current_user: User) -> Appointment:
    """El acceso a la cita se deriva del acceso al paciente, no de quién la agendó."""
    appointment = (
        scoped_query(db.query(Appointment), Appointment, current_user)
        .filter(Appointment.id == appointment_id)
        .first()
    )
    if not appointment:
        raise HTTPException(status_code=404, detail="No se encontró la cita. Puede que la hayan eliminado; vuelve a la agenda y actualízala.")
    _patient_in_scope(db, appointment.patient_id, current_user)
    return appointment


def _certificate_in_scope(
    db: Session, certificate_id: int, current_user: User
) -> MedicalCertificate:
    """Leerlo depende del paciente; modificarlo sigue dependiendo de quién lo firmó.

    ``update_medical_certificate`` conserva su propio ``assert_owner``: nadie
    edita un documento firmado por alguien más.
    """
    certificate = (
        scoped_query(db.query(MedicalCertificate), MedicalCertificate, current_user)
        .filter(MedicalCertificate.id == certificate_id)
        .first()
    )
    if not certificate:
        raise HTTPException(status_code=404, detail="No se encontró el certificado. Puede que lo hayan eliminado; actualiza el expediente.")
    _patient_in_scope(db, certificate.patient_id, current_user)
    return certificate


def _texto_normalizado(valor: Any) -> str:
    """Compara por contenido: los espacios de más y las mayúsculas no hacen distinto un certificado."""
    if valor is None:
        return ""
    return " ".join(str(valor).split()).casefold()


def _huella_de_certificado(certificate_type: Any, diagnosis: Any, days_off: Any, notes: Any) -> tuple:
    """Todo lo que el médico capturó. Si algo de esto cambia, es otro certificado."""
    return (
        _texto_normalizado(getattr(certificate_type, "value", certificate_type)),
        _texto_normalizado(diagnosis),
        days_off,
        _texto_normalizado(notes),
    )


def _certificado_ya_emitido(
    db: Session, certificate_in: MedicalCertificateCreate, current_user: User
) -> MedicalCertificate | None:
    """Devuelve el certificado idéntico reciente de esta misma consulta, si lo hay.

    Mismo criterio que la receta: misma cita, misma doctora, mismo contenido y
    dentro de la ventana. Dos certificados DISTINTOS en la misma consulta
    siguen siendo válidos —una incapacidad y una constancia de aptitud, por
    ejemplo— y por eso no hay restricción única en la tabla.
    """
    huella = _huella_de_certificado(
        certificate_in.certificate_type,
        certificate_in.diagnosis,
        certificate_in.days_off,
        certificate_in.notes,
    )
    candidatos = (
        db.query(MedicalCertificate)
        .filter(
            MedicalCertificate.tenant_id == current_user.tenant_id,
            MedicalCertificate.appointment_id == certificate_in.appointment_id,
            MedicalCertificate.doctor_id == current_user.id,
            MedicalCertificate.created_at >= utcnow() - VENTANA_DE_REENVIO,
        )
        .order_by(MedicalCertificate.created_at, MedicalCertificate.id)
        .all()
    )
    for candidato in candidatos:
        actual = _huella_de_certificado(
            candidato.certificate_type, candidato.diagnosis, candidato.days_off, candidato.notes
        )
        if actual == huella:
            return candidato
    return None


def _build_certificate_pdf(db: Session, certificate: MedicalCertificate) -> tuple[bytes, Patient]:
    """Shared setup for both the download and send-by-email endpoints."""
    from app.utils.pdf import generate_certificate_pdf

    doctor_profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == certificate.doctor_id).first()
    if not doctor_profile:
        raise HTTPException(status_code=404, detail="Todavía no tienes configurado tu perfil de doctor. Complétalo en Mi Perfil para poder emitir certificados.")

    patient = db.query(Patient).filter(Patient.id == certificate.patient_id).first()

    pdf_buffer = generate_certificate_pdf(certificate, doctor_profile, patient)
    return pdf_buffer.read(), patient


@router.post("", response_model=MedicalCertificateResponse, status_code=status.HTTP_201_CREATED)
def create_medical_certificate(
    *,
    db: Session = Depends(get_db),
    certificate_in: MedicalCertificateCreate,
    current_user: User = Depends(require_permission("medical_certificates.create")),
) -> MedicalCertificate:
    """Create medical certificate for a patient (doctor only)"""
    # Verify appointment exists and belongs to current doctor
    appointment = _appointment_in_scope(db, certificate_in.appointment_id, current_user)
    patient = _patient_in_scope(db, certificate_in.patient_id, current_user)
    if appointment.patient_id != patient.id:
        raise HTTPException(status_code=422, detail="La consulta no corresponde al paciente")

    # Reenvío del mismo contenido: se devuelve el certificado que ya existe en
    # vez de emitir otro con folio distinto para la misma incapacidad.
    ya_emitido = _certificado_ya_emitido(db, certificate_in, current_user)
    if ya_emitido:
        return ya_emitido

    try:
        db_certificate = guardar_con_folio(
            db,
            generar_folio=lambda: generate_certificate_folio(
                db, current_user.tenant_id, user_id=current_user.id, patient_id=certificate_in.patient_id
            ),
            construir=lambda folio: MedicalCertificate(
                **certificate_in.model_dump(),
                doctor_id=current_user.id,
                tenant_id=current_user.tenant_id,
                folio_number=folio,
            ),
        )
        return db_certificate
    except Exception as exc:
        logger.exception("No se pudo crear el certificado medico")
        db.rollback()
        raise HTTPException(status_code=500, detail="No se pudo guardar el certificado. Inténtalo de nuevo; si vuelve a fallar, avisa al equipo de soporte.") from exc


@router.get("/{certificate_id}", response_model=MedicalCertificateResponse)
def get_medical_certificate(
    *,
    db: Session = Depends(get_db),
    certificate_id: int,
    current_user: User = Depends(require_permission("medical_certificates.read")),
) -> MedicalCertificate:
    """Get medical certificate by ID"""
    return _certificate_in_scope(db, certificate_id, current_user)


@router.get("/{certificate_id}/pdf")
def generate_certificate_pdf_endpoint(
    *,
    db: Session = Depends(get_db),
    certificate_id: int,
    current_user: User = Depends(require_permission("medical_certificates.read")),
):
    """Generate and download medical certificate PDF"""
    from io import BytesIO

    from fastapi.responses import StreamingResponse

    certificate = _certificate_in_scope(db, certificate_id, current_user)

    pdf_bytes, patient = _build_certificate_pdf(db, certificate)

    headers = {
        'Content-Disposition': f'attachment; filename="Certificado_{patient.first_name}_{certificate.created_at.strftime("%Y%m%d")}.pdf"'
    }

    log_action(
        db,
        action="medical_certificate.downloaded",
        entity_type="medical_certificate",
        entity_id=certificate.id,
        actor_user_id=current_user.id,
        tenant_id=certificate.tenant_id,
        details={"patient_id": certificate.patient_id},
    )

    return StreamingResponse(BytesIO(pdf_bytes), media_type="application/pdf", headers=headers)


@router.post("/{certificate_id}/send-email", status_code=status.HTTP_200_OK)
def send_certificate_email(
    *,
    db: Session = Depends(get_db),
    certificate_id: int,
    current_user: User = Depends(require_permission("medical_certificates.send_email")),
):
    """Email the medical certificate PDF to the patient's registered email address."""
    certificate = _certificate_in_scope(db, certificate_id, current_user)

    pdf_bytes, patient = _build_certificate_pdf(db, certificate)

    if not patient.email:
        raise HTTPException(status_code=400, detail="El paciente no tiene un correo registrado")

    clinic = get_clinic_info(db, user_id=certificate.doctor_id, tenant_id=certificate.tenant_id)
    date_str = certificate.created_at.strftime('%d/%m/%Y')
    cert_type = certificate.certificate_type.value if hasattr(certificate.certificate_type, 'value') else str(certificate.certificate_type)
    body_text = f"Hola {patient.first_name}, adjuntamos tu certificado médico generado el {date_str}."
    body_html = cert_tmpl(clinic, patient.first_name, cert_type, date_str)
    sent = send_email(
        to_email=patient.email,
        subject="Tu certificado médico",
        body_text=body_text,
        body_html=body_html,
        attachment_bytes=pdf_bytes,
        attachment_filename=f"Certificado_{patient.first_name}_{certificate.created_at.strftime('%Y%m%d')}.pdf",
    )

    if not sent:
        raise HTTPException(status_code=502, detail="No se pudo enviar el correo")

    log_action(
        db,
        action="certificate.emailed",
        entity_type="medical_certificate",
        entity_id=certificate.id,
        actor_user_id=current_user.id,
        tenant_id=certificate.tenant_id,
        details={"to_email": patient.email},
    )

    return {"detail": "Correo enviado", "to_email": patient.email}


@router.get("/appointment/{appointment_id}/all", response_model=list[MedicalCertificateResponse])
def list_appointment_certificates(
    *,
    db: Session = Depends(get_db),
    appointment_id: int,
    current_user: User = Depends(require_permission("medical_certificates.read")),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> list[MedicalCertificate]:
    """List all medical certificates for an appointment"""
    # Verify appointment exists and user has access
    _appointment_in_scope(db, appointment_id, current_user)

    # Get certificates
    certificates = (
        scoped_query(db.query(MedicalCertificate), MedicalCertificate, current_user)
        .filter(MedicalCertificate.appointment_id == appointment_id)
        .order_by(MedicalCertificate.created_at.desc())
        .offset(skip).limit(limit).all()
    )
    return certificates


@router.get("/patient/{patient_id}/all", response_model=list[MedicalCertificateResponse])
def list_patient_certificates(
    *,
    db: Session = Depends(get_db),
    patient_id: int,
    current_user: User = Depends(require_permission("medical_certificates.read")),
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> list[MedicalCertificate]:
    """List all medical certificates for a patient"""
    # Verify patient exists and user has access
    _patient_in_scope(db, patient_id, current_user)
    registrar_acceso(db, current_user, patient_id, SeccionClinica.CERTIFICADOS)

    # Get certificates ordered by creation date (newest first)
    query = scoped_query(db.query(MedicalCertificate), MedicalCertificate, current_user).filter(
        MedicalCertificate.patient_id == patient_id
    )
    response.headers["X-Total-Count"] = str(query.count())
    certificates = (
        query
        .order_by(MedicalCertificate.created_at.desc())
        .offset(skip).limit(limit).all()
    )
    return certificates


@router.put("/{certificate_id}", response_model=MedicalCertificateResponse)
def update_medical_certificate(
    *,
    db: Session = Depends(get_db),
    certificate_id: int,
    certificate_in: MedicalCertificateUpdate,
    current_user: User = Depends(require_permission("medical_certificates.create")),
) -> MedicalCertificate:
    """Update medical certificate (doctor only, only their own certificates)"""
    certificate = _certificate_in_scope(db, certificate_id, current_user)
    assert_owner(certificate.doctor_id, current_user, detail="Solo puedes modificar los certificados que tú emitiste.")

    # Update fields
    update_data = certificate_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(certificate, field, value)

    db.add(certificate)
    db.commit()
    db.refresh(certificate)
    return certificate
