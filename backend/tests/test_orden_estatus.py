"""El ciclo de la orden de estudio se gestiona (O-05 del backlog de auditoría).

Hasta ahora la orden se quedaba en «solicitada» hasta que llegaba el
resultado: no se distinguía «pedida y nunca hecha» de «en proceso», y la
doctora no podía cancelar una orden mal hecha. Además ``status`` y
``priority`` eran texto libre en el servidor.

Se comprueba el conjunto cerrado de estados y transiciones, que cancelar
exige motivo, que una orden emitida ya no se edita (se cancela y se rehace,
plan 14 §10), que cada cambio queda en la bitácora y que las filas viejas con
valores raros se siguen leyendo.
"""
import pytest

from app.models.audit_log import AuditLog
from app.models.clinical_tracking import DiagnosticOrder

from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _orden,
    client,
    db_session,
    escenario,
)

BASE = f"{PREFIX}/clinical-tracking"


def _cambiar(client, db_session, orden, quien, estado, motivo=None):
    cuerpo = {"status": estado}
    if motivo is not None:
        cuerpo["reason"] = motivo
    return client.post(f"{BASE}/orders/{orden.id}/status", json=cuerpo, headers=_auth_headers(db_session, quien))


def _cambios_en_bitacora(db_session):
    return db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_order.status_changed").all()


# ---------------------------------------------------------------------------
# Transiciones válidas
# ---------------------------------------------------------------------------

def test_la_orden_recorre_su_ciclo_y_cada_paso_queda_en_la_bitacora(client, db_session, escenario):
    orden, doctora = escenario["orden"], escenario["doctora"]
    recorrido = ["accepted", "scheduled", "collected", "in_process"]

    for estado in recorrido:
        respuesta = _cambiar(client, db_session, orden, doctora, estado)
        assert respuesta.status_code == 200, respuesta.text
        assert respuesta.json()["status"] == estado

    pasos = [(r.details["from"], r.details["to"]) for r in sorted(_cambios_en_bitacora(db_session), key=lambda r: r.id)]
    assert pasos == list(zip(["ordered"] + recorrido[:-1], recorrido))
    assert all(r.actor_user_id == doctora.id and r.patient_id == escenario["paciente"].id for r in _cambios_en_bitacora(db_session))


def test_la_respuesta_dice_a_que_estados_se_puede_pasar(client, db_session, escenario):
    respuesta = _cambiar(client, db_session, escenario["orden"], escenario["doctora"], "collected")

    assert respuesta.json()["allowed_transitions"] == ["in_process", "cancelled", "rejected"]
    assert respuesta.json()["status_changed_by_user_id"] == escenario["doctora"].id
    assert respuesta.json()["status_changed_at"]


def test_cancelar_con_motivo_lo_guarda_en_la_orden_y_en_la_bitacora(client, db_session, escenario):
    orden = escenario["orden"]

    respuesta = _cambiar(client, db_session, orden, escenario["doctora"], "cancelled", "La paciente ya se lo hizo en otro lado")

    assert respuesta.status_code == 200
    assert respuesta.json()["status_reason"] == "La paciente ya se lo hizo en otro lado"
    assert respuesta.json()["allowed_transitions"] == []
    db_session.refresh(orden)
    assert orden.status == "cancelled"
    (registro,) = _cambios_en_bitacora(db_session)
    assert registro.reason == "La paciente ya se lo hizo en otro lado"
    assert registro.details["to"] == "cancelled"


def test_un_borrador_se_emite(client, db_session, escenario):
    borrador = _orden(db_session, escenario["tenant"], escenario["paciente"], escenario["doctora"], status="draft")

    respuesta = _cambiar(client, db_session, borrador, escenario["doctora"], "ordered")

    assert respuesta.status_code == 200


@pytest.mark.parametrize("estado", ["cancelled", "rejected"])
@pytest.mark.parametrize("motivo", [None, "", "  ", "no"])
def test_cancelar_o_rechazar_sin_motivo_se_rechaza(client, db_session, escenario, estado, motivo):
    respuesta = _cambiar(client, db_session, escenario["orden"], escenario["doctora"], estado, motivo)

    assert respuesta.status_code == 422
    db_session.refresh(escenario["orden"])
    assert escenario["orden"].status == "ordered"
    assert _cambios_en_bitacora(db_session) == []


