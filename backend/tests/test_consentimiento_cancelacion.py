"""Pruebas de extremo a extremo del texto editable y la cancelación trazable.

Siguen el patrón de ``test_tenants.py``: SQLite en memoria y ``get_db``
sobrescrito, sin necesidad de Postgres. El almacenamiento se redirige a un
directorio temporal para no ensuciar ``uploads/``.
"""
import base64
from datetime import timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import security, storage
from app.core.config import settings
from app.core.deps import get_db
from app.db.session import Base, utcnow
from app.main import app
from app.models.audit_log import AuditLog
from app.models.clinical_consent import ClinicalConsent
from app.models.patient import Patient
from app.models.tenant import Tenant
from app.models.user import Role, User
from app.models.user_session import UserSession
from app.routers import clinical_consents as consent_router

PREFIX = settings.API_V1_PREFIX
TEXTO_PROPIO = "Texto redactado por el médico para este paciente en particular."
# PNG real de 1x1 px: la firma se valida byte a byte antes de guardarse.
FIRMA = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


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
def client(db_session, tmp_path, monkeypatch):
    almacen = storage.LocalStorageBackend(root_dir=tmp_path)
    monkeypatch.setattr(storage, "default_storage", almacen)
    monkeypatch.setattr(consent_router, "default_storage", almacen)
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
    """Sucursal con un médico y un paciente suya."""
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)
    doctora = User(
        email="doctora@gems.com",
        hashed_password="no-usado-en-estas-pruebas",
        full_name="Médico de prueba",
        role=Role.DOCTOR,
        tenant_id=tenant.id,
        is_active=True,
    )
    db_session.add(doctora)
    db_session.commit()
    db_session.refresh(doctora)
    paciente = Patient(
        tenant_id=tenant.id,
        first_name="Ana",
        last_name="López",
        cell_phone="5512345678",
        owner_doctor_id=doctora.id,
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)
    return {
        "tenant": tenant,
        "doctora": doctora,
        "paciente": paciente,
        "headers": _auth_headers(db_session, doctora),
    }


def _crear_borrador(client, escenario, **extra) -> dict:
    respuesta = client.post(
        f"{PREFIX}/clinical-consents",
        headers=escenario["headers"],
        json={
            "patient_id": escenario["paciente"].id,
            "consent_type": "stereotactic_biopsy",
            **extra,
        },
    )
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


def _puntos_requeridos(client, escenario) -> list[str]:
    plantillas = client.get(
        f"{PREFIX}/clinical-consents/templates", headers=escenario["headers"]
    ).json()
    return next(
        item["acknowledgements"]
        for item in plantillas
        if item["consent_type"] == "stereotactic_biopsy"
    )


def _firmar(client, escenario, consent_id: int) -> dict:
    respuesta = client.post(
        f"{PREFIX}/clinical-consents/{consent_id}/sign",
        headers=escenario["headers"],
        json={
            "patient_signed_name": "Ana López",
            "signature_data_url": FIRMA,
            "acknowledgements": _puntos_requeridos(client, escenario),
        },
    )
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


def _listar(client, escenario) -> dict:
    return client.get(
        f"{PREFIX}/clinical-consents/patient/{escenario['paciente'].id}",
        headers=escenario["headers"],
    ).json()


# --- T1: el texto del consentimiento es editable ---


def test_el_texto_escrito_por_la_doctora_se_guarda_tal_cual(client, escenario):
    cuerpo = _crear_borrador(client, escenario, custom_body=TEXTO_PROPIO, use_template_body=False)
    assert cuerpo["rendered_body"] == TEXTO_PROPIO
    assert cuerpo["field_values"]["body_source"] == "custom"


def test_sin_texto_propio_se_conserva_el_de_la_plantilla(client, escenario):
    cuerpo = _crear_borrador(client, escenario)
    assert "estereotaxia" in cuerpo["rendered_body"]
    assert cuerpo["field_values"]["body_source"] == "template"


def test_la_plantilla_precargada_puede_ajustarse_antes_de_firmar(client, escenario):
    """Encendido el interruptor, el médico aún puede editar el texto cargado."""
    ajustado = "Biopsia estereotáctica con una aclaración añadida por el médico."
    cuerpo = _crear_borrador(client, escenario, custom_body=ajustado, use_template_body=True)
    assert cuerpo["rendered_body"] == ajustado
    assert cuerpo["field_values"]["body_edited"] is True


# --- T2: cancelación con motivo y trazabilidad ---


def test_cancelar_exige_motivo(client, escenario):
    firmado = _firmar(client, escenario, _crear_borrador(client, escenario)["id"])
    for cuerpo in ({}, {"reason": ""}, {"reason": "   "}, {"reason": "no"}):
        respuesta = client.post(
            f"{PREFIX}/clinical-consents/{firmado['id']}/cancel",
            headers=escenario["headers"],
            json=cuerpo,
        )
        assert respuesta.status_code == 422, respuesta.text
    assert _listar(client, escenario)["items"][0]["status"] == "signed"


