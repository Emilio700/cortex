"""Folios homologados por clínica y tipo (plan 32).

``{CLÍNICA}-{TIPO}-{AÑO}-{CONSECUTIVO}``, consecutivo por clínica, tipo y año
del consultorio; lo ya emitido no se renumera; cada folio queda en la bitácora
y la administración lo verifica en Auditoría.
"""
from datetime import date, datetime

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.hora_local import hoy_local
from app.models.audit_log import AuditLog
from app.models.clinical_tracking import DiagnosticOrder
from app.models.folio_emitido import FolioEmitido, TipoDeFolio
from app.models.prescription import Prescription
from app.models.tenant import Tenant
from app.models.user import Role
from app.services import folio_service

from _cobros_base import PREFIX, cita, client, db_session, headers, paciente, usuario  # noqa: F401
from test_orden_estudio_pdf import _pdf_sin_comprimir, _texto_del_pdf  # noqa: F401 (fixture)

ANIO = hoy_local().year


@pytest.fixture
def e(db_session):
    gyg = Tenant(name="Ginecología y Obstetricia", is_active=True, codigo_folio="GYG")
    sig = Tenant(name="San Ignacio", is_active=True, codigo_folio="SIG")
    db_session.add_all([gyg, sig])
    db_session.commit()
    doctora = usuario(db_session, gyg, "Cintia", Role.DOCTOR)
    doctora_sig = usuario(db_session, sig, "Sara", Role.DOCTOR)
    admin = usuario(db_session, gyg, "Admin", Role.ADMIN)
    admin_sig = usuario(db_session, sig, "Admin SIG", Role.ADMIN)
    master = usuario(db_session, gyg, "Master", Role.MASTER)
    ana = paciente(db_session, gyg, doctora, "Ana")
    berta = paciente(db_session, sig, doctora_sig, "Berta")
    return {"gyg": gyg, "sig": sig, "doctora": doctora, "doctora_sig": doctora_sig, "admin": admin,
            "admin_sig": admin_sig, "master": master, "ana": ana, "berta": berta,
            "cita": cita(db_session, gyg, ana, doctora), "cita_sig": cita(db_session, sig, berta, doctora_sig)}


def _receta(client, db, doctora, c, pac):
    r = client.post(f"{PREFIX}/prescriptions", headers=headers(db, doctora), json={
        "appointment_id": c.id, "patient_id": pac.id,
        "medications": [{"name": "ÁCIDO FÓLICO", "dosage": "5 MG", "frequency": "CADA 24 HORAS", "duration": "30 DÍAS"}],
        "instructions": "Control en un mes",
    })
    assert r.status_code == 201, r.text
    return r.json()


def test_la_receta_nace_con_el_formato_nuevo_y_queda_en_la_bitacora(client, db_session, e):
    receta = _receta(client, db_session, e["doctora"], e["cita"], e["ana"])
    assert receta["folio_number"] == f"GYG-REC-{ANIO}-0001"
    fila = db_session.query(FolioEmitido).one()
    assert (fila.tipo, fila.patient_id, fila.emitted_by_user_id, fila.entity_type, fila.entity_id) == (
        TipoDeFolio.RECETA, e["ana"].id, e["doctora"].id, "prescription", receta["id"])


def test_el_consecutivo_es_por_clinica_y_por_tipo(client, db_session, e):
    _receta(client, db_session, e["doctora"], e["cita"], e["ana"])
    segunda = _receta(client, db_session, e["doctora"], cita(db_session, e["gyg"], e["ana"], e["doctora"]), e["ana"])
    otra_clinica = _receta(client, db_session, e["doctora_sig"], e["cita_sig"], e["berta"])
    assert segunda["folio_number"] == f"GYG-REC-{ANIO}-0002"
    assert otra_clinica["folio_number"] == f"SIG-REC-{ANIO}-0001"
    assert folio_service.generate_certificate_folio(db_session, e["gyg"].id) == f"GYG-CER-{ANIO}-0001"


def test_lo_ya_emitido_no_se_renumera(client, db_session, e):
    vieja = Prescription(tenant_id=e["gyg"].id, appointment_id=e["cita"].id, doctor_id=e["doctora"].id,
                         patient_id=e["ana"].id, folio_number=f"REC-{e['gyg'].id}-{ANIO}-0042",
                         medications=[{"name": "PARACETAMOL"}])
    db_session.add(vieja)
    db_session.commit()
    nueva = _receta(client, db_session, e["doctora"], cita(db_session, e["gyg"], e["ana"], e["doctora"]), e["ana"])
    db_session.refresh(vieja)
    assert vieja.folio_number == f"REC-{e['gyg'].id}-{ANIO}-0042"
    assert nueva["folio_number"] == f"GYG-REC-{ANIO}-0001"


