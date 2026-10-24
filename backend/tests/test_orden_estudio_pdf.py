"""El papel de la orden de estudio (O-01 del backlog de auditoría).

Hasta ahora la orden sólo vivía en el sistema: el médico la capturaba y luego
llenaba a mano el formato del laboratorio, y la preparación se decía de viva
voz. Decisión de Emilio: un PDF propio de la clínica, genérico para cualquier
laboratorio; el médico lo imprime y recepción lo puede reimprimir.

Se comprueban dos cosas: que el papel lleve lo que el laboratorio necesita y
nada más del expediente, y que sólo lo saque quien debe.

El texto se lee del propio PDF con la compresión apagada, igual que
``test_receta_configurable.py``.
"""
import re
from datetime import date, timedelta
from uuid import uuid4

import pytest
import reportlab.rl_config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import security
from app.core.config import settings
from app.core.deps import get_db
from app.db.session import Base, utcnow
from app.main import app
from app.models.audit_log import AuditLog
from app.models.clinical_tracking import DiagnosticOrder
from app.models.doctor_profile import DoctorProfile
from app.models.patient import Patient
from app.models.permission import Permission
from app.models.specialty import Specialty
from app.models.tenant import Tenant
from app.models.user import Role, User
from app.models.user_session import UserSession

PREFIX = settings.API_V1_PREFIX


@pytest.fixture(autouse=True)
def _pdf_sin_comprimir():
    anterior = reportlab.rl_config.pageCompression
    reportlab.rl_config.pageCompression = 0
    yield
    reportlab.rl_config.pageCompression = anterior


def _texto_del_pdf(datos: bytes) -> str:
    cadenas = re.findall(rb"\((?:\\.|[^\\()])*\)", datos)

    def _desescapar(cruda: bytes) -> str:
        return re.sub(
            r"\\([0-7]{1,3}|.)",
            lambda m: chr(int(m.group(1), 8)) if m.group(1).isdigit() else m.group(1),
            cruda[1:-1].decode("latin-1"),
        )

    return " | ".join(_desescapar(c) for c in cadenas)


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


