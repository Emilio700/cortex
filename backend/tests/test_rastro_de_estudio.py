"""El rastro de cada estudio, con fecha y autor (plan 32, punto 3).

Lo viejo que no guardó autor dice «sin registro» (autor None), no se inventa.
"""
from datetime import date, datetime, timedelta

from app.db.session import utcnow
from app.models.acceso_clinico import AccesoClinico
from app.models.audit_log import AuditLog
from app.models.clinical_tracking import DiagnosticOrderFollowUp, DiagnosticResult

from test_bandeja_por_paciente import _pedir  # noqa: F401
from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _orden,
    client,
    db_session,
    escenario,
)


def _rastro(client, db, quien, orden):
    return client.get(f"{PREFIX}/clinical-tracking/orders/{orden.id}/rastro", headers=_auth_headers(db, quien))


def _resultado(db, orden, por, **extra):
    extra.setdefault("review_status", "received")
    r = DiagnosticResult(tenant_id=orden.tenant_id, diagnostic_order_id=orden.id, recorded_by_user_id=por.id, **extra)
    db.add(r)
    orden.status = "result_received"
    db.commit()
    return r


def test_la_linea_de_tiempo_trae_cada_paso_con_su_autor(client, db_session, escenario):
    e = escenario
    orden = _orden(db_session, e["tenant"], e["paciente"], e["doctora"])
    db_session.add(AuditLog(tenant_id=orden.tenant_id, actor_user_id=e["secretaria"].id, action="diagnostic_order.printed",
                            entity_type="diagnostic_order", entity_id=orden.id, patient_id=orden.patient_id,
                            details={"order_ids": [orden.id], "folio": "GG-ORD-2026-1", "accion": "imprimir"}))
    db_session.add(DiagnosticOrderFollowUp(tenant_id=orden.tenant_id, diagnostic_order_id=orden.id, motivo="reagendado",
                                           revisar_el=date(2026, 12, 1), registrado_por_user_id=e["secretaria"].id))
    db_session.commit()
    resultado = _resultado(db_session, orden, e["secretaria"])

    r = client.patch(f"{PREFIX}/clinical-tracking/results/{resultado.id}",
                     json={"review_status": "reviewed", "clinician_interpretation": "Sin hallazgos"},
                     headers=_auth_headers(db_session, e["doctora"]))
    assert r.status_code == 200, r.text
    r = client.patch(f"{PREFIX}/clinical-tracking/results/{resultado.id}",
                     json={"clinician_interpretation": "Sin hallazgos relevantes"},
                     headers=_auth_headers(db_session, e["doctora"]))
    assert r.status_code == 200, r.text

    cuerpo = _rastro(client, db_session, e["doctora"], orden).json()
    tipos = [ev["tipo"] for ev in cuerpo["eventos"]]
    for esperado in ("solicitud", "impresion", "seguimiento", "resultado", "escrito", "editado", "revisado"):
        assert esperado in tipos, esperado
    por_tipo = {ev["tipo"]: ev for ev in cuerpo["eventos"]}
    assert por_tipo["impresion"]["autor"] == e["secretaria"].full_name
    assert por_tipo["impresion"]["detalle"] == "GG-ORD-2026-1"
    assert por_tipo["escrito"]["autor"] == por_tipo["editado"]["autor"] == e["doctora"].full_name
    assert cuerpo["ultima_actualizacion"]["tipo"] in ("editado", "revisado")


def test_reenviar_el_mismo_texto_no_es_editarlo(client, db_session, escenario):
    e = escenario
    orden = _orden(db_session, e["tenant"], e["paciente"], e["doctora"])
    resultado = _resultado(db_session, orden, e["doctora"])
    h = _auth_headers(db_session, e["doctora"])
    for _ in range(2):
        client.patch(f"{PREFIX}/clinical-tracking/results/{resultado.id}", json={"clinician_interpretation": "Igual"}, headers=h)
    db_session.refresh(resultado)
    assert resultado.interpretacion_escrita_at is not None
    assert resultado.interpretacion_editada_at is None


def test_lo_viejo_sin_autor_dice_sin_registro(client, db_session, escenario):
    e = escenario
    orden = _orden(db_session, e["tenant"], e["paciente"], e["doctora"])
    # Revisado antes de que se guardara quién: fecha sí, autor no.
    _resultado(db_session, orden, e["doctora"], reviewed_at=utcnow() - timedelta(days=30), review_status="reviewed")
    eventos = _rastro(client, db_session, e["doctora"], orden).json()["eventos"]
    revisado = next(ev for ev in eventos if ev["tipo"] == "revisado")
    assert revisado["autor"] is None


def test_la_fila_de_la_bandeja_dice_su_ultima_actualizacion_y_los_autores(client, db_session, escenario):
    e = escenario
    orden = _orden(db_session, e["tenant"], e["paciente"], e["doctora"])
    _resultado(db_session, orden, e["secretaria"], communicated_at=utcnow() + timedelta(minutes=5), communicated_by_user_id=e["doctora"].id,
               communication_channel="whatsapp")
    fila = next(o for item in _pedir(client, db_session, e["doctora"], filtro="todos")["items"]
                for o in item["orders"] if o["id"] == orden.id)
    assert fila["ultima_actualizacion_por"] == e["doctora"].full_name
    assert fila["ultima_actualizacion_at"]
    res = fila["results"][0]
    assert res["recorded_by_nombre"] == e["secretaria"].full_name
    assert res["communicated_by_nombre"] == e["doctora"].full_name


def test_alcance_y_bitacora_de_accesos(client, db_session, escenario):
    e = escenario
    orden = _orden(db_session, e["tenant"], e["paciente"], e["doctora"])
    assert _rastro(client, db_session, e["doctora_ajena"], orden).status_code == 404
    assert _rastro(client, db_session, e["colega"], orden).status_code == 403
    assert _rastro(client, db_session, e["doctora"], orden).status_code == 200
    assert db_session.query(AccesoClinico).filter_by(user_id=e["doctora"].id, seccion="estudios").count() == 1
