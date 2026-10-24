"""Vista de mostrador: órdenes por entregar del día y marcado de entrega (O-09).

Decisión de Emilio (1.3/1.4) y hueco 05 G6: recepción maneja el papel del día.
Aquí ve las órdenes emitidas del día por sucursal y marca cuáles ya entregó a la
paciente. Es contabilidad del mostrador, aparte del ciclo clínico de la orden:
recepción no lee la indicación ni el resto del expediente. La otra mitad de la
vista («resultados por recibir») es ``GET /orders/awaiting-result`` (O-04), que
no se duplica.
"""
from datetime import date

from app.models.audit_log import AuditLog
from app.models.permission import Permission

from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _orden,
    client,
    db_session,
    escenario,
)

RUTA_POR_ENTREGAR = f"{PREFIX}/clinical-tracking/orders/to-deliver"
DIA = "2026-09-29"  # coincide con requested_on de la orden del escenario


def _ruta_entregar(orden) -> str:
    return f"{PREFIX}/clinical-tracking/orders/{orden.id}/delivered"


def _por_entregar(client, db_session, quien, **params):
    return client.get(
        RUTA_POR_ENTREGAR,
        headers=_auth_headers(db_session, quien),
        params={"fecha": DIA, **params},
    )


# ---------------------------------------------------------------------------
# Lista «por entregar»
# ---------------------------------------------------------------------------

def test_recepcion_ve_la_orden_emitida_del_dia_sin_datos_clinicos(client, db_session, escenario):
    respuesta = _por_entregar(client, db_session, escenario["secretaria"])

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["total"] == 1
    item = cuerpo["items"][0]
    assert item["order_id"] == escenario["orden"].id
    assert item["patient_name"] == "María López Pérez"
    assert item["study_name"] == "Biometría hemática completa"
    assert item["delivered"] is False
    # Recepción entrega el papel, no lee el porqué: nada clínico en el item.
    assert "clinical_indication" not in item
    # La prioridad sí: ordena qué se entrega primero (plan 26, D-10).
    assert item["priority"] == "urgent"
    # De qué doctora es, para imprimir el papel de cada una por separado (M5).
    assert item["doctor_name"] == "Dra. Yara Gutiérrez"


def test_una_orden_cancelada_no_esta_por_entregar(client, db_session, escenario):
    _orden(db_session, escenario["tenant"], escenario["paciente"], escenario["doctora"],
           status="cancelled", study_name="Urocultivo")

    respuesta = _por_entregar(client, db_session, escenario["secretaria"])

    estudios = [i["study_name"] for i in respuesta.json()["items"]]
    assert "Urocultivo" not in estudios
    assert respuesta.json()["total"] == 1


def test_otro_dia_no_trae_la_orden(client, db_session, escenario):
    respuesta = _por_entregar(client, db_session, escenario["secretaria"], fecha="2026-09-28")

    assert respuesta.status_code == 200
    assert respuesta.json()["total"] == 0


# ---------------------------------------------------------------------------
# Marcar entregada
# ---------------------------------------------------------------------------

def test_recepcion_marca_entregada_y_queda_en_la_bitacora(client, db_session, escenario):
    orden = escenario["orden"]
    respuesta = client.post(_ruta_entregar(orden), headers=_auth_headers(db_session, escenario["secretaria"]))

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["delivered"] is True
    assert cuerpo["ya_estaba_entregada"] is False
    assert cuerpo["delivered_at"] is not None
    assert cuerpo["delivered_by_user_id"] == escenario["secretaria"].id

    db_session.refresh(orden)
    assert orden.delivered_at is not None
    assert orden.delivered_by_user_id == escenario["secretaria"].id
    # No se toca el ciclo clínico: sigue "solicitada" en el laboratorio.
    assert orden.status == "ordered"

    registro = db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_order.delivered").one()
    assert registro.actor_user_id == escenario["secretaria"].id
    assert registro.entity_id == orden.id
    assert registro.patient_id == escenario["paciente"].id


def test_al_entregarla_sale_de_la_lista_pero_vuelve_con_include_delivered(client, db_session, escenario):
    orden = escenario["orden"]
    client.post(_ruta_entregar(orden), headers=_auth_headers(db_session, escenario["secretaria"]))

    sin = _por_entregar(client, db_session, escenario["secretaria"])
    assert sin.json()["total"] == 0

    con = _por_entregar(client, db_session, escenario["secretaria"], include_delivered=True)
    assert con.json()["total"] == 1
    assert con.json()["items"][0]["delivered"] is True


