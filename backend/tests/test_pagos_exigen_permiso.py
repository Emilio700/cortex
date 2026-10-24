"""Los pagos se leen sólo con ``payments.read``.

Hasta ahora ``GET /payments``, ``GET /payments/{id}`` y
``GET /payments/patient/{id}/all`` pedían nada más una sesión válida: cualquier
doctora podía leer por API todo el dinero de su sucursal, aunque la pantalla no
le mostrara el menú. Crear, cortar y enviar recibo ya exigían su permiso; la
lectura era la única puerta abierta (plan 23, "Defectos que se corrigen").

Usan SQLite en memoria y sobrescriben ``get_db``, como ``test_triage_desde_consulta.py``.
"""
from datetime import datetime, timedelta
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
from app.models.patient import Patient
from app.models.payment import Payment, PaymentMethod
from app.models.permission import Permission
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
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    pago = Payment(
        tenant_id=tenant.id,
        patient_id=paciente.id,
        received_by_user_id=secretaria.id,
        amount=Decimal("800.00"),
        method=PaymentMethod.CASH,
    )
    db_session.add(pago)
    db_session.commit()
    db_session.refresh(pago)

    return {
        "doctora": doctora,
        "secretaria": secretaria,
        "admin": admin,
        "paciente": paciente,
        "pago": pago,
    }


def _rutas(escenario):
    return [
        f"{PREFIX}/payments",
        f"{PREFIX}/payments/{escenario['pago'].id}",
        f"{PREFIX}/payments/patient/{escenario['paciente'].id}/all",
    ]


def test_sin_payments_read_no_se_leen_los_pagos(client, db_session, escenario):
    """Una sesión válida no basta: sin el permiso, el dinero de la sucursal no se ve."""
    doctora = escenario["doctora"]
    # Se le niega explícitamente para que la prueba siga describiendo la fuga
    # aunque el rol doctor reciba ``payments.read`` por defecto (plan 23).
    db_session.add(
        Permission(role="doctor", action="payments.read", is_granted=False, user_id=doctora.id)
    )
    db_session.commit()
    headers = _auth_headers(db_session, doctora)

    for ruta in _rutas(escenario):
        respuesta = client.get(ruta, headers=headers)
        assert respuesta.status_code == 403, f"{ruta}: {respuesta.text}"


@pytest.mark.parametrize("rol", ["secretaria", "admin"])
def test_recepcion_y_administracion_siguen_leyendo_los_pagos(client, db_session, escenario, rol):
    headers = _auth_headers(db_session, escenario[rol])

    for ruta in _rutas(escenario):
        respuesta = client.get(ruta, headers=headers)
        assert respuesta.status_code == 200, f"{ruta}: {respuesta.text}"
