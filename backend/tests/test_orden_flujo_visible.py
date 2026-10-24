"""El flujo visible de la orden: Pendiente → Resultado recibido → Revisada (plan 26, D-1).

GEMS no tiene laboratorio propio, así que los pasos intermedios del
laboratorio no se pueden medir. El modelo los conserva (las órdenes viejas
siguen siendo válidas), pero la respuesta trae lo necesario para que la
pantalla no dependa de ellos: ``estado_visible`` y ``acciones_de_estado``.

Además, la doctora anexa resultados ella misma (el estudio que la paciente le
manda por WhatsApp), con el mismo endpoint que recepción, y una orden admite
varios archivos.
"""
import pytest

from test_resultado_adjunto import almacenamiento  # noqa: F401 (fixture: archivos a tmp)
from test_upload_storage import VALID_PDF, VALID_PNG
from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _orden,
    client,
    db_session,
    escenario,
)


def _historial(client, db_session, escenario):
    respuesta = client.get(
        f"{PREFIX}/clinical-tracking/patient/{escenario['paciente'].id}/orders",
        headers=_auth_headers(db_session, escenario["doctora"]),
    )
    assert respuesta.status_code == 200, respuesta.text
    return {orden["id"]: orden for orden in respuesta.json()}


@pytest.mark.parametrize("estado,visible", [
    ("ordered", "pendiente"), ("accepted", "pendiente"), ("scheduled", "pendiente"),
    ("collected", "pendiente"), ("in_process", "pendiente"), ("result_received", "resultado_recibido"),
    ("reviewed", "revisada"), ("cancelled", "cancelada"), ("rejected", "rechazada"), ("draft", "borrador"),
])
def test_cada_estado_guardado_tiene_su_estado_visible(client, db_session, escenario, estado, visible):
    orden = _orden(db_session, escenario["tenant"], escenario["paciente"], escenario["doctora"], status=estado)

    assert _historial(client, db_session, escenario)[orden.id]["estado_visible"] == visible


def test_la_interfaz_solo_ofrece_emitir_cancelar_o_rechazar(client, db_session, escenario):
    t, p, d = escenario["tenant"], escenario["paciente"], escenario["doctora"]
    borrador = _orden(db_session, t, p, d, status="draft")
    vieja = _orden(db_session, t, p, d, status="scheduled")
    historial = _historial(client, db_session, escenario)

    assert historial[escenario["orden"].id]["acciones_de_estado"] == ["cancelled", "rejected"]
    assert historial[borrador.id]["acciones_de_estado"] == ["ordered", "cancelled"]
    assert historial[vieja.id]["acciones_de_estado"] == ["cancelled", "rejected"]
    # Lo de siempre se conserva para quien todavía lo lea.
    assert "collected" in historial[vieja.id]["allowed_transitions"]


def test_la_doctora_anexa_varios_archivos_a_su_orden_y_se_listan(client, db_session, escenario):
    orden = escenario["orden"]
    headers = _auth_headers(db_session, escenario["doctora"])
    ruta = f"{PREFIX}/clinical-tracking/orders/{orden.id}/result-attachment"

    pdf = client.post(ruta, files={"file": ("reporte.pdf", VALID_PDF, "application/pdf")}, headers=headers)
    foto = client.post(ruta, files={"file": ("usg.png", VALID_PNG, "image/png")}, headers=headers)

    assert pdf.status_code == 201, pdf.text
    assert foto.status_code == 201, foto.text
    assert foto.json()["order_status"] == "result_received"
    resultados = _historial(client, db_session, escenario)[orden.id]["results"]
    assert {(r["document_file_name"], r["document_mime_type"]) for r in resultados} == {
        ("reporte.pdf", "application/pdf"), ("usg.png", "image/png"),
    }
    assert all(r["patient_document_id"] for r in resultados)
    assert _historial(client, db_session, escenario)[orden.id]["estado_visible"] == "resultado_recibido"


def test_la_doctora_puede_bajar_el_archivo_que_anexo(client, db_session, escenario):
    orden = escenario["orden"]
    headers = _auth_headers(db_session, escenario["doctora"])
    subido = client.post(
        f"{PREFIX}/clinical-tracking/orders/{orden.id}/result-attachment",
        files={"file": ("usg.png", VALID_PNG, "image/png")}, headers=headers,
    ).json()

    respuesta = client.get(f"{PREFIX}/documents/{subido['patient_document_id']}/download", headers=headers)

    assert respuesta.status_code == 200
    assert respuesta.headers["content-type"] == "image/png"
    assert respuesta.content == VALID_PNG
