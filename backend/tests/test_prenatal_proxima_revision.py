"""Pruebas de la próxima revisión prenatal guardada en el servidor.

Antes la fecha sólo existía en el navegador: se perdía al recargar y ningún
proceso del servidor podía recordarla. Estas pruebas cubren que ahora se
guarde, que se distinga la sugerida de la ajustada y que quede constancia de
quién la movió.

Usan SQLite en memoria y sobrescriben ``get_db``, igual que
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
from app.models.pregnancy import Pregnancy
from app.models.tenant import Tenant
from app.models.user import Role, User
from app.models.user_session import UserSession

PREFIX = settings.API_V1_PREFIX

FUM = date(2026, 1, 5)
SUGERIDA = date(2026, 10, 14)


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
    """Un embarazo activo bajo seguimiento de su médico."""
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    def _doctora(email: str) -> User:
        user = User(
            email=email,
            hashed_password="no-usado-en-estas-pruebas",
            full_name="Médico de prueba",
            role=Role.DOCTOR,
            tenant_id=tenant.id,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    doctora = _doctora("doctora@gems.com")
    otra = _doctora("otra.doctora@gems.com")

    paciente = Patient(
        tenant_id=tenant.id,
        first_name="Paciente",
        last_name="Embarazada",
        date_of_birth=date(1994, 3, 11),
        owner_doctor_id=doctora.id,
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    embarazo = Pregnancy(
        tenant_id=tenant.id,
        patient_id=paciente.id,
        doctor_id=doctora.id,
        last_menstrual_period=FUM,
    )
    db_session.add(embarazo)
    db_session.commit()
    db_session.refresh(embarazo)

    return {"doctora": doctora, "otra": otra, "paciente": paciente, "embarazo": embarazo}


def _patch(client, db, user, embarazo, cuerpo):
    return client.patch(
        f"{PREFIX}/prenatal/pregnancies/{embarazo.id}",
        headers=_auth_headers(db, user),
        json=cuerpo,
    )


def test_aceptar_la_sugerencia_no_deja_marca_de_ajuste(client, db_session, escenario):
    """Aceptar lo que propuso la regla no es ajustar nada."""
    respuesta = _patch(
        client,
        db_session,
        escenario["doctora"],
        escenario["embarazo"],
        {"next_review_on": SUGERIDA.isoformat(), "next_review_suggested_on": SUGERIDA.isoformat()},
    )

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["next_review_on"] == SUGERIDA.isoformat()
    assert cuerpo["next_review_suggested_on"] == SUGERIDA.isoformat()
    assert cuerpo["next_review_adjusted_by_user_id"] is None
    assert cuerpo["next_review_adjusted_at"] is None


def test_mover_la_fecha_registra_quien_la_movio(client, db_session, escenario):
    """La sugerencia orienta, no manda: si el médico la corrige, se anota."""
    ajustada = SUGERIDA + timedelta(days=3)
    respuesta = _patch(
        client,
        db_session,
        escenario["doctora"],
        escenario["embarazo"],
        {"next_review_on": ajustada.isoformat(), "next_review_suggested_on": SUGERIDA.isoformat()},
    )

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["next_review_on"] == ajustada.isoformat()
    assert cuerpo["next_review_suggested_on"] == SUGERIDA.isoformat()
    assert cuerpo["next_review_adjusted_by_user_id"] == escenario["doctora"].id
    assert cuerpo["next_review_adjusted_at"] is not None


def test_la_fecha_ajustada_sobrevive_a_recargar(client, db_session, escenario):
    """El motivo de la columna: antes el ajuste vivía sólo en el navegador."""
    ajustada = SUGERIDA - timedelta(days=5)
    _patch(
        client,
        db_session,
        escenario["doctora"],
        escenario["embarazo"],
        {"next_review_on": ajustada.isoformat(), "next_review_suggested_on": SUGERIDA.isoformat()},
    )

    leido = client.get(
        f"{PREFIX}/prenatal/pregnancies/{escenario['embarazo'].id}",
        headers=_auth_headers(db_session, escenario["doctora"]),
    )
    assert leido.status_code == 200, leido.text
    assert leido.json()["next_review_on"] == ajustada.isoformat()


def test_volver_a_la_sugerida_borra_la_marca_de_ajuste(client, db_session, escenario):
    """Seguir diciendo 'ajustada' cuando ya coincide con la sugerencia sería mentir."""
    ajustada = SUGERIDA + timedelta(days=7)
    _patch(
        client,
        db_session,
        escenario["doctora"],
        escenario["embarazo"],
        {"next_review_on": ajustada.isoformat(), "next_review_suggested_on": SUGERIDA.isoformat()},
    )

    respuesta = _patch(
        client,
        db_session,
        escenario["doctora"],
        escenario["embarazo"],
        {"next_review_on": SUGERIDA.isoformat()},
    )

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["next_review_adjusted_by_user_id"] is None


def test_borrar_la_fecha_borra_tambien_la_marca_de_ajuste(client, db_session, escenario):
    """Sin fecha no hay nada ajustado y nada que recordar."""
    _patch(
        client,
        db_session,
        escenario["doctora"],
        escenario["embarazo"],
        {
            "next_review_on": (SUGERIDA + timedelta(days=2)).isoformat(),
            "next_review_suggested_on": SUGERIDA.isoformat(),
        },
    )

    respuesta = _patch(
        client, db_session, escenario["doctora"], escenario["embarazo"], {"next_review_on": None}
    )

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["next_review_on"] is None
    assert cuerpo["next_review_adjusted_by_user_id"] is None


def test_rechaza_una_revision_anterior_a_la_fum_guardada(client, db_session, escenario):
    """El PATCH no trae la FUM, así que la coherencia se comprueba contra lo guardado."""
    respuesta = _patch(
        client,
        db_session,
        escenario["doctora"],
        escenario["embarazo"],
        {"next_review_on": (FUM - timedelta(days=1)).isoformat()},
    )

    assert respuesta.status_code == 400, respuesta.text
    db_session.expire_all()
    guardado = db_session.get(Pregnancy, escenario["embarazo"].id)
    assert guardado.next_review_on is None


def test_otra_doctora_no_mueve_la_revision_de_un_embarazo_ajeno(client, db_session, escenario):
    """La fecha nueva no abre una puerta que el expediente tenía cerrada."""
    respuesta = _patch(
        client,
        db_session,
        escenario["otra"],
        escenario["embarazo"],
        {"next_review_on": SUGERIDA.isoformat()},
    )

    assert respuesta.status_code in (403, 404), respuesta.text
