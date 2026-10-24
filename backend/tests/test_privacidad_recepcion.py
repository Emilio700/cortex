"""Recepción no lee lo clínico por la puerta de la ficha (plan 32, punto 7).

C1: ``GET /patients/{id}/history`` pedía solo ``patients.read`` y devolvía la
nota SOAP, el triage y las recetas de cada cita a recepción, que no tiene
``soap_notes.read`` ni ``prescriptions.read``.

C2: cada resultado de orden se guarda también como documento del paciente y
``/documents`` solo pedía ``documents.read``: recepción abría el resultado de
cualquier paciente. Decisión de Emilio: ve el archivo que ella recibió o subió,
nunca la interpretación, y no navega por los resultados de las demás.

Más la revisión de routers: el triage se leía con solo estar autenticada.
"""
from datetime import date

import pytest

from app.models.clinical_tracking import DiagnosticOrder, DiagnosticResult
from app.models.patient_document import DocumentType, PatientDocument
from app.models.permission import Permission
from app.models.prescription import Prescription
from app.models.soap_note import SOAPNote
from app.models.tenant import Tenant
from app.models.triage import Triage
from app.models.user import Role

from _cobros_base import PREFIX, cita, client, db_session, headers, paciente, usuario  # noqa: F401

INTERPRETACION = "Anemia ferropénica leve; iniciar hierro"


@pytest.fixture
def e(db_session):
    centro, otra = Tenant(name="Centro", is_active=True), Tenant(name="Otra", is_active=True)
    db_session.add_all([centro, otra])
    db_session.commit()
    doctora = usuario(db_session, centro, "Cintia", Role.DOCTOR)
    recepcion = usuario(db_session, centro, "Lupita", Role.SECRETARIA)
    recepcion2 = usuario(db_session, centro, "Rosa", Role.SECRETARIA)
    recepcion_otra = usuario(db_session, otra, "Marta", Role.SECRETARIA)
    ana = paciente(db_session, centro, doctora, "Ana")
    c = cita(db_session, centro, ana, doctora)
    db_session.add_all([
        SOAPNote(tenant_id=centro.id, appointment_id=c.id, doctor_id=doctora.id,
                 subjective="Dolor pélvico", objective="Útero doloroso", assessment="Endometriosis",
                 plan="Ultrasonido"),
        Triage(appointment_id=c.id, created_by_user_id=recepcion.id, weight_kg=60,
               chief_complaint="Dolor", observations="Hallazgo clínico"),
        Prescription(tenant_id=centro.id, appointment_id=c.id, doctor_id=doctora.id, patient_id=ana.id,
                     folio_number="REC-1", medications=[{"name": "Dienogest"}]),
    ])
    db_session.commit()
    return {"centro": centro, "doctora": doctora, "recepcion": recepcion, "recepcion2": recepcion2,
            "recepcion_otra": recepcion_otra, "ana": ana, "cita": c}


def _historial(client, db, user, paciente_id):
    return client.get(f"{PREFIX}/patients/{paciente_id}/history", headers=headers(db, user))


# ── C1 ─────────────────────────────────────────────────────────────────────


def test_recepcion_recibe_las_citas_sin_soap_triage_ni_recetas(client, db_session, e):
    r = _historial(client, db_session, e["recepcion"], e["ana"].id)
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["contenido_clinico"] is False
    entrada = cuerpo["history"][0]
    assert entrada["appointment_id"] == e["cita"].id
    assert entrada["soap_note"] is None and entrada["triage"] is None and entrada["prescriptions"] == []
    assert "Endometriosis" not in r.text and "Dienogest" not in r.text and "Hallazgo" not in r.text


def test_la_doctora_si_recibe_lo_clinico_del_historial(client, db_session, e):
    cuerpo = _historial(client, db_session, e["doctora"], e["ana"].id).json()
    entrada = cuerpo["history"][0]
    assert cuerpo["contenido_clinico"] is True
    assert entrada["soap_note"]["assessment"] == "Endometriosis"
    assert entrada["triage"]["observations"] == "Hallazgo clínico"
    assert entrada["prescriptions"][0]["folio"] == "REC-1"


def test_cada_seccion_sigue_su_propio_permiso(client, db_session, e):
    """Recepción a la que se le concedió leer recetas ve esas, no la nota."""
    db_session.add(Permission(role="secretaria", user_id=e["recepcion"].id, action="prescriptions.read", is_granted=True))
    db_session.commit()
    entrada = _historial(client, db_session, e["recepcion"], e["ana"].id).json()["history"][0]
    assert entrada["prescriptions"][0]["folio"] == "REC-1"
    assert entrada["soap_note"] is None and entrada["triage"] is None


def test_historial_de_otra_sucursal_no_existe(client, db_session, e):
    assert _historial(client, db_session, e["recepcion_otra"], e["ana"].id).status_code == 404


# ── C2 ─────────────────────────────────────────────────────────────────────


def _documento(db, e, subio, titulo, tipo=DocumentType.LAB_RESULT):
    doc = PatientDocument(
        patient_id=e["ana"].id, tenant_id=e["centro"].id, uploaded_by_user_id=subio.id,
        document_type=tipo, title=titulo, file_path=f"uploads/patient_documents/{titulo}.pdf",
        file_name=f"{titulo}.pdf", mime_type="application/pdf",
    )
    db.add(doc)
    db.commit()
    return doc


