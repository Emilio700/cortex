"""Recepción adjunta el resultado del laboratorio a su orden (O-04).

Decisión de Emilio: el sobre del laboratorio llega al mostrador; recepción
sube el PDF o la foto ligado a la orden, y la doctora lo interpreta y lo marca
revisado. Recepción no ve más clínica de la necesaria: ni la indicación, ni el
resultado interpretado, ni el resto del expediente.
"""
import pytest

from app.core.storage import LocalStorageBackend
from app.models.audit_log import AuditLog
from app.models.clinical_tracking import DiagnosticResult
from app.models.notification import Notification
from app.models.patient_document import DocumentType, PatientDocument
from app.models.permission import Permission

from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _orden,
    client,
    db_session,
    escenario,
)
from test_upload_storage import VALID_PDF, VALID_PNG

RUTA_POR_RECIBIR = f"{PREFIX}/clinical-tracking/orders/awaiting-result"


def _ruta_adjunto(orden) -> str:
    return f"{PREFIX}/clinical-tracking/orders/{orden.id}/result-attachment"


@pytest.fixture(autouse=True)
def almacenamiento(monkeypatch, tmp_path):
    """Los archivos van a una carpeta temporal, no al ``uploads/`` del repositorio."""
    import app.core.storage as almacen
    import app.routers.clinical_tracking as ordenes
    import app.routers.patient_documents as documentos

    backend = LocalStorageBackend(tmp_path)
    for modulo in (almacen, ordenes, documentos):
        monkeypatch.setattr(modulo, "default_storage", backend)
    return tmp_path


def _adjuntar(client, db_session, orden, quien, contenido=VALID_PDF, nombre="resultado.pdf", **datos):
    return client.post(
        _ruta_adjunto(orden),
        headers=_auth_headers(db_session, quien),
        files={"file": (nombre, contenido, "application/pdf")},
        data=datos,
    )


# ---------------------------------------------------------------------------
# Subir el resultado
# ---------------------------------------------------------------------------

def test_recepcion_adjunta_el_resultado_y_la_orden_pasa_a_la_bandeja(client, db_session, escenario, almacenamiento):
    orden = escenario["orden"]

    respuesta = _adjuntar(
        client, db_session, orden, escenario["secretaria"],
        resulted_on="2026-10-02", reporting_provider="Laboratorio Central",
    )

    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["order_id"] == orden.id
    assert cuerpo["order_status"] == "result_received"
    assert cuerpo["file_name"] == "resultado.pdf"
    resultado = db_session.get(DiagnosticResult, cuerpo["result_id"])
    assert resultado.review_status == "received"
    assert resultado.patient_document_id == cuerpo["patient_document_id"]
    assert resultado.clinician_interpretation is None
    assert str(resultado.resulted_on) == "2026-10-02"
    documento = db_session.get(PatientDocument, cuerpo["patient_document_id"])
    assert documento.patient_id == escenario["paciente"].id
    assert documento.document_type == DocumentType.LAB_RESULT
    assert documento.title == "Resultado: Biometría hemática completa"
    assert documento.lab_name == "Laboratorio Central"
    assert (almacenamiento / documento.file_path).read_bytes() == VALID_PDF
    db_session.refresh(orden)
    assert orden.status == "result_received"


def test_la_respuesta_no_trae_nada_clinico(client, db_session, escenario):
    respuesta = _adjuntar(client, db_session, escenario["orden"], escenario["secretaria"])

    cuerpo = respuesta.json()
    assert set(cuerpo) == {
        "result_id", "order_id", "order_status", "patient_document_id", "file_name", "mime_type", "file_size",
        "uploaded_at",
    }


