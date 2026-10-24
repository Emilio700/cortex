"""Consent creation, tablet signing, revocation and protected PDF access."""

import base64
import binascii
import hashlib
import json
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.access_scope import (
    exigir_autoria_clinica,
    resolver_paciente_de_su_duena,
)
from app.core.deps import get_db, require_permission
from app.core.hora_local import hoy_local
from app.core.storage import default_storage, storage_response
from app.core.tenant_scope import scoped_query
from app.db.session import utcnow
from app.models.acceso_clinico import SeccionClinica
from app.models.appointment import Appointment
from app.models.clinical_consent import ClinicalConsent, ConsentStatus, ConsentType
from app.models.clinical_episode import ClinicalEpisode
from app.models.patient import Patient
from app.models.pregnancy import Pregnancy, PregnancyStatus
from app.models.user import User
from app.schemas.clinical_consent import (
    ClinicalConsentCancel,
    ClinicalConsentCreate,
    ClinicalConsentPage,
    ClinicalConsentResponse,
    ClinicalConsentRevoke,
    ClinicalConsentSign,
    ConsentTemplateResponse,
)
from app.services.antivirus_service import scan_upload
from app.services.audit_service import log_action
from app.services.bitacora_accesos import registrar_acceso
from app.services.consent_pdf_service import generate_consent_pdf
from app.services.consent_templates import get_template, list_templates
from app.utils.uploads import validate_file_structure

router = APIRouter(prefix="/clinical-consents", tags=["clinical-consents"])
TEMPLATE_VERSION = "2026.08.07.1"


def _patient_in_scope(db: Session, patient_id: int, user: User) -> Patient:
    # El consentimiento lo firma la paciente con su doctora titular, así que se
    # queda en la variante estrecha del alcance clínico.
    return resolver_paciente_de_su_duena(
        db,
        patient_id,
        user,
        detalle_403="Solo puedes gestionar consentimientos de tus pacientes",
        detalle_404="No se encontró la paciente.",
    )


def _consent_in_scope(db: Session, consent_id: int, user: User) -> ClinicalConsent:
    consent = (
        scoped_query(db.query(ClinicalConsent), ClinicalConsent, user)
        .filter(ClinicalConsent.id == consent_id)
        .first()
    )
    if not consent:
        raise HTTPException(status_code=404, detail="No se encontró el consentimiento.")
    _patient_in_scope(db, consent.patient_id, user)
    exigir_autoria_clinica(
        consent.doctor_id, user, detalle="Solo puedes gestionar consentimientos bajo tu atención"
    )
    return consent


def _validate_context(
    db: Session, data: ClinicalConsentCreate, patient: Patient, user: User
) -> None:
    if data.appointment_id:
        appointment = (
            scoped_query(db.query(Appointment), Appointment, user)
            .filter(Appointment.id == data.appointment_id)
            .first()
        )
        if not appointment or appointment.patient_id != patient.id:
            raise HTTPException(status_code=422, detail="La consulta no corresponde a la paciente")
        exigir_autoria_clinica(appointment.doctor_id, user, detalle="Solo puedes usar tus consultas")
    if data.clinical_episode_id:
        episode = (
            scoped_query(db.query(ClinicalEpisode), ClinicalEpisode, user)
            .filter(ClinicalEpisode.id == data.clinical_episode_id)
            .first()
        )
        if not episode or episode.patient_id != patient.id:
            raise HTTPException(status_code=422, detail="El episodio no corresponde a la paciente")


def _snapshot_body(template, procedure_name: str | None, diagnosis: str | None) -> str:
    lines = [template.summary]
    if procedure_name:
        lines.append(f"Procedimiento confirmado: {procedure_name}.")
    if diagnosis:
        lines.append(f"Diagnóstico o indicación documentada: {diagnosis}.")
    lines.append(
        "La paciente declara que recibió información suficiente y puede realizar preguntas antes de firmar."
    )
    return "\n\n".join(lines)


def _embarazo_activo(db: Session, patient: Patient) -> Pregnancy | None:
    """El embarazo en curso de la paciente, si es que está embarazada ahora.

    Una paciente no *es* obstétrica: *está* embarazada, y luego deja de estarlo.
    Por eso se pregunta por el registro de embarazo y no por la bandera
    ``patient_type`` del expediente, que lleva años sin apagarse.
    """
    return (
        db.query(Pregnancy)
        .filter(
            Pregnancy.patient_id == patient.id,
            Pregnancy.tenant_id == patient.tenant_id,
            Pregnancy.status == PregnancyStatus.ACTIVE.value,
        )
        .order_by(Pregnancy.created_at.desc(), Pregnancy.id.desc())
        .first()
    )


