"""Escalas neurológicas aplicadas (Cortex): lo que no puede fallar en silencio.

- El puntaje que se guarda es el que calcula el servidor, no el del navegador.
- Una respuesta inválida se rechaza con un mensaje en español que nombra el ítem.
- Solo el médico dueño del expediente ve y aplica; recepción y administración no.
- Anular no borra: la escala sigue ahí con quién, cuándo y por qué.
- Aplicar y anular quedan en la bitácora; leer, en la de accesos.
"""
from datetime import timedelta

from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    client,
    db_session,
    escenario,
)

from app.db.session import utcnow
from app.models.acceso_clinico import AccesoClinico
from app.models.appointment import Appointment, AppointmentStatus
from app.models.audit_log import AuditLog
from app.models.escala_aplicada import EscalaAplicada
from app.models.patient import Patient

GLASGOW_12 = {"ocular": "3", "verbal": "4", "motora": "5"}


def _ruta(escenario, sufijo=""):
    return f"{PREFIX}/patients/{escenario['paciente'].id}/escalas{sufijo}"


def _aplicar(client, cabeceras, escenario, escala="glasgow", respuestas=None, version="1", **extra):
    cuerpo = {"escala": escala, "version_escala": version, "respuestas": respuestas or GLASGOW_12, **extra}
    return client.post(_ruta(escenario), headers=cabeceras, json=cuerpo)


def _doctora(db_session, escenario):
    return _auth_headers(db_session, escenario["doctora"])


# ── El servidor recalcula ──────────────────────────────────────────────────


def test_el_puntaje_lo_calcula_el_servidor_aunque_el_navegador_mande_otro(client, db_session, escenario):
    respuesta = _aplicar(
        client, _doctora(db_session, escenario), escenario,
        puntaje=99, interpretacion="Leve", tono="ok",
    )
    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["puntaje"] == 12
    assert cuerpo["interpretacion"] == "Moderado (9–12)"
    assert cuerpo["detalle"] == "O3 V4 M5"
    assert cuerpo["tono"] == "aviso"
    guardada = db_session.query(EscalaAplicada).one()
    assert guardada.puntaje == 12
    assert guardada.version_escala == "1"
    assert guardada.respuestas == GLASGOW_12
    assert guardada.doctor_id == escenario["doctora"].id
    assert guardada.created_by_user_id == escenario["doctora"].id


def test_glasgow_intubado_se_guarda_sin_total_y_por_componentes(client, db_session, escenario):
    respuesta = _aplicar(
        client, _doctora(db_session, escenario), escenario,
        respuestas={"ocular": "3", "verbal": "T", "motora": "5"},
    )
    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["puntaje"] is None
    assert respuesta.json()["detalle"] == "O3 VT M5"


def test_oswestry_con_una_seccion_omitida_se_calcula_sobre_las_respondidas(client, db_session, escenario):
    respuestas = {
        "dolor": "2", "cuidado": "2", "levantar": "2", "caminar": "2", "sentado": "2",
        "de_pie": "2", "dormir": "2", "social": "2", "viajar": "0",
    }
    respuesta = _aplicar(
        client, _doctora(db_session, escenario), escenario, escala="oswestry", respuestas=respuestas,
    )
    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["puntaje"] == 35.6
    assert respuesta.json()["detalle"] == "1 sección sin responder"


# ── Respuestas inválidas: en español y nombrando el ítem ───────────────────


def test_una_opcion_que_no_existe_se_rechaza_en_espanol(client, db_session, escenario):
    respuesta = _aplicar(
        client, _doctora(db_session, escenario), escenario,
        respuestas={"ocular": "3", "verbal": "9", "motora": "5"},
    )
    assert respuesta.status_code == 400
    assert respuesta.json()["detail"] == "La respuesta de «Respuesta verbal (V)» no es una opción de Glasgow."
    assert db_session.query(EscalaAplicada).count() == 0


def test_un_item_sin_responder_se_nombra(client, db_session, escenario):
    respuesta = _aplicar(
        client, _doctora(db_session, escenario), escenario, respuestas={"ocular": "3", "verbal": "4"},
    )
    assert respuesta.status_code == 400
    assert respuesta.json()["detail"] == "Falta responder «Respuesta motora (M)»."