def test_el_anio_es_el_del_consultorio_la_noche_del_31(db_session, e, monkeypatch):
    from _reloj import servidor_en_utc

    # 20:00 del 31 de diciembre en Mazatlán = 03:00 del 1 de enero en UTC.
    servidor_en_utc(monkeypatch, datetime(2027, 1, 1, 3, 0), folio_service)
    assert folio_service.generate_prescription_folio(db_session, e["gyg"].id) == "GYG-REC-2026-0001"


def test_sin_codigo_configurado_usa_el_numero_de_sucursal(db_session):
    t = Tenant(name="Nueva", is_active=True)
    db_session.add(t)
    db_session.commit()
    assert folio_service.generate_prescription_folio(db_session, t.id).startswith(f"S{t.id}-REC-")


def test_si_dos_se_ganan_el_mismo_numero_el_segundo_reintenta(db_session, e):
    """El índice único de la serie rechaza al segundo y ``guardar_con_folio``
    vuelve a pedir número. Se simula el empate metiendo, en la misma
    transacción, otra fila con el consecutivo que se acaba de calcular."""
    intentos = []

    def generar():
        folio = folio_service.generate_prescription_folio(db_session, e["gyg"].id)
        if not intentos:
            db_session.add(FolioEmitido(folio="OTRO-PROCESO", tenant_id=e["gyg"].id, tipo="REC", anio=ANIO,
                                        consecutivo=1))
        intentos.append(folio)
        return folio

    guardada = folio_service.guardar_con_folio(
        db_session, generar_folio=generar,
        construir=lambda folio: Prescription(tenant_id=e["gyg"].id, appointment_id=e["cita"].id,
                                             doctor_id=e["doctora"].id, patient_id=e["ana"].id,
                                             folio_number=folio, medications=[{"name": "X"}]),
    )
    assert len(intentos) == 2
    assert guardada.folio_number == f"GYG-REC-{ANIO}-0001"
    assert db_session.query(FolioEmitido).count() == 1


def test_el_indice_unico_no_deja_dos_folios_iguales_en_la_serie(db_session, e):
    db_session.add_all([
        FolioEmitido(folio="A", tenant_id=e["gyg"].id, tipo="REC", anio=ANIO, consecutivo=5),
        FolioEmitido(folio="B", tenant_id=e["gyg"].id, tipo="REC", anio=ANIO, consecutivo=5),
    ])
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_el_folio_sale_impreso_en_la_receta(client, db_session, e):
    receta = _receta(client, db_session, e["doctora"], e["cita"], e["ana"])
    r = client.get(f"{PREFIX}/prescriptions/{receta['id']}/pdf", headers=headers(db_session, e["doctora"]))
    assert r.status_code == 200, r.text
    assert f"GYG-REC-{ANIO}-0001" in _texto_del_pdf(r.content)


# ── Papel de órdenes ──────────────────────────────────────────────────────


def _orden(db, e, estudio):
    o = DiagnosticOrder(tenant_id=e["gyg"].id, patient_id=e["ana"].id, doctor_id=e["doctora"].id,
                        appointment_id=e["cita"].id, category="laboratorio", study_name=estudio,
                        clinical_indication="Control", requested_on=date(2026, 10, 1), status="ordered")
    db.add(o)
    db.commit()
    return o


def _papel(client, db, e):
    r = client.get(f"{PREFIX}/clinical-tracking/appointments/{e['cita'].id}/orders/pdf",
                   headers=headers(db, e["doctora"]))
    assert r.status_code == 200, r.text
    import re

    return re.search(r"Orden_de_estudios_(.+)\.pdf", r.headers["content-disposition"]).group(1), r


def test_el_papel_de_ordenes_pasa_a_ord_y_reimprimirlo_da_el_mismo(client, db_session, e):
    a = _orden(db_session, e, "Biometría")
    folio, r = _papel(client, db_session, e)
    assert folio == f"GYG-ORD-{ANIO}-0001"
    texto = _texto_del_pdf(r.content)
    assert f"FOLIO: {folio}" in texto and f"Orden n.º {a.id}" in texto
    assert _papel(client, db_session, e)[0] == folio
    _orden(db_session, e, "Glucosa")
    assert _papel(client, db_session, e)[0] == f"GYG-ORD-{ANIO}-0002"


