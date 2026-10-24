"""Pruebas de extremo a extremo del router de sucursales (tenants).

Usan SQLite en memoria y sobrescriben ``get_db``, de modo que no hace falta
una base Postgres levantada para verificar el contrato de la API.
"""
from datetime import timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import security
from app.core.config import settings
from app.core.deps import get_db
from app.db.session import Base, utcnow
from app.main import app
from app.models.doctor_clinic import DoctorClinic
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


def _make_tenant(db, name: str, is_active: bool = True) -> Tenant:
    tenant = Tenant(name=name, is_active=is_active)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


def _make_user(db, email: str, role: Role, tenant: Tenant) -> User:
    user = User(
        email=email,
        hashed_password="no-usado-en-estas-pruebas",
        full_name=f"Usuario {role.value}",
        role=role,
        tenant_id=tenant.id,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _auth_headers(db, user: User) -> dict[str, str]:
    """Emula una sesión iniciada: crea la sesión y firma el access token."""
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


# --- TAREA 1: el token devuelto por el switch debe servir para autenticarse ---


def test_switch_devuelve_token_utilizable(client, db_session):
    origen = _make_tenant(db_session, "Sucursal A")
    destino = _make_tenant(db_session, "Sucursal B")
    master = _make_user(db_session, "master@gems.com", Role.MASTER, origen)

    response = client.put(
        f"{PREFIX}/tenants/{destino.id}/switch", headers=_auth_headers(db_session, master)
    )
    assert response.status_code == 200
    body = response.json()
    assert body["tenant_id"] == destino.id
    assert body["tenant_name"] == destino.name
    assert body["token_type"] == "bearer"
    assert body["refresh_token"]

    # El token nuevo debe autenticar en un endpoint protegido (antes no llevaba
    # el claim "sid" y devolvía 401).
    protegido = client.get(
        f"{PREFIX}/tenants", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert protegido.status_code == 200


def test_switch_access_token_incluye_claim_sid(client, db_session):
    origen = _make_tenant(db_session, "Sucursal A")
    destino = _make_tenant(db_session, "Sucursal B")
    master = _make_user(db_session, "master@gems.com", Role.MASTER, origen)

    body = client.put(
        f"{PREFIX}/tenants/{destino.id}/switch", headers=_auth_headers(db_session, master)
    ).json()
    payload = jwt.decode(
        body["access_token"], settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
    )
    assert payload.get("sid")


# --- TAREA 2: pertenencia usuario <-> sucursal ---


def test_admin_no_puede_cambiar_a_otra_sucursal(client, db_session):
    propia = _make_tenant(db_session, "Sucursal A")
    ajena = _make_tenant(db_session, "Sucursal B")
    admin = _make_user(db_session, "admin@gems.com", Role.ADMIN, propia)

    response = client.put(
        f"{PREFIX}/tenants/{ajena.id}/switch", headers=_auth_headers(db_session, admin)
    )
    assert response.status_code == 403


def test_secretaria_no_puede_cambiar_a_otra_sucursal(client, db_session):
    propia = _make_tenant(db_session, "Sucursal A")
    ajena = _make_tenant(db_session, "Sucursal B")
    secretaria = _make_user(db_session, "secre@gems.com", Role.SECRETARIA, propia)

    response = client.put(
        f"{PREFIX}/tenants/{ajena.id}/switch", headers=_auth_headers(db_session, secretaria)
    )
    assert response.status_code == 403


def test_admin_puede_cambiar_a_su_propia_sucursal(client, db_session):
    propia = _make_tenant(db_session, "Sucursal A")
    admin = _make_user(db_session, "admin@gems.com", Role.ADMIN, propia)

    response = client.put(
        f"{PREFIX}/tenants/{propia.id}/switch", headers=_auth_headers(db_session, admin)
    )
    assert response.status_code == 200


def test_doctor_solo_cambia_a_sucursales_asignadas(client, db_session):
    propia = _make_tenant(db_session, "Sucursal A")
    asignada = _make_tenant(db_session, "Sucursal B")
    ajena = _make_tenant(db_session, "Sucursal C")
    doctor = _make_user(db_session, "doctor@gems.com", Role.DOCTOR, propia)
    db_session.add(DoctorClinic(doctor_id=doctor.id, tenant_id=asignada.id, is_active=True))
    db_session.commit()

    headers = _auth_headers(db_session, doctor)
    assert client.put(f"{PREFIX}/tenants/{asignada.id}/switch", headers=headers).status_code == 200
    assert client.put(f"{PREFIX}/tenants/{ajena.id}/switch", headers=headers).status_code == 403


def test_switch_a_sucursal_inexistente_da_404(client, db_session):
    propia = _make_tenant(db_session, "Sucursal A")
    master = _make_user(db_session, "master@gems.com", Role.MASTER, propia)

    response = client.put(
        f"{PREFIX}/tenants/9999/switch", headers=_auth_headers(db_session, master)
    )
    assert response.status_code == 404


# --- TAREA 3: CRUD de sucursales ---


def test_master_crea_sucursal(client, db_session):
    propia = _make_tenant(db_session, "Sucursal A")
    master = _make_user(db_session, "master@gems.com", Role.MASTER, propia)

    response = client.post(
        f"{PREFIX}/tenants",
        headers=_auth_headers(db_session, master),
        json={"name": "Sucursal Nueva", "phone": "5551234", "email": "nueva@gems.com"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Sucursal Nueva"
    assert body["is_active"] is True


@pytest.mark.parametrize("role", [Role.ADMIN, Role.DOCTOR, Role.SECRETARIA])
def test_solo_master_administra_sucursales(client, db_session, role):
    propia = _make_tenant(db_session, "Sucursal A")
    user = _make_user(db_session, f"{role.value}@gems.com", role, propia)
    headers = _auth_headers(db_session, user)

    assert client.post(
        f"{PREFIX}/tenants", headers=headers, json={"name": "Sucursal X"}
    ).status_code == 403
    assert client.put(
        f"{PREFIX}/tenants/{propia.id}", headers=headers, json={"name": "Otro nombre"}
    ).status_code == 403
    assert client.put(
        f"{PREFIX}/tenants/{propia.id}/status", headers=headers, json={"is_active": False}
    ).status_code == 403


def test_no_se_supera_el_limite_de_sucursales(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "MAX_TENANTS", 2)
    propia = _make_tenant(db_session, "Sucursal A")
    _make_tenant(db_session, "Sucursal B")
    master = _make_user(db_session, "master@gems.com", Role.MASTER, propia)

    response = client.post(
        f"{PREFIX}/tenants",
        headers=_auth_headers(db_session, master),
        json={"name": "Sucursal C"},
    )
    assert response.status_code == 400
    assert "máximo de 2 sucursales" in response.json()["detail"]


def test_sucursal_desactivada_libera_cupo(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "MAX_TENANTS", 2)
    propia = _make_tenant(db_session, "Sucursal A")
    _make_tenant(db_session, "Sucursal B", is_active=False)
    master = _make_user(db_session, "master@gems.com", Role.MASTER, propia)

    response = client.post(
        f"{PREFIX}/tenants",
        headers=_auth_headers(db_session, master),
        json={"name": "Sucursal C"},
    )
    assert response.status_code == 201


def test_no_se_permiten_nombres_duplicados(client, db_session):
    propia = _make_tenant(db_session, "Sucursal A")
    master = _make_user(db_session, "master@gems.com", Role.MASTER, propia)

    response = client.post(
        f"{PREFIX}/tenants",
        headers=_auth_headers(db_session, master),
        json={"name": "sucursal a"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Ya existe una sucursal con ese nombre."


def test_master_edita_sucursal(client, db_session):
    propia = _make_tenant(db_session, "Sucursal A")
    otra = _make_tenant(db_session, "Sucursal B")
    master = _make_user(db_session, "master@gems.com", Role.MASTER, propia)

    response = client.put(
        f"{PREFIX}/tenants/{otra.id}",
        headers=_auth_headers(db_session, master),
        json={"name": "Sucursal B renombrada", "address": "Calle 1"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Sucursal B renombrada"
    assert response.json()["address"] == "Calle 1"


def test_desactivar_y_reactivar_sucursal(client, db_session):
    propia = _make_tenant(db_session, "Sucursal A")
    otra = _make_tenant(db_session, "Sucursal B")
    master = _make_user(db_session, "master@gems.com", Role.MASTER, propia)
    headers = _auth_headers(db_session, master)

    baja = client.put(f"{PREFIX}/tenants/{otra.id}/status", headers=headers, json={"is_active": False})
    assert baja.status_code == 200
    assert baja.json()["is_active"] is False

    # Desactivada deja de aparecer en el listado por defecto, pero sigue existiendo.
    visibles = client.get(f"{PREFIX}/tenants", headers=headers).json()
    assert [t["id"] for t in visibles] == [propia.id]
    todas = client.get(f"{PREFIX}/tenants?include_inactive=true", headers=headers).json()
    assert {t["id"] for t in todas} == {propia.id, otra.id}

    alta = client.put(f"{PREFIX}/tenants/{otra.id}/status", headers=headers, json={"is_active": True})
    assert alta.status_code == 200
    assert alta.json()["is_active"] is True


def test_no_se_desactiva_la_sucursal_propia(client, db_session):
    propia = _make_tenant(db_session, "Sucursal A")
    _make_tenant(db_session, "Sucursal B")
    master = _make_user(db_session, "master@gems.com", Role.MASTER, propia)

    response = client.put(
        f"{PREFIX}/tenants/{propia.id}/status",
        headers=_auth_headers(db_session, master),
        json={"is_active": False},
    )
    assert response.status_code == 400
    assert "está trabajando" in response.json()["detail"]


def test_no_existe_borrado_fisico_de_sucursales(client, db_session):
    propia = _make_tenant(db_session, "Sucursal A")
    otra = _make_tenant(db_session, "Sucursal B")
    master = _make_user(db_session, "master@gems.com", Role.MASTER, propia)

    response = client.delete(
        f"{PREFIX}/tenants/{otra.id}", headers=_auth_headers(db_session, master)
    )
    assert response.status_code == 405


def test_no_master_solo_ve_su_sucursal(client, db_session):
    propia = _make_tenant(db_session, "Sucursal A")
    _make_tenant(db_session, "Sucursal B")
    admin = _make_user(db_session, "admin@gems.com", Role.ADMIN, propia)

    visibles = client.get(f"{PREFIX}/tenants", headers=_auth_headers(db_session, admin)).json()
    assert [t["id"] for t in visibles] == [propia.id]


def test_el_doctor_ve_las_sucursales_que_tiene_asignadas(client, db_session):
    """Sin esto el selector no le ofrece a donde cambiar, aunque el cambio si
    este permitido: el doctor atiende en dos clinicas."""
    propia = _make_tenant(db_session, "G & G")
    otra = _make_tenant(db_session, "San Ignacio")
    ajena = _make_tenant(db_session, "Clinica de otro")
    doctor = _make_user(db_session, "doctor@gems.com", Role.DOCTOR, propia)
    db_session.add(DoctorClinic(doctor_id=doctor.id, tenant_id=otra.id, is_active=True))
    db_session.commit()

    respuesta = client.get(f"{PREFIX}/tenants", headers=_auth_headers(db_session, doctor))
    assert respuesta.status_code == 200
    nombres = {t["name"] for t in respuesta.json()}
    assert nombres == {"G & G", "San Ignacio"}
    assert "Clinica de otro" not in nombres


def test_la_secretaria_solo_ve_su_sucursal(client, db_session):
    propia = _make_tenant(db_session, "G & G")
    _make_tenant(db_session, "San Ignacio")
    secretaria = _make_user(db_session, "secre@gems.com", Role.SECRETARIA, propia)

    respuesta = client.get(
        f"{PREFIX}/tenants", headers=_auth_headers(db_session, secretaria)
    )
    assert respuesta.status_code == 200
    assert [t["name"] for t in respuesta.json()] == ["G & G"]
