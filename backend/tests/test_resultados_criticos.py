"""La incidencia crítica de la doctora autora (plan 26, D-3 y D-8).

Marcar «crítico» sólo pintaba un badge (B-6). Desde D-3 queda en el dashboard
de la doctora que pidió el estudio; D-8 fija cuándo se cierra: al comunicarle
el resultado a la paciente (con su medio) o al revisarlo en una consulta suya.
Revisarlo desde la bandeja, sin la paciente, NO la cierra. La misma regla vale
para /critical-results y para el filtro «críticos» de la bandeja.
"""
from datetime import datetime

import pytest

from app.models.appointment import Appointment
from test_resultado_adjunto import almacenamiento  # noqa: F401 (fixture: archivos a tmp)

from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _orden,
    client,
    db_session,
    escenario,
)

RUTA = f"{PREFIX}/clinical-tracking/critical-results"
BANDEJA = f"{PREFIX}/clinical-tracking/orders/inbox-by-patient"


def _registrar(client, db_session, escenario, orden, **datos):
    respuesta = client.post(
        f"{PREFIX}/clinical-tracking/orders/{orden.id}/results",
        json={"review_status": "received", "report_text": "Hb 6.1", **datos},
        headers=_auth_headers(db_session, escenario["doctora"]),
    )
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


def _revisar(client, db_session, escenario, resultado, codigo=200, **datos):
    respuesta = client.patch(
        f"{PREFIX}/clinical-tracking/results/{resultado['id']}", json=datos,
        headers=_auth_headers(db_session, escenario["doctora"]),
    )
    assert respuesta.status_code == codigo, respuesta.text
    return respuesta.json()


def _incidencias(client, db_session, quien):
    respuesta = client.get(RUTA, headers=_auth_headers(db_session, quien))
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


def _criticos_en_bandeja(client, db_session, escenario):
    respuesta = client.get(BANDEJA, params={"filtro": "criticos"}, headers=_auth_headers(db_session, escenario["doctora"]))
    assert respuesta.status_code == 200
    return respuesta.json()["total"]


def _cita(db_session, escenario, paciente=None, doctora=None, status="en_sala", dias=0):
    """Una cita de hoy (hora del consultorio), o ``dias`` antes o después."""
    from datetime import time, timedelta

    from app.core.hora_local import hoy_local

    cita = Appointment(
        tenant_id=escenario["tenant"].id, patient_id=(paciente or escenario["paciente"]).id,
        doctor_id=(doctora or escenario["doctora"]).id,
        scheduled_at=datetime.combine(hoy_local() + timedelta(days=dias), time(10, 0)), status=status,
    )
    db_session.add(cita)
    db_session.commit()
    return cita


def _adjuntar_como_recepcion(client, db_session, escenario):
    from test_upload_storage import VALID_PDF

    respuesta = client.post(
        f"{PREFIX}/clinical-tracking/orders/{escenario['orden'].id}/result-attachment",
        files={"file": ("bh.pdf", VALID_PDF, "application/pdf")},
        headers=_auth_headers(db_session, escenario["secretaria"]),
    )
    assert respuesta.status_code == 201, respuesta.text
    return {"id": respuesta.json()["result_id"]}


def test_el_critico_se_queda_abierto_aunque_la_doctora_lo_revise_en_la_bandeja(client, db_session, escenario, almacenamiento):
    """El escenario de la revisión final (B1): antes la incidencia nunca aparecía."""
    resultado = _adjuntar_como_recepcion(client, db_session, escenario)
    assert _incidencias(client, db_session, escenario["doctora"])["total"] == 0

    revisado = _revisar(client, db_session, escenario, resultado, review_status="reviewed",
                        valoracion="critico", clinician_interpretation="Hb 6.1, anemia severa")

    assert revisado["incidencia_abierta"] is True
    abiertas = _incidencias(client, db_session, escenario["doctora"])
    assert abiertas["total"] == 1
    incidencia = abiertas["items"][0]
    assert incidencia["result_id"] == resultado["id"]
    assert incidencia["patient_name"] == "María López Pérez"
    assert incidencia["study_name"] == "Biometría hemática completa"
    assert incidencia["valoracion"] == "critico"
    assert incidencia["review_status"] == "reviewed"
    assert _criticos_en_bandeja(client, db_session, escenario) == 1


def test_se_cierra_al_revisarlo_en_una_consulta_de_la_paciente(client, db_session, escenario, almacenamiento):
    resultado = _adjuntar_como_recepcion(client, db_session, escenario)
    _revisar(client, db_session, escenario, resultado, review_status="reviewed", valoracion="critico")
    cita = _cita(db_session, escenario)

    cerrado = _revisar(client, db_session, escenario, resultado, review_status="reviewed", appointment_id=cita.id)

    assert cerrado["incidencia_abierta"] is False
    assert cerrado["incidencia_cerrada_por"] == "consulta"
    assert cerrado["reviewed_in_appointment_id"] == cita.id
    assert _incidencias(client, db_session, escenario["doctora"])["total"] == 0
    assert _criticos_en_bandeja(client, db_session, escenario) == 0


