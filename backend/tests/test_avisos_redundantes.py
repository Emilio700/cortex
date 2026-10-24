"""Un aviso de lo que uno mismo acaba de hacer no informa de nada.

En una semana de uso real la campanita llegó a acumular decenas de avisos sin
leer, y parte de ese volumen era la doctora enterándose de sus propios actos.
Un canal que avisa de lo obvio enseña a no mirarlo, y el día que llegue el
aviso que sí importaba ya nadie lo estará leyendo.
"""
from datetime import timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base, utcnow
from app.models.appointment import Appointment
from app.models.notification import Notification
from app.models.patient import Patient
from app.models.tenant import Tenant
from app.models.user import Role, User
from app.services.avisos_de_citas import avisar_cita_agendada


@pytest.fixture
def db():
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
def escenario(db):
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db.add(tenant)
    db.commit()

    doctora = User(
        tenant_id=tenant.id,
        email="doctora@test.mx",
        hashed_password="x",
        full_name="Ana Ruiz",
        role=Role.DOCTOR,
        is_active=True,
    )
    secretaria = User(
        tenant_id=tenant.id,
        email="secre@test.mx",
        hashed_password="x",
        full_name="Luz Mena",
        role=Role.SECRETARIA,
        is_active=True,
    )
    db.add_all([doctora, secretaria])
    db.commit()

    # Sin correo a propósito: aquí se prueba el aviso en la campanita, no el
    # envío de correo, que tiene sus propias pruebas.
    paciente = Patient(
        tenant_id=tenant.id,
        first_name="Rosa",
        last_name="Pérez",
        email=None,
    )
    db.add(paciente)
    db.commit()

    cita = Appointment(
        tenant_id=tenant.id,
        patient_id=paciente.id,
        doctor_id=doctora.id,
        scheduled_at=utcnow() + timedelta(days=1),
        duration_minutes=30,
    )
    db.add(cita)
    db.commit()
    return {"cita": cita, "doctora": doctora, "secretaria": secretaria}


def test_no_se_avisa_a_la_doctora_de_la_cita_que_ella_misma_agendo(db, escenario):
    # El aviso sale en la transacción de la cita (plan 27); el correo, aparte.
    avisar_cita_agendada(db, escenario["cita"], escenario["doctora"])
    db.commit()

    assert db.query(Notification).count() == 0


def test_si_la_agenda_secretaria_la_doctora_sigue_enterandose(db, escenario):
    avisar_cita_agendada(db, escenario["cita"], escenario["secretaria"])
    db.commit()

    avisos = db.query(Notification).all()
    assert len(avisos) == 1
    assert avisos[0].user_id == escenario["doctora"].id
