"""Plantillas clínicas que precargan estudios en la orden (O-03 del backlog).

Son opcionales y de sólo lectura: la doctora elige una, el frontend copia sus
estudios al formulario de la orden agrupada (O-02) y ella confirma. Nada se crea
sin esa confirmación manual; la plantilla no escribe nada por sí sola. La
pregunta 2.3 (quién administra las plantillas) sigue abierta, así que hoy no se
editan desde la interfaz.
"""
from app.models.clinical_tracking import DiagnosticOrder

from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _orden,
    client,
    db_session,
    escenario,
)

RUTA_PLANTILLAS = f"{PREFIX}/clinical-tracking/order-templates"
RUTA_LOTES = f"{PREFIX}/clinical-tracking/order-groups"


def _listar(client, db_session, quien):
    return client.get(RUTA_PLANTILLAS, headers=_auth_headers(db_session, quien))


def _detalle(client, db_session, quien, clave):
    return client.get(f"{RUTA_PLANTILLAS}/{clave}", headers=_auth_headers(db_session, quien))


# ---------------------------------------------------------------------------
# Leer las plantillas
# ---------------------------------------------------------------------------

def test_la_doctora_ve_el_indice_de_plantillas_con_las_seis_semilla(client, db_session, escenario):
    respuesta = _listar(client, db_session, escenario["doctora"])

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["version"] >= 1
    claves = {p["clave"] for p in cuerpo["plantillas"]}
    assert claves == {
        "primera_consulta_prenatal", "control_prenatal_subsecuente",
        "tamizaje_diabetes_gestacional", "papanicolau_hpv", "its", "fertilidad",
    }
    prenatal = next(p for p in cuerpo["plantillas"] if p["clave"] == "primera_consulta_prenatal")
    assert prenatal["num_estudios"] == 10


def test_el_detalle_trae_los_estudios_para_precargar(client, db_session, escenario):
    respuesta = _detalle(client, db_session, escenario["doctora"], "papanicolau_hpv")

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["nombre"] == "Papanicolau / HPV"
    assert cuerpo["indicacion_sugerida"]
    assert len(cuerpo["estudios"]) == 2
    estudio = cuerpo["estudios"][0]
    # Los estudios tienen la forma de DiagnosticOrderGroupStudy (O-02).
    assert set(estudio) >= {"category", "study_name", "catalog_code", "specimen_or_body_site", "preparation_instructions"}


def test_una_plantilla_inexistente_responde_404(client, db_session, escenario):
    respuesta = _detalle(client, db_session, escenario["doctora"], "no_existe")
    assert respuesta.status_code == 404


def test_leer_plantillas_no_crea_ninguna_orden(client, db_session, escenario):
    """La plantilla es sólo lectura: consultarla no toca el expediente."""
    antes = db_session.query(DiagnosticOrder).count()
    _listar(client, db_session, escenario["doctora"])
    _detalle(client, db_session, escenario["doctora"], "its")
    # El escenario ya trae una orden suelta; el número no debe cambiar.
    assert db_session.query(DiagnosticOrder).count() == antes


# ---------------------------------------------------------------------------
# Permisos
# ---------------------------------------------------------------------------

def test_recepcion_no_ve_las_plantillas(client, db_session, escenario):
    """Sólo quien puede pedir estudios (clinical_tracking.create) las usa."""
    lista = _listar(client, db_session, escenario["secretaria"])
    assert lista.status_code == 403
    detalle = _detalle(client, db_session, escenario["secretaria"], "its")
    assert detalle.status_code == 403


# ---------------------------------------------------------------------------
# Combinación con O-02: precargar y confirmar crea la orden agrupada
# ---------------------------------------------------------------------------

def test_los_estudios_de_una_plantilla_crean_la_orden_al_confirmar(client, db_session, escenario):
    """El flujo real: se lee la plantilla, se precarga el formulario y la doctora
    confirma con POST /order-groups (O-02). La confirmación es lo que crea."""
    plantilla = _detalle(client, db_session, escenario["doctora"], "control_prenatal_subsecuente").json()

    cuerpo = {
        "patient_id": escenario["paciente"].id,
        "clinical_indication": plantilla["indicacion_sugerida"],
        "requested_on": "2026-09-29",
        "studies": plantilla["estudios"],
    }
    respuesta = client.post(RUTA_LOTES, json=cuerpo, headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 201, respuesta.text
    lote = respuesta.json()
    assert len(lote["orders"]) == len(plantilla["estudios"]) == 3
    nombres = {o["study_name"] for o in lote["orders"]}
    assert "Biometría hemática completa" in nombres


def test_la_doctora_puede_editar_los_estudios_antes_de_confirmar(client, db_session, escenario):
    """Precargar no obliga: la doctora quita uno y agrega otro, y se crea lo que
    ella confirmó, no lo que traía la plantilla."""
    plantilla = _detalle(client, db_session, escenario["doctora"], "control_prenatal_subsecuente").json()
    estudios = plantilla["estudios"][:1]  # se queda con uno
    estudios.append({"category": "laboratory", "study_name": "Grupo sanguíneo y factor Rh"})

    cuerpo = {
        "patient_id": escenario["paciente"].id,
        "clinical_indication": "Control prenatal subsecuente",
        "requested_on": "2026-09-29",
        "studies": estudios,
    }
    respuesta = client.post(RUTA_LOTES, json=cuerpo, headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 201, respuesta.text
    nombres = {o["study_name"] for o in respuesta.json()["orders"]}
    assert nombres == {"Biometría hemática completa", "Grupo sanguíneo y factor Rh"}
