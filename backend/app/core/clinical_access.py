"""Quién tiene relación asistencial con un paciente.

La dueña del expediente es el único camino clínico para un médico. El equipo
tratante existe para el **apoyo administrativo** de la titular —recepción
adjuntando estudios, capturando documentos— y no para que un médico abra el
expediente completo del paciente de otra.

Por qué se cerró la cobertura clínica entre doctoras
----------------------------------------------------
Se habilitó y se deshabilitó en menos de una semana: no se estaba usando y
multiplicaba las formas de entrar a un expediente, que es justo lo que no
conviene multiplicar en datos sensibles (NOM-004, LFPDPPP). Emilio lo decidió
así, y con una precisión que este módulo sí respeta: **se cierra el expediente,
no la agenda**. Los médicos se siguen viendo y compartiendo el calendario;
eso vive en ``alcance_operativo_acotado`` y aquí no se toca.

El efecto lateral que se buscaba: el acceso clínico de un médico vuelve a ser
uno solo —ser la dueña— y con eso desaparece la asimetría que teníamos
documentada, donde quien cubría leía la nota y la receta pero recibía 403 en
episodios, imágenes, prenatal, seguimiento y consentimientos.

Las membresías de doctoras que ya existan **no se borran**: dejan de conceder
acceso aquí, que es lo único que hacía falta, y su historial sigue auditable.
"""
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Query, Session

from app.core.tenant_scope import scoped_query
from app.db.session import utcnow
from app.models.patient import Patient
from app.models.patient_care_team import PatientCareTeamMember
from app.models.user import Role, User


@dataclass(frozen=True)
class PatientClinicalAccess:
    patient: Patient
    relation: str
    membership_id: int | None = None


def _active_membership_query(db: Session, patient_id: int, user_id: int):
    now = utcnow()
    return db.query(PatientCareTeamMember).filter(
        PatientCareTeamMember.patient_id == patient_id,
        PatientCareTeamMember.user_id == user_id,
        PatientCareTeamMember.revoked_at.is_(None),
        PatientCareTeamMember.starts_at <= now,
        or_(
            PatientCareTeamMember.expires_at.is_(None),
            PatientCareTeamMember.expires_at > now,
        ),
    )


def apply_doctor_patient_access_filter(query: Query, current_user: User) -> Query:
    """Recorta un listado de pacientes a las del expediente propio del médico.

    Contrapartida en lista de ``assert_patient_clinical_access``: las dos tienen
    que decir lo mismo o el buscador enseña pacientes que después no se abren.
    Los roles operativos no se acotan aquí a propósito: recepción necesita ver a
    toda la clínica para agendar y cobrar, y acotarla rompería la agenda.
    """
    if current_user.role != Role.DOCTOR:
        return query

    return query.filter(Patient.owner_doctor_id == current_user.id)


def assert_patient_clinical_access(
    db: Session, patient_id: int, current_user: User
) -> PatientClinicalAccess:
    """Devuelve el paciente sólo a quien tiene una relación asistencial explícita.

    MASTER conserva su bypass supervisorio. Un médico entra **sólo** si es la
    dueña del expediente: una membresía de equipo tratante ya no le abre la
    puerta, aunque siga viva en la base. El resto de las cuentas sí pueden
    entrar por una membresía activa, que es el diseño original del equipo
    tratante: apoyo administrativo concedido por la titular, revocable y con
    vencimiento.
    """
    patient = (
        scoped_query(db.query(Patient), Patient, current_user)
        .filter(Patient.id == patient_id)
        .first()
    )
    if not patient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paciente no encontrada")

    if current_user.role == Role.MASTER:
        return PatientClinicalAccess(patient=patient, relation="master")
    if current_user.role == Role.DOCTOR:
        # Una sola puerta para el médico. El `return` temprano es la parte
        # importante: sin él, una membresía vieja de las que se otorgaron
        # mientras la cobertura estuvo habilitada seguiría abriendo el
        # expediente sin que nadie la hubiera vuelto a conceder.
        if patient.owner_doctor_id == current_user.id:
            return PatientClinicalAccess(patient=patient, relation="owner")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes acceder a expedientes de tus pacientes",
        )

    membership = _active_membership_query(db, patient.id, current_user.id).filter(
        PatientCareTeamMember.tenant_id == patient.tenant_id
    ).first()
    if membership:
        return PatientClinicalAccess(
            patient=patient,
            relation=membership.access_role.value,
            membership_id=membership.id,
        )

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No tienes una relación asistencial activa con este paciente",
    )


def can_manage_patient_care_team(patient: Patient, current_user: User) -> bool:
    """Sólo el médico responsable (o MASTER) concede o revoca el apoyo."""
    return current_user.role == Role.MASTER or (
        current_user.role == Role.DOCTOR and patient.owner_doctor_id == current_user.id
    )
