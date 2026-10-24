"""Las imágenes de la paciente en una sola lista, sin mover datos (plan 32, punto 6).

- La lista combinada no pierde ni repite nada, y va por fecha.
- Permisos por origen: recepción no ve fotos clínicas; ve los estudios de
  imagen que ella recibió.
- Lo anulado no aparece.
"""
from datetime import datetime

from app.models.clinical_image import ClinicalImage
from app.models.clinical_tracking import DiagnosticResult
from app.models.patient_document import DocumentType, PatientDocument

from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _orden,
    client,
    db_session,
    escenario,
)


def _foto(db, e, categoria, cuando):
    img = ClinicalImage(tenant_id=e["tenant"].id, patient_id=e["paciente"].id, uploaded_by_user_id=e["doctora"].id,
                        category=categoria, taken_at=cuando, consent_obtained=True, file_path="x.jpg",
                        file_name="foto.jpg", file_size=10, mime_type="image/jpeg")
    db.add(img)
    db.commit()
    return img


def _estudio(db, e, titulo, cuando, subio, **extra):
    doc = PatientDocument(patient_id=e["paciente"].id, tenant_id=e["tenant"].id, uploaded_by_user_id=subio.id,
                          document_type=DocumentType.IMAGING_STUDY, title=titulo, file_path="x.pdf",
                          file_name=f"{titulo}.pdf", mime_type="application/pdf", **extra)
    db.add(doc)
    db.commit()
    doc.created_at = cuando
    db.commit()
    return doc


def _lista(client, db, quien, e, **params):
    r = client.get(f"{PREFIX}/patients/{e['paciente'].id}/imagenes", headers=_auth_headers(db, quien), params=params)
    assert r.status_code == 200, r.text
    return r.json(), int(r.headers["X-Total-Count"])


def test_junta_las_dos_fuentes_por_fecha_sin_perder_ni_repetir(client, db_session, escenario):
    e = escenario
    foto = _foto(db_session, e, "clinical_photo", datetime(2026, 9, 1, 10))
    us = _foto(db_session, e, "ultrasound", datetime(2026, 9, 20, 10))
    externo = _estudio(db_session, e, "RX de tórax", datetime(2026, 9, 10, 10), e["secretaria"])
    orden = _orden(db_session, e["tenant"], e["paciente"], e["doctora"], study_name="Mastografía bilateral", category="breast")
    de_orden = _estudio(db_session, e, "Resultado: Mastografía", datetime(2026, 9, 25, 10), e["secretaria"])
    db_session.add(DiagnosticResult(tenant_id=orden.tenant_id, diagnostic_order_id=orden.id,
                                    recorded_by_user_id=e["secretaria"].id, patient_document_id=de_orden.id,
                                    review_status="received"))
    db_session.commit()

    items, total = _lista(client, db_session, e["doctora"], e)
    assert total == 4
    assert [(i["origen"], i["id"]) for i in items] == [
        ("resultado", de_orden.id), ("consulta", us.id), ("documento", externo.id), ("consulta", foto.id),
    ]
    por_id = {(i["origen"], i["id"]): i for i in items}
    assert por_id[("resultado", de_orden.id)]["categoria"] == "mastografia"
    assert por_id[("resultado", de_orden.id)]["order_id"] == orden.id
    assert por_id[("documento", externo.id)]["categoria"] == "rayos_x"
    assert por_id[("consulta", us.id)]["categoria_texto"] == "Ultrasonido"


def test_filtra_por_categoria_y_anio(client, db_session, escenario):
    e = escenario
    _foto(db_session, e, "ultrasound", datetime(2025, 5, 1, 10))
    _foto(db_session, e, "ultrasound", datetime(2026, 5, 1, 10))
    _foto(db_session, e, "clinical_photo", datetime(2026, 5, 2, 10))
    items, total = _lista(client, db_session, e["doctora"], e, categoria="ultrasonido", anio=2026)
    assert total == 1 and items[0]["categoria"] == "ultrasonido"


def test_recepcion_no_ve_fotos_clinicas_y_solo_los_estudios_que_recibio(client, db_session, escenario):
    e = escenario
    _foto(db_session, e, "clinical_photo", datetime(2026, 9, 1, 10))
    suyo = _estudio(db_session, e, "US que recibió", datetime(2026, 9, 2, 10), e["secretaria"])
    ajeno = _estudio(db_session, e, "US de la doctora", datetime(2026, 9, 3, 10), e["doctora"])
    orden = _orden(db_session, e["tenant"], e["paciente"], e["doctora"], category="obstetric")
    db_session.add(DiagnosticResult(tenant_id=orden.tenant_id, diagnostic_order_id=orden.id,
                                    recorded_by_user_id=e["doctora"].id, patient_document_id=ajeno.id,
                                    review_status="received"))
    db_session.commit()
    items, _ = _lista(client, db_session, e["secretaria"], e)
    assert [i["id"] for i in items] == [suyo.id]


def test_lo_anulado_y_lo_archivado_no_aparecen(client, db_session, escenario):
    e = escenario
    img = _foto(db_session, e, "clinical_photo", datetime(2026, 9, 1, 10))
    img.is_archived = True
    _estudio(db_session, e, "Anulado", datetime(2026, 9, 2, 10), e["doctora"], anulado_at=datetime(2026, 9, 3))
    db_session.commit()
    items, total = _lista(client, db_session, e["doctora"], e)
    assert total == 0 and items == []


def test_otra_sucursal_no_llega(client, db_session, escenario):
    e = escenario
    r = client.get(f"{PREFIX}/patients/{e['paciente'].id}/imagenes", headers=_auth_headers(db_session, e["secretaria_ajena"]))
    assert r.status_code == 404
