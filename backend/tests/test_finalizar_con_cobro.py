"""Finalizar la consulta y cobrarla es UNA operación (plan 23).

Si fueran dos llamadas, cualquier falla a la mitad dejaría "se cobró pero no se
cerró" o "se cerró sin el cobro que la doctora cree haber registrado". Aquí se
prueba que o quedan las dos cosas o ninguna, que el aviso a secretaría dice lo
que de verdad pasó con el cobro, y que el ingreso queda a nombre de quien
atendió.

Usan SQLite en memoria y sobrescriben ``get_db``, como ``test_triage_desde_consulta.py``.
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
from app.models.notification import Notification
from app.models.patient import Patient
from app.models.payment import Payment, PaymentMethod, PaymentStatus
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


def _headers(db, user: User) -> dict[str, str]:
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


def _usuario(db, tenant, nombre, role):
    usuario = User(
        email=f"{nombre.lower().replace(' ', '.')}@gems.com",
        hashed_password="no-usado-en-estas-pruebas",
        full_name=nombre,
        role=role,
        tenant_id=tenant.id,
        is_active=True,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


@pytest.fixture
def e(db_session):
    """Una consulta en curso de la Dra. Cintia, con recepción que espera el aviso."""
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    cintia = _usuario(db_session, tenant, "Cintia López", Role.DOCTOR)
    rosa = _usuario(db_session, tenant, "Rosa Méndez", Role.DOCTOR)
    secretaria = _usuario(db_session, tenant, "Laura Recepción", Role.SECRETARIA)

    paciente = Patient(
        tenant_id=tenant.id,
        first_name="Ana",
        last_name="De Prueba",
        date_of_birth=datetime(1990, 5, 20).date(),
        owner_doctor_id=cintia.id,
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    cita = Appointment(
        tenant_id=tenant.id,
        patient_id=paciente.id,
        doctor_id=cintia.id,
        scheduled_at=utcnow(),
        duration_minutes=30,
        appointment_type=AppointmentType.CONSULTA,
        status=AppointmentStatus.EN_SALA,
    )
    db_session.add(cita)
    db_session.commit()
    db_session.refresh(cita)

    return {
        "tenant": tenant,
        "cintia": cintia,
        "rosa": rosa,
        "secretaria": secretaria,
        "paciente": paciente,
        "cita": cita,
    }


def _finalizar(client, headers, cita_id, **cuerpo):
    return client.patch(
        f"{PREFIX}/appointments/{cita_id}/status",
        json={"status": "atendida", **cuerpo},
        headers=headers,
    )


def _cobrado(**extra):
    return {"modo": "cobrado", "amount": "800.00", "method": "card", "referencia": "4821", **extra}


def _estado_en_bd(db, cita_id):
    """Lo que quedó de verdad confirmado, no lo que la sesión tiene en memoria."""
    db.expire_all()
    return db.query(Appointment).filter(Appointment.id == cita_id).one().status


def _pagos(db, cita_id):
    db.expire_all()
    return (
        db.query(Payment)
        .filter(Payment.appointment_id == cita_id, Payment.status == PaymentStatus.VIGENTE)
        .all()
    )


def _avisos(db):
    db.expire_all()
    return db.query(Notification).filter(Notification.type == "consultation_completed").all()


# ---------------------------------------------------------------------------
# Atomicidad
# ---------------------------------------------------------------------------

def test_finalizar_con_cobro_cierra_la_cita_y_registra_el_pago(client, db_session, e):
    respuesta = _finalizar(
        client,
        _headers(db_session, e["cintia"]),
        e["cita"].id,
        cobro=_cobrado(client_request_id=str(uuid4())),
    )

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    # La pantalla sólo dice "cobrado" si esto viene en la respuesta.
    assert cuerpo["status"] == "atendida"
    assert cuerpo["estado_cobro"] == "cobrada"
    assert Decimal(cuerpo["total_cobrado"]) == Decimal("800.00")
    assert cuerpo["attended_by_user_id"] == e["cintia"].id
    assert len(cuerpo["cobro_resumen"]) == 1
    resumen = cuerpo["cobro_resumen"][0]
    assert resumen["received_by_name"] == "Cintia López"
    assert resumen["doctor_name"] == "Cintia López"
    assert resumen["method"] == "card"
    assert resumen["referencia"] == "4821"

    pagos = _pagos(db_session, e["cita"].id)
    assert len(pagos) == 1
    assert pagos[0].doctor_id == e["cintia"].id
    assert pagos[0].received_by_user_id == e["cintia"].id


@pytest.mark.parametrize(
    "cobro",
    [
        {"modo": "cobrado", "method": "card"},  # sin importe
        {"modo": "cobrado", "amount": "0", "method": "card"},
        {"modo": "cobrado", "amount": "800.00"},  # sin forma de pago
        {"modo": "cobrado", "amount": "800.00", "method": "card", "service_id": 9999},
        {"modo": "sin_cargo"},  # sin motivo
        {"modo": "sin_cargo", "motivo": "   "},
    ],
    ids=["sin-importe", "importe-cero", "sin-metodo", "servicio-inexistente", "sin-motivo", "motivo-vacio"],
)
def test_si_el_cobro_es_invalido_la_cita_no_queda_atendida(client, db_session, e, cobro):
    respuesta = _finalizar(client, _headers(db_session, e["cintia"]), e["cita"].id, cobro=cobro)

    assert 400 <= respuesta.status_code < 500
    assert isinstance(respuesta.json()["detail"], str)
    assert _estado_en_bd(db_session, e["cita"].id) == AppointmentStatus.EN_SALA
    assert _pagos(db_session, e["cita"].id) == []
    assert _avisos(db_session) == []


def test_si_la_cita_ya_estaba_cobrada_finalizar_cobrando_da_409_y_no_cierra(client, db_session, e):
    """Recepción cobró por adelantado y la doctora, sin saberlo, cobra otra vez."""
    anticipo = client.post(
        f"{PREFIX}/payments",
        json={
            "patient_id": e["paciente"].id,
            "appointment_id": e["cita"].id,
            "amount": "800.00",
            "method": "cash",
        },
        headers=_headers(db_session, e["secretaria"]),
    )
    assert anticipo.status_code == 201, anticipo.text

    respuesta = _finalizar(client, _headers(db_session, e["cintia"]), e["cita"].id, cobro=_cobrado())

    assert respuesta.status_code == 409
    assert "Laura Recepción" in respuesta.json()["detail"]
    assert respuesta.json()["cobro_existente"]["id"] == anticipo.json()["id"]
    assert _estado_en_bd(db_session, e["cita"].id) == AppointmentStatus.EN_SALA
    assert len(_pagos(db_session, e["cita"].id)) == 1


def test_repetir_el_cierre_con_el_mismo_cobro_no_lo_duplica(client, db_session, e):
    """Doble clic en "Finalizar": la segunda llamada devuelve la misma cita cobrada."""
    headers = _headers(db_session, e["cintia"])
    cobro = _cobrado(client_request_id=str(uuid4()))

    primero = _finalizar(client, headers, e["cita"].id, cobro=cobro)
    segundo = _finalizar(client, headers, e["cita"].id, cobro=cobro)

    assert primero.status_code == 200, primero.text
    assert segundo.status_code == 200, segundo.text
    assert segundo.json()["estado_cobro"] == "cobrada"
    assert len(_pagos(db_session, e["cita"].id)) == 1
    assert len(_avisos(db_session)) == 1


def test_el_cobro_solo_viaja_al_finalizar(client, db_session, e):
    respuesta = client.patch(
        f"{PREFIX}/appointments/{e['cita'].id}/status",
        json={"status": "confirmada", "cobro": _cobrado()},
        headers=_headers(db_session, e["cintia"]),
    )

    assert respuesta.status_code == 400
    assert _pagos(db_session, e["cita"].id) == []


# ---------------------------------------------------------------------------
# Modos y aviso a secretaría
# ---------------------------------------------------------------------------

def test_cobrado_avisa_que_ya_se_cobro(client, db_session, e):
    _finalizar(client, _headers(db_session, e["cintia"]), e["cita"].id, cobro=_cobrado())

    avisos = _avisos(db_session)
    assert len(avisos) == 1
    assert avisos[0].user_id == e["secretaria"].id
    assert "ya cobrada" in avisos[0].title
    assert "pendiente" not in avisos[0].title
    assert "$800.00" in avisos[0].message
    assert "tarjeta" in avisos[0].message
    assert "No volver a cobrar" in avisos[0].message


def test_recepcion_avisa_pendiente_de_cobro(client, db_session, e):
    respuesta = _finalizar(
        client, _headers(db_session, e["cintia"]), e["cita"].id, cobro={"modo": "recepcion"}
    )

    assert respuesta.json()["estado_cobro"] == "pendiente"
    avisos = _avisos(db_session)
    assert len(avisos) == 1
    assert "pendiente de cobro" in avisos[0].title


def test_sin_bloque_de_cobro_se_comporta_como_hasta_ahora(client, db_session, e):
    respuesta = _finalizar(client, _headers(db_session, e["cintia"]), e["cita"].id, notes="DESCUENTO 10%")

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["estado_cobro"] == "pendiente"
    assert "DESCUENTO 10%" in respuesta.json()["notes"]
    assert "pendiente de cobro" in _avisos(db_session)[0].title
    assert _pagos(db_session, e["cita"].id) == []


def test_sin_cargo_queda_registrado_y_se_avisa(client, db_session, e):
    respuesta = _finalizar(
        client,
        _headers(db_session, e["cintia"]),
        e["cita"].id,
        cobro={"modo": "sin_cargo", "motivo": "REVISIÓN INCLUIDA"},
    )

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["estado_cobro"] == "sin_cargo"
    assert respuesta.json()["cobro_sin_cargo_motivo"] == "REVISIÓN INCLUIDA"
    db_session.expire_all()
    cita = db_session.query(Appointment).filter(Appointment.id == e["cita"].id).one()
    assert cita.cobro_sin_cargo_por_user_id == e["cintia"].id
    assert cita.cobro_sin_cargo_at is not None
    aviso = _avisos(db_session)[0]
    assert "sin cargo" in aviso.title
    assert "REVISIÓN INCLUIDA" in aviso.message


def test_una_cita_cobrada_que_se_cierra_sin_bloque_avisa_ya_cobrada(client, db_session, e):
    """El aviso sigue al estado real: decir "pendiente" aquí provocaría el cobro doble."""
    client.post(
        f"{PREFIX}/payments",
        json={
            "patient_id": e["paciente"].id,
            "appointment_id": e["cita"].id,
            "amount": "800.00",
            "method": "cash",
        },
        headers=_headers(db_session, e["secretaria"]),
    )

    respuesta = _finalizar(client, _headers(db_session, e["cintia"]), e["cita"].id)

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["estado_cobro"] == "cobrada"
    aviso = _avisos(db_session)[0]
    assert "ya cobrada" in aviso.title
    assert "Laura Recepción" in aviso.message


def test_sin_permiso_de_cobro_no_se_finaliza_cobrando(client, db_session, e):
    from app.models.permission import Permission

    db_session.add(
        Permission(role="doctor", action="payments.create", is_granted=False, user_id=e["cintia"].id)
    )
    db_session.commit()

    respuesta = _finalizar(client, _headers(db_session, e["cintia"]), e["cita"].id, cobro=_cobrado())

    assert respuesta.status_code == 403
    assert _estado_en_bd(db_session, e["cita"].id) == AppointmentStatus.EN_SALA


# ---------------------------------------------------------------------------
# A quién pertenece el ingreso
# ---------------------------------------------------------------------------

def test_el_cobro_anticipado_pasa_a_quien_atendio_al_finalizar(client, db_session, e):
    """Recepción cobró antes de la consulta, a nombre de la titular; atendió otra."""
    anticipo = client.post(
        f"{PREFIX}/payments",
        json={
            "patient_id": e["paciente"].id,
            "appointment_id": e["cita"].id,
            "amount": "800.00",
            "method": "cash",
        },
        headers=_headers(db_session, e["secretaria"]),
    ).json()
    assert anticipo["doctor_id"] == e["cintia"].id

    # Reasignada a Rosa (la cubrió), que es quien cierra la consulta.
    e["cita"].doctor_id = e["rosa"].id
    db_session.commit()
    respuesta = _finalizar(client, _headers(db_session, e["rosa"]), e["cita"].id)

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["attended_by_user_id"] == e["rosa"].id
    db_session.expire_all()
    assert db_session.get(Payment, anticipo["id"]).doctor_id == e["rosa"].id


def test_despues_de_atendida_el_ingreso_ya_no_se_mueve(client, db_session, e):
    """Reasignar la cita no mueve el dinero de un corte ya hecho."""
    _finalizar(client, _headers(db_session, e["cintia"]), e["cita"].id, cobro=_cobrado())
    pago = _pagos(db_session, e["cita"].id)[0]

    # Se reabre, se reasigna y la cierra otra doctora.
    client.patch(
        f"{PREFIX}/appointments/{e['cita'].id}/status",
        json={"status": "en_sala"},
        headers=_headers(db_session, e["cintia"]),
    )
    db_session.expire_all()
    cita = db_session.get(Appointment, e["cita"].id)
    cita.doctor_id = e["rosa"].id
    db_session.commit()
    _finalizar(client, _headers(db_session, e["rosa"]), e["cita"].id)

    db_session.expire_all()
    assert db_session.get(Payment, pago.id).doctor_id == e["cintia"].id
    assert db_session.get(Appointment, e["cita"].id).attended_by_user_id == e["cintia"].id


def test_si_cierra_recepcion_el_ingreso_es_de_la_titular(client, db_session, e):
    respuesta = _finalizar(client, _headers(db_session, e["secretaria"]), e["cita"].id, cobro=_cobrado())

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["attended_by_user_id"] == e["cintia"].id
    pago = _pagos(db_session, e["cita"].id)[0]
    assert pago.doctor_id == e["cintia"].id
    assert pago.received_by_user_id == e["secretaria"].id


def test_la_agenda_muestra_el_estado_de_cobro(client, db_session, e):
    headers = _headers(db_session, e["cintia"])
    _finalizar(client, headers, e["cita"].id, cobro=_cobrado())

    agenda = client.get(f"{PREFIX}/appointments", headers=headers).json()
    mias = client.get(f"{PREFIX}/appointments/my-appointments", headers=headers).json()

    for lista in (agenda, mias):
        assert [c["estado_cobro"] for c in lista] == ["cobrada"]
        assert Decimal(lista[0]["total_cobrado"]) == Decimal("800.00")


def test_una_cita_agendada_no_esta_pendiente_de_cobro(client, db_session, e):
    e["cita"].status = AppointmentStatus.AGENDADA
    db_session.commit()

    cita = client.get(
        f"{PREFIX}/appointments/{e['cita'].id}", headers=_headers(db_session, e["cintia"])
    ).json()

    assert cita["estado_cobro"] is None
    assert Decimal(cita["total_cobrado"]) == Decimal("0")