def test_cancelar_registra_motivo_autor_y_fecha_sin_perder_el_texto(client, escenario, db_session):
    firmado = _firmar(
        client, escenario, _crear_borrador(client, escenario, custom_body=TEXTO_PROPIO)["id"]
    )
    respuesta = client.post(
        f"{PREFIX}/clinical-consents/{firmado['id']}/cancel",
        headers=escenario["headers"],
        json={"reason": "Se firmó el formato equivocado por error de captura"},
    )

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["status"] == "cancelled"
    assert cuerpo["cancelled_reason"] == "Se firmó el formato equivocado por error de captura"
    assert cuerpo["cancelled_by_user_id"] == escenario["doctora"].id
    assert cuerpo["cancelled_by_name"] == "Médico de prueba"
    assert cuerpo["cancelled_at"]
    # El documento clínico no se destruye: sigue el texto y la firma original.
    assert cuerpo["rendered_body"] == TEXTO_PROPIO
    assert cuerpo["patient_signed_name"] == "Ana López"
    fila = db_session.query(ClinicalConsent).filter_by(id=firmado["id"]).one()
    assert fila.rendered_body == TEXTO_PROPIO
    assert fila.signed_pdf_path and fila.content_hash


def test_el_consentimiento_cancelado_sigue_en_el_historial_y_no_cuenta_como_vigente(
    client, escenario
):
    firmado = _firmar(client, escenario, _crear_borrador(client, escenario)["id"])
    client.post(
        f"{PREFIX}/clinical-consents/{firmado['id']}/cancel",
        headers=escenario["headers"],
        json={"reason": "Consentimiento duplicado en la misma consulta"},
    )

    historial = _listar(client, escenario)
    assert historial["total"] == 1
    registro = historial["items"][0]
    assert registro["id"] == firmado["id"]
    assert registro["status"] == "cancelled"
    assert registro["cancelled_reason"] == "Consentimiento duplicado en la misma consulta"
    assert [item for item in historial["items"] if item["status"] == "signed"] == []


def test_no_se_puede_cancelar_dos_veces(client, escenario):
    firmado = _firmar(client, escenario, _crear_borrador(client, escenario)["id"])
    motivo = {"reason": "Error de captura en el formato"}
    client.post(
        f"{PREFIX}/clinical-consents/{firmado['id']}/cancel",
        headers=escenario["headers"],
        json=motivo,
    )
    repetida = client.post(
        f"{PREFIX}/clinical-consents/{firmado['id']}/cancel",
        headers=escenario["headers"],
        json=motivo,
    )
    assert repetida.status_code == 409
    assert repetida.json()["detail"] == "El consentimiento ya está cancelado"


def test_la_cancelacion_queda_en_la_auditoria(client, escenario, db_session):
    firmado = _firmar(client, escenario, _crear_borrador(client, escenario)["id"])
    client.post(
        f"{PREFIX}/clinical-consents/{firmado['id']}/cancel",
        headers=escenario["headers"],
        json={"reason": "Se emitió al paciente equivocada"},
    )

    registro = (
        db_session.query(AuditLog).filter(AuditLog.action == "clinical_consent.cancelled").one()
    )
    assert registro.entity_id == firmado["id"]
    assert registro.actor_user_id == escenario["doctora"].id
    assert registro.reason == "Se emitió al paciente equivocada"


def test_el_pdf_descargado_de_un_cancelado_queda_marcado(client, escenario, db_session):
    firmado = _firmar(client, escenario, _crear_borrador(client, escenario)["id"])
    client.post(
        f"{PREFIX}/clinical-consents/{firmado['id']}/cancel",
        headers=escenario["headers"],
        json={"reason": "Firmado por error en la consulta anterior"},
    )

    fila = db_session.query(ClinicalConsent).filter_by(id=firmado["id"]).one()
    # El PDF original firmado se conserva intacto y el marcado es una copia.
    assert fila.cancelled_pdf_path
    assert fila.cancelled_pdf_path != fila.signed_pdf_path
    descarga = client.get(
        f"{PREFIX}/clinical-consents/{firmado['id']}/download", headers=escenario["headers"]
    )
    assert descarga.status_code == 200
    assert descarga.content.startswith(b"%PDF")


def test_un_borrador_cancelado_ya_no_puede_firmarse(client, escenario):
    borrador = _crear_borrador(client, escenario)
    client.post(
        f"{PREFIX}/clinical-consents/{borrador['id']}/cancel",
        headers=escenario["headers"],
        json={"reason": "Se preparó el formato equivocado"},
    )
    respuesta = client.post(
        f"{PREFIX}/clinical-consents/{borrador['id']}/sign",
        headers=escenario["headers"],
        json={
            "patient_signed_name": "Ana López",
            "signature_data_url": FIRMA,
            "acknowledgements": _puntos_requeridos(client, escenario),
        },
    )
    assert respuesta.status_code == 409



def test_ya_no_se_emiten_consentimientos_de_ginecologia(client, escenario):
    """Los tipos de GEMS se conservan para lo ya firmado, pero no se crean nuevos."""
    respuesta = client.post(
        f"{PREFIX}/clinical-consents",
        headers=escenario["headers"],
        json={"patient_id": escenario["paciente"].id, "consent_type": "cesarean"},
    )
    assert respuesta.status_code == 422
    assert "ya no se ofrece" in respuesta.json()["detail"]
