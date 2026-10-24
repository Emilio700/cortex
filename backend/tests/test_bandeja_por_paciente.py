"""La bandeja de órdenes del médico, agrupada por paciente (plan 26, B-1, B-7, B-9, D-3).

Kenia Peraza aparecía en tres tarjetas, una por estudio, y la paginación por
orden la podía partir entre páginas. Ahora se paginan pacientes: cada una
llega completa, con todas sus órdenes y todos sus resultados.
"""
from datetime import date

import pytest
from sqlalchemy import event

from app.models.clinical_tracking import DiagnosticResult
from app.models.patient import Patient
from app.models.patient_document import DocumentType, PatientDocument

from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _orden,
    client,
    db_session,
    escenario,
)

RUTA = f"{PREFIX}/clinical-tracking/orders/inbox-by-patient"


def _paciente(db, escenario, nombre, apellidos, doctora=None):
    paciente = Patient(tenant_id=escenario["tenant"].id, first_name=nombre, last_name=apellidos,
                       owner_doctor_id=(doctora or escenario["doctora"]).id)
    db.add(paciente)
    db.commit()
    return paciente


def _resultado(db, orden, *, critico=False, comunicado=False, revisado=False, archivo=None):
    documento = None
    if archivo:
        documento = PatientDocument(
            patient_id=orden.patient_id, tenant_id=orden.tenant_id, uploaded_by_user_id=orden.doctor_id,
            document_type=DocumentType.LAB_RESULT, title="Resultado", file_path=f"uploads/{archivo[0]}",
            file_name=archivo[0], file_size=10, mime_type=archivo[1],
        )
        db.add(documento)
        db.flush()
    from app.db.session import utcnow

    resultado = DiagnosticResult(
        tenant_id=orden.tenant_id, diagnostic_order_id=orden.id, recorded_by_user_id=orden.doctor_id,
        patient_document_id=documento.id if documento else None, is_critical=critico,
        review_status="communicated" if comunicado else "reviewed" if revisado else "received",
        communicated_at=utcnow() if comunicado else None,
        reviewed_at=utcnow() if (revisado or comunicado) else None,
    )
    db.add(resultado)
    orden.status = "reviewed" if (revisado or comunicado) else "result_received"
    db.commit()
    return resultado


def _pedir(client, db, quien, **params):
    respuesta = client.get(RUTA, params=params, headers=_auth_headers(db, quien))
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


def test_una_paciente_con_tres_estudios_es_una_tarjeta(client, db_session, escenario):
    t, d = escenario["tenant"], escenario["doctora"]
    kenia = _paciente(db_session, escenario, "Kenia Ximena", "Peraza Durán")
    for estudio in ("VDRL / RPR", "HBsAg", "Hepatitis C"):
        _orden(db_session, t, kenia, d, study_name=estudio, priority="routine")

    cuerpo = _pedir(client, db_session, d, search="kenia peraza")

    assert cuerpo["total"] == 1
    tarjeta = cuerpo["items"][0]
    assert tarjeta["patient_name"] == "Kenia Ximena Peraza Durán"
    assert tarjeta["total_ordenes"] == 3
    assert [o["study_name"] for o in tarjeta["orders"]] == ["VDRL / RPR", "HBsAg", "Hepatitis C"]
    assert all(o["estado_visible"] == "pendiente" for o in tarjeta["orders"])


def test_pagina_pacientes_y_ninguna_queda_partida(client, db_session, escenario):
    t, d = escenario["tenant"], escenario["doctora"]
    for n in range(3):
        paciente = _paciente(db_session, escenario, f"Paciente{n}", "Prueba")
        for k in range(4):
            _orden(db_session, t, paciente, d, study_name=f"Estudio {k}", priority="routine")

    primera = _pedir(client, db_session, d, search="Prueba", limit=2)
    segunda = _pedir(client, db_session, d, search="Prueba", limit=2, skip=2)

    assert primera["total"] == 3
    assert len(primera["items"]) == 2 and len(segunda["items"]) == 1
    assert all(len(item["orders"]) == 4 for item in primera["items"] + segunda["items"])
    vistas = {item["patient_id"] for item in primera["items"] + segunda["items"]}
    assert len(vistas) == 3


