"""Pruebas de las salas de consulta (consultorios físicos).

El consultorio G & G tiene dos salas y cuatro doctores: hasta ahora el
sistema solo detectaba empalmes por doctor, así que dejaba agendar tres
doctores a la misma hora. Aquí se verifica el choque doble (doctor y sala),
la obligatoriedad según la sucursal y la gestión del catálogo.

Usan SQLite en memoria y sobrescriben ``get_db``, siguiendo el mismo patrón
que ``test_tenants.py``.
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
from app.models.consultation_room import ConsultationRoom
from app.models.patient import Patient
from app.models.tenant import Tenant
from app.models.user import Role, User
from app.models.user_session import UserSession

PREFIX = settings.API_V1_PREFIX

# Una hora fija y futura, para que las pruebas no dependan del reloj.
INICIO = (utcnow() + timedelta(days=7)).replace(hour=10, minute=0, second=0, microsecond=0)


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
    """Una sucursal SIN salas todavía, con secretaria, dos doctores y paciente."""
    tenant = Tenant(name="Consultorio de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    def _user(email, role, full_name=None):
        user = User(
            email=email,
            hashed_password="no-usado-en-estas-pruebas",
            full_name=full_name or f"Usuario {role.value}",
            role=role,
            tenant_id=tenant.id,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    paciente = Patient(
        tenant_id=tenant.id,
        first_name="Paciente",
        last_name="De Prueba",
        date_of_birth=datetime(1990, 5, 20).date(),
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    return {
        "tenant": tenant,
        "secretaria": _user("secretaria@gems.com", Role.SECRETARIA),
        "admin": _user("admin@gems.com", Role.ADMIN),
        "doctora_a": _user("doctora.a@gems.com", Role.DOCTOR, "Dra. Alvarez"),
        "doctor_b": _user("doctor.b@gems.com", Role.DOCTOR, "Dr. Bernal"),
        "paciente": paciente,
    }


def _crear_sala(db, tenant, nombre, orden=0, is_active=True) -> ConsultationRoom:
    sala = ConsultationRoom(
        tenant_id=tenant.id, name=nombre, display_order=orden, is_active=is_active
    )
    db.add(sala)
    db.commit()
    db.refresh(sala)
    return sala


def _agendar(client, headers, escenario, doctor, inicio, duracion=30, sala=None):
    cuerpo = {
        "patient_id": escenario["paciente"].id,
        "doctor_id": doctor.id,
        "scheduled_at": inicio.isoformat(),
        "duration_minutes": duracion,
    }
    if sala is not None:
        cuerpo["room_id"] = sala.id
    return client.post(f"{PREFIX}/appointments", headers=headers, json=cuerpo)


# --- T2: choque de sala ---


def test_dos_doctores_en_la_misma_sala_a_la_misma_hora_choca(client, db_session, escenario):
    sala_1 = _crear_sala(db_session, escenario["tenant"], "Sala 1", 1)
    _crear_sala(db_session, escenario["tenant"], "Sala 2", 2)
    headers = _auth_headers(db_session, escenario["secretaria"])

    primera = _agendar(client, headers, escenario, escenario["doctora_a"], INICIO, sala=sala_1)
    assert primera.status_code == 201, primera.text

    segunda = _agendar(client, headers, escenario, escenario["doctor_b"], INICIO, sala=sala_1)
    assert segunda.status_code == 400
    detalle = segunda.json()["detail"]
    assert "Sala 1" in detalle
    assert "Dra. Alvarez" in detalle
    assert "Elige otra sala u otro horario" in detalle


def test_el_solapamiento_parcial_de_sala_tambien_choca(client, db_session, escenario):
    """10:00-10:30 y 10:15-10:45 comparten quince minutos: es un choque."""
    sala_1 = _crear_sala(db_session, escenario["tenant"], "Sala 1", 1)
    _crear_sala(db_session, escenario["tenant"], "Sala 2", 2)
    headers = _auth_headers(db_session, escenario["secretaria"])

    assert (
        _agendar(client, headers, escenario, escenario["doctora_a"], INICIO, 30, sala_1).status_code
        == 201
    )

    solapada = _agendar(
        client,
        headers,
        escenario,
        escenario["doctor_b"],
        INICIO + timedelta(minutes=15),
        30,
        sala_1,
    )
    assert solapada.status_code == 400
    assert "Sala 1" in solapada.json()["detail"]


def test_citas_pegadas_en_la_misma_sala_no_chocan(client, db_session, escenario):
    """10:00-10:30 y 10:30-11:00 se tocan pero no se solapan."""
    sala_1 = _crear_sala(db_session, escenario["tenant"], "Sala 1", 1)
    _crear_sala(db_session, escenario["tenant"], "Sala 2", 2)
    headers = _auth_headers(db_session, escenario["secretaria"])

    assert (
        _agendar(client, headers, escenario, escenario["doctora_a"], INICIO, 30, sala_1).status_code
        == 201
    )
    seguida = _agendar(
        client,
        headers,
        escenario,
        escenario["doctor_b"],
        INICIO + timedelta(minutes=30),
        30,
        sala_1,
    )
    assert seguida.status_code == 201, seguida.text


def test_dos_doctores_en_salas_distintas_a_la_misma_hora_se_permite(
    client, db_session, escenario
):
    """El caso que hace útil todo esto: dos salas, dos doctores, misma hora."""
    sala_1 = _crear_sala(db_session, escenario["tenant"], "Sala 1", 1)
    sala_2 = _crear_sala(db_session, escenario["tenant"], "Sala 2", 2)
    headers = _auth_headers(db_session, escenario["secretaria"])

    primera = _agendar(client, headers, escenario, escenario["doctora_a"], INICIO, sala=sala_1)
    segunda = _agendar(client, headers, escenario, escenario["doctor_b"], INICIO, sala=sala_2)

    assert primera.status_code == 201, primera.text
    assert segunda.status_code == 201, segunda.text
    assert primera.json()["room_name"] == "Sala 1"
    assert segunda.json()["room_name"] == "Sala 2"


def test_una_cita_cancelada_libera_la_sala(client, db_session, escenario):
    sala_1 = _crear_sala(db_session, escenario["tenant"], "Sala 1", 1)
    _crear_sala(db_session, escenario["tenant"], "Sala 2", 2)
    headers = _auth_headers(db_session, escenario["secretaria"])

    cita = _agendar(client, headers, escenario, escenario["doctora_a"], INICIO, sala=sala_1).json()
    cancelar = client.patch(
        f"{PREFIX}/appointments/{cita['id']}/status",
        headers=headers,
        json={"status": "cancelada", "cancellation_reason": "La paciente reprogramó"},
    )
    assert cancelar.status_code == 200, cancelar.text

    reutilizar = _agendar(client, headers, escenario, escenario["doctor_b"], INICIO, sala=sala_1)
    assert reutilizar.status_code == 201, reutilizar.text


def test_reagendar_a_una_sala_ocupada_choca(client, db_session, escenario):
    sala_1 = _crear_sala(db_session, escenario["tenant"], "Sala 1", 1)
    sala_2 = _crear_sala(db_session, escenario["tenant"], "Sala 2", 2)
    headers = _auth_headers(db_session, escenario["secretaria"])

    _agendar(client, headers, escenario, escenario["doctora_a"], INICIO, sala=sala_1)
    otra = _agendar(client, headers, escenario, escenario["doctor_b"], INICIO, sala=sala_2).json()

    mover = client.put(
        f"{PREFIX}/appointments/{otra['id']}", headers=headers, json={"room_id": sala_1.id}
    )
    assert mover.status_code == 400
    assert "Sala 1" in mover.json()["detail"]


def test_reagendar_la_hora_revalida_la_sala(client, db_session, escenario):
    """Cambiar solo la hora también tiene que revisar la sala."""
    sala_1 = _crear_sala(db_session, escenario["tenant"], "Sala 1", 1)
    _crear_sala(db_session, escenario["tenant"], "Sala 2", 2)
    headers = _auth_headers(db_session, escenario["secretaria"])

    _agendar(client, headers, escenario, escenario["doctora_a"], INICIO, sala=sala_1)
    tarde = _agendar(
        client, headers, escenario, escenario["doctor_b"], INICIO + timedelta(hours=3), sala=sala_1
    ).json()

    mover = client.put(
        f"{PREFIX}/appointments/{tarde['id']}",
        headers=headers,
        json={"scheduled_at": INICIO.isoformat()},
    )
    assert mover.status_code == 400
    assert "Sala 1" in mover.json()["detail"]


# --- T3: obligatoriedad segun la sucursal ---


def test_con_dos_salas_la_sala_es_obligatoria(client, db_session, escenario):
    _crear_sala(db_session, escenario["tenant"], "Sala 1", 1)
    _crear_sala(db_session, escenario["tenant"], "Sala 2", 2)
    headers = _auth_headers(db_session, escenario["secretaria"])

    sin_sala = _agendar(client, headers, escenario, escenario["doctora_a"], INICIO)
    assert sin_sala.status_code == 400
    detalle = sin_sala.json()["detail"]
    assert "Hay que indicar en qué sala" in detalle
    assert "Sala 1" in detalle and "Sala 2" in detalle


def test_con_una_sola_sala_se_asigna_sola(client, db_session, escenario):
    sala = _crear_sala(db_session, escenario["tenant"], "Consultorio", 1)
    headers = _auth_headers(db_session, escenario["secretaria"])

    respuesta = _agendar(client, headers, escenario, escenario["doctora_a"], INICIO)
    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["room_id"] == sala.id
    assert respuesta.json()["room_name"] == "Consultorio"


def test_sin_salas_configuradas_no_bloquea(client, db_session, escenario):
    """Sucursal sin salas dadas de alta: se agenda igual, sin sala."""
    headers = _auth_headers(db_session, escenario["secretaria"])

    respuesta = _agendar(client, headers, escenario, escenario["doctora_a"], INICIO)
    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["room_id"] is None
    assert respuesta.json()["room_name"] is None


def test_una_sala_desactivada_no_cuenta_para_la_obligatoriedad(client, db_session, escenario):
    """Con Sala 2 desactivada queda una sola activa: se asigna sola."""
    sala_1 = _crear_sala(db_session, escenario["tenant"], "Sala 1", 1)
    _crear_sala(db_session, escenario["tenant"], "Sala 2", 2, is_active=False)
    headers = _auth_headers(db_session, escenario["secretaria"])

    respuesta = _agendar(client, headers, escenario, escenario["doctora_a"], INICIO)
    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["room_id"] == sala_1.id


def test_no_se_puede_agendar_en_una_sala_desactivada(client, db_session, escenario):
    _crear_sala(db_session, escenario["tenant"], "Sala 1", 1)
    apagada = _crear_sala(db_session, escenario["tenant"], "Sala 2", 2, is_active=False)
    headers = _auth_headers(db_session, escenario["secretaria"])

    respuesta = _agendar(client, headers, escenario, escenario["doctora_a"], INICIO, sala=apagada)
    assert respuesta.status_code == 400
    assert "no existe o está desactivada" in respuesta.json()["detail"]


def test_no_se_puede_agendar_en_la_sala_de_otra_sucursal(client, db_session, escenario):
    _crear_sala(db_session, escenario["tenant"], "Sala 1", 1)
    otra_sucursal = Tenant(name="Otra sucursal", is_active=True)
    db_session.add(otra_sucursal)
    db_session.commit()
    db_session.refresh(otra_sucursal)
    ajena = _crear_sala(db_session, otra_sucursal, "Sala ajena", 1)

    headers = _auth_headers(db_session, escenario["secretaria"])
    respuesta = _agendar(client, headers, escenario, escenario["doctora_a"], INICIO, sala=ajena)
    assert respuesta.status_code == 400


# --- T4: endpoints de gestion ---


def test_cualquier_rol_autenticado_lista_las_salas(client, db_session, escenario):
    _crear_sala(db_session, escenario["tenant"], "Sala 2", 2)
    _crear_sala(db_session, escenario["tenant"], "Sala 1", 1)

    for rol in ("secretaria", "doctora_a", "admin"):
        respuesta = client.get(
            f"{PREFIX}/consultation-rooms", headers=_auth_headers(db_session, escenario[rol])
        )
        assert respuesta.status_code == 200, respuesta.text
        assert [s["name"] for s in respuesta.json()] == ["Sala 1", "Sala 2"]


def test_el_listado_oculta_las_desactivadas_salvo_que_se_pidan(client, db_session, escenario):
    _crear_sala(db_session, escenario["tenant"], "Sala 1", 1)
    _crear_sala(db_session, escenario["tenant"], "Sala 2", 2, is_active=False)
    headers = _auth_headers(db_session, escenario["admin"])

    activas = client.get(f"{PREFIX}/consultation-rooms", headers=headers).json()
    assert [s["name"] for s in activas] == ["Sala 1"]

    todas = client.get(
        f"{PREFIX}/consultation-rooms?include_inactive=true", headers=headers
    ).json()
    assert [s["name"] for s in todas] == ["Sala 1", "Sala 2"]


def test_la_secretaria_no_puede_gestionar_salas(client, db_session, escenario):
    sala = _crear_sala(db_session, escenario["tenant"], "Sala 1", 1)
    headers = _auth_headers(db_session, escenario["secretaria"])

    assert (
        client.post(
            f"{PREFIX}/consultation-rooms", headers=headers, json={"name": "Sala 3"}
        ).status_code
        == 403
    )
    assert (
        client.put(
            f"{PREFIX}/consultation-rooms/{sala.id}", headers=headers, json={"name": "Otra"}
        ).status_code
        == 403
    )
    assert (
        client.put(
            f"{PREFIX}/consultation-rooms/{sala.id}/status",
            headers=headers,
            json={"is_active": False},
        ).status_code
        == 403
    )


def test_el_doctor_no_puede_gestionar_salas(client, db_session, escenario):
    headers = _auth_headers(db_session, escenario["doctora_a"])
    assert (
        client.post(
            f"{PREFIX}/consultation-rooms", headers=headers, json={"name": "Sala 3"}
        ).status_code
        == 403
    )


def test_el_admin_da_de_alta_y_edita_una_sala(client, db_session, escenario):
    headers = _auth_headers(db_session, escenario["admin"])

    alta = client.post(
        f"{PREFIX}/consultation-rooms",
        headers=headers,
        json={"name": "  Sala 3  ", "display_order": 3},
    )
    assert alta.status_code == 201, alta.text
    creada = alta.json()
    assert creada["name"] == "Sala 3"  # se recortan los espacios
    assert creada["is_active"] is True
    assert creada["tenant_id"] == escenario["tenant"].id

    edicion = client.put(
        f"{PREFIX}/consultation-rooms/{creada['id']}",
        headers=headers,
        json={"name": "Sala de procedimientos"},
    )
    assert edicion.status_code == 200, edicion.text
    assert edicion.json()["name"] == "Sala de procedimientos"


def test_no_se_repite_el_nombre_de_sala_en_la_misma_sucursal(client, db_session, escenario):
    _crear_sala(db_session, escenario["tenant"], "Sala 1", 1)
    headers = _auth_headers(db_session, escenario["admin"])

    repetida = client.post(
        f"{PREFIX}/consultation-rooms", headers=headers, json={"name": "sala 1"}
    )
    assert repetida.status_code == 400
    assert "Ya existe una sala con ese nombre" in repetida.json()["detail"]


def test_desactivar_no_borra_la_sala_ni_las_citas(client, db_session, escenario):
    """No hay borrado físico: la sala sigue existiendo y la cita conserva su sala."""
    sala_1 = _crear_sala(db_session, escenario["tenant"], "Sala 1", 1)
    _crear_sala(db_session, escenario["tenant"], "Sala 2", 2)
    secretaria = _auth_headers(db_session, escenario["secretaria"])
    cita = _agendar(
        client, secretaria, escenario, escenario["doctora_a"], INICIO, sala=sala_1
    ).json()

    admin = _auth_headers(db_session, escenario["admin"])
    apagar = client.put(
        f"{PREFIX}/consultation-rooms/{sala_1.id}/status", headers=admin, json={"is_active": False}
    )
    assert apagar.status_code == 200, apagar.text
    assert apagar.json()["is_active"] is False

    # La sala sigue en la base y no existe ningun endpoint de borrado.
    assert db_session.query(ConsultationRoom).filter_by(id=sala_1.id).first() is not None
    assert (
        client.delete(f"{PREFIX}/consultation-rooms/{sala_1.id}", headers=admin).status_code == 405
    )

    # La cita conserva su sala y sigue mostrando el nombre.
    detalle = client.get(f"{PREFIX}/appointments/{cita['id']}", headers=secretaria).json()
    assert detalle["room_id"] == sala_1.id
    assert detalle["room_name"] == "Sala 1"


# --- T4: la agenda filtra por sala ---


def test_la_agenda_filtra_por_sala(client, db_session, escenario):
    sala_1 = _crear_sala(db_session, escenario["tenant"], "Sala 1", 1)
    sala_2 = _crear_sala(db_session, escenario["tenant"], "Sala 2", 2)
    headers = _auth_headers(db_session, escenario["secretaria"])

    _agendar(client, headers, escenario, escenario["doctora_a"], INICIO, sala=sala_1)
    _agendar(client, headers, escenario, escenario["doctor_b"], INICIO, sala=sala_2)

    en_sala_1 = client.get(f"{PREFIX}/appointments?room_id={sala_1.id}", headers=headers).json()
    assert len(en_sala_1) == 1
    assert en_sala_1[0]["room_name"] == "Sala 1"

    todas = client.get(f"{PREFIX}/appointments", headers=headers).json()
    assert len(todas) == 2
