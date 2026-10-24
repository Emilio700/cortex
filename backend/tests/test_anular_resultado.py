"""Anular un resultado de orden (plan 29, lote 9).

El archivo equivocado ligado a una orden no se borra: se anula con motivo,
con su documento, y la orden y la incidencia crítica se recalculan con lo que
queda vigente. Pruebas con un resultado y con varios en la misma orden.
"""
import pytest

from app.models.audit_log import AuditLog
from app.models.clinical_tracking import DiagnosticOrder, DiagnosticResult
from app.models.patient_document import PatientDocument
from test_resultado_adjunto import almacenamiento  # noqa: F401 (fixture: archivos a tmp)
from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    client,
    db_session,
    escenario,
)
from test_resultados_criticos import (
    _adjuntar_como_recepcion,
    _criticos_en_bandeja,
    _incidencias,
    _revisar,
)

BASE = f"{PREFIX}/clinical-tracking"
MOTIVO = "Era de otra paciente"


def _anular(client, db_session, quien, resultado, motivo=MOTIVO, codigo=200):
    respuesta = client.post(
        f"{BASE}/results/{resultado['id']}/anular", json={"motivo": motivo},
        headers=_auth_headers(db_session, quien),
    )
    assert respuesta.status_code == codigo, respuesta.text
    return respuesta.json()


def _orden(db_session, escenario):
    db_session.expire_all()
    return db_session.get(DiagnosticOrder, escenario["orden"].id)


def _historial(client, db_session, escenario, quien, **params):
    respuesta = client.get(
        f"{BASE}/patient/{escenario['paciente'].id}/orders", params=params,
        headers=_auth_headers(db_session, quien),
    )
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


def _resultados_del_historial(client, db_session, escenario, quien):
    return [
        r for o in _historial(client, db_session, escenario, quien)
        if o["id"] == escenario["orden"].id for r in o["results"]
    ]


def test_un_solo_resultado_vuelve_a_pendiente_y_anula_su_documento(client, db_session, escenario, almacenamiento):
    resultado = _adjuntar_como_recepcion(client, db_session, escenario)

    hecho = _anular(client, db_session, escenario["doctora"], resultado)

    assert hecho["estado_anterior"] == "result_received"
    assert hecho["order_status"] == "ordered"
    assert hecho["estado_visible"] == "pendiente"
    assert hecho["resultados_vigentes"] == 0
    assert hecho["documento_anulado"] is True
    assert hecho["incidencia"] == "sin_incidencia"
    db_session.expire_all()
    fila = db_session.get(DiagnosticResult, resultado["id"])
    assert fila.anulado_motivo == MOTIVO
    documento = db_session.get(PatientDocument, fila.patient_document_id)
    assert documento.anulado_at is not None and documento.anulado_motivo == MOTIVO
    acciones = {a.action for a in db_session.query(AuditLog).all()}
    assert {"diagnostic_result.voided", "document.voided", "diagnostic_order.status_changed"} <= acciones
    # Después se sube el correcto como siempre, y vuelve a la bandeja.
    nuevo = _adjuntar_como_recepcion(client, db_session, escenario)
    assert nuevo["id"] != resultado["id"]
    assert _orden(db_session, escenario).status == "result_received"


def test_con_otro_resultado_revisado_la_orden_sigue_revisada(client, db_session, escenario, almacenamiento):
    bueno = _adjuntar_como_recepcion(client, db_session, escenario)
    _revisar(client, db_session, escenario, bueno, review_status="reviewed", valoracion="bien")
    malo = _adjuntar_como_recepcion(client, db_session, escenario)
    assert _orden(db_session, escenario).status == "result_received"

    hecho = _anular(client, db_session, escenario["doctora"], malo)

    assert hecho["order_status"] == "reviewed"
    assert hecho["estado_visible"] == "revisada"
    assert hecho["resultados_vigentes"] == 1
    ids = [r["id"] for r in _resultados_del_historial(client, db_session, escenario, escenario["doctora"])]
    assert ids == [bueno["id"]]


def test_con_otro_resultado_sin_revisar_la_orden_queda_recibida(client, db_session, escenario, almacenamiento):
    _adjuntar_como_recepcion(client, db_session, escenario)
    malo = _adjuntar_como_recepcion(client, db_session, escenario)

    hecho = _anular(client, db_session, escenario["doctora"], malo)

    assert hecho["order_status"] == "result_received"
    assert hecho["resultados_vigentes"] == 1