def test_una_escala_que_no_existe_se_rechaza(client, db_session, escenario):
    respuesta = _aplicar(client, _doctora(db_session, escenario), escenario, escala="phq9")
    assert respuesta.status_code == 400
    assert "no está disponible" in respuesta.json()["detail"]


def test_otra_version_de_la_escala_pide_recargar_en_vez_de_guardar(client, db_session, escenario):
    respuesta = _aplicar(client, _doctora(db_session, escenario), escenario, version="0")
    assert respuesta.status_code == 409
    assert "Recarga la página" in respuesta.json()["detail"]
    assert db_session.query(EscalaAplicada).count() == 0


def test_una_respuesta_que_no_es_texto_da_un_error_de_validacion_en_espanol(client, db_session, escenario):
    respuesta = _aplicar(
        client, _doctora(db_session, escenario), escenario, respuestas={"ocular": 3, "verbal": "4", "motora": "5"},
    )
    assert respuesta.status_code == 422
    texto = str(respuesta.json())
    assert "Respuestas de la escala" in texto
    assert "Input should" not in texto


def test_una_fecha_futura_no_se_acepta(client, db_session, escenario):
    respuesta = _aplicar(
        client, _doctora(db_session, escenario), escenario,
        aplicada_en=(utcnow() + timedelta(days=2)).isoformat(),
    )
    assert respuesta.status_code == 400
    assert "futura" in respuesta.json()["detail"]


def test_la_consulta_tiene_que_ser_del_mismo_paciente(client, db_session, escenario):
    otro = Patient(
        tenant_id=escenario["tenant"].id, first_name="Otro", last_name="Paciente",
        owner_doctor_id=escenario["doctora"].id,
    )
    db_session.add(otro)
    db_session.commit()
    cita = Appointment(
        tenant_id=escenario["tenant"].id, patient_id=otro.id, doctor_id=escenario["doctora"].id,
        scheduled_at=utcnow(), status=AppointmentStatus.EN_CONSULTA,
    )
    db_session.add(cita)
    db_session.commit()
    respuesta = _aplicar(client, _doctora(db_session, escenario), escenario, appointment_id=cita.id)
    assert respuesta.status_code == 400
    assert "no es de este paciente" in respuesta.json()["detail"]


# ── Permisos y alcance ─────────────────────────────────────────────────────


def test_recepcion_y_administracion_no_ven_ni_aplican_escalas(client, db_session, escenario):
    for quien in ("secretaria", "admin"):
        cabeceras = _auth_headers(db_session, escenario[quien])
        assert client.get(_ruta(escenario), headers=cabeceras).status_code == 403, quien
        assert _aplicar(client, cabeceras, escenario).status_code == 403, quien


def test_un_medico_que_no_es_dueno_del_expediente_recibe_403(client, db_session, escenario):
    cabeceras = _auth_headers(db_session, escenario["colega"])
    assert client.get(_ruta(escenario), headers=cabeceras).status_code == 403
    assert _aplicar(client, cabeceras, escenario).status_code == 403


def test_otra_sucursal_no_sabe_que_el_paciente_existe(client, db_session, escenario):
    cabeceras = _auth_headers(db_session, escenario["doctora_ajena"])
    assert client.get(_ruta(escenario), headers=cabeceras).status_code == 404


def test_el_expediente_ofrece_la_pestana_solo_a_quien_lee_escalas(client, db_session, escenario):
    ruta = f"{PREFIX}/patients/{escenario['paciente'].id}/expediente"
    del_medico = client.get(ruta, headers=_doctora(db_session, escenario)).json()
    assert "escalas" in del_medico["pestanas"]
    de_recepcion = client.get(ruta, headers=_auth_headers(db_session, escenario["secretaria"])).json()
    assert "escalas" not in de_recepcion["pestanas"]


# ── Anulación lógica ───────────────────────────────────────────────────────