@pytest.mark.parametrize("canal", ["en_mano", "llamada", "whatsapp", "correo"])
def test_se_cierra_al_comunicarlo_con_su_medio(client, db_session, escenario, canal):
    resultado = _registrar(client, db_session, escenario, escenario["orden"], valoracion="critico", review_status="reviewed")
    assert _incidencias(client, db_session, escenario["doctora"])["total"] == 1

    cerrado = _revisar(client, db_session, escenario, resultado, review_status="communicated",
                       communication_note="Se le explicó y se citó mañana", communication_channel=canal)

    assert cerrado["communication_channel"] == canal
    assert cerrado["incidencia_cerrada_por"] == "comunicacion"
    assert _incidencias(client, db_session, escenario["doctora"])["total"] == 0
    assert _criticos_en_bandeja(client, db_session, escenario) == 0


def test_comunicar_sin_medio_es_422(client, db_session, escenario):
    resultado = _registrar(client, db_session, escenario, escenario["orden"], valoracion="critico")

    _revisar(client, db_session, escenario, resultado, codigo=422, review_status="communicated",
             communication_note="Llamada")
    _revisar(client, db_session, escenario, resultado, codigo=422, review_status="communicated",
             communication_note="Llamada", communication_channel="paloma")
    assert _incidencias(client, db_session, escenario["doctora"])["total"] == 1


@pytest.mark.parametrize("caso", ["otra_paciente", "otra_doctora", "cancelada", "inexistente"])
def test_una_cita_ajena_o_cancelada_es_un_error(client, db_session, escenario, caso):
    from app.models.patient import Patient

    resultado = _registrar(client, db_session, escenario, escenario["orden"], valoracion="critico")
    if caso == "otra_paciente":
        otra = Patient(tenant_id=escenario["tenant"].id, first_name="Ana", last_name="Ruiz",
                       owner_doctor_id=escenario["doctora"].id)
        db_session.add(otra)
        db_session.commit()
        cita_id = _cita(db_session, escenario, paciente=otra).id
    elif caso == "otra_doctora":
        cita_id = _cita(db_session, escenario, doctora=escenario["colega"]).id
    elif caso == "cancelada":
        cita_id = _cita(db_session, escenario, status="cancelada").id
    else:
        cita_id = 9999

    _revisar(client, db_session, escenario, resultado, codigo=422, review_status="reviewed", appointment_id=cita_id)
    assert _incidencias(client, db_session, escenario["doctora"])["total"] == 1


@pytest.mark.parametrize("dias,status,cierra", [
    (0, "agendada", True),        # consulta de hoy
    (-1, "en_sala", True),        # la de las 23:30 que se revisa a las 00:05, o la de ayer que sigue abierta
    (-1, "atendida", False),      # ayer, ya terminada (o reabierta después)
    (-1, "agendada", False),
    (1, "agendada", False),       # futura
    (-60, "en_sala", False),      # hace meses, aunque nadie la haya cerrado
])
def test_la_revision_se_guarda_siempre_y_la_cita_decide_el_cierre(client, db_session, escenario, dias, status, cierra):
    from app.models.clinical_tracking import DiagnosticOrder

    resultado = _registrar(client, db_session, escenario, escenario["orden"], valoracion="critico")
    cita = _cita(db_session, escenario, dias=dias, status=status)

    revisado = _revisar(client, db_session, escenario, resultado, review_status="reviewed",
                        clinician_interpretation="Revisado en consulta", appointment_id=cita.id)

    assert revisado["clinician_interpretation"] == "Revisado en consulta"
    assert db_session.get(DiagnosticOrder, escenario["orden"].id).status == "reviewed"
    assert revisado["cierre_en_consulta"] == ("aplicada" if cierra else "cita_de_otro_dia")
    assert revisado["incidencia_abierta"] is (not cierra)
    assert _incidencias(client, db_session, escenario["doctora"])["total"] == (0 if cierra else 1)


def test_la_cita_sin_revision_se_ignora(client, db_session, escenario):
    """La consulta manda la cita siempre, también al cambiar sólo la valoración."""
    resultado = _registrar(client, db_session, escenario, escenario["orden"], valoracion="critico")
    cita = _cita(db_session, escenario)

    cambiado = _revisar(client, db_session, escenario, resultado, valoracion="malo", appointment_id=cita.id)

    assert cambiado["cierre_en_consulta"] is None
    assert cambiado["review_status"] == "received"


