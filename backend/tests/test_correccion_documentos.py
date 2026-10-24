"""Corrección de documentos subidos al paciente equivocado (plan 29, lote 7).

Nunca se borra: se anula (con motivo, reversible por administración) o se
mueve (con motivo, bitácora en las dos pacientes). Permiso documents.correct,
o quien lo subió en las primeras 24 h. Un archivo de resultado de orden no se
toca desde aquí.
"""
from datetime import date, timedelta

import pytest

from app.db.session import utcnow
from app.models.audit_log import AuditLog
from app.models.clinical_tracking import DiagnosticOrder, DiagnosticResult
from app.models.notification import Notification, NotificationType
from app.models.patient_document import DocumentType, PatientDocument
from app.models.permission import Permission
from app.models.tenant import Tenant
from app.models.user import Role

from _cobros_base import PREFIX, client, db_session, headers, paciente, usuario  # noqa: F401


@pytest.fixture
def e(db_session):
    centro = Tenant(name="Centro", is_active=True)
    otra = Tenant(name="Otra", is_active=True)
    db_session.add_all([centro, otra])
    db_session.commit()
    doctora = usuario(db_session, centro, "Cintia", Role.DOCTOR)
    recepcion = usuario(db_session, centro, "Lupita", Role.SECRETARIA)
    admin = usuario(db_session, centro, "Admin", Role.ADMIN)
    admin_otra = usuario(db_session, otra, "Admin Otra", Role.ADMIN)
    ana = paciente(db_session, centro, doctora, "Ana")
    berta = paciente(db_session, centro, doctora, "Berta")
    ajena = paciente(db_session, otra, doctora, "Carla")
    return {
        "centro": centro, "doctora": doctora, "recepcion": recepcion, "admin": admin,
        "admin_otra": admin_otra, "ana": ana, "berta": berta, "ajena": ajena,
    }


def _doc(db, e, *, subio=None, hace=timedelta(0), paciente_=None):
    doc = PatientDocument(
        patient_id=(paciente_ or e["ana"]).id, tenant_id=e["centro"].id,
        uploaded_by_user_id=(subio or e["recepcion"]).id, document_type=DocumentType.LAB_RESULT,
        title="Biometría", file_path="uploads/patient_documents/x.pdf", file_name="x.pdf",
        mime_type="application/pdf", created_at=utcnow() - hace,
    )
    db.add(doc)
    db.commit()
    return doc


def _post(client, db, user, doc_id, accion, **cuerpo):
    return client.post(f"{PREFIX}/documents/{doc_id}/{accion}", headers=headers(db, user), json=cuerpo)


def _lista(client, db, user, paciente_id, **params):
    return client.get(f"{PREFIX}/documents/patient/{paciente_id}", headers=headers(db, user), params=params)


def _bitacora(db, accion):
    return db.query(AuditLog).filter(AuditLog.action == accion).all()


# --- Anular ---------------------------------------------------------------

def test_la_doctora_anula_con_motivo_y_sale_de_las_vistas(client, db_session, e):
    doc = _doc(db_session, e)

    r = _post(client, db_session, e["doctora"], doc.id, "anular", motivo="Era de otro paciente")

    assert r.status_code == 200, r.text
    assert r.json()["anulado_at"] is not None
    assert r.json()["anulado_motivo"] == "Era de otro paciente"
    # Fuera de la lista, del detalle y de la descarga para quien no es administración.
    assert _lista(client, db_session, e["doctora"], e["ana"].id).json() == []
    assert client.get(f"{PREFIX}/documents/{doc.id}", headers=headers(db_session, e["doctora"])).status_code == 404
    # El registro y el archivo se conservan.
    db_session.refresh(doc)
    assert doc.file_path
    [rastro] = _bitacora(db_session, "document.voided")
    assert rastro.reason == "Era de otro paciente"
    assert rastro.patient_id == e["ana"].id


def test_el_motivo_es_obligatorio(client, db_session, e):
    doc = _doc(db_session, e)
    assert _post(client, db_session, e["doctora"], doc.id, "anular", motivo="  ").status_code == 422


