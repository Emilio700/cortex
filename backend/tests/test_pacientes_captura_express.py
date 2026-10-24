"""Pruebas del alta express de pacientes.

Usan SQLite en memoria y sobrescriben ``get_db``, siguiendo el mismo patrón que
``test_appointments_creacion.py``.
"""
from datetime import date, timedelta
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
def headers(db_session):
    """Secretaria autenticada de una sucursal recién creada."""
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    usuario = User(
        email="secretaria@gems.com",
        hashed_password="no-usado-en-estas-pruebas",
        full_name="Usuaria de prueba",
        role=Role.SECRETARIA,
        tenant_id=tenant.id,
        is_active=True,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)

    return _auth_headers(db_session, usuario)


def test_alta_solo_con_nombre_apellidos_y_celular(client, headers):
    """Captura express: sin fecha de nacimiento el alta debe funcionar."""
    respuesta = client.post(
        f"{PREFIX}/patients",
        headers=headers,
        json={"first_name": "Ana", "last_name": "López", "cell_phone": "5512345678"},
    )

    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["date_of_birth"] is None


def test_alta_sin_celular_falla_con_mensaje_en_espanol(client, headers):
    """El celular es el único contacto obligatorio al crear."""
    respuesta = client.post(
        f"{PREFIX}/patients",
        headers=headers,
        json={"first_name": "Ana", "last_name": "López"},
    )

    assert respuesta.status_code == 422
    assert "El celular es obligatorio" in respuesta.text


def test_alta_con_celular_vacio_falla(client, headers):
    respuesta = client.post(
        f"{PREFIX}/patients",
        headers=headers,
        json={"first_name": "Ana", "last_name": "López", "cell_phone": "   "},
    )

    assert respuesta.status_code == 422
    assert "El celular es obligatorio" in respuesta.text


def test_texto_se_guarda_en_mayusculas_y_el_correo_no(client, headers):
    respuesta = client.post(
        f"{PREFIX}/patients",
        headers=headers,
        json={
            "first_name": "ana maría",
            "last_name": "lópez",
            "cell_phone": "5512345678",
            "email": "Ana.Lopez@correo.com",
            "address": "calle 1",
            "allergies": "penicilina",
            "personal_history": "ninguno",
            "family_history": "diabetes",
            "gynecological_history": "sin datos",
            "religion": "católica",
            "blood_type": "o+",
            "menstrual_rhythm": "30x4 dis",
            "birth_control": "diu",
        },
    )

    assert respuesta.status_code == 201, respuesta.text
    datos = respuesta.json()
    assert datos["first_name"] == "ANA MARÍA"
    assert datos["last_name"] == "LÓPEZ"
    assert datos["address"] == "CALLE 1"
    assert datos["allergies"] == "PENICILINA"
    # Recepción no captura antecedentes (opción C, plan 32): llegan, se
    # ignoran y no se le devuelven. Su paso a mayúsculas lo prueba el esquema.
    assert datos["antecedentes_visibles"] is False
    assert datos["personal_history"] is None
    assert datos["family_history"] is None
    assert datos["gynecological_history"] is None
    assert datos["religion"] == "CATÓLICA"
    assert datos["blood_type"] == "O+"
    assert datos["menstrual_rhythm"] is None
    assert datos["birth_control"] is None
    assert datos["email"] == "Ana.Lopez@correo.com"


