"""El papel consolidado: un papel por consulta o por paciente (plan 26, D-2 y D-5).

Diez estudios eran diez hojas. Ahora se imprime uno por consulta (``C-{cita}``)
o por paciente (``P-{paciente}-{AAAAMMDD}`` o ``G-{lote}``), separado por
destino físico o en una sola hoja. Cada renglón conserva su «Orden n.º» para
que recepción siga ligando el resultado orden por orden.
"""
from datetime import date, datetime

import pytest

from app.models.appointment import Appointment
from app.models.audit_log import AuditLog
from app.models.clinical_tracking import DiagnosticOrderGroup

from test_resultado_adjunto import almacenamiento  # noqa: F401 (fixture: archivos a tmp)
from test_upload_storage import VALID_PDF
from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _pdf_sin_comprimir,
    _auth_headers,
    _orden,
    _texto_del_pdf,
    _usuario,
    client,
    db_session,
    escenario,
)
from app.models.user import Role


def _paginas(datos: bytes) -> int:
    return datos.count(b"/Type /Page\n") + datos.count(b"/Type /Page ")


@pytest.fixture
def consulta(db_session, escenario):
    """Una consulta con tres estudios de laboratorio, uno de imagen y una interconsulta."""
    t, p, d = escenario["tenant"], escenario["paciente"], escenario["doctora"]
    cita = Appointment(tenant_id=t.id, patient_id=p.id, doctor_id=d.id, scheduled_at=datetime(2026, 9, 30, 10, 0))
    db_session.add(cita)
    db_session.commit()
    comun = dict(appointment_id=cita.id, clinical_indication="Perfil prenatal", priority="routine",
                 desired_on=None, destination=None, preparation_instructions=None)
    ordenes = [
        _orden(db_session, t, p, d, study_name="VDRL / RPR", category="laboratory", **comun),
        _orden(db_session, t, p, d, study_name="HBsAg", category="laboratory", **comun),
        _orden(db_session, t, p, d, study_name="Citología cervicovaginal", category="gynecology", **comun),
        _orden(db_session, t, p, d, study_name="Ultrasonido obstétrico", category="obstetric", **comun),
        _orden(db_session, t, p, d, study_name="Valoración por nutrición", category="referral", **comun),
    ]
    return cita, ordenes


def _folio_de(respuesta) -> str:
    """El folio con el que salió el papel, leído del nombre del archivo."""
    import re

    return re.search(r'Orden_de_estudios_(.+)\.pdf', respuesta.headers["content-disposition"]).group(1)


def _ruta_cita(cita, **params):
    return f"{PREFIX}/clinical-tracking/appointments/{cita.id}/orders/pdf", params