def test_recepcion_sin_permiso_no_anula_lo_que_no_subio(client, db_session, e):
    doc = _doc(db_session, e, subio=e["doctora"])
    r = _post(client, db_session, e["recepcion"], doc.id, "anular", motivo="Error")
    assert r.status_code == 403


def test_quien_lo_subio_puede_corregirlo_en_las_primeras_24_horas(client, db_session, e):
    reciente = _doc(db_session, e, hace=timedelta(hours=23))
    viejo = _doc(db_session, e, hace=timedelta(hours=25))

    assert _post(client, db_session, e["recepcion"], reciente.id, "anular", motivo="Me equivoqué").status_code == 200
    r = _post(client, db_session, e["recepcion"], viejo.id, "anular", motivo="Me equivoqué")
    assert r.status_code == 403
    assert "24 horas" in r.json()["detail"]


def test_el_permiso_se_puede_conceder_a_recepcion(client, db_session, e):
    db_session.add(Permission(role="secretaria", action="documents.correct", is_granted=True, user_id=e["recepcion"].id))
    db_session.commit()
    doc = _doc(db_session, e, subio=e["doctora"], hace=timedelta(days=3))
    assert _post(client, db_session, e["recepcion"], doc.id, "anular", motivo="Error").status_code == 200


def test_anular_retira_el_aviso_de_documento_nuevo(client, db_session, e):
    doc = _doc(db_session, e)
    db_session.add(Notification(tenant_id=e["centro"].id, user_id=e["doctora"].id, type=NotificationType.DOCUMENT_UPLOADED,
                                title="Nuevo documento", message="x", entity_type="patient_document", entity_id=doc.id))
    db_session.commit()

    _post(client, db_session, e["doctora"], doc.id, "anular", motivo="Error")

    aviso = db_session.query(Notification).one()
    assert aviso.resolved_at is not None and aviso.is_read


def test_no_se_borra_fisicamente(client, db_session, e):
    doc = _doc(db_session, e)
    r = client.delete(f"{PREFIX}/documents/{doc.id}", headers=headers(db_session, e["admin"]))
    assert r.status_code == 405
    assert db_session.get(PatientDocument, doc.id) is not None


# --- Anulados y revertir -------------------------------------------------

def test_administracion_ve_los_anulados_y_revierte(client, db_session, e):
    doc = _doc(db_session, e)
    _post(client, db_session, e["doctora"], doc.id, "anular", motivo="Error")

    assert _lista(client, db_session, e["doctora"], e["ana"].id, anulados=True).status_code == 403
    anulados = _lista(client, db_session, e["admin"], e["ana"].id, anulados=True).json()
    assert [d["id"] for d in anulados] == [doc.id]
    # El médico no puede revertir.
    assert _post(client, db_session, e["doctora"], doc.id, "revertir-anulacion", motivo="Era suyo").status_code == 404

    r = _post(client, db_session, e["admin"], doc.id, "revertir-anulacion", motivo="Sí era suyo")
    assert r.status_code == 200, r.text
    assert r.json()["anulado_at"] is None
    assert [d["id"] for d in _lista(client, db_session, e["admin"], e["ana"].id).json()] == [doc.id]
    [rastro] = _bitacora(db_session, "document.void_reverted")
    assert rastro.reason == "Sí era suyo"


# --- Mover ----------------------------------------------------------------

def test_mover_a_la_paciente_correcta_deja_rastro_en_las_dos(client, db_session, e):
    doc = _doc(db_session, e)

    r = _post(client, db_session, e["doctora"], doc.id, "mover", patient_id=e["berta"].id, motivo="Se subió a Ana por error")

    assert r.status_code == 200, r.text
    assert r.json()["patient_id"] == e["berta"].id
    assert r.json()["movido_desde_patient_id"] == e["ana"].id
    assert _lista(client, db_session, e["doctora"], e["ana"].id).json() == []
    assert [d["id"] for d in _lista(client, db_session, e["doctora"], e["berta"].id).json()] == [doc.id]
    [salida] = _bitacora(db_session, "document.moved_out")
    [entrada] = _bitacora(db_session, "document.moved_in")
    assert salida.patient_id == e["ana"].id and entrada.patient_id == e["berta"].id
    assert salida.details == {"desde_patient_id": e["ana"].id, "hacia_patient_id": e["berta"].id, "title": "Biometría"}