def test_queda_en_la_bitacora_y_le_avisa_a_la_doctora(client, db_session, escenario):
    respuesta = _adjuntar(client, db_session, escenario["orden"], escenario["secretaria"])

    registro = db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_result.attachment_uploaded").one()
    assert registro.actor_user_id == escenario["secretaria"].id
    assert registro.entity_id == respuesta.json()["result_id"]
    assert registro.patient_id == escenario["paciente"].id
    assert registro.details["order_id"] == escenario["orden"].id
    aviso = db_session.query(Notification).filter(Notification.user_id == escenario["doctora"].id).one()
    assert aviso.type == "diagnostic_result_received"
    assert aviso.entity_type == "diagnostic_order"
    assert aviso.entity_id == escenario["orden"].id


def test_la_doctora_que_sube_su_propio_resultado_no_se_avisa_a_si_misma(client, db_session, escenario):
    respuesta = _adjuntar(client, db_session, escenario["orden"], escenario["doctora"], contenido=VALID_PNG, nombre="foto.png")

    assert respuesta.status_code == 201
    assert db_session.query(Notification).count() == 0


def test_un_segundo_archivo_es_otro_resultado_y_la_orden_revisada_vuelve_a_la_bandeja(client, db_session, escenario):
    """Los resultados originales no se sobrescriben (plan 14 §10)."""
    orden = escenario["orden"]
    primero = _adjuntar(client, db_session, orden, escenario["secretaria"]).json()
    orden.status = "reviewed"
    db_session.commit()

    segundo = _adjuntar(client, db_session, orden, escenario["secretaria"], nombre="hoja2.pdf").json()

    assert segundo["result_id"] != primero["result_id"]
    assert db_session.query(DiagnosticResult).filter(DiagnosticResult.diagnostic_order_id == orden.id).count() == 2
    assert segundo["order_status"] == "result_received"


@pytest.mark.parametrize("estado", ["cancelled", "rejected", "draft"])
def test_a_una_orden_cancelada_no_se_le_liga_resultado(client, db_session, escenario, almacenamiento, estado):
    orden = _orden(db_session, escenario["tenant"], escenario["paciente"], escenario["doctora"], status=estado)

    respuesta = _adjuntar(client, db_session, orden, escenario["secretaria"])

    assert respuesta.status_code == 409
    assert db_session.query(PatientDocument).count() == 0
    assert not any(almacenamiento.rglob("*.pdf"))


def test_un_archivo_que_no_es_pdf_ni_imagen_se_rechaza(client, db_session, escenario):
    respuesta = _adjuntar(client, db_session, escenario["orden"], escenario["secretaria"], contenido=b"MZ ejecutable", nombre="virus.exe")

    assert respuesta.status_code == 400
    assert db_session.query(DiagnosticResult).count() == 0


# ---------------------------------------------------------------------------
# Quién puede
# ---------------------------------------------------------------------------

def test_la_doctora_ajena_recibe_403(client, db_session, escenario):
    respuesta = _adjuntar(client, db_session, escenario["orden"], escenario["colega"])

    assert respuesta.status_code == 403
    assert db_session.query(DiagnosticResult).count() == 0


@pytest.mark.parametrize("quien", ["secretaria_ajena", "doctora_ajena"])
def test_otra_sucursal_recibe_404(client, db_session, escenario, quien):
    respuesta = _adjuntar(client, db_session, escenario["orden"], escenario[quien])

    assert respuesta.status_code == 404


def test_sin_el_permiso_recepcion_no_adjunta(client, db_session, escenario):
    secretaria = escenario["secretaria"]
    db_session.add(Permission(
        role="secretaria", action="clinical_tracking.attach_result", is_granted=False, user_id=secretaria.id,
    ))
    db_session.commit()

    respuesta = _adjuntar(client, db_session, escenario["orden"], secretaria)

    assert respuesta.status_code == 403


