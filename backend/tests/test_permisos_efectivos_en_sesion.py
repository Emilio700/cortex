"""``/auth/me`` entrega los permisos efectivos de la sesión (B2 del plan maestro).

Sin esto, la pantalla de Master concede permisos que el frontend nunca llega a
mirar: la doctora recibía ``triage.create`` y su menú seguía igual. El campo es
aditivo, así que ninguna pantalla vieja se entera.
"""
from datetime import timedelta
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
from app.models.permission import ALL_PERMISSIONS, Permission
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


@pytest.fixture
def tenant(db_session):
    t = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    return t


def _usuario(db, tenant, role: Role) -> User:
    user = User(
        email=f"{role.value}-{uuid4().hex[:6]}@gems.com",
        hashed_password="no-se-usa",
        full_name=f"Usuario {role.value}",
        role=role,
        tenant_id=tenant.id,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _headers(db, user: User) -> dict[str, str]:
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


def test_el_perfil_trae_los_permisos_del_rol(client, db_session, tenant):
    doctora = _usuario(db_session, tenant, Role.DOCTOR)

    respuesta = client.get(f"{PREFIX}/auth/me", headers=_headers(db_session, doctora))

    assert respuesta.status_code == 200
    permisos = respuesta.json()["permissions"]
    assert "soap_notes.create" in permisos
    # El rol sigue viajando: las pantallas aún no migradas dependen de él.
    assert respuesta.json()["role"] == "doctor"


def test_un_permiso_concedido_desde_master_aparece_en_el_perfil(client, db_session, tenant):
    """El caso que motivó todo: conceder algo a una doctora y que se note.

    El caso real fue triage, que después pasó a ser de la doctora por defecto;
    se prueba con los reportes, que el rol sigue sin traer (el corte de caja
    también sirvió de ejemplo hasta que el plan 23 se lo dio a la doctora).
    """
    doctora = _usuario(db_session, tenant, Role.DOCTOR)
    assert "reports.read" not in client.get(
        f"{PREFIX}/auth/me", headers=_headers(db_session, doctora)
    ).json()["permissions"]

    db_session.add(
        Permission(role="doctor", action="reports.read", is_granted=True, user_id=doctora.id)
    )
    db_session.commit()

    permisos = client.get(f"{PREFIX}/auth/me", headers=_headers(db_session, doctora)).json()[
        "permissions"
    ]
    assert "reports.read" in permisos


def test_una_denegacion_explicita_no_aparece_en_el_perfil(client, db_session, tenant):
    secretaria = _usuario(db_session, tenant, Role.SECRETARIA)
    db_session.add(
        Permission(role="secretaria", action="payments.create", is_granted=False, user_id=secretaria.id)
    )
    db_session.commit()

    permisos = client.get(
        f"{PREFIX}/auth/me", headers=_headers(db_session, secretaria)
    ).json()["permissions"]

    assert "payments.create" not in permisos


def test_master_recibe_el_catalogo_completo(client, db_session, tenant):
    master = _usuario(db_session, tenant, Role.MASTER)

    permisos = client.get(f"{PREFIX}/auth/me", headers=_headers(db_session, master)).json()[
        "permissions"
    ]

    assert set(permisos) == set(ALL_PERMISSIONS)
