"""La valoración del resultado (plan 26, D-9).

Excelente / Bien / Regular / Malo / Crítico, opcional. «Crítico» es lo que
hace crítico el resultado; ``is_critical`` queda derivado.
"""
from datetime import date

import pytest

from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _orden,
    client,
    db_session,
    escenario,
)


def _registrar(client, db_session, escenario, orden, **datos):
    respuesta = client.post(
        f"{PREFIX}/clinical-tracking/orders/{orden.id}/results",
        json={"review_status": "received", "report_text": "Nota rápida", **datos},
        headers=_auth_headers(db_session, escenario["doctora"]),
    )
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


def _patch(client, db_session, escenario, resultado, **datos):
    respuesta = client.patch(
        f"{PREFIX}/clinical-tracking/results/{resultado['id']}", json=datos,
        headers=_auth_headers(db_session, escenario["doctora"]),
    )
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


@pytest.mark.parametrize("valoracion,critico", [
    ("excelente", False), ("bien", False), ("regular", False), ("malo", False), ("critico", True),
])
def test_la_valoracion_decide_si_es_critico(client, db_session, escenario, valoracion, critico):
    creado = _registrar(client, db_session, escenario, escenario["orden"], valoracion=valoracion)

    assert creado["valoracion"] == valoracion
    assert creado["is_critical"] is critico


def test_una_valoracion_desconocida_es_422(client, db_session, escenario):
    respuesta = client.post(
        f"{PREFIX}/clinical-tracking/orders/{escenario['orden'].id}/results",
        json={"review_status": "received", "valoracion": "pesimo"},
        headers=_auth_headers(db_session, escenario["doctora"]),
    )

    assert respuesta.status_code == 422


def test_la_casilla_vieja_de_critico_se_traduce(client, db_session, escenario):
    creado = _registrar(client, db_session, escenario, escenario["orden"], is_critical=True)
    assert creado["valoracion"] == "critico"

    quitado = _patch(client, db_session, escenario, creado, review_status="reviewed", is_critical=False)
    assert quitado["valoracion"] is None
    assert quitado["is_critical"] is False


def test_el_patch_cambia_o_quita_la_valoracion(client, db_session, escenario):
    creado = _registrar(client, db_session, escenario, escenario["orden"])

    critico = _patch(client, db_session, escenario, creado, review_status="reviewed", valoracion="critico")
    assert critico["is_critical"] is True
    bien = _patch(client, db_session, escenario, creado, review_status="reviewed", valoracion="bien")
    assert (bien["valoracion"], bien["is_critical"]) == ("bien", False)
    # Omitirla no la cambia; null la quita.
    igual = _patch(client, db_session, escenario, creado, review_status="reviewed")
    assert igual["valoracion"] == "bien"
    sin = _patch(client, db_session, escenario, creado, review_status="reviewed", valoracion=None)
    assert sin["valoracion"] is None


def test_la_valoracion_sale_en_el_historial_y_en_la_bandeja(client, db_session, escenario):
    _registrar(client, db_session, escenario, escenario["orden"], valoracion="regular")
    headers = _auth_headers(db_session, escenario["doctora"])

    historial = client.get(f"{PREFIX}/clinical-tracking/patient/{escenario['paciente'].id}/orders", headers=headers).json()
    bandeja = client.get(f"{PREFIX}/clinical-tracking/orders/inbox-by-patient", headers=headers).json()

    assert historial[0]["results"][0]["valoracion"] == "regular"
    assert bandeja["items"][0]["orders"][0]["results"][0]["valoracion"] == "regular"


def test_la_serie_de_valoraciones_para_la_grafica(client, db_session, escenario):
    t, p, d = escenario["tenant"], escenario["paciente"], escenario["doctora"]
    segunda = _orden(db_session, t, p, d, study_name="Biometría hemática completa", catalog_code="BH")
    _registrar(client, db_session, escenario, segunda, valoracion="bien", resulted_on="2026-09-20")
    _registrar(client, db_session, escenario, escenario["orden"], valoracion="malo", resulted_on="2026-08-01")
    _registrar(client, db_session, escenario, _orden(db_session, t, p, d))  # sin valoración: no sale

    respuesta = client.get(f"{PREFIX}/clinical-tracking/patient/{p.id}/valoraciones",
                           headers=_auth_headers(db_session, d))

    assert respuesta.status_code == 200
    puntos = respuesta.json()["items"]
    assert [(x["fecha"], x["valoracion"]) for x in puntos] == [("2026-08-01", "malo"), ("2026-09-20", "bien")]
    assert puntos[1]["catalog_code"] == "BH"
    assert puntos[1]["category"] == "laboratory"


@pytest.mark.parametrize("quien,codigo", [("colega", 403), ("secretaria", 403), ("doctora_ajena", 404)])
def test_la_serie_respeta_el_acceso(client, db_session, escenario, quien, codigo):
    respuesta = client.get(f"{PREFIX}/clinical-tracking/patient/{escenario['paciente'].id}/valoraciones",
                           headers=_auth_headers(db_session, escenario[quien]))

    assert respuesta.status_code == codigo


def test_cambiar_solo_la_valoracion_no_mueve_la_revision(client, db_session, escenario):
    """La doctora desmarca un «crítico» de un archivo viejo sin tocar su revisión."""
    from app.models.clinical_tracking import DiagnosticOrder

    viejo = _registrar(client, db_session, escenario, escenario["orden"], valoracion="critico")

    cambiado = _patch(client, db_session, escenario, viejo, valoracion="bien")

    assert cambiado["valoracion"] == "bien"
    assert cambiado["is_critical"] is False
    assert cambiado["review_status"] == "received"
    assert cambiado["reviewed_at"] is None
    assert db_session.get(DiagnosticOrder, escenario["orden"].id).status == "result_received"
    sin = _patch(client, db_session, escenario, viejo, valoracion=None, review_status=None)
    assert sin["valoracion"] is None
    assert sin["review_status"] == "received"