def test_registrado_en_consulta_como_critico_nace_cerrado(client, db_session, escenario):
    """La doctora lo ve con la paciente enfrente: no hay nada pendiente."""
    cita = _cita(db_session, escenario)

    creado = _registrar(client, db_session, escenario, escenario["orden"], valoracion="critico",
                        review_status="reviewed", appointment_id=cita.id, report_text="Nota rápida sin archivo")

    assert creado["document_file_name"] is None
    assert creado["incidencia_abierta"] is False
    assert _incidencias(client, db_session, escenario["doctora"])["total"] == 0


def test_un_resultado_solo_con_texto_se_registra(client, db_session, escenario):
    creado = _registrar(client, db_session, escenario, escenario["orden"], report_text=None,
                        clinician_interpretation="Normal, sin cambios", review_status="reviewed", valoracion="bien")

    assert creado["patient_document_id"] is None
    assert creado["order_status"] == "reviewed"


def test_no_critico_no_es_incidencia(client, db_session, escenario):
    _registrar(client, db_session, escenario, escenario["orden"], valoracion="malo")

    assert _incidencias(client, db_session, escenario["doctora"])["total"] == 0


def test_una_orden_cancelada_no_deja_incidencia(client, db_session, escenario):
    _registrar(client, db_session, escenario, escenario["orden"], is_critical=True)
    escenario["orden"].status = "cancelled"
    db_session.commit()

    assert _incidencias(client, db_session, escenario["doctora"])["total"] == 0


@pytest.mark.parametrize("quien", ["colega", "doctora_ajena"])
def test_solo_la_ve_la_doctora_autora(client, db_session, escenario, quien):
    _registrar(client, db_session, escenario, escenario["orden"], is_critical=True)

    assert _incidencias(client, db_session, escenario[quien]) == {"items": [], "total": 0}


def test_recepcion_no_tiene_acceso(client, db_session, escenario):
    respuesta = client.get(RUTA, headers=_auth_headers(db_session, escenario["secretaria"]))

    assert respuesta.status_code == 403


def test_revisar_la_orden_en_consulta_cierra_el_critico_de_otro_archivo(client, db_session, escenario):
    """Varios archivos, una revisión: se revisa results[0] y se cierra todo lo de la orden."""
    from app.models.clinical_tracking import DiagnosticResult

    orden = escenario["orden"]
    viejo_critico = _registrar(client, db_session, escenario, orden, is_critical=True)
    nuevo = _registrar(client, db_session, escenario, orden)

    # Desde la bandeja: la orden queda revisada, pero la incidencia sigue.
    respuesta = _revisar(client, db_session, escenario, nuevo, review_status="reviewed",
                         clinician_interpretation="Revisados el reporte y las imágenes")
    assert respuesta["order_status"] == "reviewed"
    assert _incidencias(client, db_session, escenario["doctora"])["total"] == 1
    viejo = db_session.get(DiagnosticResult, viejo_critico["id"])
    db_session.refresh(viejo)
    assert viejo.review_status == "reviewed"
    assert viejo.is_critical is True

    # En consulta: se cierra la del archivo anterior.
    _revisar(client, db_session, escenario, nuevo, review_status="reviewed", appointment_id=_cita(db_session, escenario).id)
    assert _incidencias(client, db_session, escenario["doctora"])["total"] == 0
    db_session.refresh(viejo)
    assert viejo.incidencia_cerrada_por == "consulta"
    assert viejo.incidencia_cerrada_by_user_id == escenario["doctora"].id


def test_registrar_un_resultado_dice_el_estado_de_la_orden(client, db_session, escenario):
    recibido = _registrar(client, db_session, escenario, escenario["orden"])

    assert recibido["order_status"] == "result_received"
    assert recibido["document_file_name"] is None


def test_comunicar_sin_nota_es_422_y_no_deja_cambios_a_medias(client, db_session, escenario):
    """La validación va antes de tocar la sesión: un 422 no deja la orden «revisada»."""
    from app.models.clinical_tracking import DiagnosticOrder, DiagnosticResult

    resultado = _registrar(client, db_session, escenario, escenario["orden"])
    respuesta = client.patch(
        f"{PREFIX}/clinical-tracking/results/{resultado['id']}",
        json={"review_status": "communicated", "clinician_interpretation": "Normal", "communication_channel": "llamada"},
        headers=_auth_headers(db_session, escenario["doctora"]),
    )

    assert respuesta.status_code == 422
    assert db_session.get(DiagnosticResult, resultado["id"]).review_status == "received"
    assert db_session.get(DiagnosticResult, resultado["id"]).clinician_interpretation is None
    assert db_session.get(DiagnosticOrder, escenario["orden"].id).status == "result_received"