def test_editar_una_paciente_no_le_borra_la_fur_ni_la_fpp(client, headers, db_session):
    """La regresión que importó: editar el expediente no destruye fechas.

    El sistema borraba FUR y FPP en cuanto la paciente estaba marcada como
    ginecológica, y contestaba 200 igual. Como el 97% de las marcadas como
    obstétricas ya no lo están, esa bandera no podía decidir qué se conserva.
    """
    tenant_id = db_session.query(Tenant).first().id
    paciente = Patient(
        tenant_id=tenant_id,
        first_name="ANA",
        last_name="LÓPEZ",
        cell_phone="5512345678",
        patient_type="GINECOLOGICAS",
        last_menstrual_period=date(2026, 1, 10),
        expected_delivery_date=date(2026, 10, 17),
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    respuesta = client.put(
        f"{PREFIX}/patients/{paciente.id}",
        headers=headers,
        json={"allergies": "penicilina"},
    )

    assert respuesta.status_code == 200, respuesta.text
    db_session.expire_all()
    guardada = db_session.query(Patient).filter(Patient.id == paciente.id).first()
    assert guardada.last_menstrual_period == date(2026, 1, 10)
    assert guardada.expected_delivery_date == date(2026, 10, 17)


def test_cambiar_el_tipo_de_paciente_ya_no_borra_fechas(client, headers, db_session):
    """Ni siquiera tocando la bandera a mano se pierde información clínica."""
    tenant_id = db_session.query(Tenant).first().id
    paciente = Patient(
        tenant_id=tenant_id,
        first_name="ANA",
        last_name="LÓPEZ",
        cell_phone="5512345678",
        patient_type="OBSTETRICAS",
        last_menstrual_period=date(2026, 1, 10),
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    respuesta = client.put(
        f"{PREFIX}/patients/{paciente.id}",
        headers=headers,
        json={"patient_type": "GINECOLOGICAS"},
    )

    assert respuesta.status_code == 200, respuesta.text
    db_session.expire_all()
    guardada = db_session.query(Patient).filter(Patient.id == paciente.id).first()
    assert guardada.last_menstrual_period == date(2026, 1, 10)


def test_el_alta_ya_no_deduce_la_fpp_desde_la_fur(client, headers, db_session):
    """Fechar un embarazo es decisión clínica y vive en ``pregnancies``.

    El expediente ya no calcula nada por su cuenta: dos respuestas distintas a
    la misma pregunta (y en 8 embarazos activos no coincidían) es peor que una.
    """
    respuesta = client.post(
        f"{PREFIX}/patients",
        headers=headers,
        json={
            "first_name": "Ana",
            "last_name": "López",
            "cell_phone": "5512345678",
            "last_menstrual_period": "2026-01-10",
        },
    )

    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["expected_delivery_date"] is None


def test_actualizar_sin_celular_sigue_permitido(client, headers, db_session):
    """Hay pacientes migradas sin teléfono: editarlas no debe exigir uno."""
    paciente = Patient(
        tenant_id=db_session.query(Tenant).first().id,
        first_name="SIN",
        last_name="TELEFONO",
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    respuesta = client.put(
        f"{PREFIX}/patients/{paciente.id}",
        headers=headers,
        json={"address": "calle 2"},
    )

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["address"] == "CALLE 2"
    assert respuesta.json()["cell_phone"] is None


def test_fecha_vacia_del_formulario_no_rompe_el_alta(client, headers):
    """Regresión de integración: el formulario manda ``date_of_birth: ""`` cuando
    no se captura la fecha. Sin tratar la cadena vacía como nula, Pydantic
    respondía 422 y el alta express fallaba en producción.
    """
    respuesta = client.post(
        f"{PREFIX}/patients",
        headers=headers,
        json={
            "first_name": "ana",
            "last_name": "lopez",
            "cell_phone": "6691234567",
            "date_of_birth": "",
            "last_menstrual_period": "",
            "expected_delivery_date": "",
        },
    )

    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["date_of_birth"] is None
    assert cuerpo["last_menstrual_period"] is None
    assert cuerpo["expected_delivery_date"] is None
    assert cuerpo["first_name"] == "ANA"


def test_un_correo_invalido_guardado_no_tumba_la_respuesta(client, db_session, headers):
    """Regresión: los datos migrados traen telefonos y direcciones en el campo
    de correo. Validar la RESPUESTA hacia que una sola fila corrupta devolviera
    500 y dejara inaccesible la lista completa de pacientes.
    """
    from app.models.patient import Patient
    from app.models.tenant import Tenant

    tenant = db_session.query(Tenant).first()
    db_session.add(
        Patient(
            tenant_id=tenant.id,
            first_name="LUCERO",
            last_name="REYES GONZALEZ",
            email="6692629673",  # un telefono, tal como vino del sistema viejo
        )
    )
    db_session.commit()

    respuesta = client.get(f"{PREFIX}/patients?limit=50", headers=headers)
    assert respuesta.status_code == 200, respuesta.text
    correos = [p["email"] for p in respuesta.json()]
    assert "6692629673" in correos


def test_los_antecedentes_se_normalizan_a_mayusculas_en_el_esquema():
    """Lo que sí captura la doctora sigue guardándose en MAYÚSCULAS."""
    from app.schemas.patient import PatientCreate

    datos = PatientCreate(
        first_name="ana", last_name="lópez", cell_phone="5512345678",
        personal_history="ninguno", family_history="diabetes", gynecological_history="sin datos",
        menstrual_rhythm="30x4 dis", birth_control="diu",
    )
    assert (datos.personal_history, datos.family_history, datos.gynecological_history) == ("NINGUNO", "DIABETES", "SIN DATOS")
    assert (datos.menstrual_rhythm, datos.birth_control) == ("30X4 DIS", "DIU")
