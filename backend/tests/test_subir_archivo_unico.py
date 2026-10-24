"""Un solo modo de subir archivos (plan 32, punto 6).

- Un resultado no entra como documento suelto: va a su orden o como estudio
  de otro lugar, y llega a Estudios.
- Documentos ya no lista los archivos que son resultado (C3) y dice cuántos.
- Los resultados viejos sin orden se ligan sin mover el archivo.
- El médico sube documentos (decisión 3).
"""
import io

import pytest

from app.models.clinical_tracking import DiagnosticOrder, DiagnosticResult
from app.models.patient_document import DocumentType, PatientDocument

from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _orden,
    client,
    db_session,
    escenario,
)

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


@pytest.fixture(autouse=True)
def almacen(monkeypatch, tmp_path):
    from app.core import storage

    guardados = {}
    monkeypatch.setattr(storage.default_storage, "save", lambda ruta, contenido: guardados.__setitem__(ruta, contenido))
    monkeypatch.setattr(storage.default_storage, "delete", lambda ruta: guardados.pop(ruta, None))
    return guardados


def _subir_doc(client, db, quien, paciente, tipo):
    return client.post(
        f"{PREFIX}/documents/upload", headers=_auth_headers(db, quien),
        data={"patient_id": paciente.id, "document_type": tipo, "title": "Referencia"},
        files={"file": ("ref.pdf", io.BytesIO(PDF), "application/pdf")},
    )


def test_un_resultado_no_se_sube_como_documento_suelto(client, db_session, escenario):
    e = escenario
    for tipo in ("lab_result", "imaging_study"):
        r = _subir_doc(client, db_session, e["secretaria"], e["paciente"], tipo)
        assert r.status_code == 422 and "estudio de otro lugar" in r.text


def test_la_doctora_sube_documentos_y_recepcion_solo_referencias(client, db_session, escenario):
    e = escenario
    assert _subir_doc(client, db_session, e["doctora"], e["paciente"], "other").status_code == 201
    assert _subir_doc(client, db_session, e["secretaria"], e["paciente"], "external_note").status_code == 201
    assert _subir_doc(client, db_session, e["secretaria"], e["paciente"], "other").status_code == 403


def test_estudio_de_otro_lugar_nace_en_estudios_por_revisar(client, db_session, escenario):
    e = escenario
    r = client.post(
        f"{PREFIX}/clinical-tracking/external-studies", headers=_auth_headers(db_session, e["secretaria"]),
        data={"patient_id": e["paciente"].id, "study_name": "Ultrasonido pélvico", "category": "imaging",
              "resulted_on": "2026-09-20", "reporting_provider": "Clínica del Valle"},
        files={"file": ("us.pdf", io.BytesIO(PDF), "application/pdf")},
    )
    assert r.status_code == 201, r.text
    orden = db_session.get(DiagnosticOrder, r.json()["order_id"])
    assert orden.origen == "externo" and orden.status == "result_received"
    assert orden.doctor_id == e["paciente"].owner_doctor_id
    # El médico lo ve en Estudios como «por revisar», y no se le ofrece imprimirlo ni cancelarlo.
    lista = client.get(f"{PREFIX}/clinical-tracking/patient/{e['paciente'].id}/orders",
                       headers=_auth_headers(db_session, e["doctora"])).json()
    externa = next(o for o in lista if o["id"] == orden.id)
    assert externa["origen"] == "externo" and externa["acciones_de_estado"] == []
    assert client.get(f"{PREFIX}/clinical-tracking/orders/{orden.id}/pdf",
                      headers=_auth_headers(db_session, e["doctora"])).status_code == 409


def test_documentos_no_repite_los_resultados_y_dice_cuantos(client, db_session, escenario):
    e = escenario
    for tipo in ("external_note",):
        _subir_doc(client, db_session, e["doctora"], e["paciente"], tipo)
    orden = _orden(db_session, e["tenant"], e["paciente"], e["doctora"])
    r = client.post(f"{PREFIX}/clinical-tracking/orders/{orden.id}/result-attachment",
                    headers=_auth_headers(db_session, e["doctora"]),
                    files={"file": ("bh.pdf", io.BytesIO(PDF), "application/pdf")})
    assert r.status_code == 201, r.text
    lista = client.get(f"{PREFIX}/documents/patient/{e['paciente'].id}", headers=_auth_headers(db_session, e["doctora"]))
    assert [d["document_type"] for d in lista.json()] == ["external_note"]
    assert lista.headers["X-Resultados-En-Estudios"] == "1"


def _viejo(db, e, tipo=DocumentType.LAB_RESULT):
    doc = PatientDocument(patient_id=e["paciente"].id, tenant_id=e["tenant"].id, uploaded_by_user_id=e["secretaria"].id,
                          document_type=tipo, title="Resultado de laboratorio", file_path="uploads/x.pdf",
                          file_name="x.pdf", mime_type="application/pdf", lab_name="Lab Central")
    db.add(doc)
    db.commit()
    return doc


def test_resultados_viejos_sin_orden_se_ligan_sin_mover_el_archivo(client, db_session, escenario):
    e = escenario
    viejo = _viejo(db_session, e)
    _viejo(db_session, e, DocumentType.EXTERNAL_NOTE)  # una referencia no parece resultado
    h = _auth_headers(db_session, e["doctora"])
    sin_orden = client.get(f"{PREFIX}/clinical-tracking/patients/{e['paciente'].id}/resultados-sin-orden", headers=h).json()
    assert [d["id"] for d in sin_orden] == [viejo.id]

    orden = _orden(db_session, e["tenant"], e["paciente"], e["doctora"], status="ordered")
    r = client.post(f"{PREFIX}/clinical-tracking/documents/{viejo.id}/ligar", headers=h, json={"order_id": orden.id})
    assert r.status_code == 200, r.text
    db_session.refresh(orden)
    assert orden.status == "result_received"
    res = db_session.get(DiagnosticResult, r.json()["result_id"])
    assert res.patient_document_id == viejo.id and res.recorded_by_user_id == e["secretaria"].id
    assert client.get(f"{PREFIX}/clinical-tracking/patients/{e['paciente'].id}/resultados-sin-orden", headers=h).json() == []
    # Ligarlo dos veces no crea otro resultado.
    assert client.post(f"{PREFIX}/clinical-tracking/documents/{viejo.id}/ligar", headers=h,
                       json={"order_id": orden.id}).status_code == 409


def test_un_resultado_viejo_puede_marcarse_como_estudio_externo(client, db_session, escenario):
    e = escenario
    viejo = _viejo(db_session, e)
    r = client.post(f"{PREFIX}/clinical-tracking/documents/{viejo.id}/ligar", headers=_auth_headers(db_session, e["doctora"]),
                    json={"externo_study_name": "Perfil tiroideo"})
    assert r.status_code == 200, r.text
    orden = db_session.get(DiagnosticOrder, r.json()["order_id"])
    assert orden.origen == "externo" and orden.study_name == "Perfil tiroideo" and orden.destination == "Lab Central"


def test_recepcion_no_liga_ni_ve_los_sin_orden(client, db_session, escenario):
    e = escenario
    viejo = _viejo(db_session, e)
    h = _auth_headers(db_session, e["secretaria"])
    assert client.get(f"{PREFIX}/clinical-tracking/patients/{e['paciente'].id}/resultados-sin-orden", headers=h).status_code == 403
    assert client.post(f"{PREFIX}/clinical-tracking/documents/{viejo.id}/ligar", headers=h,
                       json={"externo_study_name": "X"}).status_code == 403