# ---------------------------------------------------------------------------
# Transiciones inválidas
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("desde, hacia", [
    ("in_process", "accepted"),
    ("collected", "scheduled"),
    ("cancelled", "ordered"),
    ("rejected", "accepted"),
    ("result_received", "cancelled"),
    ("reviewed", "in_process"),
    ("ordered", "ordered"),
])
def test_una_transicion_fuera_del_ciclo_es_409_y_no_cambia_nada(client, db_session, escenario, desde, hacia):
    orden = _orden(db_session, escenario["tenant"], escenario["paciente"], escenario["doctora"], status=desde)

    respuesta = _cambiar(client, db_session, orden, escenario["doctora"], hacia, "motivo suficiente")

    assert respuesta.status_code == 409
    assert "Actualiza la lista de estudios" in respuesta.json()["detail"]
    db_session.refresh(orden)
    assert orden.status == desde
    assert _cambios_en_bitacora(db_session) == []


@pytest.mark.parametrize("hacia", ["result_received", "reviewed", "perdida", ""])
def test_los_estados_del_resultado_o_desconocidos_no_se_ponen_a_mano(client, db_session, escenario, hacia):
    respuesta = _cambiar(client, db_session, escenario["orden"], escenario["doctora"], hacia)

    assert respuesta.status_code == 422


@pytest.mark.parametrize("quien, codigo", [("colega", 403), ("secretaria", 403), ("doctora_ajena", 404)])
def test_solo_la_doctora_que_la_pidio_mueve_la_orden(client, db_session, escenario, quien, codigo):
    respuesta = _cambiar(client, db_session, escenario["orden"], escenario[quien], "accepted")

    assert respuesta.status_code == codigo
    assert _cambios_en_bitacora(db_session) == []


# ---------------------------------------------------------------------------
# Una orden emitida no se edita
# ---------------------------------------------------------------------------

def test_una_orden_emitida_no_se_edita(client, db_session, escenario):
    respuesta = client.patch(
        f"{BASE}/orders/{escenario['orden'].id}", json={"destination": "Otro laboratorio"},
        headers=_auth_headers(db_session, escenario["doctora"]),
    )

    assert respuesta.status_code == 409
    assert "cancélala" in respuesta.json()["detail"]
    db_session.refresh(escenario["orden"])
    assert escenario["orden"].destination == "Laboratorio Central"


def test_un_borrador_si_se_corrige(client, db_session, escenario):
    borrador = _orden(db_session, escenario["tenant"], escenario["paciente"], escenario["doctora"], status="draft")

    respuesta = client.patch(
        f"{BASE}/orders/{borrador.id}", json={"destination": "Otro laboratorio"},
        headers=_auth_headers(db_session, escenario["doctora"]),
    )

    assert respuesta.status_code == 200
    assert respuesta.json()["destination"] == "Otro laboratorio"


def test_el_estado_ya_no_se_cambia_editando(client, db_session, escenario):
    """Antes el PATCH aceptaba cualquier texto como estado, sin motivo ni ciclo."""
    respuesta = client.patch(
        f"{BASE}/orders/{escenario['orden'].id}", json={"status": "cancelled"},
        headers=_auth_headers(db_session, escenario["doctora"]),
    )

    assert respuesta.status_code == 422
    db_session.refresh(escenario["orden"])
    assert escenario["orden"].status == "ordered"


def test_a_una_orden_cancelada_no_se_le_registra_resultado(client, db_session, escenario):
    """Antes el resultado la pasaba a result_received y la «descancelaba» en silencio."""
    orden = _orden(db_session, escenario["tenant"], escenario["paciente"], escenario["doctora"], status="cancelled")

    respuesta = client.post(
        f"{BASE}/orders/{orden.id}/results", json={"report_text": "Hb 12", "review_status": "received"},
        headers=_auth_headers(db_session, escenario["doctora"]),
    )

    assert respuesta.status_code == 409
    db_session.refresh(orden)
    assert orden.status == "cancelled"