def test_recepcion_adjunta_pero_no_lee_la_interpretacion(client, db_session, escenario):
    """La doctora interpreta; recepción no tiene por dónde leerlo."""
    adjunto = _adjuntar(client, db_session, escenario["orden"], escenario["secretaria"]).json()
    doctora = _auth_headers(db_session, escenario["doctora"])
    revisado = client.patch(
        f"{PREFIX}/clinical-tracking/results/{adjunto['result_id']}", headers=doctora,
        json={"review_status": "reviewed", "clinician_interpretation": "ANEMIA LEVE, INICIAR HIERRO"},
    )
    assert revisado.status_code == 200
    recepcion = _auth_headers(db_session, escenario["secretaria"])

    assert client.get(f"{PREFIX}/clinical-tracking/orders/inbox", headers=recepcion).status_code == 403
    assert client.get(
        f"{PREFIX}/clinical-tracking/patient/{escenario['paciente'].id}/orders", headers=recepcion,
    ).status_code == 403
    assert client.patch(
        f"{PREFIX}/clinical-tracking/results/{adjunto['result_id']}", headers=recepcion,
        json={"review_status": "reviewed"},
    ).status_code == 403
    listado = client.get(RUTA_POR_RECIBIR, headers=recepcion, params={"patient_id": escenario["paciente"].id})
    assert "ANEMIA" not in listado.text
    assert "Control prenatal" not in listado.text


def test_la_doctora_ve_el_adjunto_en_su_bandeja_y_lo_marca_revisado(client, db_session, escenario):
    adjunto = _adjuntar(client, db_session, escenario["orden"], escenario["secretaria"]).json()
    doctora = _auth_headers(db_session, escenario["doctora"])

    bandeja = client.get(f"{PREFIX}/clinical-tracking/orders/inbox", headers=doctora).json()

    fila = next(item for item in bandeja["items"] if item["order"]["id"] == escenario["orden"].id)
    assert fila["latest_result"]["patient_document_id"] == adjunto["patient_document_id"]
    assert fila["latest_result"]["review_status"] == "received"
    descarga = client.get(f"{PREFIX}/documents/{adjunto['patient_document_id']}/download", headers=doctora)
    assert descarga.status_code == 200
    assert descarga.content == VALID_PDF


# ---------------------------------------------------------------------------
# La lista con la que recepción encuentra la orden
# ---------------------------------------------------------------------------

def test_la_lista_trae_solo_lo_necesario_para_reconocer_la_orden(client, db_session, escenario):
    respuesta = client.get(RUTA_POR_RECIBIR, headers=_auth_headers(db_session, escenario["secretaria"]))

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["total"] == 1
    item = cuerpo["items"][0]
    # Atrasado y seguimiento (plan 32, punto 3): operativo, no clínico. Sus
    # valores dependen del día; la regla se prueba en test_seguimiento_atrasados.
    assert isinstance(item.pop("atrasada"), bool)
    assert isinstance(item.pop("dias_sin_resultado"), int)
    assert item.pop("ultimo_seguimiento") is None
    assert [item] == [{
        "order_id": escenario["orden"].id,
        "order_group_id": None,
        "patient_id": escenario["paciente"].id,
        "patient_name": "María López Pérez",
        "study_name": "Biometría hemática completa",
        "requested_on": "2026-09-29",
        "status": "ordered",
        "attachments": 0,
        # Los archivos ya subidos (plan 26, R-1): nombre y tipo, nada clínico.
        "adjuntos": [],
        # Qué atender primero (D-10) y de qué doctora es, para imprimir el
        # papel de cada una (M5). Ni indicación ni resultado.
        "priority": "urgent",
        "doctor_id": escenario["doctora"].id,
        "doctor_name": "Dra. Yara Gutiérrez",
    }]


def test_la_lista_deja_fuera_las_canceladas_y_las_revisadas_y_cuenta_adjuntos(client, db_session, escenario):
    for estado in ("cancelled", "reviewed", "draft"):
        _orden(db_session, escenario["tenant"], escenario["paciente"], escenario["doctora"], status=estado)
    _adjuntar(client, db_session, escenario["orden"], escenario["secretaria"])

    cuerpo = client.get(RUTA_POR_RECIBIR, headers=_auth_headers(db_session, escenario["secretaria"])).json()

    assert [item["order_id"] for item in cuerpo["items"]] == [escenario["orden"].id]
    assert cuerpo["items"][0]["attachments"] == 1
    assert cuerpo["items"][0]["status"] == "result_received"


