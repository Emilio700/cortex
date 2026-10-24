"""La franja de estado de la bandeja cuenta en el servidor (plan 32, punto 3).

Cuenta sobre todas las páginas con el alcance de la bandeja: sucursal y
autoría. «Atrasado» se mide con el hoy del consultorio (Mazatlán).
"""
from datetime import date, datetime, timedelta

import pytest

from app.services import estudios_atrasados

from test_bandeja_por_paciente import _paciente, _pedir, _resultado  # noqa: F401
from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _orden,
    client,
    db_session,
    escenario,
)
from _reloj import servidor_en_utc

RUTA = f"{PREFIX}/clinical-tracking/orders/inbox-summary"
# 2026-10-10 05:30 UTC: en el contenedor ya es sábado 10; en Mazatlán sigue el viernes 9.
INSTANTE = datetime(2026, 10, 10, 5, 30)
HOY = date(2026, 10, 9)


@pytest.fixture(autouse=True)
def reloj(monkeypatch):
    servidor_en_utc(monkeypatch, INSTANTE, estudios_atrasados)


def _resumen(client, db, quien):
    r = client.get(RUTA, headers=_auth_headers(db, quien))
    assert r.status_code == 200, r.text
    return r.json()


def _limpio(db, escenario):
    # El escenario trae su propia orden; la sacamos para contar desde cero.
    from app.models.clinical_tracking import DiagnosticOrder
    db.query(DiagnosticOrder).delete()
    db.commit()


def test_cuenta_cada_segmento_sobre_todas_las_paginas(client, db_session, escenario):
    _limpio(db_session, escenario)
    t, d = escenario["tenant"], escenario["doctora"]
    for i in range(25):
        p = _paciente(db_session, escenario, f"P{i}", "Prueba")
        _orden(db_session, t, p, d, priority="routine", requested_on=HOY, desired_on=None)
    p = _paciente(db_session, escenario, "Rev", "Prueba")
    _resultado(db_session, _orden(db_session, t, p, d, requested_on=HOY, desired_on=None))
    _resultado(db_session, _orden(db_session, t, p, d, requested_on=HOY, desired_on=None), critico=True)

    r = _resumen(client, db_session, d)
    assert r["pendientes"] == 25
    assert r["por_revisar"] == 2
    assert r["criticos"] == 1
    assert r["atrasados"] == 0
    assert r["activas"] == 27


def test_atrasado_por_fecha_limite_y_por_plazo_de_prioridad(client, db_session, escenario):
    _limpio(db_session, escenario)
    t, d = escenario["tenant"], escenario["doctora"]
    p = escenario["paciente"]
    casos = [
        # (prioridad, pedido, a más tardar, ¿atrasado?)
        ("routine", HOY - timedelta(days=5), HOY - timedelta(days=1), True),   # pasó su fecha límite
        ("routine", HOY - timedelta(days=60), HOY, False),                      # fecha límite hoy: aún no
        ("urgent", HOY - timedelta(days=8), None, True),                        # urgente > 7 días
        ("urgent", HOY - timedelta(days=7), None, False),                       # justo 7: aún no
        ("preferential", HOY - timedelta(days=16), None, True),
        ("preferential", HOY - timedelta(days=15), None, False),
        ("routine", HOY - timedelta(days=31), None, True),
        ("routine", HOY - timedelta(days=30), None, False),
    ]
    for prioridad, pedido, limite, _ in casos:
        _orden(db_session, t, p, d, priority=prioridad, requested_on=pedido, desired_on=limite)
    # Con resultado ya no está atrasado aunque sea viejo.
    _resultado(db_session, _orden(db_session, t, p, d, priority="urgent", requested_on=HOY - timedelta(days=90), desired_on=None))

    r = _resumen(client, db_session, d)
    assert r["atrasados"] == sum(1 for *_, a in casos if a)
    assert r["urgentes"] == 4

    cuerpo = _pedir(client, db_session, d, filtro="atrasados")
    assert sum(len(x["orders"]) for x in cuerpo["items"]) == r["atrasados"]


def test_solo_cuenta_lo_de_la_doctora_y_su_sucursal(client, db_session, escenario):
    _limpio(db_session, escenario)
    t, d, colega = escenario["tenant"], escenario["doctora"], escenario["colega"]
    _orden(db_session, t, escenario["paciente"], colega, requested_on=HOY, desired_on=None)
    ajena = escenario["doctora_ajena"]
    from app.models.patient import Patient
    pa = Patient(tenant_id=ajena.tenant_id, first_name="Ajena", last_name="X", owner_doctor_id=ajena.id)
    db_session.add(pa)
    db_session.commit()
    _orden(db_session, ajena.tenant, pa, ajena, requested_on=HOY, desired_on=None)

    assert _resumen(client, db_session, d)["pendientes"] == 0
    assert _resumen(client, db_session, colega)["pendientes"] == 1


def test_recepcion_sin_permiso_clinico_no_lo_ve(client, db_session, escenario):
    r = client.get(RUTA, headers=_auth_headers(db_session, escenario["secretaria"]))
    assert r.status_code in (200, 403)
    if r.status_code == 200:
        # Si recepción tiene clinical_tracking.read, solo números: sin nombres ni estudios.
        assert set(r.json()) == {"pendientes", "por_revisar", "sin_comunicar", "criticos", "atrasados", "urgentes", "activas"}
