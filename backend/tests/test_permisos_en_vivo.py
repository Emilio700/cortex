"""B8 — un cambio de permisos surte efecto sin volver a iniciar sesión.

Desde que el menú y los guards del frontend se gobiernan por permisos, otorgar
uno *parecía* no hacer nada: la sesión ya abierta seguía con los permisos que
calculó al entrar, y la pantalla de Master anunciaba un éxito que la usuaria no
veía por ningún lado. Es exactamente el caso que este proyecto no se permite: si
el sistema no hizo algo, la interfaz no puede decir que sí.

La salida elegida es un contador por usuario, no revocar su sesión: revocarla a
media consulta le costaría a una doctora la nota que está capturando, que es
peor que el problema. Estas pruebas fijan que el contador sube, que viaja en
cada respuesta autenticada y que nadie pierde la sesión por el camino.
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
from app.core.deps import PERMISSIONS_VERSION_HEADER, get_db
from app.db.session import Base, utcnow
from app.main import app
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


def _sesion(db, user: User) -> UserSession:
    session = UserSession(
        id=str(uuid4()),
        user_id=user.id,
        tenant_id=user.tenant_id,
        refresh_jti=str(uuid4()),
        expires_at=utcnow() + timedelta(days=1),
    )
    db.add(session)
    db.commit()
    return session


def _headers(db, user: User) -> dict[str, str]:
    session = _sesion(db, user)
    token = security.create_access_token(
        data={"sub": str(user.id), "role": user.role.value, "sid": session.id}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def escenario(db_session):
    tenant = Tenant(name="Clínica de permisos", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    def _user(role: Role, nombre: str) -> User:
        user = User(
            email=f"{nombre}@gems.com",
            hashed_password="no-se-usa",
            full_name=nombre,
            role=role,
            tenant_id=tenant.id,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    return {"master": _user(Role.MASTER, "master"), "doctora": _user(Role.DOCTOR, "doctora")}


def test_una_cuenta_nueva_arranca_en_la_version_uno(db_session, escenario):
    """Arranca en 1 para poder distinguir 'sin versión' de 'versión inicial'."""
    assert escenario["doctora"].permissions_version == 1


def test_cada_respuesta_autenticada_trae_la_version_de_permisos(
    client, db_session, escenario
):
    respuesta = client.get(f"{PREFIX}/auth/me", headers=_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 200
    assert respuesta.headers[PERMISSIONS_VERSION_HEADER] == "1"
    assert respuesta.json()["permissions_version"] == 1


def test_otorgar_un_permiso_sube_la_version_de_quien_lo_recibe(
    client, db_session, escenario
):
    """Es la señal con la que la sesión abierta se entera de que quedó vieja."""
    doctora = escenario["doctora"]

    respuesta = client.put(
        f"{PREFIX}/permissions/user/{doctora.id}",
        headers=_headers(db_session, escenario["master"]),
        json=[{"user_id": doctora.id, "action": "reports.read", "is_granted": True}],
    )

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["permissions_version"] == 2

    db_session.refresh(doctora)
    assert doctora.permissions_version == 2


def test_el_guardado_devuelve_los_permisos_efectivos_que_quedaron(
    client, db_session, escenario
):
    """La pantalla de Master no tiene que suponer el resultado: se lo devuelven."""
    doctora = escenario["doctora"]

    respuesta = client.put(
        f"{PREFIX}/permissions/user/{doctora.id}",
        headers=_headers(db_session, escenario["master"]),
        json=[
            {"user_id": doctora.id, "action": "reports.read", "is_granted": True},
            {"user_id": doctora.id, "action": "soap_notes.create", "is_granted": False},
        ],
    )

    efectivos = respuesta.json()["effective_permissions"]
    assert "reports.read" in efectivos
    assert "soap_notes.create" not in efectivos


def test_la_sesion_abierta_ve_el_permiso_nuevo_sin_volver_a_entrar(
    client, db_session, escenario
):
    """El corazón de B8: mismo token antes y después del cambio."""
    doctora = escenario["doctora"]
    headers_doctora = _headers(db_session, doctora)

    antes = client.get(f"{PREFIX}/auth/me", headers=headers_doctora).json()
    assert "reports.read" not in antes["permissions"]

    client.put(
        f"{PREFIX}/permissions/user/{doctora.id}",
        headers=_headers(db_session, escenario["master"]),
        json=[{"user_id": doctora.id, "action": "reports.read", "is_granted": True}],
    )

    despues = client.get(f"{PREFIX}/auth/me", headers=headers_doctora)
    assert despues.status_code == 200
    assert "reports.read" in despues.json()["permissions"]
    assert despues.headers[PERMISSIONS_VERSION_HEADER] == "2"


def test_cambiar_permisos_no_echa_a_nadie_de_su_sesion(client, db_session, escenario):
    """Revocar la sesión costaría la nota a medio capturar: no se hace.

    La versión sube, la sesión sigue viva y el token que la doctora tiene en la
    mano sigue sirviendo.
    """
    doctora = escenario["doctora"]
    headers_doctora = _headers(db_session, doctora)

    client.put(
        f"{PREFIX}/permissions/user/{doctora.id}",
        headers=_headers(db_session, escenario["master"]),
        json=[{"user_id": doctora.id, "action": "reports.read", "is_granted": True}],
    )

    activas = (
        db_session.query(UserSession)
        .filter(UserSession.user_id == doctora.id, UserSession.revoked_at.is_(None))
        .count()
    )
    assert activas >= 1
    assert client.get(f"{PREFIX}/auth/me", headers=headers_doctora).status_code == 200


def test_el_cambio_de_permisos_queda_auditado_con_lo_otorgado_y_lo_retirado(
    client, db_session, escenario
):
    from app.models.audit_log import AuditLog

    doctora = escenario["doctora"]
    client.put(
        f"{PREFIX}/permissions/user/{doctora.id}",
        headers=_headers(db_session, escenario["master"]),
        json=[
            {"user_id": doctora.id, "action": "reports.read", "is_granted": True},
            {"user_id": doctora.id, "action": "soap_notes.create", "is_granted": False},
        ],
    )

    registro = (
        db_session.query(AuditLog).filter(AuditLog.action == "permissions.updated").first()
    )

    assert registro is not None
    assert registro.actor_user_id == escenario["master"].id
    assert registro.details["otorgados"] == ["reports.read"]
    assert registro.details["retirados"] == ["soap_notes.create"]


# --- Migración 0047: los permisos por omisión de la 1.2.0 llegan solos -------

def _migracion_0047(conexion):  # conexion: función que la devuelve
    """Carga la 0047 con un ``op`` que ejecuta sobre la conexión de la prueba.

    Desde ``backend/`` la carpeta ``alembic/`` tapa al paquete de Alembic, así
    que se le da un sustituto mientras se carga (ver test_migracion_0040).
    """
    import importlib.util
    import sys
    import types
    from pathlib import Path

    ruta = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "2026_10_10_0047_refrescar_permisos_por_omision.py"
    spec = importlib.util.spec_from_file_location("m0047", ruta)
    m = importlib.util.module_from_spec(spec)
    previo = sys.modules.get("alembic")
    sys.modules["alembic"] = types.SimpleNamespace(op=types.SimpleNamespace(get_bind=conexion))
    try:
        spec.loader.exec_module(m)
    finally:
        if previo is None:
            sys.modules.pop("alembic", None)
        else:
            sys.modules["alembic"] = previo
    return m


def test_tras_la_0047_la_sesion_abierta_recarga_sus_permisos(client, db_session, escenario):
    """La pantalla recarga cuando cambia X-Permissions-Version; la 0047 lo cambia
    para todos, así una sesión ya abierta recibe los permisos nuevos de su rol
    sin volver a entrar."""
    doctora = escenario["doctora"]
    inactiva = User(email="baja@gems.com", hashed_password="x", full_name="Baja", role=Role.DOCTOR,
                    tenant_id=doctora.tenant_id, is_active=False)
    db_session.add(inactiva)
    db_session.commit()
    headers_doctora = _headers(db_session, doctora)
    antes = client.get(f"{PREFIX}/auth/me", headers=headers_doctora)
    assert antes.headers[PERMISSIONS_VERSION_HEADER] == "1"

    m = _migracion_0047(db_session.connection)
    m.upgrade()
    db_session.commit()
    db_session.expire_all()

    despues = client.get(f"{PREFIX}/auth/me", headers=headers_doctora)
    assert despues.status_code == 200
    assert despues.headers[PERMISSIONS_VERSION_HEADER] == "2"
    # Lo que la pantalla vuelve a pedir trae los permisos de su rol de hoy.
    from app.models.permission import get_default_permissions

    assert set(get_default_permissions("doctor")) <= set(despues.json()["permissions"])
    assert db_session.get(User, inactiva.id).permissions_version == 1

    m.downgrade()
    m.downgrade()  # nunca baja de 1
    db_session.commit()
    db_session.expire_all()
    assert db_session.get(User, doctora.id).permissions_version == 1
