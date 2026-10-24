"""Borrar un rol personalizado que alguien tiene asignado.

``users.custom_role_id`` apunta al rol sin ``ondelete``. Borrarlo con cuentas
asignadas dejaba a esas cuentas con un perfil que ya no existe (o, según el
motor, un 500 por la llave foránea), y además sin rastro de quién lo borró.
Ahora responde 409 con un mensaje que dice qué hacer, y el borrado que sí
procede queda en la bitácora. Acción B-04 del backlog de auditoría.

Usan SQLite en memoria y sobrescriben ``get_db``, como ``test_auditoria_por_permiso.py``.
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
from app.models.audit_log import AuditLog
from app.models.custom_role import CustomRole
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


def _usuario(db, tenant, role: Role, *, custom_role_id=None, is_active=True) -> User:
    user = User(
        email=f"{role.value}-{uuid4().hex[:6]}@gems.com",
        hashed_password="no-se-usa",
        full_name=f"Usuario {role.value}",
        role=role,
        tenant_id=tenant.id,
        custom_role_id=custom_role_id,
        is_active=is_active,
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


@pytest.fixture
def escenario(db_session):
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    rol = CustomRole(tenant_id=tenant.id, name="Enfermería", base_role="secretaria")
    db_session.add(rol)
    db_session.commit()
    db_session.refresh(rol)

    master = _usuario(db_session, tenant, Role.MASTER)
    return {"tenant": tenant, "rol": rol, "master": master}


def test_borrar_un_rol_asignado_responde_409_y_no_lo_borra(client, db_session, escenario):
    cuenta = _usuario(db_session, escenario["tenant"], Role.SECRETARIA, custom_role_id=escenario["rol"].id)

    respuesta = client.delete(
        f"{PREFIX}/custom-roles/{escenario['rol'].id}",
        headers=_headers(db_session, escenario["master"]),
    )

    assert respuesta.status_code == 409, respuesta.text
    detalle = respuesta.json()["detail"]
    assert "Enfermería" in detalle
    assert "una cuenta" in detalle
    db_session.expire_all()
    assert db_session.get(CustomRole, escenario["rol"].id) is not None
    assert db_session.get(User, cuenta.id).custom_role_id == escenario["rol"].id


def test_una_cuenta_inactiva_tambien_cuenta_como_uso(client, db_session, escenario):
    """Si se reactivara, quedaría con un perfil que ya no existe."""
    _usuario(db_session, escenario["tenant"], Role.SECRETARIA, custom_role_id=escenario["rol"].id, is_active=False)
    _usuario(db_session, escenario["tenant"], Role.SECRETARIA, custom_role_id=escenario["rol"].id)

    respuesta = client.delete(
        f"{PREFIX}/custom-roles/{escenario['rol'].id}",
        headers=_headers(db_session, escenario["master"]),
    )

    assert respuesta.status_code == 409, respuesta.text
    assert "2 cuentas" in respuesta.json()["detail"]


def test_borrar_un_rol_sin_uso_lo_borra_y_queda_en_la_bitacora(client, db_session, escenario):
    rol_id = escenario["rol"].id

    respuesta = client.delete(
        f"{PREFIX}/custom-roles/{rol_id}",
        headers=_headers(db_session, escenario["master"]),
    )

    assert respuesta.status_code == 204, respuesta.text
    db_session.expire_all()
    assert db_session.get(CustomRole, rol_id) is None

    registros = db_session.query(AuditLog).filter(AuditLog.action == "custom_role.deleted").all()
    assert len(registros) == 1
    registro = registros[0]
    assert registro.actor_user_id == escenario["master"].id
    assert registro.tenant_id == escenario["tenant"].id
    assert registro.entity_id == rol_id
    assert registro.details == {"name": "Enfermería", "base_role": "secretaria"}


def test_un_borrado_rechazado_no_deja_registro_de_borrado(client, db_session, escenario):
    """La bitácora no puede decir que se borró algo que sigue ahí."""
    _usuario(db_session, escenario["tenant"], Role.SECRETARIA, custom_role_id=escenario["rol"].id)

    client.delete(
        f"{PREFIX}/custom-roles/{escenario['rol'].id}",
        headers=_headers(db_session, escenario["master"]),
    )

    assert db_session.query(AuditLog).filter(AuditLog.action == "custom_role.deleted").count() == 0
