"""Que "todavía no hay nota" no se confunda con "no pude leer la nota".

El endpoint devolvía 404 para dos cosas distintas: cita inexistente y cita sin
nota. El cliente traducía cualquier 404 a "no hay nota" y pintaba un formulario
vacío y editable, así que un problema de acceso o un error se le presentaba a la
doctora como una consulta en blanco, invitándola a escribir encima de una nota
que sí existía. Aquí se fija el contrato: 204 = sin registro, 404 = cita
inexistente, 403 = sin acceso.

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
from app.models.soap_note import SOAPNote
from app.models.tenant import Tenant
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
    """Dos doctores de la misma clínica y un paciente que sólo es de uno.

    El segundo doctor existe para poder distinguir "sin acceso" de "no existe":
    comparte tenant, así que llega hasta la comprobación asistencial.
    """
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    def _user(email):
        user = User(
            email=email,
            hashed_password="no-usado-en-estas-pruebas",
            full_name=f"Médico {email}",
            role=Role.DOCTOR,
            tenant_id=tenant.id,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    doctor = _user("doctora@gems.com")
    otro_doctor = _user("otra.doctora@gems.com")

    paciente = Patient(
        tenant_id=tenant.id,
        first_name="Paciente",
        last_name="De Prueba",
        date_of_birth=datetime(1990, 5, 20).date(),
        owner_doctor_id=doctor.id,
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    cita = Appointment(
        tenant_id=tenant.id,
        patient_id=paciente.id,
        doctor_id=doctor.id,
        scheduled_at=utcnow() + timedelta(days=1),
        duration_minutes=30,
        appointment_type=AppointmentType.CONSULTA,
    )
    db_session.add(cita)
    db_session.commit()
    db_session.refresh(cita)

    return {
        "tenant": tenant,
        "doctor": doctor,
        "otro_doctor": otro_doctor,
        "paciente": paciente,
        "cita": cita,
    }


def test_cita_sin_nota_responde_204_y_cuerpo_vacio(client, db_session, escenario):
    """Ausencia confirmada: es el único caso en que la interfaz puede abrir el
    formulario en blanco sin arriesgarse a tapar una nota existente.
    """
    headers = _auth_headers(db_session, escenario["doctor"])
    respuesta = client.get(
        f"{PREFIX}/soap-notes/appointment/{escenario['cita'].id}", headers=headers
    )

    assert respuesta.status_code == 204
    assert respuesta.content == b""


def test_cita_con_nota_devuelve_la_nota(client, db_session, escenario):
    """El 204 no debe haberse comido el camino feliz."""
    nota = SOAPNote(
        tenant_id=escenario["tenant"].id,
        appointment_id=escenario["cita"].id,
        doctor_id=escenario["doctor"].id,
        subjective="DOLOR ABDOMINAL",
        objective="ABDOMEN BLANDO",
        assessment="DISMENORREA",
        plan="ANALGESICO",
    )
    db_session.add(nota)
    db_session.commit()

    headers = _auth_headers(db_session, escenario["doctor"])
    respuesta = client.get(
        f"{PREFIX}/soap-notes/appointment/{escenario['cita'].id}", headers=headers
    )

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["appointment_id"] == escenario["cita"].id
    assert cuerpo["assessment"] == "DISMENORREA"


def test_cita_inexistente_sigue_siendo_404(client, db_session, escenario):
    """404 queda reservado para esto: la cita no está, volver a la agenda."""
    headers = _auth_headers(db_session, escenario["doctor"])
    respuesta = client.get(f"{PREFIX}/soap-notes/appointment/999999", headers=headers)

    assert respuesta.status_code == 404
    assert "cita" in respuesta.json()["detail"].lower()


def test_doctor_sin_acceso_clinico_recibe_403_y_no_404(client, db_session, escenario):
    """Éste es el caso que provocaba la pérdida de datos: degradado a 404, la
    consulta ajena se dibujaba en blanco y editable en vez de negar el acceso.
    """
    headers = _auth_headers(db_session, escenario["otro_doctor"])
    respuesta = client.get(
        f"{PREFIX}/soap-notes/appointment/{escenario['cita'].id}", headers=headers
    )

    assert respuesta.status_code == 403


def test_sin_acceso_no_se_confunde_con_sin_nota(client, db_session, escenario):
    """La nota existe y el intruso no debe recibir el mismo 204 que quien
    simplemente todavía no ha documentado: son respuestas con sentidos opuestos.
    """
    nota = SOAPNote(
        tenant_id=escenario["tenant"].id,
        appointment_id=escenario["cita"].id,
        doctor_id=escenario["doctor"].id,
        subjective="DOLOR ABDOMINAL",
        objective="",
        assessment="",
        plan="",
    )
    db_session.add(nota)
    db_session.commit()

    headers = _auth_headers(db_session, escenario["otro_doctor"])
    respuesta = client.get(
        f"{PREFIX}/soap-notes/appointment/{escenario['cita'].id}", headers=headers
    )

    assert respuesta.status_code == 403


def test_openapi_documenta_el_204(client):
    """El contrato vive en el esquema, no sólo en la implementación: el cliente
    lo lee de ahí para decidir cuándo puede abrir el formulario vacío.
    """
    esquema = client.get("/openapi.json").json()
    ruta = esquema["paths"][f"{PREFIX}/soap-notes/appointment/{{appointment_id}}"]["get"]

    assert "204" in ruta["responses"]
    assert "content" not in ruta["responses"]["204"]
    assert "403" in ruta["responses"]
    assert "404" in ruta["responses"]
    assert "200" in ruta["responses"]
