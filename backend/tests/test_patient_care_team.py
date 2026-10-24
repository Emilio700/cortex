"""Unit tests for explicit patient care-team access contracts."""
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.core.clinical_access import can_manage_patient_care_team
from app.models.patient import Patient
from app.models.patient_care_team import CareTeamAccessRole, PatientCareTeamMember
from app.models.user import Role, User
from app.schemas.patient_care_team import PatientCareTeamMemberCreate


def _user(role: Role, user_id: int) -> User:
    user = User()
    user.id = user_id
    user.role = role
    return user


def test_temporary_care_access_requires_reason_and_expiration():
    with pytest.raises(ValidationError):
        PatientCareTeamMemberCreate(user_id=7, access_role=CareTeamAccessRole.TEMPORARY)

    starts_at = datetime.now(UTC)
    with pytest.raises(ValidationError):
        PatientCareTeamMemberCreate(
            user_id=7,
            access_role=CareTeamAccessRole.TEMPORARY,
            reason="Cobertura",
            starts_at=starts_at,
            expires_at=starts_at,
        )


def test_temporary_care_access_normalizes_aware_dates_to_utc_naive():
    starts_at = datetime.now(UTC)
    access = PatientCareTeamMemberCreate(
        user_id=7,
        access_role=CareTeamAccessRole.TEMPORARY,
        reason="Cobertura de guardia",
        starts_at=starts_at,
        expires_at=starts_at + timedelta(hours=4),
    )

    assert access.starts_at is not None
    assert access.expires_at is not None
    assert access.starts_at.tzinfo is None
    assert access.expires_at.tzinfo is None


def test_only_owner_doctor_or_master_manages_care_team():
    patient = Patient()
    patient.owner_doctor_id = 10

    assert can_manage_patient_care_team(patient, _user(Role.DOCTOR, 10)) is True
    assert can_manage_patient_care_team(patient, _user(Role.DOCTOR, 11)) is False
    assert can_manage_patient_care_team(patient, _user(Role.SECRETARIA, 12)) is False
    assert can_manage_patient_care_team(patient, _user(Role.MASTER, 1)) is True


def test_care_team_enum_persists_clinical_values_not_python_member_names():
    column = PatientCareTeamMember.__table__.c.access_role
    assert column.type.enums == ["collaborator", "assistant", "temporary"]
