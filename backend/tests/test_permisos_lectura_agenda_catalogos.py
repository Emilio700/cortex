"""Las lecturas de agenda y catálogos exigen su permiso de lectura (B-03).

``GET /appointments``, ``/appointments/ocupacion-salas``, ``/appointments/{id}``,
``/doctor-schedule/blocks``, ``/services``, ``/services/{id}`` y ``/specialties``
pedían nada más una sesión válida. Quitarle a un perfil ``appointments.read``
le escondía el menú, pero por API seguía leyendo la agenda completa de la
sucursal (auditoría, ``06`` M1).

Dos cosas se comprueban: sin el permiso, 403; y los tres roles que hoy viven de
esas lecturas (recepción con la agenda, el médico con su calendario y el
cobro, administración) las siguen teniendo por defecto.

Usan SQLite en memoria y sobrescriben ``get_db``, como ``test_pagos_exigen_permiso.py``.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal
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
from app.models.permission import ROLE_DEFAULT_PERMISSIONS, Permission
from app.models.service import Service
from app.models.tenant import Tenant
from app.models.user import Role, User
from app.models.user_session import UserSession

PREFIX = settings.API_V1_PREFIX
ROLES = ["doctora", "secretaria", "admin"]


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
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    doctora = _usuario(db_session, tenant, "doctora@gems.com", Role.DOCTOR)
    secretaria = _usuario(db_session, tenant, "secretaria@gems.com", Role.SECRETARIA)
    admin = _usuario(db_session, tenant, "admin@gems.com", Role.ADMIN)

    paciente = Patient(
        tenant_id=tenant.id,
        first_name="Paciente",
        last_name="De Prueba",
        date_of_birth=datetime(1990, 5, 20).date(),
        owner_doctor_id=doctora.id,
    )
    servicio = Service(tenant_id=tenant.id, name="Consulta", price=Decimal("800.00"))
    db_session.add_all([paciente, servicio])
    db_session.commit()

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

    return {
        "doctora": doctora,
        "secretaria": secretaria,
        "admin": admin,
        "cita": cita,
        "servicio": servicio,
    }


def _lecturas(escenario):
    """(ruta, permiso que la abre). ``doctor_id`` lo exigen recepción y administración."""
    doctora_id = escenario["doctora"].id
    return [
        (f"{PREFIX}/appointments", "appointments.read"),
        (f"{PREFIX}/appointments/ocupacion-salas?fecha={date.today().isoformat()}", "appointments.read"),
        (f"{PREFIX}/appointments/{escenario['cita'].id}", "appointments.read"),
        (f"{PREFIX}/doctor-schedule/blocks?doctor_id={doctora_id}", "schedule.blocks.read"),
        (f"{PREFIX}/services", "services.read"),
        (f"{PREFIX}/services/{escenario['servicio'].id}", "services.read"),
        (f"{PREFIX}/specialties", "services.read"),
    ]


@pytest.mark.parametrize("rol", ROLES)
def test_los_tres_roles_conservan_sus_lecturas(client, db_session, escenario, rol):
    """Nadie pierde la agenda ni los catálogos: los tres roles traen esos permisos."""
    headers = _auth_headers(db_session, escenario[rol])

    for ruta, _ in _lecturas(escenario):
        respuesta = client.get(ruta, headers=headers)
        assert respuesta.status_code == 200, f"{rol} {ruta}: {respuesta.text}"


@pytest.mark.parametrize("rol", ROLES)
def test_sin_el_permiso_de_lectura_la_ruta_responde_403(client, db_session, escenario, rol):
    usuario = escenario[rol]
    for ruta, permiso in _lecturas(escenario):
        negado = Permission(role=usuario.role.value, action=permiso, is_granted=False, user_id=usuario.id)
        db_session.add(negado)
        db_session.commit()

        respuesta = client.get(ruta, headers=_auth_headers(db_session, usuario))

        assert respuesta.status_code == 403, f"{rol} {ruta}: {respuesta.text}"
        db_session.delete(negado)
        db_session.commit()


def test_los_permisos_que_se_exigen_vienen_en_los_tres_roles():
    """Si alguien quita uno de estos de un rol base, esta prueba avisa antes que la agenda."""
    for rol in ("doctor", "secretaria", "admin"):
        for permiso in ("appointments.read", "schedule.blocks.read", "services.read"):
            assert permiso in ROLE_DEFAULT_PERMISSIONS[rol], (rol, permiso)