def test_anular_no_borra_y_deja_quien_cuando_y_por_que(client, db_session, escenario):
    cabeceras = _doctora(db_session, escenario)
    creada = _aplicar(client, cabeceras, escenario).json()
    respuesta = client.post(
        _ruta(escenario, f"/{creada['id']}/anular"), headers=cabeceras,
        json={"motivo": "Se capturó en el paciente equivocado"},
    )
    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["anulado_motivo"] == "Se capturó en el paciente equivocado"

    fila = db_session.query(EscalaAplicada).one()
    assert fila.anulado_at is not None
    assert fila.anulado_por_user_id == escenario["doctora"].id
    assert fila.puntaje == 12  # el dato original no se toca

    todas = client.get(_ruta(escenario), headers=cabeceras).json()
    assert [e["id"] for e in todas] == [creada["id"]]
    vigentes = client.get(_ruta(escenario, "?incluir_anuladas=false"), headers=cabeceras).json()
    assert vigentes == []


def test_no_se_anula_dos_veces(client, db_session, escenario):
    cabeceras = _doctora(db_session, escenario)
    creada = _aplicar(client, cabeceras, escenario).json()
    ruta = _ruta(escenario, f"/{creada['id']}/anular")
    assert client.post(ruta, headers=cabeceras, json={"motivo": "Error de captura"}).status_code == 200
    segunda = client.post(ruta, headers=cabeceras, json={"motivo": "Error de captura"})
    assert segunda.status_code == 409
    assert segunda.json()["detail"] == "Esta escala ya estaba anulada."


def test_anular_exige_un_motivo_de_verdad(client, db_session, escenario):
    cabeceras = _doctora(db_session, escenario)
    creada = _aplicar(client, cabeceras, escenario).json()
    respuesta = client.post(_ruta(escenario, f"/{creada['id']}/anular"), headers=cabeceras, json={"motivo": "x"})
    assert respuesta.status_code == 422
    assert "Motivo" in str(respuesta.json())
    assert db_session.query(EscalaAplicada).one().anulado_at is None


def test_solo_quien_aplico_la_escala_la_anula(client, db_session, escenario):
    # Una escala del expediente de la doctora que aplicó otro médico (p. ej.
    # cuando la cobertura entre médicos estaba abierta): ella la ve, pero no
    # puede anular lo que firmó otro.
    ajena = EscalaAplicada(
        tenant_id=escenario["tenant"].id, patient_id=escenario["paciente"].id,
        doctor_id=escenario["colega"].id, escala="glasgow", version_escala="1",
        respuestas=GLASGOW_12, puntaje=12, interpretacion="Moderado (9–12)",
        aplicada_en=utcnow(), created_by_user_id=escenario["colega"].id,
    )
    db_session.add(ajena)
    db_session.commit()
    respuesta = client.post(
        _ruta(escenario, f"/{ajena.id}/anular"), headers=_doctora(db_session, escenario),
        json={"motivo": "No corresponde"},
    )
    assert respuesta.status_code == 403
    assert respuesta.json()["detail"] == "Solo quien aplicó la escala puede anularla."


# ── Bitácoras ──────────────────────────────────────────────────────────────


def test_aplicar_y_anular_quedan_en_la_bitacora_sin_las_respuestas(client, db_session, escenario):
    cabeceras = _doctora(db_session, escenario)
    creada = _aplicar(client, cabeceras, escenario).json()
    client.post(_ruta(escenario, f"/{creada['id']}/anular"), headers=cabeceras, json={"motivo": "Error de captura"})
    acciones = {
        a.action: a for a in db_session.query(AuditLog).filter(AuditLog.entity_type == "escala_aplicada")
    }
    assert set(acciones) == {"clinical_scale.applied", "clinical_scale.voided"}
    aplicada = acciones["clinical_scale.applied"]
    assert aplicada.patient_id == escenario["paciente"].id
    assert aplicada.details["escala"] == "glasgow"
    assert "respuestas" not in aplicada.details and "puntaje" not in aplicada.details
    assert acciones["clinical_scale.voided"].reason == "Error de captura"


def test_ver_las_escalas_queda_en_la_bitacora_de_accesos(client, db_session, escenario):
    client.get(_ruta(escenario), headers=_doctora(db_session, escenario))
    acceso = db_session.query(AccesoClinico).filter(AccesoClinico.seccion == "escalas").one()
    assert acceso.patient_id == escenario["paciente"].id
    assert acceso.user_id == escenario["doctora"].id
