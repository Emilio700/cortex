"""El tablero de controles prenatales pendientes: pasivo, acotado y de acuerdo con el aviso.

Lo que se prueba aquí no es que la lista se dibuje, sino las tres cosas que la
vuelven confiable: que sólo muestre lo que de verdad falta agendar, que no le
enseñe a un médico el seguimiento de otra, y que coincida con lo que recepción
recibió por notificación. Si el tablero y el aviso divergen, no hay forma de
saber cuál de los dos miente.
"""
from datetime import date, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import security
from app.core.config import settings
from app.core.deps import get_db
from app.core.hora_local import hoy_local
from app.db.session import Base, utcnow
from app.main import app
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.models.patient import Patient
from app.models.pregnancy import Pregnancy, PregnancyStatus
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


@pytest.fixture
def consultorio(db_session):
    tenant = Tenant(name="Clínica del tablero", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    def _doctora(email):
        user = User(
            email=email,
            hashed_password="no-se-usa",
            full_name=f"Médico {email}",
            role=Role.DOCTOR,
            tenant_id=tenant.id,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    return {
        "tenant": tenant,
        "dra_a": _doctora("dra.a@gems.test"),
        "dra_b": _doctora("dra.b@gems.test"),
    }


def _embarazo(db, consultorio, doctora, *, revision: date, nombre: str, avisado: date | None = None):
    paciente = Patient(
        tenant_id=consultorio["tenant"].id,
        first_name=nombre,
        last_name="Tablero",
        owner_doctor_id=doctora.id,
    )
    db.add(paciente)
    db.commit()
    db.refresh(paciente)

    embarazo = Pregnancy(
        tenant_id=consultorio["tenant"].id,
        patient_id=paciente.id,
        doctor_id=doctora.id,
        status=PregnancyStatus.ACTIVE.value,
        next_review_on=revision,
        next_review_reminded_on=avisado,
    )
    db.add(embarazo)
    db.commit()
    db.refresh(embarazo)
    return embarazo


# Las fechas de estas pruebas salen de ``hoy_local()``, el mismo "hoy" con el
# que el servidor calcula el atraso. Con ``date.today()`` valían sólo en una
# máquina con hora de Mazatlán: en una en UTC, de 17:00 a medianoche locales el
# atraso salía con un día de más y la próxima revisión, con uno de menos.
def _tablero(client, db, doctora, **params):
    return client.get(
        f"{PREFIX}/clinical-tracking/prenatal-review-board",
        headers=_auth_headers(db, doctora),
        params=params,
    )


def test_la_revision_vencida_aparece_marcada_como_vencida(client, db_session, consultorio):
    """Vencida y próxima se ven distinto porque se atienden distinto.

    El cálculo lo hace el servidor: la fecha vive en hora del consultorio, y si
    lo resolviera el navegador, el mismo renglón diría "hoy" o "ayer" según la
    computadora de quien mira.
    """
    hoy = hoy_local()
    _embarazo(db_session, consultorio, consultorio["dra_a"], revision=hoy - timedelta(days=5), nombre="Atrasada")

    respuesta = _tablero(client, db_session, consultorio["dra_a"])

    assert respuesta.status_code == 200, respuesta.text
    [item] = respuesta.json()
    assert item["vencida"] is True
    assert item["dias_de_atraso"] == 5
    assert item["patient_full_name"] == "Atrasada Tablero"


def test_la_paciente_ya_citada_no_ocupa_lugar_en_el_tablero(client, db_session, consultorio):
    """El tablero es de pendientes. Si la lista trae lo que ya está resuelto,
    se deja de mirar a la semana y el trabajo entero sobra."""
    hoy = hoy_local()
    embarazo = _embarazo(
        db_session, consultorio, consultorio["dra_a"], revision=hoy + timedelta(days=3), nombre="Citada"
    )
    db_session.add(
        Appointment(
            tenant_id=consultorio["tenant"].id,
            patient_id=embarazo.patient_id,
            doctor_id=consultorio["dra_a"].id,
            scheduled_at=datetime.combine(hoy + timedelta(days=3), datetime.min.time())
            + timedelta(hours=9),
            duration_minutes=30,
            appointment_type=AppointmentType.CONSULTA,
            status=AppointmentStatus.AGENDADA,
        )
    )
    db_session.commit()

    respuesta = _tablero(client, db_session, consultorio["dra_a"])

    assert respuesta.json() == []


def test_una_doctora_no_ve_el_seguimiento_prenatal_de_su_colega(client, db_session, consultorio):
    """El tablero no es una puerta lateral al expediente de otra.

    Es la misma regla que gobierna prenatal: el embarazo lo lleva quien lo
    abrió. Un tablero que listara nombres de pacientes ajenas ya estaría
    filtrando información clínica aunque no dejara abrir nada.
    """
    hoy = hoy_local()
    _embarazo(db_session, consultorio, consultorio["dra_b"], revision=hoy - timedelta(days=2), nombre="DeLaB")

    respuesta = _tablero(client, db_session, consultorio["dra_a"])

    assert respuesta.json() == []


def test_lo_muy_atrasado_no_llena_el_tablero(client, db_session, consultorio):
    """Un embarazo activo con revisión de hace meses es un registro sin cerrar.

    Mezclarlo con los pendientes reales vuelve la lista inservible el primer
    día, que es exactamente cómo mueren los tableros.
    """
    hoy = hoy_local()
    _embarazo(db_session, consultorio, consultorio["dra_a"], revision=hoy - timedelta(days=200), nombre="Antigua")

    assert _tablero(client, db_session, consultorio["dra_a"]).json() == []


def test_el_tablero_dice_si_recepcion_ya_fue_avisada(client, db_session, consultorio):
    """Lo primero que el médico pregunta antes de ponerse a llamar ella.

    Es también la prueba de que el tablero y el recordatorio leen la misma
    marca: si divergieran, no habría manera de saber cuál miente.
    """
    hoy = hoy_local()
    revision = hoy + timedelta(days=4)
    _embarazo(db_session, consultorio, consultorio["dra_a"], revision=revision, nombre="Avisada", avisado=revision)
    _embarazo(db_session, consultorio, consultorio["dra_a"], revision=revision, nombre="Nadie")

    por_nombre = {
        item["patient_full_name"]: item["avisado_a_recepcion"]
        for item in _tablero(client, db_session, consultorio["dra_a"]).json()
    }

    assert por_nombre == {"Avisada Tablero": True, "Nadie Tablero": False}


def test_el_tablero_no_manda_ningun_aviso(client, db_session, consultorio):
    """Consultarlo es pasivo: es una lista, no un disparador.

    Emilio fue explícito en que el médico no necesita otra campanita. Si
    alguien engancha aquí un ``notify()``, esta prueba se cae.
    """
    from app.models.notification import Notification

    hoy = hoy_local()
    _embarazo(db_session, consultorio, consultorio["dra_a"], revision=hoy - timedelta(days=1), nombre="Pendiente")

    _tablero(client, db_session, consultorio["dra_a"])

    assert db_session.query(Notification).count() == 0