def test_criticos_primero_y_luego_por_prioridad(client, db_session, escenario):
    t, d = escenario["tenant"], escenario["doctora"]
    rutina = _paciente(db_session, escenario, "Rutina", "Uno")
    _orden(db_session, t, rutina, d, priority="routine", requested_on=date(2026, 8, 1), desired_on=None)
    preferente = _paciente(db_session, escenario, "Preferente", "Dos")
    _orden(db_session, t, preferente, d, priority="preferential", desired_on=None)
    critica = _paciente(db_session, escenario, "Critica", "Tres")
    orden_critica = _orden(db_session, t, critica, d, priority="routine", desired_on=None)
    _resultado(db_session, orden_critica, critico=True)

    cuerpo = _pedir(client, db_session, d)

    nombres = [item["patient_name"] for item in cuerpo["items"]]
    # El paciente del escenario tiene una orden urgente.
    assert nombres == ["Critica Tres", "María López Pérez", "Preferente Dos", "Rutina Uno"]
    assert cuerpo["items"][0]["tiene_criticos"] is True
    assert cuerpo["items"][0]["orders"][0]["critico_sin_comunicar"] is True
    assert cuerpo["items"][1]["prioridad_maxima"] == "urgent"
    assert cuerpo["items"][2]["prioridad_maxima"] == "preferential"


def test_cada_orden_trae_todos_sus_resultados_con_su_archivo(client, db_session, escenario):
    orden = escenario["orden"]
    _resultado(db_session, orden, archivo=("reporte.pdf", "application/pdf"))
    _resultado(db_session, orden, critico=True, archivo=("usg.png", "image/png"))

    cuerpo = _pedir(client, db_session, escenario["doctora"])

    resultados = cuerpo["items"][0]["orders"][0]["results"]
    assert {(r["document_file_name"], r["document_mime_type"], r["is_critical"]) for r in resultados} == {
        ("reporte.pdf", "application/pdf", False), ("usg.png", "image/png", True),
    }
    assert all(r["patient_document_id"] and r["review_status"] == "received" for r in resultados)
    assert cuerpo["items"][0]["por_revisar"] == 1


@pytest.mark.parametrize("filtro,esperados", [
    ("pendientes", {"pendiente"}),
    # Una crítica también está por revisar o sin comunicar: los filtros se
    # cruzan, y «críticos» es el atajo para verlas solas.
    ("por_revisar", {"por_revisar", "critica_sin_revisar"}),
    ("sin_comunicar", {"revisada_sin_comunicar", "critica_comunicada_no"}),
    ("criticos", {"critica_comunicada_no", "critica_sin_revisar"}),
    ("activas", {"pendiente", "por_revisar", "revisada_sin_comunicar", "critica_comunicada_no", "critica_sin_revisar"}),
    ("todos", {"pendiente", "por_revisar", "revisada_sin_comunicar", "critica_comunicada_no", "critica_sin_revisar",
               "comunicada", "cancelada"}),
])
def test_filtros(client, db_session, escenario, filtro, esperados):
    t, p, d = escenario["tenant"], escenario["paciente"], escenario["doctora"]
    escenario["orden"].status = "draft"  # el borrador no sale ni en «todos»
    db_session.commit()
    _orden(db_session, t, p, d, study_name="pendiente")
    _resultado(db_session, _orden(db_session, t, p, d, study_name="por_revisar"))
    _resultado(db_session, _orden(db_session, t, p, d, study_name="revisada_sin_comunicar"), revisado=True)
    _resultado(db_session, _orden(db_session, t, p, d, study_name="comunicada"), comunicado=True)
    _resultado(db_session, _orden(db_session, t, p, d, study_name="critica_comunicada_no"), critico=True, revisado=True)
    _resultado(db_session, _orden(db_session, t, p, d, study_name="critica_sin_revisar"), critico=True)
    _orden(db_session, t, p, d, study_name="cancelada", status="cancelled")

    cuerpo = _pedir(client, db_session, d, filtro=filtro)

    vistos = {o["study_name"] for item in cuerpo["items"] for o in item["orders"]}
    assert vistos == esperados