def test_marcar_entregada_dos_veces_es_idempotente_y_no_duplica_bitacora(client, db_session, escenario):
    orden = escenario["orden"]
    primera = client.post(_ruta_entregar(orden), headers=_auth_headers(db_session, escenario["secretaria"]))
    segunda = client.post(_ruta_entregar(orden), headers=_auth_headers(db_session, escenario["admin"]))

    assert primera.json()["ya_estaba_entregada"] is False
    assert segunda.status_code == 200
    assert segunda.json()["ya_estaba_entregada"] is True
    # No se reescribe quién entregó ni se vuelve a auditar.
    assert segunda.json()["delivered_by_user_id"] == escenario["secretaria"].id
    assert db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_order.delivered").count() == 1


def test_no_se_entrega_una_orden_cancelada(client, db_session, escenario):
    cancelada = _orden(db_session, escenario["tenant"], escenario["paciente"], escenario["doctora"],
                       status="cancelled")

    respuesta = client.post(_ruta_entregar(cancelada), headers=_auth_headers(db_session, escenario["secretaria"]))

    assert respuesta.status_code == 409, respuesta.text
    db_session.refresh(cancelada)
    assert cancelada.delivered_at is None


# ---------------------------------------------------------------------------
# Alcance
# ---------------------------------------------------------------------------

def test_la_doctora_solo_ve_y_entrega_sus_propias_ordenes(client, db_session, escenario):
    """El médico tiene el permiso, pero acotada a las órdenes que ella pidió."""
    # La colega no pidió la orden del escenario: no la ve ni la puede entregar.
    lista = _por_entregar(client, db_session, escenario["colega"])
    assert lista.json()["total"] == 0

    # Misma sucursal pero no es su orden: 403 (autoría clínica), igual que el
    # resto de las escrituras sobre órdenes ajenas.
    intento = client.post(
        _ruta_entregar(escenario["orden"]), headers=_auth_headers(db_session, escenario["colega"])
    )
    assert intento.status_code == 403, intento.text

    # La dueña de la orden sí la ve y la entrega.
    propia = _por_entregar(client, db_session, escenario["doctora"])
    assert propia.json()["total"] == 1


def test_otra_sucursal_no_ve_ni_entrega(client, db_session, escenario):
    lista = _por_entregar(client, db_session, escenario["secretaria_ajena"])
    assert lista.json()["total"] == 0

    intento = client.post(
        _ruta_entregar(escenario["orden"]), headers=_auth_headers(db_session, escenario["secretaria_ajena"])
    )
    assert intento.status_code == 404, intento.text


def test_sin_el_permiso_no_puede_ver_ni_entregar(client, db_session, escenario):
    # A la secretaria se le quita el permiso de entrega con un override.
    db_session.add(Permission(
        role=escenario["secretaria"].role.value,
        action="clinical_tracking.deliver_order",
        is_granted=False,
        user_id=escenario["secretaria"].id,
    ))
    db_session.commit()

    lista = _por_entregar(client, db_session, escenario["secretaria"])
    assert lista.status_code == 403

    intento = client.post(
        _ruta_entregar(escenario["orden"]), headers=_auth_headers(db_session, escenario["secretaria"])
    )
    assert intento.status_code == 403


def test_la_busqueda_encuentra_por_folio_y_por_nombre(client, db_session, escenario):
    orden = escenario["orden"]
    por_folio = _por_entregar(client, db_session, escenario["secretaria"], search=str(orden.id))
    assert por_folio.json()["total"] == 1

    por_nombre = _por_entregar(client, db_session, escenario["secretaria"], search="María")
    assert por_nombre.json()["total"] == 1

    sin_coincidencia = _por_entregar(client, db_session, escenario["secretaria"], search="Zzzz")
    assert sin_coincidencia.json()["total"] == 0


def test_por_entregar_pone_lo_urgente_primero(client, db_session, escenario):
    """Prioridad efectiva por estudio (D-10), con el mismo orden que «por recibir»."""
    t, p, d = escenario["tenant"], escenario["paciente"], escenario["doctora"]
    hoy = date.fromisoformat(DIA)
    escenario["orden"].priority = "routine"
    db_session.commit()
    urgente = _orden(db_session, t, p, d, study_name="Tomografía", priority="urgent", requested_on=hoy, desired_on=None)
    preferente = _orden(db_session, t, p, d, study_name="Resonancia", priority="preferential", requested_on=hoy, desired_on=None)

    items = _por_entregar(client, db_session, escenario["secretaria"]).json()["items"]

    assert [(i["order_id"], i["priority"]) for i in items] == [
        (urgente.id, "urgent"), (preferente.id, "preferential"), (escenario["orden"].id, "routine"),
    ]
