"""Pruebas de creación de citas.

Usan SQLite en memoria y sobrescriben ``get_db``, siguiendo el mismo patrón que
``test_tenants.py``: no hace falta una base Postgres levantada.
"""
from datetime import datetime, timedelta
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
from sqlalchemy import String

from app.models.appointment import Appointment, AppointmentType
from app.models.patient import Patient
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
def escenario(db_session):
    """Una sucursal con secretaria, doctor y paciente listos para agendar."""
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    def _user(email, role):
        user = User(
            email=email,
            hashed_password="no-usado-en-estas-pruebas",
            full_name=f"Usuario {role.value}",
            role=role,
            tenant_id=tenant.id,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    secretaria = _user("secretaria@gems.com", Role.SECRETARIA)
    doctor = _user("doctor@gems.com", Role.DOCTOR)

    paciente = Patient(
        tenant_id=tenant.id,
        first_name="Paciente",
        last_name="De Prueba",
        date_of_birth=datetime(1990, 5, 20).date(),
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    return {"secretaria": secretaria, "doctor": doctor, "paciente": paciente}


def test_agendar_cirugia_conserva_tipo_y_datos_quirurgicos(client, db_session, escenario):
    """Regresión: el endpoint enumeraba los campos a mano y descartaba en
    silencio el tipo de cita y los datos de cirugía, guardándola como consulta.
    """
    headers = _auth_headers(db_session, escenario["secretaria"])
    respuesta = client.post(
        f"{PREFIX}/appointments",
        headers=headers,
        json={
            "patient_id": escenario["paciente"].id,
            "doctor_id": escenario["doctor"].id,
            "scheduled_at": (utcnow() + timedelta(days=7)).isoformat(),
            "duration_minutes": 60,
            "appointment_type": "cirugia",
            "cirugia_type": "Histerectomía",
            "hospital": "Hospital Central",
            "anestesiologo": "Dra. Martínez",
            "preop_notes": "Ayuno de 8 horas",
            "duration_hours": 2.5,
        },
    )

    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["appointment_type"] == AppointmentType.CIRUGIA.value
    assert cuerpo["cirugia_type"] == "Histerectomía"
    assert cuerpo["hospital"] == "Hospital Central"
    assert cuerpo["anestesiologo"] == "Dra. Martínez"
    assert cuerpo["preop_notes"] == "Ayuno de 8 horas"
    assert cuerpo["duration_hours"] == 2.5


def test_agendar_sin_tipo_queda_como_consulta(client, db_session, escenario):
    """El valor por defecto del schema debe seguir aplicándose."""
    headers = _auth_headers(db_session, escenario["secretaria"])
    respuesta = client.post(
        f"{PREFIX}/appointments",
        headers=headers,
        json={
            "patient_id": escenario["paciente"].id,
            "doctor_id": escenario["doctor"].id,
            "scheduled_at": (utcnow() + timedelta(days=8)).isoformat(),
        },
    )

    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["appointment_type"] == AppointmentType.CONSULTA.value


# --- Motivo extra: una nota opcional para el doctor -------------------------
#
# El consultorio lo pidió textualmente "como opcional... una nota para el doc
# extra del tipo motivo extra". NO es un tipo de cita: los tipos del sistema
# siguen siendo tres. Por eso se comprueba que se guarde, que se devuelva y,
# sobre todo, que **no obligue a nada**.


def test_agendar_con_motivo_extra_lo_guarda_y_lo_devuelve(client, db_session, escenario):
    headers = _auth_headers(db_session, escenario["secretaria"])
    respuesta = client.post(
        f"{PREFIX}/appointments",
        headers=headers,
        json={
            "patient_id": escenario["paciente"].id,
            "doctor_id": escenario["doctor"].id,
            "scheduled_at": (utcnow() + timedelta(days=9)).isoformat(),
            "motivo_extra": "CONTROL",
        },
    )

    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["motivo_extra"] == "CONTROL"
    # Sigue siendo una consulta: el motivo no inventa un tipo de cita.
    assert cuerpo["appointment_type"] == AppointmentType.CONSULTA.value

    guardada = (
        db_session.query(Appointment).filter(Appointment.id == cuerpo["id"]).one()
    )
    assert guardada.motivo_extra == "CONTROL"


def test_el_motivo_extra_es_opcional_y_no_bloquea_el_guardado(client, db_session, escenario):
    """Sin motivo la cita se agenda igual y el campo viaja como vacío."""
    headers = _auth_headers(db_session, escenario["secretaria"])
    respuesta = client.post(
        f"{PREFIX}/appointments",
        headers=headers,
        json={
            "patient_id": escenario["paciente"].id,
            "doctor_id": escenario["doctor"].id,
            "scheduled_at": (utcnow() + timedelta(days=10)).isoformat(),
        },
    )

    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["motivo_extra"] is None


def test_el_motivo_extra_admite_texto_libre_y_se_puede_cambiar(client, db_session, escenario):
    """Las sugerencias de un clic son atajos, no la única opción."""
    headers = _auth_headers(db_session, escenario["secretaria"])
    creada = client.post(
        f"{PREFIX}/appointments",
        headers=headers,
        json={
            "patient_id": escenario["paciente"].id,
            "doctor_id": escenario["doctor"].id,
            "scheduled_at": (utcnow() + timedelta(days=11)).isoformat(),
            "motivo_extra": "REVISIÓN DE PUNTOS",
        },
    )
    assert creada.status_code == 201, creada.text
    cita_id = creada.json()["id"]

    editada = client.put(
        f"{PREFIX}/appointments/{cita_id}",
        headers=headers,
        json={"motivo_extra": "COLPOSCOPIA"},
    )
    assert editada.status_code == 200, editada.text
    assert editada.json()["motivo_extra"] == "COLPOSCOPIA"


def test_un_motivo_larguisimo_se_rechaza_con_un_mensaje_en_espanol(client, db_session, escenario):
    """Es una nota corta; el 422 tiene que explicarlo sin jerga."""
    headers = _auth_headers(db_session, escenario["secretaria"])
    respuesta = client.post(
        f"{PREFIX}/appointments",
        headers=headers,
        json={
            "patient_id": escenario["paciente"].id,
            "doctor_id": escenario["doctor"].id,
            "scheduled_at": (utcnow() + timedelta(days=12)).isoformat(),
            "motivo_extra": "A" * 200,
        },
    )

    assert respuesta.status_code == 422
    textos = [e["msg"] for e in respuesta.json()["detail"]]
    assert textos == ["«Motivo de la cita» es demasiado largo: no puede pasar de 120 caracteres."]


def test_la_columna_del_motivo_es_texto_y_no_un_entero_disfrazado():
    """Guardar en la columna equivocada ya tumbó producción una vez."""
    columna = Appointment.__table__.columns["motivo_extra"]
    assert isinstance(columna.type, String)
    assert columna.nullable is True
    assert columna.type.length == 120


def _conceder(db, user: User, accion: str) -> None:
    """Concede un permiso a un usuario concreto, como lo haría un admin.

    El rol doctor todavía no trae ``appointments.create`` por defecto; la
    prueba concede el permiso para poder verificar lo único que importa: que
    tenerlo no lo deja escribir en la agenda de nadie más.
    """
    from app.models.permission import Permission

    db.add(Permission(role=user.role.value, action=accion, is_granted=True, user_id=user.id))
    db.commit()


def test_doctora_con_permiso_agenda_en_su_propia_agenda(client, db_session, escenario):
    """El caso que habilita la fase: agendar la próxima revisión de su paciente."""
    doctora = escenario["doctor"]
    _conceder(db_session, doctora, "appointments.create")
    headers = _auth_headers(db_session, doctora)

    respuesta = client.post(
        f"{PREFIX}/appointments",
        headers=headers,
        json={
            "patient_id": escenario["paciente"].id,
            "doctor_id": doctora.id,
            "scheduled_at": (utcnow() + timedelta(days=21)).isoformat(),
            "duration_minutes": 30,
        },
    )

    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["doctor_id"] == doctora.id


def test_doctora_con_permiso_no_agenda_en_la_agenda_de_otra(client, db_session, escenario):
    """El permiso de crear citas no dice para quién: sin este guard, dárselo a
    una doctora se lo daría sobre las agendas de todas sus colegas.
    """
    doctora = escenario["doctor"]
    _conceder(db_session, doctora, "appointments.create")

    otra = User(
        email="otra.doctora@gems.com",
        hashed_password="no-usado-en-estas-pruebas",
        full_name="Otra doctora",
        role=Role.DOCTOR,
        tenant_id=doctora.tenant_id,
        is_active=True,
    )
    db_session.add(otra)
    db_session.commit()
    db_session.refresh(otra)

    respuesta = client.post(
        f"{PREFIX}/appointments",
        headers=_auth_headers(db_session, doctora),
        json={
            "patient_id": escenario["paciente"].id,
            "doctor_id": otra.id,
            "scheduled_at": (utcnow() + timedelta(days=21)).isoformat(),
            "duration_minutes": 30,
        },
    )

    assert respuesta.status_code == 403, respuesta.text
    assert "tu propia agenda" in respuesta.json()["detail"]
    assert db_session.query(Appointment).filter(Appointment.doctor_id == otra.id).count() == 0


def test_secretaria_sigue_agendando_para_cualquier_doctor(client, db_session, escenario):
    """El guard es sólo para el rol doctor: quien reparte la agenda es ella."""
    respuesta = client.post(
        f"{PREFIX}/appointments",
        headers=_auth_headers(db_session, escenario["secretaria"]),
        json={
            "patient_id": escenario["paciente"].id,
            "doctor_id": escenario["doctor"].id,
            "scheduled_at": (utcnow() + timedelta(days=28)).isoformat(),
            "duration_minutes": 30,
        },
    )

    assert respuesta.status_code == 201, respuesta.text


def test_doctora_sin_recepcion_da_de_alta_y_agenda_en_su_agenda(client, db_session, escenario):
    """Plan 32, punto 5: el preregistro se quitó y la paciente nueva se da de
    alta al agendar. La doctora que trabaja sola lo hace desde su Agenda con
    ``patients.create`` concedido por usuaria: la paciente queda suya y la
    cita, en su propia agenda.
    """
    doctora = escenario["doctor"]
    _conceder(db_session, doctora, "patients.create")
    headers = _auth_headers(db_session, doctora)

    alta = client.post(
        f"{PREFIX}/patients",
        headers=headers,
        json={"first_name": "NUEVA", "last_name": "PACIENTE EXPRES", "cell_phone": "6691234567",
              "email": "nueva.expres@example.com"},
    )
    assert alta.status_code == 201, alta.text
    paciente = alta.json()
    assert paciente["owner_doctor_id"] == doctora.id
    assert paciente["date_of_birth"] is None

    cita = client.post(
        f"{PREFIX}/appointments",
        headers=headers,
        json={
            "patient_id": paciente["id"],
            "doctor_id": doctora.id,
            "scheduled_at": (utcnow() + timedelta(days=10)).isoformat(),
            "duration_minutes": 30,
            "motivo_extra": "PRIMERA VEZ",
        },
    )
    assert cita.status_code == 201, cita.text
    assert cita.json()["motivo_extra"] == "PRIMERA VEZ"


def test_doctora_sin_el_permiso_no_da_de_alta_pacientes(client, db_session, escenario):
    """Sin la concesión, el alta exprés no se le ofrece y el servidor la niega."""
    respuesta = client.post(
        f"{PREFIX}/patients",
        headers=_auth_headers(db_session, escenario["doctor"]),
        json={"first_name": "NUEVA", "last_name": "PACIENTE", "cell_phone": "6691234567"},
    )
    assert respuesta.status_code == 403, respuesta.text
