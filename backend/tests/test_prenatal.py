"""Unit tests for prenatal validation and role-permission contracts."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.models.permission import ROLE_DEFAULT_PERMISSIONS
from app.schemas.patient import NAEGELE_DAYS
from app.schemas.pregnancy import NAEGELE_SOURCE, PregnancyCreate, PrenatalVisitCreate


def test_pregnancy_rejects_due_date_before_recorded_lmp():
    with pytest.raises(ValidationError, match="fecha estimada"):
        PregnancyCreate(
            patient_id=1,
            last_menstrual_period=date(2026, 8, 6),
            estimated_delivery_date=date(2026, 8, 5),
        )


def test_pregnancy_calcula_fpp_por_naegele_cuando_falta():
    pregnancy = PregnancyCreate(patient_id=1, last_menstrual_period=date(2026, 1, 1))
    assert pregnancy.estimated_delivery_date == date(2026, 1, 1) + timedelta(days=NAEGELE_DAYS)
    assert pregnancy.estimated_delivery_date == date(2026, 10, 8)
    assert pregnancy.estimated_delivery_date_source == NAEGELE_SOURCE


def test_pregnancy_respeta_la_fpp_que_captura_el_medico():
    """La FPP por ecografía manda sobre el cálculo y no se sobrescribe."""
    pregnancy = PregnancyCreate(
        patient_id=1,
        last_menstrual_period=date(2026, 1, 1),
        estimated_delivery_date=date(2026, 10, 1),
        estimated_delivery_date_source="Ultrasonido del primer trimestre",
    )
    assert pregnancy.estimated_delivery_date == date(2026, 10, 1)
    assert pregnancy.estimated_delivery_date_source == "Ultrasonido del primer trimestre"


def test_pregnancy_sin_fur_no_inventa_fpp():
    pregnancy = PregnancyCreate(patient_id=1)
    assert pregnancy.estimated_delivery_date is None
    assert pregnancy.estimated_delivery_date_source is None


def test_pregnancy_calcula_fpp_cruzando_anio_bisiesto():
    """2024 es bisiesto: el conteo de 280 días pasa por el 29 de febrero."""
    pregnancy = PregnancyCreate(patient_id=1, last_menstrual_period=date(2023, 12, 19))
    assert pregnancy.estimated_delivery_date == date(2024, 9, 24)


def test_pregnancy_sanitizes_notes_without_clinical_inference():
    pregnancy = PregnancyCreate(patient_id=1, notes="  Seguimiento registrado\x00  ")
    assert pregnancy.notes == "Seguimiento registrado"


def test_prenatal_visit_rejects_next_visit_before_documented_visit():
    with pytest.raises(ValidationError, match="próxima visita"):
        PrenatalVisitCreate(
            visit_date=date(2026, 8, 6),
            next_visit_on=date(2026, 8, 5),
        )


def test_prenatal_visit_accepts_structured_observations():
    visit = PrenatalVisitCreate(
        visit_date=date(2026, 8, 6),
        gestational_age_weeks=Decimal("18.5"),
        maternal_weight_kg=Decimal("62.40"),
        systolic_bp=110,
        diastolic_bp=70,
        fetal_movements="reported",
        fetal_presentation="cephalic",
        maternal_observations="  Registro clínico de la visita. ",
    )
    assert visit.gestational_age_weeks == Decimal("18.5")
    assert visit.maternal_observations == "Registro clínico de la visita."
    assert visit.fetal_movements.value == "reported"
    assert visit.fetal_presentation.value == "cephalic"


def test_doctor_has_required_prenatal_permissions_and_secretaria_does_not_write():
    permissions = ROLE_DEFAULT_PERMISSIONS["doctor"]
    assert {"prenatal.read", "prenatal.create", "prenatal.update"}.issubset(permissions)
    assert "prenatal.create" not in ROLE_DEFAULT_PERMISSIONS["secretaria"]