def _prefilled_field_values(
    db: Session, patient: Patient, appointment_id: int | None, doctor: User
) -> dict:
    """Server-owned demographic/context values; the client never supplies these."""
    # Hoy del consultorio, no del contenedor (UTC): con ``date.today()`` el
    # consentimiento de las 17:00 en adelante salía fechado al día siguiente y
    # la edad cambiaba un día antes del cumpleaños.
    today = hoy_local()
    embarazo = _embarazo_activo(db, patient)
    # La fecha de nacimiento es opcional (alta express): sin ella el
    # consentimiento se emite con edad vacía en lugar de reventar.
    nacimiento = patient.date_of_birth
    age = (
        (
            today.year
            - nacimiento.year
            - ((today.month, today.day) < (nacimiento.month, nacimiento.day))
        )
        if nacimiento
        else ""
    )
    values = {
        "patient_name": f"{patient.first_name} {patient.last_name}",
        "record_number": patient.id,
        "date_of_birth": nacimiento.isoformat() if nacimiento else "",
        "patient_age": age,
        "doctor_name": doctor.full_name,
        "generated_on": today.isoformat(),
        # La FUR y la FPP salen del embarazo en curso, no del expediente: el
        # expediente guarda una copia que nadie mantiene (y que en 8 casos ya no
        # coincide con la del embarazo), mientras que el registro de embarazo es
        # el que la doctora actualiza consulta a consulta. Sin embarazo activo el
        # consentimiento se emite sin esas fechas, como hasta ahora cuando no
        # había dato.
        "last_menstrual_period": (
            embarazo.last_menstrual_period.isoformat()
            if embarazo and embarazo.last_menstrual_period
            else None
        ),
        "expected_delivery_date": (
            embarazo.estimated_delivery_date.isoformat()
            if embarazo and embarazo.estimated_delivery_date
            else None
        ),
    }
    if appointment_id:
        appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
        values["appointment_id"] = appointment_id
        values["appointment_at"] = appointment.scheduled_at.isoformat() if appointment else None
    return values


