"""Las fechas del consentimiento salen del embarazo activo, no del expediente.

El expediente guardaba una copia de la FUR y la FPP que nadie mantenía: en 8 de
los 223 embarazos activos ya no coincidía con la del registro de embarazo, y de
esa fecha sale la fecha probable de parto que se imprime en el consentimiento.

Mismo arnés de SQLite que ``test_appointments_creacion.py``.
"""
from datetime import date, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base
from app.models.patient import Patient
from app.models.pregnancy import Pregnancy, PregnancyStatus
from app.models.tenant import Tenant
from app.models.user import Role, User
from app.routers.clinical_consents import _prefilled_field_values

FUR_DEL_EMBARAZO = date(2026, 1, 10)
FPP_DEL_EMBARAZO = date(2026, 10, 17)
# A propósito distinta de la del embarazo: es justo el caso que se quiere cubrir.
FUR_VIEJA_DEL_EXPEDIENTE = date(2024, 5, 3)


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


@pytest.fixture
def doctora(db_session) -> User:
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    usuaria = User(
        email="doctora@gems.com",
        hashed_password="no-usado-en-estas-pruebas",
        full_name="Médico de prueba",
        role=Role.DOCTOR,
        tenant_id=tenant.id,
        is_active=True,
    )
    db_session.add(usuaria)
    db_session.commit()
    db_session.refresh(usuaria)
    return usuaria


def _paciente(db_session, doctora: User, **campos) -> Patient:
    paciente = Patient(
        tenant_id=doctora.tenant_id,
        first_name="ANA",
        last_name="LÓPEZ",
        cell_phone="5512345678",
        **campos,
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)
    return paciente


def _embarazo(db_session, paciente: Patient, doctora: User, estado: str) -> Pregnancy:
    embarazo = Pregnancy(
        tenant_id=paciente.tenant_id,
        patient_id=paciente.id,
        doctor_id=doctora.id,
        status=estado,
        last_menstrual_period=FUR_DEL_EMBARAZO,
        estimated_delivery_date=FPP_DEL_EMBARAZO,
    )
    db_session.add(embarazo)
    db_session.commit()
    db_session.refresh(embarazo)
    return embarazo


def test_el_consentimiento_toma_las_fechas_del_embarazo_activo(db_session, doctora):
    """Manda el dato que el médico sí mantiene, aunque el expediente diga otro."""
    paciente = _paciente(
        db_session,
        doctora,
        patient_type="GINECOLOGICAS",
        last_menstrual_period=FUR_VIEJA_DEL_EXPEDIENTE,
        expected_delivery_date=None,
    )
    _embarazo(db_session, paciente, doctora, PregnancyStatus.ACTIVE.value)

    valores = _prefilled_field_values(db_session, paciente, None, doctora)

    assert valores["last_menstrual_period"] == FUR_DEL_EMBARAZO.isoformat()
    assert valores["expected_delivery_date"] == FPP_DEL_EMBARAZO.isoformat()


def test_sin_embarazo_activo_el_consentimiento_sale_sin_esas_fechas(db_session, doctora):
    """Un paciente que ya no está embarazada no arrastra su FPP a otro trámite."""
    paciente = _paciente(
        db_session,
        doctora,
        patient_type="OBSTETRICAS",
        last_menstrual_period=FUR_VIEJA_DEL_EXPEDIENTE,
    )
    _embarazo(db_session, paciente, doctora, PregnancyStatus.COMPLETED.value)

    valores = _prefilled_field_values(db_session, paciente, None, doctora)

    assert valores["last_menstrual_period"] is None
    assert valores["expected_delivery_date"] is None


def test_una_paciente_sin_ningun_embarazo_no_revienta(db_session, doctora):
    """El 97% de las marcadas como obstétricas no tienen embarazo: es el caso normal."""
    paciente = _paciente(db_session, doctora, patient_type="OBSTETRICAS")

    valores = _prefilled_field_values(db_session, paciente, None, doctora)

    assert valores["last_menstrual_period"] is None
    assert valores["expected_delivery_date"] is None
    assert valores["patient_name"] == "ANA LÓPEZ"


def test_la_fecha_y_la_edad_del_consentimiento_son_las_del_consultorio(
    db_session, doctora, monkeypatch
):
    """A las 23:30 del 3 de octubre en Mazatlán el contenedor ya va en el día 4.

    Con ``date.today()`` el consentimiento firmado esa noche salía fechado al
    día siguiente y, si el paciente cumplía años el 4, con un año de más.
    """
    import app.routers.clinical_consents as clinical_consents
    from _reloj import servidor_en_utc

    servidor_en_utc(monkeypatch, datetime(2026, 10, 4, 6, 30), clinical_consents)
    paciente = _paciente(db_session, doctora, date_of_birth=date(1990, 10, 4))

    valores = _prefilled_field_values(db_session, paciente, None, doctora)

    assert valores["generated_on"] == "2026-10-03"
    assert valores["patient_age"] == 35