def test_un_estado_de_revision_desconocido_es_422(client, db_session, escenario):
    resultado = _registrar(client, db_session, escenario, escenario["orden"])

    respuesta = client.patch(
        f"{PREFIX}/clinical-tracking/results/{resultado['id']}", json={"review_status": "visto"},
        headers=_auth_headers(db_session, escenario["doctora"]),
    )

    assert respuesta.status_code == 422


def test_una_fila_vieja_comunicada_sin_nota_se_sigue_leyendo(client, db_session, escenario):
    """Las reglas de escribir no tumban la lectura de lo que ya estaba guardado."""
    from app.models.clinical_tracking import DiagnosticResult

    resultado = _registrar(client, db_session, escenario, escenario["orden"])
    fila = db_session.get(DiagnosticResult, resultado["id"])
    fila.review_status = "communicated"
    fila.communication_note = None
    db_session.commit()

    headers = _auth_headers(db_session, escenario["doctora"])
    for estado in ("communicated", "visto-legacy"):
        fila.review_status = estado
        db_session.commit()
        bandeja = client.get(f"{PREFIX}/clinical-tracking/orders/inbox", headers=headers)
        assert bandeja.status_code == 200, bandeja.text
        assert bandeja.json()["items"][0]["latest_result"]["review_status"] == estado


def test_la_cita_de_hoy_cierra_aunque_la_orden_sea_de_otra_consulta(client, db_session, escenario):
    """El estudio se pidió en una consulta anterior; se revisa con la paciente en la de hoy."""
    anterior = _cita(db_session, escenario, dias=-30, status="atendida")
    escenario["orden"].appointment_id = anterior.id
    db_session.commit()
    resultado = _registrar(client, db_session, escenario, escenario["orden"], valoracion="critico")

    cerrado = _revisar(client, db_session, escenario, resultado, review_status="reviewed",
                       appointment_id=_cita(db_session, escenario).id)

    assert cerrado["incidencia_cerrada_por"] == "consulta"
    assert _incidencias(client, db_session, escenario["doctora"])["total"] == 0


def test_si_vuelve_a_ser_critico_la_incidencia_se_reabre(client, db_session, escenario):
    from app.models.audit_log import AuditLog

    resultado = _registrar(client, db_session, escenario, escenario["orden"], valoracion="critico")
    _revisar(client, db_session, escenario, resultado, review_status="communicated",
             communication_note="Llamada a la paciente", communication_channel="llamada")
    assert _incidencias(client, db_session, escenario["doctora"])["total"] == 0

    # Reenviar «crítico» a uno que ya lo es no reabre nada.
    igual = _revisar(client, db_session, escenario, resultado, valoracion="critico")
    assert igual["incidencia_abierta"] is False

    _revisar(client, db_session, escenario, resultado, valoracion="bien")
    reabierto = _revisar(client, db_session, escenario, resultado, valoracion="critico")

    assert reabierto["incidencia_abierta"] is True
    assert reabierto["incidencia_cerrada_at"] is None and reabierto["incidencia_cerrada_por"] is None
    assert _incidencias(client, db_session, escenario["doctora"])["total"] == 1
    registro = db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_result.critical_reopened").one()
    assert registro.entity_id == resultado["id"]
    assert registro.details["cerrada_por"] == "comunicacion"


def test_por_atender_trae_lo_recibido_y_lo_critico_de_cualquier_cita(client, db_session, escenario):
    """N3: lo que la consulta tiene que revisar con la paciente enfrente."""
    t, p, d = escenario["tenant"], escenario["paciente"], escenario["doctora"]
    recibido = _registrar(client, db_session, escenario, escenario["orden"])  # result_received
    orden_critica = _orden(db_session, t, p, d, study_name="USG", priority="routine")
    _registrar(client, db_session, escenario, orden_critica, valoracion="critico", review_status="reviewed")
    revisada = _orden(db_session, t, p, d, study_name="Revisada sin pendiente")
    _registrar(client, db_session, escenario, revisada, valoracion="bien", review_status="reviewed")
    _orden(db_session, t, p, d, study_name="Sin resultado")
    # De la colega, con resultado recibido: no es de esta doctora, no sale.
    _orden(db_session, t, p, escenario["colega"], study_name="De la colega", status="result_received")

    respuesta = client.get(f"{PREFIX}/clinical-tracking/patient/{p.id}/orders", params={"por_atender": True},
                           headers=_auth_headers(db_session, d))

    assert respuesta.status_code == 200
    ordenes = respuesta.json()
    assert [o["study_name"] for o in ordenes] == ["USG", "Biometría hemática completa"]
    assert respuesta.headers["X-Total-Count"] == "2"
    assert ordenes[0]["incidencia_abierta"] is True
    assert ordenes[0]["results"][0]["valoracion"] == "critico"
    assert ordenes[1]["results"][0]["id"] == recibido["id"]
    assert ordenes[1]["estado_visible"] == "resultado_recibido"
    assert "comunicada" in ordenes[1]