def _decode_signature(data_url: str) -> bytes:
    prefix = "data:image/png;base64,"
    if not data_url.startswith(prefix):
        raise HTTPException(status_code=422, detail="La firma debe ser una imagen PNG válida")
    try:
        content = base64.b64decode(data_url[len(prefix) :], validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(status_code=422, detail="La firma no pudo validarse") from error
    if not content.startswith(b"\x89PNG\r\n\x1a\n") or len(content) > 1_500_000:
        raise HTTPException(status_code=422, detail="La firma no es una imagen PNG válida")
    try:
        validate_file_structure(content, "image/png")
        scan_upload(content)
    except HTTPException as error:
        raise HTTPException(
            status_code=422, detail="La firma no es una imagen PNG válida"
        ) from error
    return content


@router.get("/templates", response_model=list[ConsentTemplateResponse])
def get_consent_templates(
    current_user: Annotated[User, Depends(require_permission("clinical_consents.read"))],
) -> list[ConsentTemplateResponse]:
    """Return template metadata only; signed records retain their own snapshot."""
    return [
        ConsentTemplateResponse(
            consent_type=item.consent_type,
            title=item.title,
            summary=item.summary,
            acknowledgements=list(item.acknowledgements),
            allows_photos=item.allows_photos,
            requires_pregnancy_test=item.requires_pregnancy_test,
            allows_transfusion_choice=item.allows_transfusion_choice,
        )
        for item in list_templates()
    ]


@router.get("/patient/{patient_id}", response_model=ClinicalConsentPage)
def list_patient_consents(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_consents.read"))],
    appointment_id: int | None = Query(default=None, gt=0),
) -> ClinicalConsentPage:
    _patient_in_scope(db, patient_id, current_user)
    registrar_acceso(db, current_user, patient_id, SeccionClinica.CONSENTIMIENTOS)
    query = scoped_query(db.query(ClinicalConsent), ClinicalConsent, current_user).filter(
        ClinicalConsent.patient_id == patient_id
    )
    if appointment_id:
        query = query.filter(ClinicalConsent.appointment_id == appointment_id)
    items = query.order_by(ClinicalConsent.created_at.desc()).limit(100).all()
    return ClinicalConsentPage(items=items, total=len(items))


@router.post("", response_model=ClinicalConsentResponse, status_code=status.HTTP_201_CREATED)
def create_consent_draft(
    data: ClinicalConsentCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_consents.create"))],
) -> ClinicalConsent:
    patient = _patient_in_scope(db, data.patient_id, current_user)
    _validate_context(db, data, patient, current_user)
    template = get_template(data.consent_type)
    consent = ClinicalConsent(
        tenant_id=patient.tenant_id,
        patient_id=patient.id,
        appointment_id=data.appointment_id,
        clinical_episode_id=data.clinical_episode_id,
        doctor_id=current_user.id,
        created_by_user_id=current_user.id,
        consent_type=data.consent_type.value,
        template_version=TEMPLATE_VERSION,
        status=ConsentStatus.DRAFT.value,
        title=template.title,
        procedure_name=data.procedure_name,
        diagnosis=data.diagnosis,
        rendered_body=data.custom_body
        or _snapshot_body(template, data.procedure_name, data.diagnosis),
        field_values={
            **data.field_values,
            **_prefilled_field_values(db, patient, data.appointment_id, current_user),
            "body_source": "template" if data.use_template_body else "custom",
            "body_edited": bool(data.custom_body),
        },
        acknowledgements=[],
    )
    db.add(consent)
    db.commit()
    db.refresh(consent)
    log_action(
        db,
        action="clinical_consent.draft_created",
        entity_type="clinical_consent",
        entity_id=consent.id,
        actor_user_id=current_user.id,
        tenant_id=consent.tenant_id,
        details={"patient_id": patient.id, "consent_type": consent.consent_type},
    )
    return consent


@router.post("/{consent_id}/sign", response_model=ClinicalConsentResponse)
def sign_consent(
    consent_id: int,
    data: ClinicalConsentSign,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_consents.sign"))],
) -> ClinicalConsent:
    consent = _consent_in_scope(db, consent_id, current_user)
    if consent.status != ConsentStatus.DRAFT.value:
        raise HTTPException(
            status_code=409, detail="Solo se pueden firmar consentimientos en borrador"
        )
    template = get_template(ConsentType(consent.consent_type))
    required = set(template.acknowledgements)
    if not required.issubset(set(data.acknowledgements)):
        raise HTTPException(
            status_code=422, detail="La paciente debe confirmar todos los puntos requeridos"
        )
    signature_content = _decode_signature(data.signature_data_url)
    signature_path = f"uploads/clinical_consents/signatures/{uuid4()}.png"
    pdf_path: str | None = None
    try:
        default_storage.save(signature_path, signature_content)
    except Exception as error:
        raise HTTPException(status_code=500, detail="No fue posible guardar la firma") from error
    values = dict(consent.field_values or {})
    values.update(
        {
            "photo_record_authorized": data.photo_record_authorized,
            "photo_education_authorized": data.photo_education_authorized,
            "transfusion_authorized": data.transfusion_authorized,
        }
    )
    consent.patient_signed_name = data.patient_signed_name
    consent.patient_signature_path = signature_path
    consent.patient_signed_at = utcnow()
    consent.doctor_confirmed_at = utcnow()
    consent.acknowledgements = list(template.acknowledgements)
    consent.field_values = values
    consent.status = ConsentStatus.SIGNED.value
    snapshot = {
        "body": consent.rendered_body,
        "acknowledgements": consent.acknowledgements,
        "field_values": values,
        "signed_name": data.patient_signed_name,
        "signed_at": consent.patient_signed_at.isoformat(),
        "patient_id": consent.patient_id,
        "doctor_id": consent.doctor_id,
        "signature_sha256": hashlib.sha256(signature_content).hexdigest(),
        "template_version": consent.template_version,
    }
    consent.content_hash = hashlib.sha256(
        json.dumps(snapshot, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()
    patient = _patient_in_scope(db, consent.patient_id, current_user)
    try:
        pdf_path = f"uploads/clinical_consents/pdfs/{uuid4()}.pdf"
        pdf_bytes = generate_consent_pdf(
            consent, patient, current_user, signature_content
        )
        default_storage.save(pdf_path, pdf_bytes)
        consent.signed_pdf_path = pdf_path
        db.commit()
        db.refresh(consent)
    except Exception as error:
        db.rollback()
        default_storage.delete(signature_path)
        if pdf_path:
            default_storage.delete(pdf_path)
        raise HTTPException(
            status_code=500, detail="No fue posible completar el consentimiento firmado"
        ) from error
    log_action(
        db,
        action="clinical_consent.signed",
        entity_type="clinical_consent",
        entity_id=consent.id,
        actor_user_id=current_user.id,
        tenant_id=consent.tenant_id,
        details={
            "patient_id": consent.patient_id,
            "consent_type": consent.consent_type,
            "content_hash": consent.content_hash,
        },
    )
    return consent


@router.post("/{consent_id}/revoke", response_model=ClinicalConsentResponse)
def revoke_consent(
    consent_id: int,
    data: ClinicalConsentRevoke,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_consents.revoke"))],
) -> ClinicalConsent:
    consent = _consent_in_scope(db, consent_id, current_user)
    if consent.status not in {ConsentStatus.DRAFT.value, ConsentStatus.SIGNED.value}:
        raise HTTPException(
            status_code=409, detail="El consentimiento no puede revocarse en su estado actual"
        )
    consent.status = ConsentStatus.REVOKED.value
    consent.revoked_reason = data.reason
    consent.revoked_at = utcnow()
    db.commit()
    db.refresh(consent)
    log_action(
        db,
        action="clinical_consent.revoked",
        entity_type="clinical_consent",
        entity_id=consent.id,
        actor_user_id=current_user.id,
        tenant_id=consent.tenant_id,
        details={"patient_id": consent.patient_id},
    )
    return consent


def _rebuild_cancelled_pdf(db: Session, consent: ClinicalConsent, doctor: User) -> None:
    """Guardar una copia del PDF marcada como cancelada, sin tocar la original.

    Es un extra de conveniencia: si algo falla aquí la cancelación ya quedó
    registrada en la base y no debe revertirse por un problema de archivos.
    """
    if not consent.signed_pdf_path:
        return
    signature_content: bytes | None = None
    try:
        if consent.patient_signature_path and default_storage.exists(
            consent.patient_signature_path
        ):
            signature_content = default_storage.read(consent.patient_signature_path)
        patient = db.query(Patient).filter(Patient.id == consent.patient_id).first()
        if not patient:
            return
        pdf_path = f"uploads/clinical_consents/pdfs/{uuid4()}-cancelado.pdf"
        default_storage.save(
            pdf_path, generate_consent_pdf(consent, patient, doctor, signature_content)
        )
        consent.cancelled_pdf_path = pdf_path
        db.commit()
    except Exception:  # pragma: no cover - el PDF marcado es opcional
        db.rollback()


@router.post("/{consent_id}/cancel", response_model=ClinicalConsentResponse)
def cancel_consent(
    consent_id: int,
    data: ClinicalConsentCancel,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_consents.revoke"))],
) -> ClinicalConsent:
    """Anular un consentimiento emitido por error dejando rastro de quién y por qué.

    Nunca borra la fila ni el texto firmado: sólo cambia el estado a
    ``cancelled`` y guarda motivo, autor y fecha.
    """
    consent = _consent_in_scope(db, consent_id, current_user)
    if consent.status == ConsentStatus.CANCELLED.value:
        raise HTTPException(status_code=409, detail="El consentimiento ya está cancelado")
    if consent.status not in {ConsentStatus.DRAFT.value, ConsentStatus.SIGNED.value}:
        raise HTTPException(
            status_code=409, detail="El consentimiento no puede cancelarse en su estado actual"
        )
    consent.status = ConsentStatus.CANCELLED.value
    consent.cancelled_reason = data.reason
    consent.cancelled_at = utcnow()
    consent.cancelled_by_user_id = current_user.id
    db.commit()
    db.refresh(consent)
    log_action(
        db,
        action="clinical_consent.cancelled",
        entity_type="clinical_consent",
        entity_id=consent.id,
        actor_user_id=current_user.id,
        tenant_id=consent.tenant_id,
        patient_id=consent.patient_id,
        reason=data.reason,
        details={
            "patient_id": consent.patient_id,
            "consent_type": consent.consent_type,
            "previous_status": ConsentStatus.SIGNED.value
            if consent.patient_signed_at
            else ConsentStatus.DRAFT.value,
        },
    )
    _rebuild_cancelled_pdf(db, consent, current_user)
    db.refresh(consent)
    return consent


@router.get("/{consent_id}/download")
def download_signed_consent(
    consent_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_consents.read"))],
) -> Response:
    consent = _consent_in_scope(db, consent_id, current_user)
    path = consent.signed_pdf_path
    if consent.status == ConsentStatus.CANCELLED.value and consent.cancelled_pdf_path:
        path = consent.cancelled_pdf_path
    if not path or not default_storage.exists(path):
        raise HTTPException(status_code=404, detail="El PDF firmado no está disponible")
    log_action(
        db,
        action="clinical_consent.downloaded",
        entity_type="clinical_consent",
        entity_id=consent.id,
        actor_user_id=current_user.id,
        tenant_id=consent.tenant_id,
        details={"patient_id": consent.patient_id},
    )
    return storage_response(path, filename=f"consentimiento-{consent.id}.pdf", media_type="application/pdf")
