"""Que "todavía no le toman los signos" no se confunda con "no existe la cita".

`triage.py` era el último endpoint que contestaba 404 para las dos cosas. El
frontend lo sabía y traducía ese 404 a 204 antes de clasificarlo: una
inconsistencia del servidor tapada desde el navegador, que sólo funcionaba
mientras nadie olvidara poner la traducción en el siguiente hook. Aquí se fija
el contrato del resto del expediente: 204 = sin registro, 404 = cita
inexistente.

Usan SQLite en memoria y sobrescriben ``get_db``, como ``test_appointments_creacion.py``.
"""
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import security
from app.core.config import settings
from app.core.deps import get_db
from app.db.session import Base, utcnow
from app.main import app
from app.models.appointment import Appointment, AppointmentType
from app.models.patient import Patient
from app.models.tenant import Tenant
from app.models.triage import Triage
from app.models.user import Role, User
from app.models.user_session import UserSession

PREFIX = settings.API_V1_PREFIX


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
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _auth_headers(db, user: User) -> dict[str, str]:
    session = UserSession(
        id=str(uuid4()),
        user_id=user.id,
        tenant_id=user.tenant_id,
        refresh_jti=str(uuid4()),
        expires_at=utcnow() + timedelta(days=1),
    )
    db.add(session)
    db.commit()
    token = security.create_access_token(
        data={"sub": str(user.id), "role": user.role.value, "sid": session.id}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def escenario(db_session):
    """Un médico, su paciente y una cita a la que nadie le tomó la presión."""
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    doctora = User(
        email="doctora@gems.com",
        hashed_password="no-usado-en-estas-pruebas",
        full_name="Médico De Prueba",
        role=Role.DOCTOR,
        tenant_id=tenant.id,
        is_active=True,
    )
    db_session.add(doctora)
    db_session.commit()
    db_session.refresh(doctora)

    paciente = Patient(
        tenant_id=tenant.id,
        first_name="Paciente",
        last_name="De Prueba",
        date_of_birth=datetime(1990, 5, 20).date(),
        owner_doctor_id=doctora.id,
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    cita = Appointment(
        tenant_id=tenant.id,
        patient_id=paciente.id,
        doctor_id=doctora.id,
        scheduled_at=utcnow() + timedelta(days=1),
        duration_minutes=30,
        appointment_type=AppointmentType.CONSULTA,
    )
    db_session.add(cita)
    db_session.commit()
    db_session.refresh(cita)

    return {"tenant": tenant, "doctora": doctora, "paciente": paciente, "cita": cita}


def test_cita_sin_triage_responde_204_y_cuerpo_vacio(client, db_session, escenario):
    """Ausencia confirmada: la consulta puede decir "sin signos vitales" sin
    estar adivinando que quizá la lectura se cayó.
    """
    headers = _auth_headers(db_session, escenario["doctora"])
    respuesta = client.get(
        f"{PREFIX}/triage/appointment/{escenario['cita'].id}", headers=headers
    )

    assert respuesta.status_code == 204
    assert respuesta.content == b""


def test_cita_con_triage_devuelve_los_signos(client, db_session, escenario):
    """El 204 no debe haberse comido el camino feliz, ni el IMC calculado."""
    db_session.add(
        Triage(
            appointment_id=escenario["cita"].id,
            created_by_user_id=escenario["doctora"].id,
            weight_kg=64.0,
            height_cm=160.0,
            blood_pressure_systolic=118,
            blood_pressure_diastolic=76,
            temperature_celsius=36.7,
            chief_complaint="DOLOR DE CABEZA",
        )
    )
    db_session.commit()

    headers = _auth_headers(db_session, escenario["doctora"])
    respuesta = client.get(
        f"{PREFIX}/triage/appointment/{escenario['cita'].id}", headers=headers
    )

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["appointment_id"] == escenario["cita"].id
    assert cuerpo["blood_pressure_systolic"] == 118
    assert cuerpo["bmi"] == 25.0


def test_cita_inexistente_sigue_siendo_404(client, db_session, escenario):
    """404 queda reservado para esto: la cita no está, volver a la agenda."""
    headers = _auth_headers(db_session, escenario["doctora"])
    respuesta = client.get(f"{PREFIX}/triage/appointment/999999", headers=headers)

    assert respuesta.status_code == 404
    assert "cita" in respuesta.json()["detail"].lower()


def test_openapi_documenta_el_204(client):
    """El contrato vive en el esquema: es de donde el cliente saca que puede
    distinguir sin registro de cita inexistente, en vez de traducir códigos a
    mano en cada hook.
    """
    esquema = client.get("/openapi.json").json()
    ruta = esquema["paths"][f"{PREFIX}/triage/appointment/{{appointment_id}}"]["get"]

    assert "204" in ruta["responses"]
    assert "content" not in ruta["responses"]["204"]
    assert "404" in ruta["responses"]
    assert "200" in ruta["responses"]