def _usuario(db, tenant, email, role, **extra):
    usuario = User(
        email=email,
        hashed_password="no-usado-en-estas-pruebas",
        full_name=extra.pop("full_name", email.split("@")[0]),
        role=role,
        tenant_id=tenant.id,
        is_active=True,
        **extra,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


def _orden(db, tenant, paciente, doctora, **cambios):
    datos = dict(
        tenant_id=tenant.id,
        patient_id=paciente.id,
        doctor_id=doctora.id,
        category="laboratory",
        study_name="Biometría hemática completa",
        clinical_indication="Control prenatal del primer trimestre",
        priority="urgent",
        requested_on=date(2026, 9, 29),
        desired_on=date(2026, 10, 3),
        preparation_instructions="Ayuno de 8 horas\nTraer orden impresa",
        destination="Laboratorio Central",
        status="ordered",
    )
    datos.update(cambios)
    orden = DiagnosticOrder(**datos)
    db.add(orden)
    db.commit()
    db.refresh(orden)
    return orden


@pytest.fixture
def escenario(db_session):
    """Un médico con su paciente y su orden; una colega; recepción; otra sucursal."""
    tenant = Tenant(name="G & G Sucursal Centro", is_active=True)
    otro_tenant = Tenant(name="Otra sucursal", is_active=True)
    especialidad = Specialty(name="Ginecología", slug="ginecologia", is_active=True)
    db_session.add_all([tenant, otro_tenant, especialidad])
    db_session.commit()

    doctora = _usuario(
        db_session, tenant, "yara@gems.com", Role.DOCTOR,
        full_name="Yara Gutiérrez", tratamiento="Dra.",
    )
    colega = _usuario(db_session, tenant, "colega@gems.com", Role.DOCTOR)
    secretaria = _usuario(db_session, tenant, "recepcion@gems.com", Role.SECRETARIA)
    admin = _usuario(db_session, tenant, "admin@gems.com", Role.ADMIN)
    secretaria_ajena = _usuario(db_session, otro_tenant, "recepcion2@gems.com", Role.SECRETARIA)
    doctora_ajena = _usuario(db_session, otro_tenant, "doctora2@gems.com", Role.DOCTOR)

    db_session.add(DoctorProfile(
        user_id=doctora.id,
        specialty_id=especialidad.id,
        professional_id="7654321",
        clinic_address="AV. DE LA SALUD 123",
        phone="312 123 4567",
    ))
    paciente = Patient(
        tenant_id=tenant.id,
        first_name="María",
        last_name="López Pérez",
        date_of_birth=date(1990, 5, 20),
        owner_doctor_id=doctora.id,
        phone="6691112233",
        email="maria@correo.com",
        allergies="PENICILINA",
        personal_history="HIPERTENSIÓN CRÓNICA",
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    return {
        "tenant": tenant,
        "doctora": doctora,
        "colega": colega,
        "secretaria": secretaria,
        "admin": admin,
        "secretaria_ajena": secretaria_ajena,
        "doctora_ajena": doctora_ajena,
        "paciente": paciente,
        "orden": _orden(db_session, tenant, paciente, doctora),
    }


def _ruta(orden) -> str:
    return f"{PREFIX}/clinical-tracking/orders/{orden.id}/pdf"


# ---------------------------------------------------------------------------
# Contenido del papel
# ---------------------------------------------------------------------------

def test_el_pdf_lleva_todo_lo_que_el_laboratorio_necesita(client, db_session, escenario):
    respuesta = client.get(_ruta(escenario["orden"]), headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 200
    assert respuesta.headers["content-type"].startswith("application/pdf")
    assert f'Orden_de_estudio_{escenario["orden"].id}.pdf' in respuesta.headers["content-disposition"]
    texto = _texto_del_pdf(respuesta.content)
    for fragmento in (
        "ORDEN DE ESTUDIO",
        f"FOLIO: {escenario['orden'].id}",
        "G & G Sucursal Centro",
        "María López Pérez",
        "20/05/1990",
        "29/09/2026",
        "Biometría hemática completa",
        "Laboratorio",
        "Urgente",
        "03/10/2026",
        "Laboratorio Central",
        "Control prenatal del primer trimestre",
        "Ayuno de 8 horas",
        "Traer orden impresa",
        "Dra. Yara Gutiérrez",
        "no es un resultado ni un diagnóstico",
    ):
        assert fragmento in texto, fragmento


def test_el_pdf_no_lleva_nada_mas_del_expediente(client, db_session, escenario):
    """El papel sale de la clínica: nada de contacto, alergias ni antecedentes."""
    respuesta = client.get(_ruta(escenario["orden"]), headers=_auth_headers(db_session, escenario["doctora"]))

    texto = _texto_del_pdf(respuesta.content)
    for fragmento in ("6691112233", "maria@correo.com", "PENICILINA", "HIPERTENSIÓN"):
        assert fragmento not in texto, fragmento
    # Tampoco dice que es una receta o un certificado.
    assert "receta/certificado" not in texto


def test_sin_preparacion_capturada_el_papel_lo_dice_en_vez_de_inventarla(client, db_session, escenario):
    orden = _orden(
        db_session, escenario["tenant"], escenario["paciente"], escenario["doctora"],
        preparation_instructions=None, destination=None, priority="routine",
    )
    respuesta = client.get(_ruta(orden), headers=_auth_headers(db_session, escenario["doctora"]))

    texto = _texto_del_pdf(respuesta.content)
    assert "Sin indicaciones de preparación" in texto
    assert "Rutinaria" in texto
    assert "Destino" not in texto


def test_una_indicacion_larga_se_imprime_completa_en_varias_paginas(client, db_session, escenario):
    larga = " ".join(f"renglón{n}" for n in range(600)) + " FINAL-DE-LA-INDICACION"
    orden = _orden(
        db_session, escenario["tenant"], escenario["paciente"], escenario["doctora"],
        clinical_indication=larga,
    )
    respuesta = client.get(_ruta(orden), headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 200
    assert respuesta.content.count(b"/Type /Page\n") + respuesta.content.count(b"/Type /Page ") >= 2
    assert "FINAL-DE-LA-INDICACION" in _texto_del_pdf(respuesta.content)


def test_una_orden_cancelada_no_se_imprime(client, db_session, escenario):
    orden = _orden(
        db_session, escenario["tenant"], escenario["paciente"], escenario["doctora"], status="cancelled",
    )
    respuesta = client.get(_ruta(orden), headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 409
    assert "no se imprime" in respuesta.json()["detail"]


def test_sin_perfil_de_doctora_se_imprime_sin_crearle_uno(client, db_session, escenario):
    """Una reimpresión de recepción no puede dejar filas a nombre del médico."""
    colega = escenario["colega"]
    paciente = Patient(
        tenant_id=escenario["tenant"].id, first_name="Ana", last_name="Ruiz", owner_doctor_id=colega.id,
    )
    db_session.add(paciente)
    db_session.commit()
    orden = _orden(db_session, escenario["tenant"], paciente, colega)

    respuesta = client.get(_ruta(orden), headers=_auth_headers(db_session, escenario["secretaria"]))

    assert respuesta.status_code == 200
    assert db_session.query(DoctorProfile).filter(DoctorProfile.user_id == colega.id).count() == 0


# ---------------------------------------------------------------------------
# Quién lo saca
# ---------------------------------------------------------------------------

def test_la_doctora_ajena_recibe_403(client, db_session, escenario):
    respuesta = client.get(_ruta(escenario["orden"]), headers=_auth_headers(db_session, escenario["colega"]))

    assert respuesta.status_code == 403


def test_recepcion_reimprime_con_su_permiso_por_defecto(client, db_session, escenario):
    respuesta = client.get(_ruta(escenario["orden"]), headers=_auth_headers(db_session, escenario["secretaria"]))

    assert respuesta.status_code == 200
    assert "Biometría hemática completa" in _texto_del_pdf(respuesta.content)


def test_imprimir_no_le_abre_a_recepcion_el_resto_del_seguimiento(client, db_session, escenario):
    """El permiso es sólo el de imprimir: la lista de órdenes sigue cerrada."""
    headers = _auth_headers(db_session, escenario["secretaria"])

    respuesta = client.get(
        f"{PREFIX}/clinical-tracking/patient/{escenario['paciente'].id}/orders", headers=headers
    )

    assert respuesta.status_code == 403


def test_recepcion_sin_el_permiso_recibe_403(client, db_session, escenario):
    secretaria = escenario["secretaria"]
    db_session.add(Permission(
        role="secretaria", action="clinical_tracking.print_order", is_granted=False, user_id=secretaria.id,
    ))
    db_session.commit()

    respuesta = client.get(_ruta(escenario["orden"]), headers=_auth_headers(db_session, secretaria))

    assert respuesta.status_code == 403


def test_administracion_de_la_sucursal_la_puede_imprimir(client, db_session, escenario):
    respuesta = client.get(_ruta(escenario["orden"]), headers=_auth_headers(db_session, escenario["admin"]))

    assert respuesta.status_code == 200


@pytest.mark.parametrize("quien", ["secretaria_ajena", "doctora_ajena"])
def test_otra_sucursal_no_ve_que_la_orden_existe(client, db_session, escenario, quien):
    respuesta = client.get(_ruta(escenario["orden"]), headers=_auth_headers(db_session, escenario[quien]))

    assert respuesta.status_code == 404


def test_cada_impresion_queda_en_la_bitacora(client, db_session, escenario):
    secretaria = escenario["secretaria"]
    client.get(_ruta(escenario["orden"]), headers=_auth_headers(db_session, secretaria))

    registro = db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_order.pdf_generated").one()
    assert registro.actor_user_id == secretaria.id
    assert registro.entity_id == escenario["orden"].id
    assert registro.patient_id == escenario["paciente"].id
    assert registro.tenant_id == escenario["tenant"].id


def test_un_403_no_deja_registro_de_impresion(client, db_session, escenario):
    client.get(_ruta(escenario["orden"]), headers=_auth_headers(db_session, escenario["colega"]))

    assert db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_order.pdf_generated").count() == 0


# ---------------------------------------------------------------------------
# Hora local y leyenda de la firma (plan 26, fase 0: P-6 y P-7)
# ---------------------------------------------------------------------------

def test_generado_usa_la_hora_del_consultorio_y_no_la_del_contenedor(client, db_session, escenario, monkeypatch):
    """El contenedor corre en UTC: a las 20:46 de Mazatlán imprimía 03:46 del día siguiente."""
    import app.utils.pdf as pdf
    from datetime import datetime

    monkeypatch.setattr(pdf, "ahora_local", lambda: datetime(2026, 10, 3, 20, 46))
    respuesta = client.get(_ruta(escenario["orden"]), headers=_auth_headers(db_session, escenario["doctora"]))

    texto = _texto_del_pdf(respuesta.content)
    assert "Generado: 03/10/2026 20:46" in texto
    assert "04/10/2026" not in texto


def test_la_edad_se_calcula_con_la_fecha_local(monkeypatch):
    """Un cumpleaños de mañana en UTC no puede sumar el año antes de tiempo."""
    import app.utils.pdf as pdf
    from datetime import datetime

    # 23:30 del 19/05 en Mazatlán; en UTC ya es el 20/05, su cumpleaños.
    monkeypatch.setattr(pdf, "ahora_local", lambda: datetime(2026, 5, 19, 23, 30))
    assert pdf._age_str(date(1990, 5, 20)) == "35 años"


def test_la_firma_no_promete_un_sello_digital(client, db_session, escenario):
    respuesta = client.get(_ruta(escenario["orden"]), headers=_auth_headers(db_session, escenario["doctora"]))

    texto = _texto_del_pdf(respuesta.content)
    assert "Sello Digital" not in texto
    assert "| Firma |" in texto
