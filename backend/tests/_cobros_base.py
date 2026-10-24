"""Andamiaje común de las pruebas de los ajustes de cobros (plan 23, 2026-09-28).

Mismo esquema que ``test_cobros_por_doctora.py`` (SQLite en memoria y
``get_db`` sobrescrito), en un solo sitio para que las tres pruebas de los
ajustes —corte de la secretaria, consulta express y tratamiento— armen la
sucursal igual.
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
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.models.patient import Patient
from app.models.payment import Payment, PaymentMethod
from app.models.service import Service
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


def headers(db, user: User) -> dict[str, str]:
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


def usuario(db, tenant, nombre, role, **extra):
    u = User(
        email=f"{nombre.lower().replace(' ', '.')}@gems.com",
        hashed_password="no-usado-en-estas-pruebas",
        full_name=nombre,
        role=role,
        tenant_id=tenant.id,
        is_active=True,
        **extra,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def paciente(db, tenant, duena, nombre):
    p = Patient(
        tenant_id=tenant.id,
        first_name=nombre,
        last_name="De Prueba",
        date_of_birth=datetime(1990, 5, 20).date(),
        owner_doctor_id=duena.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def cita(db, tenant, pac, doctora, estado=AppointmentStatus.ATENDIDA, cuando=None):
    c = Appointment(
        tenant_id=tenant.id,
        patient_id=pac.id,
        doctor_id=doctora.id,
        scheduled_at=cuando or datetime.now(),
        duration_minutes=30,
        appointment_type=AppointmentType.CONSULTA,
        status=estado,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def pago(db, tenant, pac, recibio, doctora, monto, **extra):
    p = Payment(
        tenant_id=tenant.id,
        patient_id=pac.id,
        received_by_user_id=recibio.id,
        doctor_id=doctora.id if doctora else None,
        amount=Decimal(monto),
        method=extra.pop("method", PaymentMethod.CASH),
        **extra,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@pytest.fixture
def e(db_session):
    """Una sucursal con tres doctoras, dos secretarias y administración.

    Jhoany apoya al Dr. Adolfo (el caso real); Laura es la otra recepción.
    """
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    otra = Tenant(name="Otra sucursal", is_active=True)
    db_session.add_all([tenant, otra])
    db_session.commit()

    adolfo = usuario(db_session, tenant, "Adolfo Ruiz", Role.DOCTOR, tratamiento="Dr.")
    cintia = usuario(db_session, tenant, "Cintia Castro", Role.DOCTOR, tratamiento="Dra.")
    rosa = usuario(db_session, tenant, "Rosa Méndez", Role.DOCTOR)
    jhoany = usuario(db_session, tenant, "Jhoany Asistente", Role.SECRETARIA)
    laura = usuario(db_session, tenant, "Laura Recepción", Role.SECRETARIA)
    admin = usuario(db_session, tenant, "Admin Sucursal", Role.ADMIN)
    ajena = usuario(db_session, otra, "Médico Ajena", Role.DOCTOR)

    servicio = Service(tenant_id=tenant.id, name="Consulta", price=Decimal("800.00"))
    db_session.add(servicio)
    db_session.commit()
    db_session.refresh(servicio)

    return {
        "tenant": tenant,
        "otra": otra,
        "adolfo": adolfo,
        "cintia": cintia,
        "rosa": rosa,
        "jhoany": jhoany,
        "laura": laura,
        "admin": admin,
        "ajena": ajena,
        "pac_adolfo": paciente(db_session, tenant, adolfo, "Ana"),
        "pac_cintia": paciente(db_session, tenant, cintia, "Berta"),
        "pac_rosa": paciente(db_session, tenant, rosa, "Carla"),
        "servicio": servicio,
    }
