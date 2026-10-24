"""API for explicit, auditable patient care-team memberships."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.clinical_access import assert_patient_clinical_access, can_manage_patient_care_team
from app.core.deps import get_db, get_user_permissions, require_permission
from app.core.tenant_scope import scoped_query
from app.db.session import utcnow
from app.models.patient_care_team import CareTeamAccessRole, PatientCareTeamMember
from app.models.user import Role, User
from app.schemas.patient_care_team import (
    PatientCareTeamMemberCreate,
    PatientCareTeamMemberResponse,
    PatientCareTeamMemberRevoke,
)
from app.services.audit_service import log_action

router = APIRouter(prefix="/patients/{patient_id}/care-team", tags=["patient-care-team"])


def _response(member: PatientCareTeamMember) -> PatientCareTeamMemberResponse:
    return PatientCareTeamMemberResponse(
        id=member.id,
        patient_id=member.patient_id,
        tenant_id=member.tenant_id,
        user_id=member.user_id,
        user_full_name=member.user.full_name,
        user_role=member.user.role,
        episode_id=member.episode_id,
        access_role=member.access_role,
        granted_by_user_id=member.granted_by_user_id,
        starts_at=member.starts_at,
        expires_at=member.expires_at,
        revoked_at=member.revoked_at,
        created_at=member.created_at,
    )


def _require_manager(patient, current_user: User) -> None:
    if not can_manage_patient_care_team(patient, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el médico responsable puede administrar el equipo tratante",
        )


# Qué significa cada rol del equipo tratante, y qué capacidad exige.
#
# El equipo tratante es el único mecanismo por el que alguien que no es la
# dueña del expediente puede abrirlo, y su diseño original es el apoyo
# administrativo de la titular: recepción adjuntando estudios o capturando
# documentos de la paciente, con un permiso que la doctora concede, revoca y
# que vence solo.
#
# Durante unos días se amplió para registrar "la Dra. A cubre a la Dra. B", y
# Emilio lo cerró: no se estaba usando y multiplicaba las formas de entrar a un
# expediente. Se cierra el **expediente**, no la agenda: el calendario
# compartido entre doctoras no pasa por aquí (``alcance_operativo_acotado``).
# Por eso ninguna cuenta de doctora se asigna ya como integrante.
#
# Lo que NO se deshace de aquel cambio es la validación por capacidad, porque
# tapó un hueco distinto: ``TEMPORARY`` no exigía nada, así que servía para
# colar acceso clínico a cualquier cuenta activa de la clínica. Validar por
# capacidad efectiva —y no por el nombre del puesto— es lo que lo cierra, y se
# queda.
_CAPACIDAD_MINIMA: dict[CareTeamAccessRole, str] = {
    CareTeamAccessRole.COLLABORATOR: "soap_notes.create",
    CareTeamAccessRole.ASSISTANT: "patients.read",
    CareTeamAccessRole.TEMPORARY: "patients.read",
}

# La cobertura clínica entre doctoras se cerró: el mensaje tiene que decir qué
# sí quedó abierto, o la respuesta se lee como un defecto y alguien la reporta.
MOTIVO_DOCTORA_NO_SE_ASIGNA = (
    "El expediente completo de una paciente solo lo abre su médica responsable. "
    "Compartir la agenda entre doctoras no requiere este permiso."
)

_MOTIVO_DE_RECHAZO: dict[CareTeamAccessRole, str] = {
    CareTeamAccessRole.COLLABORATOR: (
        "Para cubrir el expediente, la cuenta necesita poder documentar la consulta "
        "(permiso soap_notes.create)"
    ),
    CareTeamAccessRole.ASSISTANT: (
        "El acceso de auxiliar requiere una cuenta que pueda consultar pacientes "
        "(permiso patients.read)"
    ),
    CareTeamAccessRole.TEMPORARY: (
        "El acceso temporal requiere una cuenta que pueda consultar pacientes "
        "(permiso patients.read)"
    ),
}


def _validate_member_capability(db: Session, member: User, access_role: CareTeamAccessRole) -> None:
    """Exigir la capacidad que el rol de equipo presupone, no un puesto concreto."""
    if member.role == Role.MASTER:
        # MASTER ya entra a cualquier expediente por su bypass supervisorio:
        # darle además una membresía sólo ensuciaría el rastro de quién cubre.
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="MASTER no se asigna como integrante clínico")

    if member.role == Role.DOCTOR:
        # Se rechaza en el alta y no sólo al leer el expediente para que la
        # negativa llegue cuando la doctora la puede entender —al intentar
        # concederla— y no como un 403 sin contexto tres días después.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=MOTIVO_DOCTORA_NO_SE_ASIGNA,
        )

    capacidad = _CAPACIDAD_MINIMA[access_role]
    if capacidad not in get_user_permissions(member, db):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=_MOTIVO_DE_RECHAZO[access_role],
        )


@router.get("", response_model=list[PatientCareTeamMemberResponse])
def list_care_team(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("patient_care_team.read"))],
):
    """List active and historical grants for an authorized patient relation."""
    access = assert_patient_clinical_access(db, patient_id, current_user)
    members = (
        scoped_query(db.query(PatientCareTeamMember), PatientCareTeamMember, current_user)
        .filter(PatientCareTeamMember.patient_id == access.patient.id)
        .options(joinedload(PatientCareTeamMember.user))
        .order_by(PatientCareTeamMember.revoked_at.is_(None).desc(), PatientCareTeamMember.created_at.desc())
        .all()
    )
    return [_response(member) for member in members]


@router.post("", response_model=PatientCareTeamMemberResponse, status_code=status.HTTP_201_CREATED)
def grant_care_team_access(
    patient_id: int,
    data: PatientCareTeamMemberCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("patient_care_team.manage"))],
):
    """Grant a doctor collaboration or justified, temporary care access."""
    access = assert_patient_clinical_access(db, patient_id, current_user)
    _require_manager(access.patient, current_user)

    member = (
        scoped_query(db.query(User), User, current_user)
        .filter(User.id == data.user_id, User.is_active.is_(True))
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La cuenta a asignar debe estar activa y pertenecer a la clínica")
    if member.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="El médico responsable ya tiene acceso por su asignación")
    _validate_member_capability(db, member, data.access_role)

    starts_at = data.starts_at or utcnow()
    if data.expires_at and data.expires_at <= starts_at:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="El vencimiento debe ser posterior al inicio del acceso")

    existing = (
        scoped_query(db.query(PatientCareTeamMember), PatientCareTeamMember, current_user)
        .filter(
            PatientCareTeamMember.patient_id == access.patient.id,
            PatientCareTeamMember.user_id == member.id,
            PatientCareTeamMember.access_role == data.access_role,
            PatientCareTeamMember.revoked_at.is_(None),
        )
        .first()
    )
    if existing and (existing.expires_at is None or existing.expires_at > utcnow()):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe un acceso activo de este tipo para la integrante seleccionada")

    care_member = PatientCareTeamMember(
        tenant_id=access.patient.tenant_id,
        patient_id=access.patient.id,
        user_id=member.id,
        episode_id=data.episode_id,
        access_role=data.access_role,
        granted_by_user_id=current_user.id,
        reason=data.reason,
        starts_at=starts_at,
        expires_at=data.expires_at,
    )
    db.add(care_member)
    db.commit()
    db.refresh(care_member)
    db.refresh(care_member, ["user"])
    log_action(
        db,
        action="care_team.member_granted",
        entity_type="patient_care_team_member",
        entity_id=care_member.id,
        actor_user_id=current_user.id,
        tenant_id=access.patient.tenant_id,
        details={
            "patient_id": access.patient.id,
            "member_user_id": member.id,
            "member_role": member.role.value,
            # A quién se está cubriendo. Sin esto la bitácora dice que alguien
            # entró al expediente, pero no de quién tomó la cobertura, que es
            # justo lo que se pregunta cuando se audita un acceso ajeno.
            "covers_doctor_id": access.patient.owner_doctor_id,
            "access_role": care_member.access_role.value,
            "temporary": care_member.access_role == CareTeamAccessRole.TEMPORARY,
            "expires_at": care_member.expires_at.isoformat() if care_member.expires_at else None,
            "has_reason": bool(care_member.reason),
        },
    )
    return _response(care_member)


@router.delete("/{membership_id}", response_model=PatientCareTeamMemberResponse)
def revoke_care_team_access(
    patient_id: int,
    membership_id: int,
    data: PatientCareTeamMemberRevoke,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("patient_care_team.manage"))],
):
    """Revoke access while preserving the clinical authorization history."""
    access = assert_patient_clinical_access(db, patient_id, current_user)
    _require_manager(access.patient, current_user)
    member = (
        scoped_query(db.query(PatientCareTeamMember), PatientCareTeamMember, current_user)
        .filter(
            PatientCareTeamMember.id == membership_id,
            PatientCareTeamMember.patient_id == access.patient.id,
        )
        .options(joinedload(PatientCareTeamMember.user))
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Acceso de equipo tratante no encontrado")
    if member.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este acceso ya fue revocado")

    member.revoked_at = utcnow()
    member.revocation_reason = data.reason
    db.commit()
    db.refresh(member)
    log_action(
        db,
        action="care_team.member_revoked",
        entity_type="patient_care_team_member",
        entity_id=member.id,
        actor_user_id=current_user.id,
        tenant_id=access.patient.tenant_id,
        details={
            "patient_id": access.patient.id,
            "member_user_id": member.user_id,
            "access_role": member.access_role.value,
        },
    )
    return _response(member)
