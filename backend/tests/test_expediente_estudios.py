"""El historial de estudios del paciente para el expediente (O-08, parte API).

«¿Ya me hice el ultrasonido?» no se respondía desde el expediente: la consulta
sólo enseñaba las últimas tres órdenes y la bandeja sólo las pendientes.
``GET /clinical-tracking/patient/{id}/orders`` ya existía; aquí se comprueba
que sirve para el expediente: todas las órdenes, con estado, fechas,
resultados y el enlace a su archivo, paginado, con el mismo número de
consultas sin importar cuántos estudios tenga el paciente, y con la misma
regla de acceso que el resto del seguimiento.
"""
from datetime import date, timedelta

import pytest
from sqlalchemy import event

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


def _ruta(paciente) -> str:
    return f"{PREFIX}/clinical-tracking/patient/{paciente.id}/orders"


def _resultado(db, orden, autora, documento=None, **cambios):
    datos = dict(
        tenant_id=orden.tenant_id, diagnostic_order_id=orden.id, recorded_by_user_id=autora.id,
        review_status="received", patient_document_id=documento.id if documento else None,
    )
    datos.update(cambios)
    resultado = DiagnosticResult(**datos)
    db.add(resultado)
    db.commit()
    db.refresh(resultado)
    return resultado


def _documento(db, paciente, autora, nombre="bh.pdf"):
    documento = PatientDocument(
        patient_id=paciente.id, tenant_id=paciente.tenant_id, uploaded_by_user_id=autora.id,
        document_type=DocumentType.LAB_RESULT, title="Resultado", file_path=f"uploads/x/{nombre}",
        file_name=nombre, mime_type="application/pdf",
    )
    db.add(documento)
    db.commit()
    db.refresh(documento)
    return documento


def test_el_historial_trae_todas_las_ordenes_con_su_estado_resultados_y_archivo(client, db_session, escenario):
    doctora, paciente, secretaria = escenario["doctora"], escenario["paciente"], escenario["secretaria"]
    biometria = escenario["orden"]
    documento = _documento(db_session, paciente, secretaria)
    _resultado(db_session, biometria, secretaria, documento, resulted_on=date(2026, 10, 2))
    _resultado(
        db_session, biometria, doctora, review_status="reviewed",
        clinician_interpretation="Sin alteraciones", report_text="Hb 12.5",
    )
    cancelada = _orden(
        db_session, escenario["tenant"], paciente, doctora, study_name="Urocultivo",
        status="cancelled", status_reason="Orden duplicada",
    )

    respuesta = client.get(_ruta(paciente), headers=_auth_headers(db_session, doctora))

    assert respuesta.status_code == 200
    assert respuesta.headers["X-Total-Count"] == "2"
    ordenes = {o["id"]: o for o in respuesta.json()}
    assert ordenes[cancelada.id]["status"] == "cancelled"
    assert ordenes[cancelada.id]["status_reason"] == "Orden duplicada"
    assert ordenes[cancelada.id]["results"] == []
    resultados = ordenes[biometria.id]["results"]
    assert [r["review_status"] for r in resultados] == ["reviewed", "received"]  # el más reciente primero
    assert resultados[0]["clinician_interpretation"] == "Sin alteraciones"
    assert resultados[1]["patient_document_id"] == documento.id
    assert resultados[1]["document_file_name"] == "bh.pdf"
    assert resultados[1]["document_mime_type"] == "application/pdf"
    assert resultados[1]["resulted_on"] == "2026-10-02"
    assert ordenes[biometria.id]["requested_on"] == "2026-09-29"


def test_el_historial_se_pagina_y_dice_el_total(client, db_session, escenario):
    for n in range(29):
        _orden(db_session, escenario["tenant"], escenario["paciente"], escenario["doctora"], study_name=f"Estudio {n}")
    headers = _auth_headers(db_session, escenario["doctora"])

    primera = client.get(_ruta(escenario["paciente"]), headers=headers)
    segunda = client.get(_ruta(escenario["paciente"]), headers=headers, params={"skip": 25})

    assert primera.headers["X-Total-Count"] == "30"
    assert len(primera.json()) == 25
    assert len(segunda.json()) == 5
    assert not {o["id"] for o in primera.json()} & {o["id"] for o in segunda.json()}


def _consultas_de(client, db_session, ruta, headers) -> int:
    contador = {"n": 0}

    def contar(*_args, **_kwargs):
        contador["n"] += 1

    motor = db_session.get_bind()
    event.listen(motor, "before_cursor_execute", contar)
    try:
        respuesta = client.get(ruta, headers=headers)
    finally:
        event.remove(motor, "before_cursor_execute", contar)
    assert respuesta.status_code == 200
    return contador["n"]


def test_el_numero_de_consultas_no_crece_con_los_estudios(client, db_session, escenario):
    """Sin N+1: la misma cantidad de consultas con 1 orden que con 20 órdenes de 2 resultados."""
    doctora, paciente, secretaria = escenario["doctora"], escenario["paciente"], escenario["secretaria"]
    headers = _auth_headers(db_session, doctora)
    _resultado(db_session, escenario["orden"], secretaria, _documento(db_session, paciente, secretaria))
    # La primera lectura de la sesión crea su renglón en la bitácora de accesos
    # (plan 32, punto 7) y las siguientes solo lo suman: se mide ya en régimen.
    client.get(_ruta(paciente), headers=headers)
    con_una = _consultas_de(client, db_session, _ruta(paciente), headers)

    for n in range(19):
        orden = _orden(db_session, escenario["tenant"], paciente, doctora, study_name=f"Estudio {n}",
                       requested_on=date(2026, 9, 29) - timedelta(days=n))
        _resultado(db_session, orden, secretaria, _documento(db_session, paciente, secretaria, f"r{n}.pdf"))
        _resultado(db_session, orden, doctora, review_status="reviewed")
    con_veinte = _consultas_de(client, db_session, _ruta(paciente), headers)

    assert con_veinte == con_una


@pytest.mark.parametrize("quien, codigo", [
    ("colega", 403), ("secretaria", 403), ("doctora_ajena", 404), ("secretaria_ajena", 403), ("admin", 200),
])
def test_el_historial_respeta_el_alcance(client, db_session, escenario, quien, codigo):
    respuesta = client.get(_ruta(escenario["paciente"]), headers=_auth_headers(db_session, escenario[quien]))

    assert respuesta.status_code == codigo


def test_la_pantalla_puede_leer_el_total_aunque_la_api_este_en_otro_origen():
    """Sin exponerlo, el navegador recibe X-Total-Count pero no deja que el frontend lo lea."""
    from starlette.middleware.cors import CORSMiddleware

    from app.main import app

    (cors,) = [m for m in app.user_middleware if m.cls is CORSMiddleware]
    assert "X-Total-Count" in cors.kwargs["expose_headers"]
