"""Boundary tests for Plan 14 structured clinical tracking."""

from datetime import date

import pytest
from pydantic import ValidationError

from app.models.permission import ROLE_DEFAULT_PERMISSIONS
from app.schemas.clinical_tracking import (
    DiagnosticOrderCreate,
    MedicationExposureCreate,
    PregnancyDatingEventCreate,
)


def test_accepted_fpp_requires_an_explicit_date():
    with pytest.raises(ValidationError, match="FPP aceptada"):
        PregnancyDatingEventCreate(method="ultrasound", status="accepted")


def test_diagnostic_order_keeps_indication_and_rejects_invalid_dates():
    with pytest.raises(ValidationError, match="fecha deseada"):
        DiagnosticOrderCreate(
            patient_id=1,
            category="obstetric",
            study_name="Ultrasonido obstétrico",
            clinical_indication="Seguimiento documentado por médico",
            requested_on=date(2026, 8, 8),
            desired_on=date(2026, 8, 7),
        )


def test_medication_exposure_does_not_allow_an_inverted_date_range():
    with pytest.raises(ValidationError, match="término"):
        MedicationExposureCreate(
            patient_id=1,
            medication_name="Medicamento documentado",
            started_on=date(2026, 8, 8),
            ended_on=date(2026, 8, 7),
        )


def test_only_doctors_receive_default_clinical_tracking_writing_permissions():
    permissions = ROLE_DEFAULT_PERMISSIONS["doctor"]
    assert {"clinical_tracking.read", "clinical_tracking.create", "clinical_tracking.update"}.issubset(permissions)
    assert "clinical_tracking.create" not in ROLE_DEFAULT_PERMISSIONS["secretaria"]
