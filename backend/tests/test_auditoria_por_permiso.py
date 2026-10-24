"""La bitacora se abre por ``audit.read``, no por la etiqueta del rol.

Master ofrece conceder ``audit.read``; mientras el endpoint pidiera el rol
admin, concederlo mostraba "Auditoria" en el menu y la pantalla fallaba.
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


def test_admin_sigue_viendo_la_bitacora(client, db_session, tenant):
    admin = _usuario(db_session, tenant, Role.ADMIN)

    respuesta = client.get(f"{PREFIX}/audit-logs", headers=_headers(db_session, admin))

    assert respuesta.status_code == 200


def test_una_doctora_sin_el_permiso_no_ve_la_bitacora(client, db_session, tenant):
    doctora = _usuario(db_session, tenant, Role.DOCTOR)

    respuesta = client.get(f"{PREFIX}/audit-logs", headers=_headers(db_session, doctora))

    assert respuesta.status_code == 403


def test_una_doctora_con_el_permiso_concedido_ve_la_bitacora(client, db_session, tenant):
    doctora = _usuario(db_session, tenant, Role.DOCTOR)
    db_session.add(
        Permission(role="doctor", action="audit.read", is_granted=True, user_id=doctora.id)
    )
    db_session.commit()

    respuesta = client.get(f"{PREFIX}/audit-logs", headers=_headers(db_session, doctora))

    assert respuesta.status_code == 200


def test_el_filtro_de_fechas_de_la_bitacora_es_en_hora_del_consultorio(client, db_session, tenant):
    """``created_at`` está en UTC; el día que se pide es el del consultorio.

    Lo de las 23:30 del 3 de octubre en Mazatlán se guarda como 06:30 del 4 en
    UTC. Pedir "el 3 de octubre" comparando sin traducir dejaba fuera lo de
    esa noche y metía lo de la noche del 2.
    """
    from datetime import datetime

    from app.models.audit_log import AuditLog

    for momento_utc, accion in (
        (datetime(2026, 10, 4, 6, 30), "prueba.noche_del_3"),
        (datetime(2026, 10, 3, 3, 0), "prueba.noche_del_2"),
    ):
        db_session.add(
            AuditLog(
                tenant_id=tenant.id,
                action=accion,
                entity_type="prueba",
                created_at=momento_utc,
            )
        )
    db_session.commit()
    admin = _usuario(db_session, tenant, Role.ADMIN)

    respuesta = client.get(
        f"{PREFIX}/audit-logs",
        params={
            "action": "prueba.",
            "date_from": "2026-10-03T00:00:00",
            "date_to": "2026-10-03T23:59:59",
        },
        headers=_headers(db_session, admin),
    )

    assert respuesta.status_code == 200, respuesta.text
    assert [item["action"] for item in respuesta.json()["items"]] == ["prueba.noche_del_3"]
