"""El aviso de servicio caído: llega al admin una vez por caída y se cierra solo.

Lo corre el healthcheck periódico; lo que puede romper no es que deje de
avisar sino que avise en cada corrida, o que siga diciendo «caído» cuando el
servicio ya volvió.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base
from app.models.notification import Notification, NotificationPriority, NotificationType
from app.models.tenant import Tenant
from app.models.user import Role, User

from scripts import aviso_de_sistema as job


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


@pytest.fixture
def personal(db):
    t1, t2 = Tenant(name="Sucursal 1", is_active=True), Tenant(name="Sucursal 2", is_active=True)
    db.add_all([t1, t2])
    db.commit()
    usuarios = {}
    for clave, rol, tenant, activo in [
        ("admin1", Role.ADMIN, t1, True),
        ("admin2", Role.ADMIN, t2, True),
        ("inactivo", Role.ADMIN, t1, False),
        ("doctora", Role.DOCTOR, t1, True),
        ("recepcion", Role.SECRETARIA, t1, True),
    ]:
        u = User(email=f"{clave}@x.mx", hashed_password="x", full_name=clave, role=rol,
                 tenant_id=tenant.id, is_active=activo)
        db.add(u)
        usuarios[clave] = u
    db.commit()
    return usuarios


def _abiertos(db):
    return db.query(Notification).filter(
        Notification.type == NotificationType.SYSTEM_ALERT, Notification.resolved_at.is_(None)
    ).all()


def test_avisa_solo_a_admins_activos_de_todas_las_sucursales(db, personal):
    assert job.avisar_caida(db, "clamav") == 2
    destinatarios = {a.user_id for a in _abiertos(db)}
    assert destinatarios == {personal["admin1"].id, personal["admin2"].id}
    assert all(a.priority == NotificationPriority.ACCIONABLE for a in _abiertos(db))


def test_corridas_repetidas_no_duplican_el_aviso(db, personal):
    job.avisar_caida(db, "clamav")
    assert job.avisar_caida(db, "clamav") == 0
    assert len(_abiertos(db)) == 2


def test_al_volver_se_resuelve_y_una_caida_nueva_avisa_de_nuevo(db, personal):
    job.avisar_caida(db, "clamav")
    assert job.resolver_caida(db, "clamav") == 2
    assert _abiertos(db) == []
    assert job.avisar_caida(db, "clamav") == 2


def test_argumentos_invalidos_no_tocan_la_base():
    assert job.main(["caido", "redis"]) == 2
    assert job.main([]) == 2