def test_no_se_mueve_a_otra_sucursal(client, db_session, e):
    doc = _doc(db_session, e)
    r = _post(client, db_session, e["admin"], doc.id, "mover", patient_id=e["ajena"].id, motivo="x x")
    assert r.status_code == 404
    db_session.refresh(doc)
    assert doc.patient_id == e["ana"].id


def test_otra_sucursal_no_ve_ni_corrige(client, db_session, e):
    doc = _doc(db_session, e)
    assert _post(client, db_session, e["admin_otra"], doc.id, "anular", motivo="Error").status_code == 404


# --- Archivo de un resultado de orden ------------------------------------

def test_el_archivo_de_un_resultado_de_orden_no_se_anula_ni_se_mueve(client, db_session, e):
    doc = _doc(db_session, e)
    orden = DiagnosticOrder(tenant_id=e["centro"].id, patient_id=e["ana"].id, doctor_id=e["doctora"].id,
                            category="laboratorio", study_name="Biometría", clinical_indication="Control",
                            requested_on=date(2026, 10, 1), status="result_received")
    db_session.add(orden)
    db_session.commit()
    db_session.add(DiagnosticResult(tenant_id=e["centro"].id, diagnostic_order_id=orden.id,
                                    recorded_by_user_id=e["recepcion"].id, patient_document_id=doc.id))
    db_session.commit()

    for accion, cuerpo in (("anular", {"motivo": "Error"}), ("mover", {"motivo": "Error", "patient_id": e["berta"].id})):
        r = _post(client, db_session, e["doctora"], doc.id, accion, **cuerpo)
        assert r.status_code == 409, accion
        assert f"orden n.º {orden.id}" in r.json()["detail"]
    db_session.refresh(doc)
    assert doc.anulado_at is None and doc.patient_id == e["ana"].id


# --- Quién corrige (plan 32, revisión del punto 7) --------------------------

def test_recepcion_no_mueve_lo_que_no_subio_ni_lo_suyo_pasadas_24_horas(client, db_session, e):
    ajeno = _doc(db_session, e, subio=e["doctora"])
    viejo = _doc(db_session, e, hace=timedelta(hours=25))
    for doc in (ajeno, viejo):
        r = _post(client, db_session, e["recepcion"], doc.id, "mover", patient_id=e["berta"].id, motivo="Error")
        assert r.status_code == 403
        db_session.refresh(doc)
        assert doc.patient_id == e["ana"].id


def test_revertir_es_solo_de_la_administracion_aunque_se_conceda_el_permiso(client, db_session, e):
    db_session.add(Permission(role="secretaria", action="documents.correct", is_granted=True, user_id=e["recepcion"].id))
    db_session.commit()
    doc = _doc(db_session, e)
    assert _post(client, db_session, e["doctora"], doc.id, "anular", motivo="Error").status_code == 200
    r = _post(client, db_session, e["recepcion"], doc.id, "revertir-anulacion", motivo="Era suyo")
    assert r.status_code in (403, 404)
    db_session.refresh(doc)
    assert doc.anulado_at is not None


def test_la_administracion_sin_el_permiso_no_revierte(client, db_session, e):
    db_session.add(Permission(role="admin", action="documents.correct", is_granted=False, user_id=e["admin"].id))
    db_session.commit()
    doc = _doc(db_session, e)
    _post(client, db_session, e["doctora"], doc.id, "anular", motivo="Error")
    assert _post(client, db_session, e["admin"], doc.id, "revertir-anulacion", motivo="x").status_code == 403
