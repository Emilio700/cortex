"""Correcciones de la fase 0 del plan 26 que hoy daban información falsa.

- B-5: la bandeja ordenaba la prioridad como texto y una preferente quedaba
  detrás de todas las rutinarias, en otra página.
- B-8: la búsqueda no separaba palabras y «KENIA PERAZA» no encontraba a nadie.
- B-10: registrar un resultado no exigía ser la doctora que pidió el estudio.
- F-1: la fecha de la orden la calculaba el navegador en UTC; ahora, si no
  viene, la pone el servidor con la hora del consultorio.
"""
from datetime import date

from app.models.clinical_tracking import DiagnosticOrder, DiagnosticOrderGroup
from app.models.patient import Patient

from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _orden,
    client,
    db_session,
    escenario,
)

BANDEJA = f"{PREFIX}/clinical-tracking/orders/inbox"


def test_una_preferente_sale_en_la_pagina_1_antes_que_muchas_rutinarias(client, db_session, escenario):
    t, p, d = escenario["tenant"], escenario["paciente"], escenario["doctora"]
    # La orden del escenario es urgente; se agregan 30 rutinarias más antiguas
    # que la preferente, para que el orden por fecha no la salve.
    for n in range(30):
        _orden(db_session, t, p, d, study_name=f"Rutina {n}", priority="routine", requested_on=date(2026, 9, 1), desired_on=None)
    preferente = _orden(db_session, t, p, d, study_name="La preferente", priority="preferential", requested_on=date(2026, 9, 30), desired_on=None)

    respuesta = client.get(BANDEJA, params={"limit": 5}, headers=_auth_headers(db_session, d))

    assert respuesta.status_code == 200
    prioridades = [item["order"]["priority"] for item in respuesta.json()["items"]]
    assert prioridades[:2] == ["urgent", "preferential"]
    assert respuesta.json()["items"][1]["order"]["id"] == preferente.id


def test_la_busqueda_separa_palabras(client, db_session, escenario):
    t, d = escenario["tenant"], escenario["doctora"]
    kenia = Patient(tenant_id=t.id, first_name="Kenia Ximena", last_name="Peraza Durán", owner_doctor_id=d.id)
    db_session.add(kenia)
    db_session.commit()
    orden = _orden(db_session, t, kenia, d, study_name="VDRL")

    respuesta = client.get(BANDEJA, params={"search": "KENIA PERAZA"}, headers=_auth_headers(db_session, d))

    assert [item["order"]["id"] for item in respuesta.json()["items"]] == [orden.id]
    # Una palabra de la paciente y otra del estudio también la encuentran.
    respuesta = client.get(BANDEJA, params={"search": "peraza vdrl"}, headers=_auth_headers(db_session, d))
    assert respuesta.json()["total"] == 1
    # Y el número de orden impreso en el papel.
    respuesta = client.get(BANDEJA, params={"search": str(orden.id)}, headers=_auth_headers(db_session, d))
    assert orden.id in [item["order"]["id"] for item in respuesta.json()["items"]]


def test_solo_la_doctora_que_pidio_el_estudio_registra_su_resultado(client, db_session, escenario):
    """Una colega con acceso al expediente no interpreta un estudio que no pidió."""
    colega = escenario["colega"]
    # La colega es dueña del expediente: pasa el filtro de paciente, pero no
    # es la autora de la orden.
    paciente = escenario["paciente"]
    paciente.owner_doctor_id = colega.id
    db_session.commit()

    respuesta = client.post(
        f"{PREFIX}/clinical-tracking/orders/{escenario['orden'].id}/results",
        json={"review_status": "received", "report_text": "Normal"},
        headers=_auth_headers(db_session, colega),
    )

    assert respuesta.status_code == 403
    assert db_session.get(DiagnosticOrder, escenario["orden"].id).status == "ordered"


def test_sin_fecha_la_orden_toma_hoy_del_consultorio(client, db_session, escenario, monkeypatch):
    """A las 23:30 de Mazatlán ya es mañana en UTC; la orden es de hoy."""
    import app.routers.clinical_tracking as rutas

    monkeypatch.setattr(rutas, "hoy_local", lambda: date(2026, 10, 3))
    respuesta = client.post(
        f"{PREFIX}/clinical-tracking/orders",
        json={
            "patient_id": escenario["paciente"].id, "category": "laboratory",
            "study_name": "Glucosa", "clinical_indication": "Control",
        },
        headers=_auth_headers(db_session, escenario["doctora"]),
    )

    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["requested_on"] == "2026-10-03"


def test_sin_fecha_el_lote_toma_hoy_del_consultorio(client, db_session, escenario, monkeypatch):
    import app.routers.clinical_tracking as rutas

    monkeypatch.setattr(rutas, "hoy_local", lambda: date(2026, 10, 3))
    respuesta = client.post(
        f"{PREFIX}/clinical-tracking/order-groups",
        json={
            "patient_id": escenario["paciente"].id, "clinical_indication": "Perfil prenatal",
            "studies": [{"category": "laboratory", "study_name": "VDRL"}, {"category": "laboratory", "study_name": "HBsAg"}],
        },
        headers=_auth_headers(db_session, escenario["doctora"]),
    )

    assert respuesta.status_code == 201, respuesta.text
    grupo = db_session.query(DiagnosticOrderGroup).one()
    assert grupo.requested_on == date(2026, 10, 3)
    assert {o.requested_on for o in grupo.orders} == {date(2026, 10, 3)}


def test_una_fecha_enviada_se_respeta(client, db_session, escenario):
    respuesta = client.post(
        f"{PREFIX}/clinical-tracking/orders",
        json={
            "patient_id": escenario["paciente"].id, "category": "laboratory", "study_name": "Glucosa",
            "clinical_indication": "Control", "requested_on": "2026-09-30",
        },
        headers=_auth_headers(db_session, escenario["doctora"]),
    )

    assert respuesta.status_code == 201
    assert respuesta.json()["requested_on"] == "2026-09-30"
