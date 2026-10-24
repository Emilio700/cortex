"""Quién escribió qué en el expediente: nota de consulta, signos y paciente.

Recetas, pagos, consentimientos e imágenes ya dejaban rastro en la bitácora;
la nota de consulta, los signos vitales y el alta, edición o desactivación de
un paciente no. En un expediente clínico (NOM-004) esa pregunta no puede
depender del módulo. Acción B-01 del backlog de auditoría.

Se afirma contra la tabla ``audit_logs`` y contra ``GET /audit-logs``, que es
lo que lee la pantalla de Auditoría: un registro que nadie puede ver no sirve.

Usan SQLite en memoria y sobrescriben ``get_db``, como ``test_triage_desde_consulta.py``.
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
from app.models.audit_log import AuditLog
from app.models.patient import Patient
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
    """Un médico con su paciente y una cita; recepción, admin y master."""
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    doctora = _usuario(db_session, tenant, "doctora@gems.com", Role.DOCTOR)
    secretaria = _usuario(db_session, tenant, "secretaria@gems.com", Role.SECRETARIA)
    admin = _usuario(db_session, tenant, "admin@gems.com", Role.ADMIN)
    master = _usuario(db_session, tenant, "master@gems.com", Role.MASTER)

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
        "tenant": tenant,
        "doctora": doctora,
        "secretaria": secretaria,
        "admin": admin,
        "master": master,
        "paciente": paciente,
        "cita": cita,
    }


def _registros(db, accion):
    db.expire_all()
    return db.query(AuditLog).filter(AuditLog.action == accion).all()


def _unico(db, accion) -> AuditLog:
    registros = _registros(db, accion)
    assert len(registros) == 1, f"Se esperaba un registro «{accion}» y hay {len(registros)}"
    return registros[0]


# --- Nota de consulta -------------------------------------------------------


def test_escribir_la_nota_de_consulta_deja_quien_y_de_que_paciente(client, db_session, escenario):
    respuesta = client.post(
        f"{PREFIX}/soap-notes",
        headers=_auth_headers(db_session, escenario["doctora"]),
        json={"appointment_id": escenario["cita"].id, "plan": "REPOSO"},
    )
    assert respuesta.status_code == 201, respuesta.text

    registro = _unico(db_session, "soap_note.created")
    assert registro.actor_user_id == escenario["doctora"].id
    assert registro.tenant_id == escenario["tenant"].id
    assert registro.patient_id == escenario["paciente"].id
    assert registro.entity_id == respuesta.json()["id"]
    assert registro.details["appointment_id"] == escenario["cita"].id


def test_corregir_la_nota_registra_los_apartados_sin_copiar_el_texto(client, db_session, escenario):
    """La bitácora dice qué apartados cambiaron, no se vuelve otra copia del expediente."""
    headers = _auth_headers(db_session, escenario["doctora"])
    creada = client.post(
        f"{PREFIX}/soap-notes",
        headers=headers,
        json={"appointment_id": escenario["cita"].id, "plan": "REPOSO"},
    )
    assert creada.status_code == 201, creada.text

    respuesta = client.put(
        f"{PREFIX}/soap-notes/{creada.json()['id']}",
        headers=headers,
        json={"assessment": "DISMENORREA", "plan": "REPOSO Y ANALGÉSICO"},
    )
    assert respuesta.status_code == 200, respuesta.text

    registro = _unico(db_session, "soap_note.updated")
    assert registro.actor_user_id == escenario["doctora"].id
    assert registro.patient_id == escenario["paciente"].id
    assert registro.details["changed_fields"] == ["assessment", "plan"]
    assert "DISMENORREA" not in str(registro.details)


# --- Signos vitales ---------------------------------------------------------


def test_capturar_signos_deja_quien_los_tomo(client, db_session, escenario):
    """Recepción en la sala de espera o el médico en consulta: hay que poder saberlo."""
    respuesta = client.post(
        f"{PREFIX}/triage",
        headers=_auth_headers(db_session, escenario["secretaria"]),
        json={"appointment_id": escenario["cita"].id, "weight_kg": 64.0},
    )
    assert respuesta.status_code == 201, respuesta.text

    registro = _unico(db_session, "triage.created")
    assert registro.actor_user_id == escenario["secretaria"].id
    assert registro.tenant_id == escenario["tenant"].id
    assert registro.patient_id == escenario["paciente"].id
    assert registro.entity_id == respuesta.json()["id"]


def test_corregir_signos_registra_los_campos_cambiados(client, db_session, escenario):
    creados = client.post(
        f"{PREFIX}/triage",
        headers=_auth_headers(db_session, escenario["secretaria"]),
        json={"appointment_id": escenario["cita"].id, "weight_kg": 64.0},
    )
    assert creados.status_code == 201, creados.text

    respuesta = client.put(
        f"{PREFIX}/triage/{creados.json()['id']}",
        headers=_auth_headers(db_session, escenario["doctora"]),
        json={"weight_kg": 63.5},
    )
    assert respuesta.status_code == 200, respuesta.text

    registro = _unico(db_session, "triage.updated")
    assert registro.actor_user_id == escenario["doctora"].id
    assert registro.patient_id == escenario["paciente"].id
    assert registro.details["changed_fields"] == ["weight_kg"]


# --- Paciente ---------------------------------------------------------------


def test_dar_de_alta_una_paciente_queda_en_la_bitacora(client, db_session, escenario):
    respuesta = client.post(
        f"{PREFIX}/patients",
        headers=_auth_headers(db_session, escenario["secretaria"]),
        json={"first_name": "Ana", "last_name": "López", "cell_phone": "5512345678"},
    )
    assert respuesta.status_code == 201, respuesta.text

    registro = _unico(db_session, "patient.created")
    assert registro.actor_user_id == escenario["secretaria"].id
    assert registro.tenant_id == escenario["tenant"].id
    assert registro.patient_id == respuesta.json()["id"]


def test_editar_una_paciente_registra_los_campos_sin_los_valores(client, db_session, escenario):
    respuesta = client.put(
        f"{PREFIX}/patients/{escenario['paciente'].id}",
        headers=_auth_headers(db_session, escenario["secretaria"]),
        json={"cell_phone": "5598765432"},
    )
    assert respuesta.status_code == 200, respuesta.text

    registro = _unico(db_session, "patient.updated")
    assert registro.actor_user_id == escenario["secretaria"].id
    assert registro.patient_id == escenario["paciente"].id
    assert registro.details["changed_fields"] == ["cell_phone"]
    assert "5598765432" not in str(registro.details)


def test_desactivar_una_paciente_deja_quien_lo_hizo(client, db_session, escenario):
    """Un paciente desactivada sale de la búsqueda; sin registro nadie sabría por qué."""
    respuesta = client.patch(
        f"{PREFIX}/patients/{escenario['paciente'].id}/deactivate",
        headers=_auth_headers(db_session, escenario["master"]),
    )
    assert respuesta.status_code == 200, respuesta.text

    registro = _unico(db_session, "patient.deactivated")
    assert registro.actor_user_id == escenario["master"].id
    assert registro.tenant_id == escenario["tenant"].id
    assert registro.patient_id == escenario["paciente"].id


# --- Lo que ve la pantalla de Auditoría -------------------------------------


def test_la_pantalla_de_auditoria_muestra_la_nota_con_actor_y_paciente(client, db_session, escenario):
    creada = client.post(
        f"{PREFIX}/soap-notes",
        headers=_auth_headers(db_session, escenario["doctora"]),
        json={"appointment_id": escenario["cita"].id, "plan": "REPOSO"},
    )
    assert creada.status_code == 201, creada.text

    respuesta = client.get(
        f"{PREFIX}/audit-logs",
        headers=_auth_headers(db_session, escenario["admin"]),
        params={"patient_id": escenario["paciente"].id},
    )
    assert respuesta.status_code == 200, respuesta.text

    notas = [r for r in respuesta.json()["items"] if r["action"] == "soap_note.created"]
    assert len(notas) == 1
    assert notas[0]["actor_name"] == escenario["doctora"].full_name
    assert notas[0]["patient_id"] == escenario["paciente"].id
