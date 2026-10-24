"""Guardar la nota de consulta tiene que funcionar de verdad.

En producción no se guardó UNA SOLA nota entre el 1 de agosto y el 24 de
septiembre de 2026. La migración ``2026_08_01_0003`` eliminó la columna
``soap_notes.diagnosis`` al quitar CIE-10, pero el esquema de Pydantic se
quedó con el campo. Como el router construye el modelo con
``SOAPNote(**soap_note_in.model_dump())``, cada alta le pasaba un argumento
que el modelo ya no conocía y reventaba; el ``except Exception`` lo convertía
en un 500 genérico y el error real nunca llegó ni a los registros.

No había ninguna prueba que ejerciera el alta de punta a punta: las que
existían validaban el esquema por separado, y el esquema solo nunca falla.
Estas pruebas cubren ese hueco — el modelo y el esquema tienen que seguir
estando de acuerdo.
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
from app.models.appointment import Appointment
from app.models.patient import Patient
from app.models.soap_note import SOAPNote
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
def consulta(db_session):
    """Una doctora con su paciente y una cita suya, lista para documentar."""
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    doctora = User(
        email="doctora@gems.com",
        hashed_password="no-usado-en-estas-pruebas",
        full_name="Doctora de prueba",
        role=Role.DOCTOR,
        tenant_id=tenant.id,
        is_active=True,
    )
    db_session.add(doctora)
    db_session.commit()
    db_session.refresh(doctora)

    paciente = Patient(
        tenant_id=tenant.id,
        first_name="Paciente",
        last_name="De Prueba",
        date_of_birth=utcnow().date().replace(year=1995),
        owner_doctor_id=doctora.id,
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    cita = Appointment(
        tenant_id=tenant.id,
        patient_id=paciente.id,
        doctor_id=doctora.id,
        scheduled_at=utcnow(),
        duration_minutes=30,
    )
    db_session.add(cita)
    db_session.commit()
    db_session.refresh(cita)

    return {"doctora": doctora, "paciente": paciente, "cita": cita}


def test_guardar_la_nota_la_persiste_de_verdad(client, db_session, consulta):
    """Regresión del 500: la nota tiene que quedar en la base, no sólo responder.

    Es la prueba que faltaba. Se afirma contra la BASE y no sólo contra el
    código de respuesta, porque lo que se perdió en producción fueron notas
    clínicas, no respuestas HTTP.
    """
    headers = _auth_headers(db_session, consulta["doctora"])

    respuesta = client.post(
        f"{PREFIX}/soap-notes",
        headers=headers,
        json={
            "appointment_id": consulta["cita"].id,
            "subjective": "DOLOR ABDOMINAL DE 3 DÍAS",
            "objective": "ABDOMEN BLANDO, SIN DATOS DE IRRITACIÓN",
            "assessment": "DISMENORREA",
            "plan": "ANALGÉSICO Y CONTROL EN UNA SEMANA",
        },
    )

    assert respuesta.status_code == 201, respuesta.text

    guardada = (
        db_session.query(SOAPNote)
        .filter(SOAPNote.appointment_id == consulta["cita"].id)
        .first()
    )
    assert guardada is not None, "La nota respondió bien pero no quedó en la base"
    assert guardada.subjective == "DOLOR ABDOMINAL DE 3 DÍAS"
    assert guardada.plan == "ANALGÉSICO Y CONTROL EN UNA SEMANA"
    assert guardada.doctor_id == consulta["doctora"].id


def test_guardar_una_nota_a_medias_tambien_persiste(client, db_session, consulta):
    """La doctora documenta sólo el plan y guarda: las secciones son opcionales."""
    headers = _auth_headers(db_session, consulta["doctora"])

    respuesta = client.post(
        f"{PREFIX}/soap-notes",
        headers=headers,
        json={"appointment_id": consulta["cita"].id, "plan": "REPOSO RELATIVO"},
    )

    assert respuesta.status_code == 201, respuesta.text
    guardada = db_session.query(SOAPNote).first()
    assert guardada is not None
    assert guardada.plan == "REPOSO RELATIVO"
    assert guardada.subjective == ""


def test_actualizar_la_nota_conserva_lo_escrito(client, db_session, consulta):
    """Completar después una nota guardada a medias tiene que persistir igual."""
    headers = _auth_headers(db_session, consulta["doctora"])

    creada = client.post(
        f"{PREFIX}/soap-notes",
        headers=headers,
        json={"appointment_id": consulta["cita"].id, "plan": "REPOSO"},
    )
    assert creada.status_code == 201, creada.text

    actualizada = client.put(
        f"{PREFIX}/soap-notes/{creada.json()['id']}",
        headers=headers,
        json={"assessment": "DISMENORREA", "plan": "REPOSO Y ANALGÉSICO"},
    )
    assert actualizada.status_code == 200, actualizada.text

    db_session.expire_all()
    guardada = db_session.query(SOAPNote).first()
    assert guardada.assessment == "DISMENORREA"
    assert guardada.plan == "REPOSO Y ANALGÉSICO"


def test_el_esquema_no_pide_campos_que_el_modelo_no_tiene(client, db_session, consulta):
    """El candado de fondo: esquema y modelo tienen que seguir de acuerdo.

    Si alguien vuelve a agregar un campo al esquema sin su columna, el alta
    revienta otra vez. Comparar los dos aquí hace que la contradicción salga
    en la suite y no meses después, en una consulta real.
    """
    from app.schemas.soap_note import SOAPNoteCreate

    columnas = {c.name for c in SOAPNote.__table__.columns}
    del_esquema = set(SOAPNoteCreate.model_fields) - {"appointment_id"}

    sobrantes = del_esquema - columnas
    assert not sobrantes, (
        f"El esquema acepta campos que la tabla no tiene: {sorted(sobrantes)}. "
        "Cada alta va a reventar con un 500 genérico."
    )
