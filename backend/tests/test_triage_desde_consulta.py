"""El médico toma los signos vitales cuando nadie lo hizo en la sala de espera.

Muchas veces no hay asistente que pase al paciente por triage, y el médico
empieza la consulta sin presión ni peso. Hasta ahora `triage.create` era sólo
de recepción: el médico no tenía cómo capturarlos y la consulta se cerraba con
el hueco en el expediente.

La puerta se abre con la misma regla que la nota de esa consulta: sólo sobre
sus propias pacientes. Recepción conserva su alcance de toda la sucursal.

Usan SQLite en memoria y sobrescriben ``get_db``, como ``test_triage_sin_registro.py``.
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

SIGNOS = {
    "weight_kg": 64.0,
    "height_cm": 160.0,
    "blood_pressure_systolic": 118,
    "blood_pressure_diastolic": 76,
    "temperature_celsius": 36.7,
    "chief_complaint": "DOLOR DE CABEZA",
}


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


def _usuario(db, tenant, email, role):
    usuario = User(
        email=email,
        hashed_password="no-usado-en-estas-pruebas",
        full_name=email.split("@")[0],
        role=role,
        tenant_id=tenant.id,
        is_active=True,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


@pytest.fixture
def escenario(db_session):
    """Dos doctoras de la misma sucursal y una cita de la primera sin signos."""
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    doctora = _usuario(db_session, tenant, "doctora@gems.com", Role.DOCTOR)
    colega = _usuario(db_session, tenant, "colega@gems.com", Role.DOCTOR)
    secretaria = _usuario(db_session, tenant, "secretaria@gems.com", Role.SECRETARIA)

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
        scheduled_at=utcnow() + timedelta(hours=1),
        duration_minutes=30,
        appointment_type=AppointmentType.CONSULTA,
    )
    db_session.add(cita)
    db_session.commit()
    db_session.refresh(cita)

    return {
        "doctora": doctora,
        "colega": colega,
        "secretaria": secretaria,
        "cita": cita,
    }


def _triage_de(db, cita_id):
    return db.query(Triage).filter(Triage.appointment_id == cita_id).first()


def test_la_doctora_registra_los_signos_de_su_paciente(client, db_session, escenario):
    """El caso real: nadie la pasó por triage y el médico los toma ella."""
    headers = _auth_headers(db_session, escenario["doctora"])
    respuesta = client.post(
        f"{PREFIX}/triage",
        json={"appointment_id": escenario["cita"].id, **SIGNOS},
        headers=headers,
    )

    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["blood_pressure_systolic"] == 118
    assert cuerpo["bmi"] == 25.0
    # Queda a su nombre: la bitácora clínica tiene que decir quién los tomó.
    assert cuerpo["created_by_user_id"] == escenario["doctora"].id
    assert _triage_de(db_session, escenario["cita"].id) is not None


def test_la_doctora_corrige_los_signos_que_capturo(client, db_session, escenario):
    headers = _auth_headers(db_session, escenario["doctora"])
    creado = client.post(
        f"{PREFIX}/triage",
        json={"appointment_id": escenario["cita"].id, **SIGNOS},
        headers=headers,
    ).json()

    respuesta = client.put(
        f"{PREFIX}/triage/{creado['id']}",
        json={"blood_pressure_systolic": 130},
        headers=headers,
    )

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["blood_pressure_systolic"] == 130


def test_otra_doctora_no_captura_signos_de_una_paciente_ajena(client, db_session, escenario):
    """Misma sucursal no basta: la regla es la de la nota, no la de la agenda."""
    headers = _auth_headers(db_session, escenario["colega"])
    respuesta = client.post(
        f"{PREFIX}/triage",
        json={"appointment_id": escenario["cita"].id, **SIGNOS},
        headers=headers,
    )

    assert respuesta.status_code == 403
    assert _triage_de(db_session, escenario["cita"].id) is None


def test_otra_doctora_no_corrige_signos_de_una_paciente_ajena(client, db_session, escenario):
    triage = Triage(
        appointment_id=escenario["cita"].id,
        created_by_user_id=escenario["secretaria"].id,
        **SIGNOS,
    )
    db_session.add(triage)
    db_session.commit()
    db_session.refresh(triage)

    headers = _auth_headers(db_session, escenario["colega"])
    respuesta = client.put(
        f"{PREFIX}/triage/{triage.id}",
        json={"blood_pressure_systolic": 200},
        headers=headers,
    )

    assert respuesta.status_code == 403
    db_session.refresh(triage)
    assert triage.blood_pressure_systolic == 118


def test_recepcion_sigue_capturando_signos_de_toda_la_sucursal(client, db_session, escenario):
    """La secretaria no es dueña de ningún expediente: acotarla rompería la sala."""
    headers = _auth_headers(db_session, escenario["secretaria"])
    respuesta = client.post(
        f"{PREFIX}/triage",
        json={"appointment_id": escenario["cita"].id, **SIGNOS},
        headers=headers,
    )

    assert respuesta.status_code == 201, respuesta.text


def test_si_recepcion_ya_los_tomo_la_doctora_no_los_duplica(client, db_session, escenario):
    """Dos capturas de la misma cita dejarían dos presiones distintas sin saber cuál vale."""
    client.post(
        f"{PREFIX}/triage",
        json={"appointment_id": escenario["cita"].id, **SIGNOS},
        headers=_auth_headers(db_session, escenario["secretaria"]),
    )

    respuesta = client.post(
        f"{PREFIX}/triage",
        json={"appointment_id": escenario["cita"].id, **SIGNOS},
        headers=_auth_headers(db_session, escenario["doctora"]),
    )

    assert respuesta.status_code == 400
    assert db_session.query(Triage).filter(Triage.appointment_id == escenario["cita"].id).count() == 1


# --- Lecturas (acción B-02 del backlog de auditoría) ------------------------
#
# Leer los signos pide lo mismo que leer la nota: el médico sólo los de sus
# pacientes. Recepción y administración leen los de toda la sucursal, porque
# recepción los captura y tiene que poder abrirlos para corregirlos.


def _signos_tomados_por_recepcion(db, escenario) -> Triage:
    triage = Triage(
        appointment_id=escenario["cita"].id,
        created_by_user_id=escenario["secretaria"].id,
        **SIGNOS,
    )
    db.add(triage)
    db.commit()
    db.refresh(triage)
    return triage


def test_otra_doctora_no_lee_los_signos_de_la_cita_de_una_paciente_ajena(client, db_session, escenario):
    _signos_tomados_por_recepcion(db_session, escenario)

    respuesta = client.get(
        f"{PREFIX}/triage/appointment/{escenario['cita'].id}",
        headers=_auth_headers(db_session, escenario["colega"]),
    )

    assert respuesta.status_code == 403
    assert "118" not in respuesta.text


def test_otra_doctora_no_sabe_si_la_paciente_ajena_ya_paso_por_triage(client, db_session, escenario):
    """Sin signos, el médico ajeno recibe 403 y no el 204 que delataría que faltan."""
    respuesta = client.get(
        f"{PREFIX}/triage/appointment/{escenario['cita'].id}",
        headers=_auth_headers(db_session, escenario["colega"]),
    )

    assert respuesta.status_code == 403


def test_otra_doctora_no_lee_el_historial_de_signos_de_una_paciente_ajena(client, db_session, escenario):
    _signos_tomados_por_recepcion(db_session, escenario)

    respuesta = client.get(
        f"{PREFIX}/triage/patient/{escenario['cita'].patient_id}/all",
        headers=_auth_headers(db_session, escenario["colega"]),
    )

    assert respuesta.status_code == 403


def test_la_doctora_lee_los_signos_y_el_historial_de_su_paciente(client, db_session, escenario):
    _signos_tomados_por_recepcion(db_session, escenario)
    headers = _auth_headers(db_session, escenario["doctora"])

    de_la_cita = client.get(f"{PREFIX}/triage/appointment/{escenario['cita'].id}", headers=headers)
    historial = client.get(f"{PREFIX}/triage/patient/{escenario['cita'].patient_id}/all", headers=headers)

    assert de_la_cita.status_code == 200, de_la_cita.text
    assert de_la_cita.json()["blood_pressure_systolic"] == 118
    assert historial.status_code == 200, historial.text
    assert len(historial.json()) == 1


def test_recepcion_y_administracion_siguen_leyendo_los_signos_de_la_sucursal(client, db_session, escenario):
    """Ninguna es dueña del expediente; acotarlas dejaría a recepción sin corregir lo que capturó."""
    _signos_tomados_por_recepcion(db_session, escenario)
    admin = _usuario(db_session, escenario["cita"].tenant, "admin@gems.com", Role.ADMIN)

    for usuario in (escenario["secretaria"], admin):
        headers = _auth_headers(db_session, usuario)
        de_la_cita = client.get(f"{PREFIX}/triage/appointment/{escenario['cita'].id}", headers=headers)
        historial = client.get(f"{PREFIX}/triage/patient/{escenario['cita'].patient_id}/all", headers=headers)

        assert de_la_cita.status_code == 200, (usuario.role, de_la_cita.text)
        assert historial.status_code == 200, (usuario.role, historial.text)
        assert len(historial.json()) == 1
