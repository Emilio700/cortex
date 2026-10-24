"""El script que baja un día las fechas guardadas en UTC (plan 26, D-4).

Sólo toca lo que la regla prueba: fecha guardada EXACTAMENTE un día después de
la fecha local de su ``created_at``. Por omisión no escribe nada.
"""
from datetime import date, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base
from app.models.clinical_episode import ClinicalEpisode
from app.models.clinical_tracking import DiagnosticOrder, DiagnosticOrderGroup, PatientImmunization
from app.models.patient import Patient
from app.models.tenant import Tenant
from app.models.user import Role, User
from scripts.corregir_fechas_ordenes import ejecutar, tiene_un_dia_de_mas

# 03/10 a las 20:46 en Mazatlán = 04/10 03:46 UTC: el navegador guardaba el 04.
NOCHE_UTC = datetime(2026, 10, 4, 3, 46)
# 03/10 a las 10:00 en Mazatlán = 03/10 17:00 UTC: aquí no había desfase.
MANANA_UTC = datetime(2026, 10, 3, 17, 0)


def test_la_regla_es_exactamente_un_dia_despues_de_la_fecha_local():
    assert tiene_un_dia_de_mas(date(2026, 10, 4), NOCHE_UTC)
    assert not tiene_un_dia_de_mas(date(2026, 10, 3), NOCHE_UTC)  # ya correcta
    assert not tiene_un_dia_de_mas(date(2026, 10, 5), NOCHE_UTC)  # dos días: no se explica por UTC
    assert not tiene_un_dia_de_mas(date(2026, 10, 2), NOCHE_UTC)
    # A las 10:00 el navegador todavía daba la fecha de hoy: una de mañana la
    # puso alguien a mano, y no se toca (I4).
    assert not tiene_un_dia_de_mas(date(2026, 10, 4), MANANA_UTC)
    assert not tiene_un_dia_de_mas(None, NOCHE_UTC)


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sesion = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    try:
        yield sesion
    finally:
        sesion.close()
        Base.metadata.drop_all(engine)


@pytest.fixture
def datos(db):
    tenant = Tenant(name="G & G", is_active=True)
    db.add(tenant)
    db.commit()
    doctora = User(email="d@gems.com", hashed_password="x", full_name="Doctora", role=Role.DOCTOR,
                   tenant_id=tenant.id, is_active=True)
    db.add(doctora)
    db.commit()
    paciente = Patient(tenant_id=tenant.id, first_name="María", last_name="López", owner_doctor_id=doctora.id)
    db.add(paciente)
    db.commit()

    def orden(requested_on, created_at, **extra):
        fila = DiagnosticOrder(tenant_id=tenant.id, patient_id=paciente.id, doctor_id=doctora.id,
                               category="laboratory", study_name="VDRL", clinical_indication="Control",
                               requested_on=requested_on, created_at=created_at, **extra)
        db.add(fila)
        db.commit()
        return fila

    grupo = DiagnosticOrderGroup(tenant_id=tenant.id, patient_id=paciente.id, doctor_id=doctora.id,
                                 clinical_indication="Prenatal", requested_on=date(2026, 10, 4), created_at=NOCHE_UTC)
    db.add(grupo)
    db.commit()
    vacuna = PatientImmunization(tenant_id=tenant.id, patient_id=paciente.id, recorded_by_user_id=doctora.id,
                                 vaccine_name="Tdpa", administered_on=date(2026, 10, 4), created_at=NOCHE_UTC)
    episodio = ClinicalEpisode(tenant_id=tenant.id, patient_id=paciente.id, created_by_user_id=doctora.id,
                               episode_type="routine", title="Control", started_on=date(2026, 10, 4),
                               created_at=NOCHE_UTC)
    db.add_all([vacuna, episodio])
    db.commit()
    return {
        "desfasada": orden(date(2026, 10, 4), NOCHE_UTC, order_group_id=grupo.id),
        "correcta": orden(date(2026, 10, 3), NOCHE_UTC),
        "dos_dias": orden(date(2026, 10, 5), NOCHE_UTC),
        "de_la_manana": orden(date(2026, 10, 4), MANANA_UTC),
        "grupo": grupo,
        "vacuna": vacuna,
        "episodio": episodio,
    }


def _recargar(db, fila):
    db.expire_all()
    return db.get(type(fila), fila.id)


def test_por_omision_solo_reporta_y_no_escribe(db, datos):
    lineas = []
    resumen = ejecutar(db, aplicar=False, listar=True, salida=lineas.append)

    assert resumen["diagnostic_orders.requested_on"]["candidatas"] == 1
    assert resumen["diagnostic_order_groups.requested_on"]["candidatas"] == 1
    assert resumen["patient_immunizations.administered_on"]["candidatas"] == 1
    assert resumen["clinical_episodes.started_on"]["candidatas"] == 1
    assert all(datos_["corregidas"] == 0 for datos_ in resumen.values())
    assert _recargar(db, datos["desfasada"]).requested_on == date(2026, 10, 4)
    assert any("SOLO REPORTE" in linea for linea in lineas)
    assert any(f"id {datos['desfasada'].id:>7}" in linea for linea in lineas)


def test_aplicar_corrige_solo_lo_que_cumple_la_regla(db, datos):
    resumen = ejecutar(db, aplicar=True, listar=False, salida=lambda *_: None)

    assert _recargar(db, datos["desfasada"]).requested_on == date(2026, 10, 3)
    assert _recargar(db, datos["grupo"]).requested_on == date(2026, 10, 3)
    assert _recargar(db, datos["vacuna"]).administered_on == date(2026, 10, 3)
    assert _recargar(db, datos["correcta"]).requested_on == date(2026, 10, 3)
    assert _recargar(db, datos["dos_dias"]).requested_on == date(2026, 10, 5)
    assert _recargar(db, datos["de_la_manana"]).requested_on == date(2026, 10, 4)
    # El episodio sólo se reporta: pudo empezar mañana a propósito.
    assert _recargar(db, datos["episodio"]).started_on == date(2026, 10, 4)
    assert resumen["clinical_episodes.started_on"]["corregidas"] == 0
    assert resumen["diagnostic_orders.requested_on"]["corregidas"] == 1


def test_correrlo_dos_veces_no_baja_la_fecha_dos_dias(db, datos):
    ejecutar(db, aplicar=True, listar=False, salida=lambda *_: None)
    segunda = ejecutar(db, aplicar=True, listar=False, salida=lambda *_: None)

    assert _recargar(db, datos["desfasada"]).requested_on == date(2026, 10, 3)
    assert segunda["diagnostic_orders.requested_on"]["candidatas"] == 0
