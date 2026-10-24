"""Filtro de fichas incompletas en la lista de pacientes (plan 32, punto 5).

El alta exprés crea pacientes sin fecha de nacimiento. El filtro las encuentra
sin cambiar nada más de la lista.
"""
from datetime import date, timedelta
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
from app.models.tenant import Tenant
from app.models.user import Role, User
from app.models.user_session import UserSession

PREFIX = settings.API_V1_PREFIX


@pytest.fixture
def db_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
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


def _headers(db, user):
    sesion = UserSession(
        id=str(uuid4()), user_id=user.id, tenant_id=user.tenant_id,
        refresh_jti=str(uuid4()), expires_at=utcnow() + timedelta(days=1),
    )
    db.add(sesion)
    db.commit()
    token = security.create_access_token(data={"sub": str(user.id), "role": user.role.value, "sid": sesion.id})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def escenario(db_session):
    tenant = Tenant(name="Clínica", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    secretaria = User(email="s@gems.com", hashed_password="x", full_name="Recepción",
                      role=Role.SECRETARIA, tenant_id=tenant.id, is_active=True)
    db_session.add(secretaria)
    db_session.commit()
    for nombre, nacimiento in [("COMPLETA", date(1990, 1, 1)), ("EXPRES", None), ("OTRA EXPRES", None)]:
        db_session.add(Patient(tenant_id=tenant.id, first_name=nombre, last_name="PRUEBA", date_of_birth=nacimiento))
    db_session.commit()
    return secretaria


def test_sin_filtro_salen_todas(client, db_session, escenario):
    r = client.get(f"{PREFIX}/patients", headers=_headers(db_session, escenario))
    assert r.status_code == 200, r.text
    assert len(r.json()) == 3


def test_incompletas_solo_trae_las_que_no_tienen_fecha_de_nacimiento(client, db_session, escenario):
    r = client.get(f"{PREFIX}/patients", params={"incompletas": "true"}, headers=_headers(db_session, escenario))
    assert r.status_code == 200, r.text
    nombres = sorted(p["first_name"] for p in r.json())
    assert nombres == ["EXPRES", "OTRA EXPRES"]


def test_incompletas_respeta_la_paginacion(client, db_session, escenario):
    r = client.get(f"{PREFIX}/patients", params={"incompletas": "true", "limit": 1},
                   headers=_headers(db_session, escenario))
    assert len(r.json()) == 1