def test_un_filtro_desconocido_es_422(client, db_session, escenario):
    respuesta = client.get(RUTA, params={"filtro": "inventado"}, headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 422


@pytest.mark.parametrize("quien", ["colega", "doctora_ajena"])
def test_otra_doctora_no_ve_las_ordenes_ajenas(client, db_session, escenario, quien):
    cuerpo = _pedir(client, db_session, escenario[quien])

    assert cuerpo == {"items": [], "total": 0, "skip": 0, "limit": 20}


def test_otra_sucursal_no_ve_nada_aunque_sea_administracion(client, db_session, escenario):
    from test_orden_estudio_pdf import _usuario
    from app.models.tenant import Tenant
    from app.models.user import Role

    otra = db_session.query(Tenant).filter(Tenant.name == "Otra sucursal").one()
    admin_ajeno = _usuario(db_session, otra, "admin2@gems.com", Role.ADMIN)

    assert _pedir(client, db_session, admin_ajeno)["total"] == 0
    assert _pedir(client, db_session, escenario["admin"])["total"] == 1


def test_sin_n_mas_1_las_consultas_no_crecen_con_las_ordenes(client, db_session, escenario):
    t, d = escenario["tenant"], escenario["doctora"]
    pacientes = [_paciente(db_session, escenario, f"Carga{n}", "Consultas") for n in range(2)]

    def contar():
        consultas = []
        motor = db_session.get_bind()

        def anotar(*_):
            consultas.append(1)

        event.listen(motor, "before_cursor_execute", anotar)
        try:
            _pedir(client, db_session, d, search="Consultas")
        finally:
            event.remove(motor, "before_cursor_execute", anotar)
        return len(consultas)

    for paciente in pacientes:
        _resultado(db_session, _orden(db_session, t, paciente, d), archivo=("a.pdf", "application/pdf"))
    pocas = contar()
    for paciente in pacientes:
        for _ in range(5):
            _resultado(db_session, _orden(db_session, t, paciente, d), archivo=("a.pdf", "application/pdf"))
    muchas = contar()

    assert muchas == pocas


def test_la_respuesta_del_resultado_trae_nombre_y_tipo_de_su_archivo(client, db_session, escenario):
    """Antes el botón decía siempre «archivo adjunto» y el visor no sabía el MIME (B-4)."""
    orden = escenario["orden"]
    previo = _resultado(db_session, orden, archivo=("biometria.pdf", "application/pdf"))
    headers = _auth_headers(db_session, escenario["doctora"])

    creado = client.post(
        f"{PREFIX}/clinical-tracking/orders/{orden.id}/results",
        json={"review_status": "received", "patient_document_id": previo.patient_document_id},
        headers=headers,
    )
    revisado = client.patch(
        f"{PREFIX}/clinical-tracking/results/{previo.id}", json={"review_status": "reviewed"}, headers=headers,
    )

    for respuesta in (creado, revisado):
        assert respuesta.status_code in (200, 201), respuesta.text
        assert respuesta.json()["document_file_name"] == "biometria.pdf"
        assert respuesta.json()["document_mime_type"] == "application/pdf"


def test_cada_orden_dice_de_que_cita_y_fecha_viene(client, db_session, escenario):
    """Plan 32, punto 3: «Lote G-3» solo no decía de qué consulta salió."""
    from datetime import datetime

    from app.models.appointment import Appointment, AppointmentStatus, AppointmentType

    t, d = escenario["tenant"], escenario["doctora"]
    ana = _paciente(db_session, escenario, "Ana Rastro", "Con Cita")
    cita = Appointment(
        tenant_id=t.id, patient_id=ana.id, doctor_id=d.id, scheduled_at=datetime(2026, 10, 1, 9, 30),
        duration_minutes=30, appointment_type=AppointmentType.CONSULTA, status=AppointmentStatus.ATENDIDA,
    )
    db_session.add(cita)
    db_session.commit()
    _orden(db_session, t, ana, d, study_name="Con cita", appointment_id=cita.id)
    _orden(db_session, t, ana, d, study_name="Suelta")

    tarjeta = _pedir(client, db_session, d, search="ana rastro")["items"][0]
    por_nombre = {o["study_name"]: o for o in tarjeta["orders"]}

    assert por_nombre["Con cita"]["cita_fecha"].startswith("2026-10-01T09:30")
    assert por_nombre["Con cita"]["cita_estado"] == "atendida"
    assert por_nombre["Suelta"]["cita_fecha"] is None
    assert por_nombre["Suelta"]["cita_estado"] is None