def test_el_papel_ya_impreso_antes_conserva_su_folio(client, db_session, e):
    a = _orden(db_session, e, "Biometría")
    db_session.add(AuditLog(action="diagnostic_order.batch_pdf_generated", entity_type="appointment",
                            entity_id=e["cita"].id, actor_user_id=e["doctora"].id, tenant_id=e["gyg"].id,
                            details={"order_ids": [a.id], "folio": f"C-{e['cita'].id}"}))
    db_session.commit()
    assert _papel(client, db_session, e)[0] == f"C-{e['cita'].id}"
    assert db_session.query(FolioEmitido).count() == 0


def test_registrar_la_impresion_anota_el_folio_que_salio(client, db_session, e):
    a = _orden(db_session, e, "Biometría")
    folio, _ = _papel(client, db_session, e)
    r = client.post(f"{PREFIX}/clinical-tracking/orders/print-record", headers=headers(db_session, e["doctora"]),
                    json={"order_ids": [a.id], "folio": f"C-{e['cita'].id}", "accion": "impreso"})
    assert r.status_code == 201, r.text
    registro = (db_session.query(AuditLog).filter(AuditLog.details.isnot(None))
                .order_by(AuditLog.id.desc()).first())
    assert registro.details["folio"] == folio


# ── Verificación en Auditoría y código de la sucursal ─────────────────────


def test_admin_verifica_un_folio_de_su_clinica(client, db_session, e):
    _receta(client, db_session, e["doctora"], e["cita"], e["ana"])
    _receta(client, db_session, e["doctora_sig"], e["cita_sig"], e["berta"])
    r = client.get(f"{PREFIX}/audit-logs/folios", params={"folio": "rec-"}, headers=headers(db_session, e["admin"]))
    assert r.status_code == 200, r.text
    [item] = r.json()["items"]
    assert item["folio"] == f"GYG-REC-{ANIO}-0001"
    assert (item["tipo_nombre"], item["patient_name"], item["emitted_by_name"]) == ("Receta", "Ana De Prueba", "Cintia")
    assert client.get(f"{PREFIX}/audit-logs/folios", headers=headers(db_session, e["doctora"])).status_code == 403


def test_un_folio_de_antes_se_confirma_escribiendolo_completo(client, db_session, e):
    db_session.add(Prescription(tenant_id=e["gyg"].id, appointment_id=e["cita"].id, doctor_id=e["doctora"].id,
                                patient_id=e["ana"].id, folio_number="REC-1-2026-0042", medications=[{"name": "X"}]))
    db_session.commit()
    [item] = client.get(f"{PREFIX}/audit-logs/folios", params={"folio": "REC-1-2026-0042"},
                        headers=headers(db_session, e["admin"])).json()["items"]
    assert item["homologado"] is False and item["patient_name"] == "Ana De Prueba"
    otra = client.get(f"{PREFIX}/audit-logs/folios", params={"folio": "REC-1-2026-0042"},
                      headers=headers(db_session, e["admin_sig"])).json()
    assert otra["items"] == []


def test_master_configura_el_codigo_de_la_sucursal(client, db_session, e):
    h = headers(db_session, e["master"])
    r = client.put(f"{PREFIX}/tenants/{e['gyg'].id}", headers=h, json={"codigo_folio": "gy"})
    assert r.status_code == 200, r.text
    assert r.json()["codigo_folio"] == "GY"
    assert client.put(f"{PREFIX}/tenants/{e['gyg'].id}", headers=h, json={"codigo_folio": "G1"}).status_code == 422
    assert client.put(f"{PREFIX}/tenants/{e['gyg'].id}", headers=h, json={"codigo_folio": "SIG"}).status_code == 400


def test_el_papel_de_ordenes_dice_su_folio_en_x_folio(client, db_session, e):
    """La pantalla nombra la descarga con el folio impreso, no con C-/G-."""
    _orden(db_session, e, "Biometría")
    folio, r = _papel(client, db_session, e)
    assert r.headers["x-folio"] == folio == f"GYG-ORD-{ANIO}-0001"


def test_el_navegador_puede_leer_el_folio_y_el_nombre_del_archivo():
    from starlette.middleware.cors import CORSMiddleware

    from app.main import app

    cors = next(m for m in app.user_middleware if m.cls is CORSMiddleware)
    expuestas = {h.lower() for h in cors.kwargs["expose_headers"]}
    assert {"x-folio", "content-disposition"} <= expuestas