@pytest.mark.parametrize("busqueda", ["lópez", "biometría", "María López"])
def test_la_lista_se_busca_por_paciente_o_estudio(client, db_session, escenario, busqueda):
    cuerpo = client.get(
        RUTA_POR_RECIBIR, headers=_auth_headers(db_session, escenario["secretaria"]), params={"search": busqueda},
    ).json()

    assert [item["order_id"] for item in cuerpo["items"]] == [escenario["orden"].id]


def test_la_lista_se_busca_por_el_folio_del_papel(client, db_session, escenario):
    otra = _orden(db_session, escenario["tenant"], escenario["paciente"], escenario["doctora"], study_name="Urocultivo")

    cuerpo = client.get(
        RUTA_POR_RECIBIR, headers=_auth_headers(db_session, escenario["secretaria"]), params={"search": str(otra.id)},
    ).json()

    assert [item["order_id"] for item in cuerpo["items"]] == [otra.id]


@pytest.mark.parametrize("quien, esperadas", [("colega", 0), ("secretaria_ajena", 0), ("doctora", 1), ("admin", 1)])
def test_la_lista_respeta_el_alcance(client, db_session, escenario, quien, esperadas):
    respuesta = client.get(RUTA_POR_RECIBIR, headers=_auth_headers(db_session, escenario[quien]))

    assert respuesta.status_code == 200
    assert respuesta.json()["total"] == esperadas


def test_recepcion_ve_los_archivos_que_ya_subio(client, db_session, escenario):
    """Para notar el sobre equivocado o el mismo subido dos veces (plan 26, R-1)."""
    orden = escenario["orden"]
    primero = _adjuntar(client, db_session, orden, escenario["secretaria"], nombre="hoja1.pdf").json()
    segundo = _adjuntar(client, db_session, orden, escenario["secretaria"], contenido=VALID_PNG, nombre="foto.png").json()

    respuesta = client.get(RUTA_POR_RECIBIR, headers=_auth_headers(db_session, escenario["secretaria"]))

    item = respuesta.json()["items"][0]
    assert item["attachments"] == 2
    assert [(a["patient_document_id"], a["file_name"], a["mime_type"]) for a in item["adjuntos"]] == [
        (primero["patient_document_id"], "hoja1.pdf", "application/pdf"),
        (segundo["patient_document_id"], "foto.png", "image/png"),
    ]
    # Recepción lo puede abrir con el permiso de documentos que ya tiene.
    descarga = client.get(
        f"{PREFIX}/documents/{segundo['patient_document_id']}/download",
        headers=_auth_headers(db_session, escenario["secretaria"]),
    )
    assert descarga.status_code == 200
    assert descarga.headers["content-type"] == "image/png"


def test_la_lista_pone_lo_urgente_primero(client, db_session, escenario):
    """Prioridad por estudio (plan 26, D-10): ordena también la pantalla de recepción."""
    t, p, d = escenario["tenant"], escenario["paciente"], escenario["doctora"]
    escenario["orden"].priority = "routine"
    db_session.commit()
    from datetime import date as _date

    preferente = _orden(db_session, t, p, d, study_name="Resonancia", priority="preferential", requested_on=_date(2026, 9, 1), desired_on=None)
    urgente = _orden(db_session, t, p, d, study_name="Tomografía", priority="urgent", requested_on=_date(2026, 9, 2), desired_on=None)

    items = client.get(RUTA_POR_RECIBIR, headers=_auth_headers(db_session, escenario["secretaria"])).json()["items"]

    assert [i["order_id"] for i in items] == [urgente.id, preferente.id, escenario["orden"].id]