def _resultado(db, e, doc, registro):
    orden = DiagnosticOrder(
        tenant_id=e["centro"].id, patient_id=e["ana"].id, doctor_id=e["doctora"].id, category="laboratorio",
        study_name="Biometría", clinical_indication="Control", requested_on=date(2026, 10, 1),
        status="result_received",
    )
    db.add(orden)
    db.commit()
    db.add(DiagnosticResult(
        tenant_id=e["centro"].id, diagnostic_order_id=orden.id, recorded_by_user_id=registro.id,
        patient_document_id=doc.id, clinician_interpretation=INTERPRETACION, valoracion="anormal",
    ))
    db.commit()
    return orden


@pytest.fixture
def docs(db_session, e):
    ajeno = _documento(db_session, e, e["doctora"], "resultado-de-la-doctora")
    _resultado(db_session, e, ajeno, e["doctora"])
    suyo = _documento(db_session, e, e["recepcion"], "resultado-que-recibio")
    _resultado(db_session, e, suyo, e["recepcion"])
    referencia = _documento(db_session, e, e["doctora"], "referencia-de-otro-medico", DocumentType.EXTERNAL_NOTE)
    return {"ajeno": ajeno, "suyo": suyo, "referencia": referencia}


def _lista(client, db, user, paciente_id):
    # Con los resultados incluidos: la regla de privacidad se prueba sobre
    # ellos, aunque la lista normal ya los manda a Estudios (plan 32, punto 6).
    r = client.get(f"{PREFIX}/documents/patient/{paciente_id}", headers=headers(db, user),
                   params={"incluir_resultados": True})
    assert r.status_code == 200
    return {d["id"] for d in r.json()}, r.text


def test_recepcion_no_lista_resultados_que_no_recibio(client, db_session, e, docs):
    ids, texto = _lista(client, db_session, e["recepcion"], e["ana"].id)
    assert docs["ajeno"].id not in ids
    assert {docs["suyo"].id, docs["referencia"].id} <= ids
    assert INTERPRETACION not in texto


def test_recepcion_abre_el_resultado_que_ella_subio_pero_no_el_ajeno(client, db_session, e, docs):
    h = headers(db_session, e["recepcion"])
    suyo = client.get(f"{PREFIX}/documents/{docs['suyo'].id}", headers=h)
    assert suyo.status_code == 200
    assert INTERPRETACION not in suyo.text and "anormal" not in suyo.text
    for ruta in ("", "/download"):
        assert client.get(f"{PREFIX}/documents/{docs['ajeno'].id}{ruta}", headers=h).status_code == 404


def test_otra_recepcionista_no_ve_lo_que_recibio_su_companera(client, db_session, e, docs):
    ids, _ = _lista(client, db_session, e["recepcion2"], e["ana"].id)
    assert docs["suyo"].id not in ids and docs["ajeno"].id not in ids
    assert docs["referencia"].id in ids


def test_la_doctora_lista_todos_los_resultados(client, db_session, e, docs):
    ids, _ = _lista(client, db_session, e["doctora"], e["ana"].id)
    assert {docs["ajeno"].id, docs["suyo"].id, docs["referencia"].id} <= ids


def test_recepcion_de_otra_sucursal_no_llega_a_ningun_documento(client, db_session, e, docs):
    r = client.get(f"{PREFIX}/documents/{docs['suyo'].id}", headers=headers(db_session, e["recepcion_otra"]))
    assert r.status_code == 404


def test_por_recibir_solo_ofrece_abrir_los_adjuntos_propios(client, db_session, e, docs):
    """La lista de órdenes por recibir no promete un archivo que luego da 404."""
    orden_ajena = _resultado(db_session, e, _documento(db_session, e, e["doctora"], "otro"), e["doctora"])
    orden_ajena.status = "ordered"
    db_session.commit()
    r = client.get(f"{PREFIX}/clinical-tracking/orders/awaiting-result", headers=headers(db_session, e["recepcion2"]))
    assert r.status_code == 200, r.text
    fila = next(i for i in r.json()["items"] if i["order_id"] == orden_ajena.id)
    assert fila["attachments"] == 1 and fila["adjuntos"] == []


# ── Revisión de routers ────────────────────────────────────────────────────


def test_el_triage_exige_su_permiso_de_lectura(client, db_session, e):
    db_session.add(Permission(role="secretaria", user_id=e["recepcion"].id, action="triage.read", is_granted=False))
    db_session.commit()
    h = headers(db_session, e["recepcion"])
    assert client.get(f"{PREFIX}/triage/appointment/{e['cita'].id}", headers=h).status_code == 403
    assert client.get(f"{PREFIX}/triage/patient/{e['ana'].id}/all", headers=h).status_code == 403
    # Con el permiso de su rol lo sigue leyendo: ella toma los signos.
    h2 = headers(db_session, e["recepcion2"])
    assert client.get(f"{PREFIX}/triage/appointment/{e['cita'].id}", headers=h2).status_code == 200