# ---------------------------------------------------------------------------
# Conjunto cerrado al escribir, tolerante al leer
# ---------------------------------------------------------------------------

def _orden_nueva(paciente, **cambios):
    cuerpo = {
        "patient_id": paciente.id, "category": "laboratory", "study_name": "Glucosa",
        "clinical_indication": "Tamizaje", "requested_on": "2026-09-29",
    }
    cuerpo.update(cambios)
    return cuerpo


@pytest.mark.parametrize("cambios", [
    {"priority": "alta"},
    {"priority": "URGENT"},
    {"status": "reviewed"},
    {"status": "cancelled"},
    {"status": "lo que sea"},
])
def test_una_orden_nueva_no_acepta_estados_ni_prioridades_fuera_de_la_lista(client, db_session, escenario, cambios):
    respuesta = client.post(
        f"{BASE}/orders", json=_orden_nueva(escenario["paciente"], **cambios),
        headers=_auth_headers(db_session, escenario["doctora"]),
    )

    assert respuesta.status_code == 422


@pytest.mark.parametrize("prioridad", ["routine", "preferential", "urgent"])
def test_las_tres_prioridades_validas_se_aceptan(client, db_session, escenario, prioridad):
    respuesta = client.post(
        f"{BASE}/orders", json=_orden_nueva(escenario["paciente"], priority=prioridad),
        headers=_auth_headers(db_session, escenario["doctora"]),
    )

    assert respuesta.status_code == 201


def test_un_lote_no_acepta_prioridades_fuera_de_la_lista(client, db_session, escenario):
    respuesta = client.post(f"{BASE}/order-groups", headers=_auth_headers(db_session, escenario["doctora"]), json={
        "patient_id": escenario["paciente"].id, "clinical_indication": "Perfil", "requested_on": "2026-09-29",
        "studies": [{"category": "laboratory", "study_name": "BH", "priority": "altísima"}],
    })

    assert respuesta.status_code == 422


def test_una_fila_vieja_con_valores_raros_se_sigue_leyendo(client, db_session, escenario):
    """Validar al escribir no puede dejar sin lista a la paciente por un dato viejo."""
    rara = _orden(
        db_session, escenario["tenant"], escenario["paciente"], escenario["doctora"],
        status="pendiente_legacy", priority="ALTA",
    )

    respuesta = client.get(
        f"{BASE}/patient/{escenario['paciente'].id}/orders", headers=_auth_headers(db_session, escenario["doctora"]),
    )

    assert respuesta.status_code == 200
    fila = next(o for o in respuesta.json() if o["id"] == rara.id)
    assert fila["status"] == "pendiente_legacy"
    assert fila["allowed_transitions"] == []


# ---------------------------------------------------------------------------
# La bandeja filtra por estados reales
# ---------------------------------------------------------------------------

def test_la_bandeja_filtra_por_un_estado_alcanzable(client, db_session, escenario):
    _cambiar(client, db_session, escenario["orden"], escenario["doctora"], "accepted")

    respuesta = client.get(
        f"{BASE}/orders/inbox", params={"status": "accepted"}, headers=_auth_headers(db_session, escenario["doctora"]),
    )

    assert respuesta.status_code == 200
    assert [item["order"]["id"] for item in respuesta.json()["items"]] == [escenario["orden"].id]


def test_la_bandeja_rechaza_un_estado_que_no_existe(client, db_session, escenario):
    respuesta = client.get(
        f"{BASE}/orders/inbox", params={"status": "aceptada"}, headers=_auth_headers(db_session, escenario["doctora"]),
    )

    assert respuesta.status_code == 422


def test_la_cancelada_sale_de_la_bandeja_de_pendientes(client, db_session, escenario):
    _cambiar(client, db_session, escenario["orden"], escenario["doctora"], "cancelled", "Orden duplicada")

    respuesta = client.get(f"{BASE}/orders/inbox", headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.json()["total"] == 0
    assert db_session.query(DiagnosticOrder).count() == 1