def test_separado_por_destino_da_una_hoja_por_grupo_y_firma_en_cada_una(client, db_session, escenario, consulta):
    cita, ordenes = consulta
    ruta, params = _ruta_cita(cita, modo="separado")

    respuesta = client.get(ruta, params=params, headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 200, respuesta.text
    # Folio homologado (plan 32): la sucursal sin código sale como ``S{id}``.
    folio = _folio_de(respuesta)
    assert folio.startswith(f"S{cita.tenant_id}-ORD-")
    texto = _texto_del_pdf(respuesta.content)
    assert _paginas(respuesta.content) == 3
    for fragmento in ("LABORATORIO (3)", "IMAGEN Y GABINETE (1)", "OTROS (1)", f"FOLIO: {folio}"):
        assert fragmento in texto, fragmento
    # Cada renglón conserva su número de orden.
    for orden in ordenes:
        assert f"Orden n.º {orden.id}" in texto
    assert texto.count("| Firma |") == 3
    # La paciente va en cada hoja: cada una se entrega en un lugar distinto.
    assert texto.count("María López Pérez") == 3
    # La indicación común se imprime una vez por hoja, no una por estudio.
    assert texto.count("Perfil prenatal") == 3


def test_todo_en_una_hoja(client, db_session, escenario, consulta):
    cita, _ = consulta
    ruta, params = _ruta_cita(cita, modo="una_hoja")

    respuesta = client.get(ruta, params=params, headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 200
    assert _paginas(respuesta.content) == 1
    texto = _texto_del_pdf(respuesta.content)
    assert "ESTUDIOS SOLICITADOS (5)" in texto
    assert texto.count("| Firma |") == 1


def test_sin_modo_ni_perfil_configurado_sale_separado(client, db_session, escenario, consulta):
    cita, _ = consulta
    ruta, _ = _ruta_cita(cita)

    respuesta = client.get(ruta, headers=_auth_headers(db_session, escenario["doctora"]))

    assert _paginas(respuesta.content) == 3


def test_un_modo_desconocido_es_422(client, db_session, escenario, consulta):
    cita, _ = consulta
    ruta, _ = _ruta_cita(cita)

    respuesta = client.get(ruta, params={"modo": "doble"}, headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 422


def test_no_salen_las_canceladas_y_sin_ninguna_es_409(client, db_session, escenario, consulta):
    cita, ordenes = consulta
    for orden in ordenes[1:]:
        orden.status = "cancelled"
    db_session.commit()
    ruta, _ = _ruta_cita(cita)

    texto = _texto_del_pdf(client.get(ruta, headers=_auth_headers(db_session, escenario["doctora"])).content)
    assert "VDRL" in texto
    assert "HBsAg" not in texto

    ordenes[0].status = "draft"
    db_session.commit()
    respuesta = client.get(ruta, headers=_auth_headers(db_session, escenario["doctora"]))
    assert respuesta.status_code == 409
    assert db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_order.batch_pdf_generated").count() == 1


def test_queda_en_la_bitacora_con_las_ordenes_impresas(client, db_session, escenario, consulta):
    cita, ordenes = consulta
    ruta, _ = _ruta_cita(cita)

    respuesta = client.get(ruta, params={"modo": "separado"}, headers=_auth_headers(db_session, escenario["secretaria"]))

    registro = db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_order.batch_pdf_generated").one()
    assert registro.entity_type == "appointment"
    assert registro.entity_id == cita.id
    assert registro.actor_user_id == escenario["secretaria"].id
    assert sorted(registro.details["order_ids"]) == sorted(o.id for o in ordenes)
    assert registro.details["folio"] == _folio_de(respuesta)


@pytest.mark.parametrize("quien,codigo", [
    ("secretaria", 200), ("admin", 200), ("colega", 403), ("secretaria_ajena", 404), ("doctora_ajena", 404),
])
def test_quien_imprime_el_papel_de_la_consulta(client, db_session, escenario, consulta, quien, codigo):
    cita, _ = consulta
    ruta, _ = _ruta_cita(cita)

    respuesta = client.get(ruta, headers=_auth_headers(db_session, escenario[quien]))

    assert respuesta.status_code == codigo


def test_ordenes_de_dos_doctoras_no_se_firman_juntas(client, db_session, escenario, consulta):
    cita, ordenes = consulta
    ordenes[0].doctor_id = escenario["colega"].id
    db_session.commit()
    ruta, _ = _ruta_cita(cita)

    respuesta = client.get(ruta, headers=_auth_headers(db_session, escenario["secretaria"]))

    assert respuesta.status_code == 409


# ---------------------------------------------------------------------------
# Por paciente, sin cita
# ---------------------------------------------------------------------------

def _ruta_paciente(escenario):
    return f"{PREFIX}/clinical-tracking/patients/{escenario['paciente'].id}/orders/pdf"


def test_ordenes_sueltas_de_la_paciente_con_folio_por_fecha(client, db_session, escenario):
    t, p, d = escenario["tenant"], escenario["paciente"], escenario["doctora"]
    a = _orden(db_session, t, p, d, study_name="Glucosa", requested_on=date(2026, 9, 28), desired_on=None)
    b = _orden(db_session, t, p, d, study_name="USG pélvico", category="obstetric", requested_on=date(2026, 9, 30), desired_on=None)

    respuesta = client.get(
        _ruta_paciente(escenario), params={"order_ids": f"{a.id},{b.id}", "modo": "una_hoja"},
        headers=_auth_headers(db_session, d),
    )

    assert respuesta.status_code == 200, respuesta.text
    folio = _folio_de(respuesta)
    assert folio.startswith(f"S{t.id}-ORD-")
    texto = _texto_del_pdf(respuesta.content)
    assert f"FOLIO: {folio}" in texto
    assert "Glucosa" in texto and "USG pélvico" in texto
    registro = db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_order.batch_pdf_generated").one()
    assert registro.entity_type == "patient"


def test_si_todas_son_del_mismo_lote_el_folio_es_el_del_lote(client, db_session, escenario):
    t, p, d = escenario["tenant"], escenario["paciente"], escenario["doctora"]
    lote = DiagnosticOrderGroup(tenant_id=t.id, patient_id=p.id, doctor_id=d.id, clinical_indication="Prenatal",
                                requested_on=date(2026, 9, 30))
    db_session.add(lote)
    db_session.commit()
    a = _orden(db_session, t, p, d, study_name="VDRL", order_group_id=lote.id)
    b = _orden(db_session, t, p, d, study_name="HBsAg", order_group_id=lote.id)

    respuesta = client.get(_ruta_paciente(escenario), params={"order_ids": f"{a.id},{b.id}"},
                           headers=_auth_headers(db_session, d))

    assert _folio_de(respuesta).startswith(f"S{t.id}-ORD-")


def test_una_orden_de_otra_paciente_es_422(client, db_session, escenario):
    from app.models.patient import Patient

    t, d = escenario["tenant"], escenario["doctora"]
    otra = Patient(tenant_id=t.id, first_name="Ana", last_name="Ruiz", owner_doctor_id=d.id)
    db_session.add(otra)
    db_session.commit()
    ajena = _orden(db_session, t, otra, d)

    respuesta = client.get(
        _ruta_paciente(escenario), params={"order_ids": f"{escenario['orden'].id},{ajena.id}"},
        headers=_auth_headers(db_session, d),
    )

    assert respuesta.status_code == 422


@pytest.mark.parametrize("ids", ["", "abc", "1,-2", ","])
def test_order_ids_invalidos_son_422(client, db_session, escenario, ids):
    respuesta = client.get(_ruta_paciente(escenario), params={"order_ids": ids},
                           headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 422


def test_otra_sucursal_no_imprime_por_paciente(client, db_session, escenario):
    respuesta = client.get(_ruta_paciente(escenario), params={"order_ids": str(escenario["orden"].id)},
                           headers=_auth_headers(db_session, escenario["secretaria_ajena"]))

    assert respuesta.status_code == 404


def test_imprimir_el_consolidado_no_rompe_el_anexo_por_orden(client, db_session, escenario, consulta):
    """Recepción sigue ligando el resultado a una orden por su número (plan 26 §6)."""
    cita, ordenes = consulta
    ruta, _ = _ruta_cita(cita)
    headers = _auth_headers(db_session, escenario["secretaria"])
    assert client.get(ruta, headers=headers).status_code == 200

    respuesta = client.post(
        f"{PREFIX}/clinical-tracking/orders/{ordenes[1].id}/result-attachment",
        files={"file": ("resultado.pdf", VALID_PDF, "application/pdf")},
        headers=headers,
    )

    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["order_id"] == ordenes[1].id
    assert respuesta.json()["order_status"] == "result_received"


def test_el_papel_del_lote_acepta_modo(client, db_session, escenario):
    t, p, d = escenario["tenant"], escenario["paciente"], escenario["doctora"]
    lote = DiagnosticOrderGroup(tenant_id=t.id, patient_id=p.id, doctor_id=d.id, clinical_indication="Prenatal",
                                requested_on=date(2026, 9, 30))
    db_session.add(lote)
    db_session.commit()
    _orden(db_session, t, p, d, study_name="VDRL", order_group_id=lote.id)
    _orden(db_session, t, p, d, study_name="USG", category="obstetric", order_group_id=lote.id)
    ruta = f"{PREFIX}/clinical-tracking/order-groups/{lote.id}/pdf"
    headers = _auth_headers(db_session, d)

    assert _paginas(client.get(ruta, params={"modo": "separado"}, headers=headers).content) == 2
    assert _paginas(client.get(ruta, params={"modo": "una_hoja"}, headers=headers).content) == 1


def test_cada_estudio_del_lote_lleva_su_prioridad_y_se_imprime(client, db_session, escenario):
    """Prioridad por estudio (plan 26, D-10): la que no la trae hereda la del lote."""
    headers = _auth_headers(db_session, escenario["doctora"])
    creado = client.post(f"{PREFIX}/clinical-tracking/order-groups", headers=headers, json={
        "patient_id": escenario["paciente"].id, "clinical_indication": "Dolor pélvico", "priority": "routine",
        "studies": [
            {"category": "laboratory", "study_name": "Examen general de orina"},
            {"category": "obstetric", "study_name": "Resonancia pélvica", "priority": "urgent"},
            {"category": "laboratory", "study_name": "Biometría hemática", "priority": "preferential"},
        ],
    })
    assert creado.status_code == 201, creado.text
    prioridades = {o["study_name"]: o["priority"] for o in creado.json()["orders"]}
    assert prioridades == {"Examen general de orina": "routine", "Resonancia pélvica": "urgent",
                           "Biometría hemática": "preferential"}

    texto = _texto_del_pdf(client.get(f"{PREFIX}/clinical-tracking/order-groups/{creado.json()['id']}/pdf",
                                      params={"modo": "una_hoja"}, headers=headers).content)
    for etiqueta in ("Urgente", "Preferente", "Rutinaria"):
        assert etiqueta in texto, etiqueta

    # Y ordena la bandeja de la doctora.
    bandeja = client.get(f"{PREFIX}/clinical-tracking/orders/inbox-by-patient", headers=headers).json()
    nombres = [o["study_name"] for o in bandeja["items"][0]["orders"] if o["order_group_id"] == creado.json()["id"]]
    assert nombres == ["Resonancia pélvica", "Biometría hemática", "Examen general de orina"]



# ---------------------------------------------------------------------------
# Bitácora: generar no es imprimir (M2)
# ---------------------------------------------------------------------------

RUTA_REGISTRO = f"{PREFIX}/clinical-tracking/orders/print-record"


def test_ver_la_vista_previa_no_registra_una_impresion(client, db_session, escenario, consulta):
    cita, _ = consulta
    ruta, _ = _ruta_cita(cita)

    client.get(ruta, headers=_auth_headers(db_session, escenario["doctora"]))

    acciones = {a.action for a in db_session.query(AuditLog).all()}
    assert "diagnostic_order.batch_pdf_generated" in acciones
    assert "diagnostic_order.batch_printed" not in acciones
    assert "diagnostic_order.printed" not in acciones


def test_imprimir_varias_ordenes_queda_registrado(client, db_session, escenario, consulta):
    cita, ordenes = consulta
    ids = [o.id for o in ordenes]

    respuesta = client.post(RUTA_REGISTRO, json={"order_ids": ids, "folio": f"C-{cita.id}", "accion": "impreso"},
                            headers=_auth_headers(db_session, escenario["secretaria"]))

    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json() == {"registrado": True, "order_ids": ids, "accion": "impreso"}
    registro = db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_order.batch_printed").one()
    assert registro.details["folio"] == f"C-{cita.id}"
    assert registro.actor_user_id == escenario["secretaria"].id
    assert registro.patient_id == escenario["paciente"].id


def test_descargar_una_orden_queda_registrado(client, db_session, escenario):
    respuesta = client.post(RUTA_REGISTRO, json={"order_ids": [escenario["orden"].id], "accion": "descargado"},
                            headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 201
    registro = db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_order.printed").one()
    assert registro.entity_id == escenario["orden"].id
    assert registro.details["accion"] == "descargado"


@pytest.mark.parametrize("cuerpo,codigo", [
    ({"order_ids": [], "accion": "impreso"}, 422),
    ({"order_ids": [1], "accion": "visto"}, 422),
    ({"order_ids": [9999], "accion": "impreso"}, 404),
])
def test_registro_de_impresion_invalido(client, db_session, escenario, cuerpo, codigo):
    respuesta = client.post(RUTA_REGISTRO, json=cuerpo, headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == codigo


def test_registro_de_ordenes_de_dos_pacientes_es_422(client, db_session, escenario):
    from app.models.patient import Patient

    otra = Patient(tenant_id=escenario["tenant"].id, first_name="Ana", last_name="Ruiz",
                   owner_doctor_id=escenario["doctora"].id)
    db_session.add(otra)
    db_session.commit()
    ajena = _orden(db_session, escenario["tenant"], otra, escenario["doctora"])

    respuesta = client.post(RUTA_REGISTRO, json={"order_ids": [escenario["orden"].id, ajena.id], "accion": "impreso"},
                            headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 422


@pytest.mark.parametrize("quien,codigo", [("colega", 403), ("secretaria_ajena", 404)])
def test_registro_de_impresion_respeta_el_alcance(client, db_session, escenario, quien, codigo):
    respuesta = client.post(RUTA_REGISTRO, json={"order_ids": [escenario["orden"].id], "accion": "impreso"},
                            headers=_auth_headers(db_session, escenario[quien]))

    assert respuesta.status_code == codigo
    assert db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_order.printed").count() == 0


# ---------------------------------------------------------------------------
# Todas las pendientes de la paciente con una doctora (M5)
# ---------------------------------------------------------------------------

def test_recepcion_imprime_todas_las_pendientes_de_una_doctora(client, db_session, escenario):
    t, p, d, colega = escenario["tenant"], escenario["paciente"], escenario["doctora"], escenario["colega"]
    otra = _orden(db_session, t, p, d, study_name="Tomografía", status="scheduled")
    _orden(db_session, t, p, d, study_name="Ya con resultado", status="result_received")
    _orden(db_session, t, p, d, study_name="Cancelada", status="cancelled")
    _orden(db_session, t, p, colega, study_name="De la colega")

    respuesta = client.get(_ruta_paciente(escenario), params={"pendientes": True, "doctor_id": d.id, "modo": "una_hoja"},
                           headers=_auth_headers(db_session, escenario["secretaria"]))

    assert respuesta.status_code == 200, respuesta.text
    texto = _texto_del_pdf(respuesta.content)
    assert "Biometría hemática completa" in texto and "Tomografía" in texto
    for ausente in ("Ya con resultado", "Cancelada", "De la colega"):
        assert ausente not in texto, ausente
    assert respuesta.headers["X-Order-Ids"] == f"{escenario['orden'].id},{otra.id}"


def test_las_pendientes_de_la_colega_salen_en_su_propio_papel(client, db_session, escenario):
    t, p, colega = escenario["tenant"], escenario["paciente"], escenario["colega"]
    suya = _orden(db_session, t, p, colega, study_name="De la colega")

    respuesta = client.get(_ruta_paciente(escenario), params={"pendientes": True, "doctor_id": colega.id},
                           headers=_auth_headers(db_session, escenario["secretaria"]))

    assert respuesta.status_code == 200
    assert respuesta.headers["X-Order-Ids"] == str(suya.id)
    assert "Biometría hemática completa" not in _texto_del_pdf(respuesta.content)


@pytest.mark.parametrize("params,codigo", [
    ({"pendientes": True}, 422),
    ({"pendientes": True, "doctor_id": 1, "order_ids": "1"}, 422),
    ({}, 422),
])
def test_pendientes_mal_pedidas(client, db_session, escenario, params, codigo):
    respuesta = client.get(_ruta_paciente(escenario), params=params,
                           headers=_auth_headers(db_session, escenario["secretaria"]))

    assert respuesta.status_code == codigo


def test_sin_pendientes_es_409(client, db_session, escenario):
    escenario["orden"].status = "result_received"
    db_session.commit()

    respuesta = client.get(_ruta_paciente(escenario), params={"pendientes": True, "doctor_id": escenario["doctora"].id},
                           headers=_auth_headers(db_session, escenario["secretaria"]))

    assert respuesta.status_code == 409


def test_pendientes_de_otra_sucursal_es_404(client, db_session, escenario):
    respuesta = client.get(_ruta_paciente(escenario), params={"pendientes": True, "doctor_id": escenario["doctora"].id},
                           headers=_auth_headers(db_session, escenario["secretaria_ajena"]))

    assert respuesta.status_code == 404
