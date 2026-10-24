"""Pruebas del reenvío de confirmación de cita (S-05).

Usan SQLite en memoria y sobrescriben ``get_db``, como
``test_appointments_creacion.py``. El correo se simula con un doble de
``send_email`` para poder probar los tres desenlaces (enviado, sin correo y
fallo de envío) sin un servidor SMTP.
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
from app.models.appointment import Appointment
from app.models.audit_log import AuditLog
from app.models.patient import Patient
from app.models.permission import Permission
from app.models.tenant import Tenant
from app.models.user import Role, User
from app.models.user_session import UserSession
from app.services import appointment_confirmation_service

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


def _user(db, tenant, email, role) -> User:
    user = User(
        email=email,
        hashed_password="no-usado-en-estas-pruebas",
        full_name=f"Usuario {role.value}",
        role=role,
        tenant_id=tenant.id,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def escenario(db_session):
    """Una sucursal con secretaria, doctora, paciente y una cita agendada."""
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    secretaria = _user(db_session, tenant, "secretaria@gems.com", Role.SECRETARIA)
    doctora = _user(db_session, tenant, "doctora@gems.com", Role.DOCTOR)

    paciente = Patient(
        tenant_id=tenant.id,
        first_name="Ana",
        last_name="López Pérez",
        date_of_birth=datetime(1990, 5, 20).date(),
        email="ana.lopez@correo.com",
        owner_doctor_id=doctora.id,
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    cita = Appointment(
        tenant_id=tenant.id,
        patient_id=paciente.id,
        doctor_id=doctora.id,
        scheduled_at=utcnow() + timedelta(days=3),
        duration_minutes=30,
    )
    db_session.add(cita)
    db_session.commit()
    db_session.refresh(cita)

    return {
        "tenant": tenant,
        "secretaria": secretaria,
        "doctora": doctora,
        "paciente": paciente,
        "cita": cita,
    }


def _ultimo_reenvio(db) -> AuditLog | None:
    return (
        db.query(AuditLog)
        .filter(AuditLog.action == "appointment.confirmation_resent")
        .order_by(AuditLog.id.desc())
        .first()
    )


def test_reenvio_con_correo_reporta_enviado_y_enmascara_al_destinatario(
    client, db_session, escenario, monkeypatch
):
    """El caso feliz: hay correo, el servidor lo acepta y se responde enviado."""
    llamadas = {}

    def _falso_send_email(**kwargs):
        llamadas["to"] = kwargs.get("to_email")
        return True

    monkeypatch.setattr(appointment_confirmation_service, "send_email", _falso_send_email)

    headers = _auth_headers(db_session, escenario["secretaria"])
    respuesta = client.post(
        f"{PREFIX}/appointments/{escenario['cita'].id}/confirmacion", headers=headers
    )

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["enviado"] is True
    assert cuerpo["motivo"] is None
    # No se filtra el correo completo: sólo la inicial y el dominio.
    assert cuerpo["destinatario"] == "a***@correo.com"
    assert "ana.lopez" not in cuerpo["destinatario"]
    assert llamadas["to"] == "ana.lopez@correo.com"

    registro = _ultimo_reenvio(db_session)
    assert registro is not None
    assert registro.outcome == "success"
    assert registro.patient_id == escenario["paciente"].id
    # La bitácora tampoco guarda el correo completo.
    assert registro.details["destinatario"] == "a***@correo.com"


def test_reenvio_sin_correo_no_afirma_envio(client, db_session, escenario, monkeypatch):
    """Sin correo capturado no se intenta nada y no se dice que se envió."""
    escenario["paciente"].email = None
    db_session.commit()

    def _no_debe_llamarse(**kwargs):  # pragma: no cover - se comprueba que no corre
        raise AssertionError("no debe intentarse enviar sin correo")

    monkeypatch.setattr(appointment_confirmation_service, "send_email", _no_debe_llamarse)

    headers = _auth_headers(db_session, escenario["secretaria"])
    respuesta = client.post(
        f"{PREFIX}/appointments/{escenario['cita'].id}/confirmacion", headers=headers
    )

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["enviado"] is False
    assert cuerpo["motivo"] == "sin_email"
    assert cuerpo["destinatario"] is None

    registro = _ultimo_reenvio(db_session)
    assert registro is not None
    assert registro.outcome == "failure"


def test_reenvio_con_fallo_de_envio_lo_reporta_sin_mentir(
    client, db_session, escenario, monkeypatch
):
    """Si el servidor de correo lo rechaza, la interfaz no puede decir «enviado»."""

    def _falla(**kwargs):
        return False

    monkeypatch.setattr(appointment_confirmation_service, "send_email", _falla)

    headers = _auth_headers(db_session, escenario["secretaria"])
    respuesta = client.post(
        f"{PREFIX}/appointments/{escenario['cita'].id}/confirmacion", headers=headers
    )

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["enviado"] is False
    assert cuerpo["motivo"] == "fallo_envio"
    # Aun con fallo se enmascara el destinatario al que se intentó.
    assert cuerpo["destinatario"] == "a***@correo.com"

    registro = _ultimo_reenvio(db_session)
    assert registro is not None
    assert registro.outcome == "failure"
    assert registro.details["motivo"] == "fallo_envio"


def test_una_doctora_ajena_no_reenvia_ni_se_entera_de_la_cita(
    client, db_session, escenario, monkeypatch
):
    """Alcance como la lectura de la cita: otra doctora recibe 404, no 403,
    para no confirmarle que la cita existe."""
    otra = _user(db_session, escenario["tenant"], "otra.doctora@gems.com", Role.DOCTOR)

    def _no_debe_llamarse(**kwargs):  # pragma: no cover
        raise AssertionError("no debe intentarse enviar sin alcance")

    monkeypatch.setattr(appointment_confirmation_service, "send_email", _no_debe_llamarse)

    headers = _auth_headers(db_session, otra)
    respuesta = client.post(
        f"{PREFIX}/appointments/{escenario['cita'].id}/confirmacion", headers=headers
    )

    assert respuesta.status_code == 404, respuesta.text
    assert _ultimo_reenvio(db_session) is None


def test_sin_permiso_de_lectura_no_puede_reenviar(client, db_session, escenario, monkeypatch):
    """Quien no puede leer la cita tampoco puede reenviar su confirmación."""
    # A la secretaria se le quita ``appointments.read`` con un override.
    db_session.add(
        Permission(
            role=escenario["secretaria"].role.value,
            action="appointments.read",
            is_granted=False,
            user_id=escenario["secretaria"].id,
        )
    )
    db_session.commit()

    monkeypatch.setattr(
        appointment_confirmation_service,
        "send_email",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("no debe enviarse")),
    )

    headers = _auth_headers(db_session, escenario["secretaria"])
    respuesta = client.post(
        f"{PREFIX}/appointments/{escenario['cita'].id}/confirmacion", headers=headers
    )

    assert respuesta.status_code == 403, respuesta.text


def test_enmascarar_correo_deja_inicial_y_dominio():
    """El enmascarado no revela el usuario completo del correo."""
    assert appointment_confirmation_service.enmascarar_correo("ana.lopez@correo.com") == "a***@correo.com"
    assert appointment_confirmation_service.enmascarar_correo("x@dom.mx") == "x***@dom.mx"
    # Un valor sin arroba nunca se devuelve tal cual.
    assert appointment_confirmation_service.enmascarar_correo("sin-arroba") == "***"