def test_el_critico_anulado_cierra_su_incidencia(client, db_session, escenario, almacenamiento):
    malo = _adjuntar_como_recepcion(client, db_session, escenario)
    _revisar(client, db_session, escenario, malo, review_status="reviewed", valoracion="critico")
    assert _incidencias(client, db_session, escenario["doctora"])["total"] == 1

    hecho = _anular(client, db_session, escenario["doctora"], malo)

    assert hecho["incidencia"] == "cerrada"
    assert _incidencias(client, db_session, escenario["doctora"])["total"] == 0
    assert _criticos_en_bandeja(client, db_session, escenario) == 0
    db_session.expire_all()
    assert db_session.get(DiagnosticResult, malo["id"]).incidencia_cerrada_por == "resultado_anulado"


def test_si_otro_resultado_vigente_es_critico_la_incidencia_sigue(client, db_session, escenario, almacenamiento):
    critico = _adjuntar_como_recepcion(client, db_session, escenario)
    malo = _adjuntar_como_recepcion(client, db_session, escenario)
    _revisar(client, db_session, escenario, critico, valoracion="critico")
    _revisar(client, db_session, escenario, malo, valoracion="critico")

    hecho = _anular(client, db_session, escenario["doctora"], malo)

    assert hecho["incidencia"] == "sigue_abierta"
    abiertas = _incidencias(client, db_session, escenario["doctora"])
    assert [i["result_id"] for i in abiertas["items"]] == [critico["id"]]
    assert _criticos_en_bandeja(client, db_session, escenario) == 1


def test_el_anulado_no_cuenta_y_la_administracion_lo_ve_con_su_motivo(client, db_session, escenario, almacenamiento):
    malo = _adjuntar_como_recepcion(client, db_session, escenario)
    _revisar(client, db_session, escenario, malo, valoracion="malo")

    _anular(client, db_session, escenario["doctora"], malo)

    grafica = client.get(
        f"{BASE}/patient/{escenario['paciente'].id}/valoraciones",
        headers=_auth_headers(db_session, escenario["doctora"]),
    ).json()
    assert grafica["items"] == []
    assert _resultados_del_historial(client, db_session, escenario, escenario["doctora"]) == []
    del_admin = _resultados_del_historial(client, db_session, escenario, escenario["admin"])
    assert [(r["id"], r["anulado_motivo"]) for r in del_admin] == [(malo["id"], MOTIVO)]
    # «Resultados pendientes de la paciente» en la consulta: ya no está por atender.
    assert _historial(client, db_session, escenario, escenario["doctora"], por_atender=True) == []


def test_la_administracion_puede_anular(client, db_session, escenario, almacenamiento):
    resultado = _adjuntar_como_recepcion(client, db_session, escenario)

    assert _anular(client, db_session, escenario["admin"], resultado)["order_status"] == "ordered"


@pytest.mark.parametrize("quien", ["colega", "secretaria"])
def test_ni_otra_doctora_ni_recepcion_pueden_anular(client, db_session, escenario, almacenamiento, quien):
    resultado = _adjuntar_como_recepcion(client, db_session, escenario)

    respuesta = client.post(
        f"{BASE}/results/{resultado['id']}/anular", json={"motivo": MOTIVO},
        headers=_auth_headers(db_session, escenario[quien]),
    )

    assert respuesta.status_code in (403, 404)
    db_session.expire_all()
    assert db_session.get(DiagnosticResult, resultado["id"]).anulado_at is None


def test_motivo_obligatorio_y_no_se_anula_dos_veces(client, db_session, escenario, almacenamiento):
    resultado = _adjuntar_como_recepcion(client, db_session, escenario)

    _anular(client, db_session, escenario["doctora"], resultado, motivo="  ", codigo=422)
    _anular(client, db_session, escenario["doctora"], resultado)
    _anular(client, db_session, escenario["doctora"], resultado, codigo=409)
    # Y ya no se revisa.
    _revisar(client, db_session, escenario, resultado, codigo=409, review_status="reviewed")


def test_el_archivo_de_un_resultado_anulado_ya_no_bloquea_documentos(client, db_session, escenario, almacenamiento):
    """El bloqueo del lote 7 es para el archivo de un resultado vigente."""
    from app.services.correccion_documentos import exigir_que_no_sea_resultado

    resultado = _adjuntar_como_recepcion(client, db_session, escenario)
    _anular(client, db_session, escenario["doctora"], resultado)
    db_session.expire_all()
    documento = db_session.get(PatientDocument, db_session.get(DiagnosticResult, resultado["id"]).patient_document_id)

    exigir_que_no_sea_resultado(db_session, documento)
