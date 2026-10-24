"""Varios estudios bajo una misma orden (O-02 del backlog de auditoría).

Un perfil prenatal típico son 6–8 estudios; hasta ahora eran 6–8 formularios y
6–8 papeles. La orden agrupada los pide en una sola llamada y los imprime en
un solo papel, pero cada estudio sigue siendo su propia orden, con su estado y
su resultado: el laboratorio no entrega todo el mismo día.

Se comprueba que el lote es todo o nada, que respeta las mismas reglas de
acceso que una orden suelta, que las órdenes sueltas siguen funcionando y que
el papel agrupado sale con todos los estudios vigentes.
"""
import pytest

from app.models.audit_log import AuditLog
from app.models.clinical_tracking import DiagnosticOrder, DiagnosticOrderGroup

from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _orden,
    _pdf_sin_comprimir,
    _texto_del_pdf,
    client,
    db_session,
    escenario,
)

RUTA_LOTES = f"{PREFIX}/clinical-tracking/order-groups"


def _cuerpo(paciente, **cambios):
    cuerpo = {
        "patient_id": paciente.id,
        "clinical_indication": "Perfil prenatal del primer trimestre",
        "priority": "routine",
        "requested_on": "2026-09-29",
        "destination": "Laboratorio Central",
        "studies": [
            {"category": "laboratory", "study_name": "Biometría hemática completa", "catalog_code": "BH",
             "preparation_instructions": "Ayuno de 8 horas"},
            {"category": "laboratory", "study_name": "Examen general de orina", "catalog_code": "EGO"},
            {"category": "obstetric", "study_name": "Ultrasonido obstétrico", "priority": "urgent",
             "clinical_indication": "Sangrado transvaginal escaso", "destination": "Gabinete de imagen"},
        ],
    }
    cuerpo.update(cambios)
    return cuerpo


def _crear_lote(client, db_session, escenario, **cambios):
    respuesta = client.post(
        RUTA_LOTES, json=_cuerpo(escenario["paciente"], **cambios),
        headers=_auth_headers(db_session, escenario["doctora"]),
    )
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


# ---------------------------------------------------------------------------
# Crear el lote
# ---------------------------------------------------------------------------

def test_un_lote_crea_una_orden_por_estudio_con_su_propio_estado(client, db_session, escenario):
    lote = _crear_lote(client, db_session, escenario)

    assert len(lote["orders"]) == 3
    assert all(orden["order_group_id"] == lote["id"] for orden in lote["orders"])
    assert all(orden["status"] == "ordered" for orden in lote["orders"])
    biometria, orina, ultrasonido = lote["orders"]
    # Lo que el estudio no trae lo hereda del lote; lo que trae, manda.
    assert orina["clinical_indication"] == "Perfil prenatal del primer trimestre"
    assert orina["destination"] == "Laboratorio Central"
    assert orina["priority"] == "routine"
    assert ultrasonido["clinical_indication"] == "Sangrado transvaginal escaso"
    assert ultrasonido["priority"] == "urgent"
    assert ultrasonido["destination"] == "Gabinete de imagen"
    assert biometria["preparation_instructions"] == "Ayuno de 8 horas"
    assert db_session.query(DiagnosticOrder).filter(DiagnosticOrder.order_group_id == lote["id"]).count() == 3


def test_el_lote_y_cada_estudio_quedan_en_la_bitacora(client, db_session, escenario):
    lote = _crear_lote(client, db_session, escenario)

    registro = db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_order_group.created").one()
    assert registro.entity_id == lote["id"]
    assert registro.patient_id == escenario["paciente"].id
    assert registro.actor_user_id == escenario["doctora"].id
    altas = db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_order.created").all()
    assert sorted(a.entity_id for a in altas) == sorted(o["id"] for o in lote["orders"])


def test_si_un_estudio_no_se_guarda_no_queda_ninguno(client, db_session, escenario, monkeypatch):
    """Un lote a medias es un papel al que le falta un estudio que el médico sí pidió."""
    import app.routers.clinical_tracking as modulo

    original = modulo.DiagnosticOrder
    creadas = []

    def orden_que_falla_en_la_segunda(**campos):
        creadas.append(campos)
        if len(creadas) == 2:
            raise RuntimeError("falla simulada al guardar el segundo estudio")
        return original(**campos)

    monkeypatch.setattr(modulo, "DiagnosticOrder", orden_que_falla_en_la_segunda)

    with pytest.raises(RuntimeError):
        client.post(
            RUTA_LOTES, json=_cuerpo(escenario["paciente"]),
            headers=_auth_headers(db_session, escenario["doctora"]),
        )

    assert db_session.query(DiagnosticOrderGroup).count() == 0
    assert db_session.query(original).filter(original.order_group_id.isnot(None)).count() == 0
    assert db_session.query(AuditLog).filter(AuditLog.action.like("diagnostic_order%created")).count() == 0


def test_un_estudio_repetido_en_el_lote_se_rechaza(client, db_session, escenario):
    cuerpo = _cuerpo(escenario["paciente"])
    cuerpo["studies"].append({"category": "laboratory", "study_name": "BH otra vez", "catalog_code": "bh"})

    respuesta = client.post(RUTA_LOTES, json=cuerpo, headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 422
    assert db_session.query(DiagnosticOrderGroup).count() == 0


def test_un_lote_sin_estudios_se_rechaza(client, db_session, escenario):
    respuesta = client.post(
        RUTA_LOTES, json=_cuerpo(escenario["paciente"], studies=[]),
        headers=_auth_headers(db_session, escenario["doctora"]),
    )

    assert respuesta.status_code == 422


def test_la_doctora_ajena_no_pide_estudios_para_la_paciente_de_otra(client, db_session, escenario):
    respuesta = client.post(
        RUTA_LOTES, json=_cuerpo(escenario["paciente"]), headers=_auth_headers(db_session, escenario["colega"]),
    )

    assert respuesta.status_code == 403
    assert db_session.query(DiagnosticOrderGroup).count() == 0


def test_otra_sucursal_no_ve_a_la_paciente(client, db_session, escenario):
    respuesta = client.post(
        RUTA_LOTES, json=_cuerpo(escenario["paciente"]), headers=_auth_headers(db_session, escenario["doctora_ajena"]),
    )

    assert respuesta.status_code == 404


def test_recepcion_no_pide_estudios(client, db_session, escenario):
    respuesta = client.post(
        RUTA_LOTES, json=_cuerpo(escenario["paciente"]), headers=_auth_headers(db_session, escenario["secretaria"]),
    )

    assert respuesta.status_code == 403


# ---------------------------------------------------------------------------
# Compatibilidad con las órdenes sueltas
# ---------------------------------------------------------------------------

def test_las_ordenes_sueltas_siguen_valiendo_junto_a_las_agrupadas(client, db_session, escenario):
    lote = _crear_lote(client, db_session, escenario)
    headers = _auth_headers(db_session, escenario["doctora"])
    suelta = client.post(f"{PREFIX}/clinical-tracking/orders", headers=headers, json={
        "patient_id": escenario["paciente"].id, "category": "laboratory", "study_name": "Glucosa en ayuno",
        "clinical_indication": "Tamizaje", "requested_on": "2026-09-29",
    })
    assert suelta.status_code == 201
    assert suelta.json()["order_group_id"] is None

    listado = client.get(f"{PREFIX}/clinical-tracking/patient/{escenario['paciente'].id}/orders", headers=headers)

    assert listado.status_code == 200
    grupos = {orden["id"]: orden["order_group_id"] for orden in listado.json()}
    assert grupos[escenario["orden"].id] is None  # la que ya existía
    assert grupos[suelta.json()["id"]] is None
    assert all(grupos[orden["id"]] == lote["id"] for orden in lote["orders"])


def test_la_doctora_consulta_el_lote_con_el_estado_de_cada_estudio(client, db_session, escenario):
    lote = _crear_lote(client, db_session, escenario)

    respuesta = client.get(f"{RUTA_LOTES}/{lote['id']}", headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 200
    assert [o["study_name"] for o in respuesta.json()["orders"]] == [
        "Biometría hemática completa", "Examen general de orina", "Ultrasonido obstétrico",
    ]


@pytest.mark.parametrize("quien, codigo", [("colega", 403), ("secretaria", 403), ("doctora_ajena", 404)])
def test_consultar_el_lote_respeta_el_alcance(client, db_session, escenario, quien, codigo):
    lote = _crear_lote(client, db_session, escenario)

    respuesta = client.get(f"{RUTA_LOTES}/{lote['id']}", headers=_auth_headers(db_session, escenario[quien]))

    assert respuesta.status_code == codigo


# ---------------------------------------------------------------------------
# El papel agrupado
# ---------------------------------------------------------------------------

def test_el_papel_agrupado_lleva_todos_los_estudios(client, db_session, escenario):
    lote = _crear_lote(client, db_session, escenario)

    respuesta = client.get(f"{RUTA_LOTES}/{lote['id']}/pdf", headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 200
    import re

    # Folio homologado (plan 32) en el archivo y en el papel.
    folio = re.search(r"Orden_de_estudios_(.+)\.pdf", respuesta.headers["content-disposition"]).group(1)
    assert "-ORD-" in folio
    assert respuesta.headers["x-folio"] == folio
    texto = _texto_del_pdf(respuesta.content)
    for fragmento in (
        "ORDEN DE ESTUDIOS",
        f"FOLIO: {folio}",
        # Separado por destino, que es el modo de fábrica (plan 26, D-2).
        "LABORATORIO (2)",
        "IMAGEN Y GABINETE (1)",
        "1. Biometría hemática completa",
        "2. Examen general de orina",
        "3. Ultrasonido obstétrico",
        "Perfil prenatal del primer trimestre",
        "Sangrado transvaginal escaso",
        "Ayuno de 8 horas",
        "Gabinete de imagen",
        "Urgente",
        "María López Pérez",
    ):
        assert fragmento in texto, fragmento
    for orden in lote["orders"]:
        assert str(orden["id"]) in texto
    for fragmento in ("6691112233", "maria@correo.com", "PENICILINA"):
        assert fragmento not in texto, fragmento


def test_un_estudio_cancelado_no_sale_en_el_papel_del_lote(client, db_session, escenario):
    lote = _crear_lote(client, db_session, escenario)
    orina = db_session.get(DiagnosticOrder, lote["orders"][1]["id"])
    orina.status = "cancelled"
    db_session.commit()

    respuesta = client.get(f"{RUTA_LOTES}/{lote['id']}/pdf", headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 200
    texto = _texto_del_pdf(respuesta.content)
    assert "Examen general de orina" not in texto
    assert "LABORATORIO (1)" in texto
    registro = db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_order_group.pdf_generated").one()
    assert sorted(registro.details["order_ids"]) == sorted([lote["orders"][0]["id"], lote["orders"][2]["id"]])


def test_un_lote_con_todo_cancelado_no_se_imprime(client, db_session, escenario):
    lote = _crear_lote(client, db_session, escenario)
    for orden in db_session.query(DiagnosticOrder).filter(DiagnosticOrder.order_group_id == lote["id"]):
        orden.status = "cancelled"
    db_session.commit()

    respuesta = client.get(f"{RUTA_LOTES}/{lote['id']}/pdf", headers=_auth_headers(db_session, escenario["doctora"]))

    assert respuesta.status_code == 409
    assert "no se imprime" in respuesta.json()["detail"]
    assert db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_order_group.pdf_generated").count() == 0


@pytest.mark.parametrize("quien, codigo", [
    ("secretaria", 200), ("admin", 200), ("colega", 403), ("secretaria_ajena", 404), ("doctora_ajena", 404),
])
def test_el_papel_del_lote_tiene_los_mismos_permisos_que_el_de_una_orden(client, db_session, escenario, quien, codigo):
    lote = _crear_lote(client, db_session, escenario)

    respuesta = client.get(f"{RUTA_LOTES}/{lote['id']}/pdf", headers=_auth_headers(db_session, escenario[quien]))

    assert respuesta.status_code == codigo


def test_la_orden_suelta_de_un_lote_se_sigue_imprimiendo_sola(client, db_session, escenario):
    """El papel de O-01 sigue sirviendo para reimprimir un solo estudio del lote."""
    lote = _crear_lote(client, db_session, escenario)
    orden_id = lote["orders"][0]["id"]

    respuesta = client.get(
        f"{PREFIX}/clinical-tracking/orders/{orden_id}/pdf", headers=_auth_headers(db_session, escenario["secretaria"]),
    )

    assert respuesta.status_code == 200
    texto = _texto_del_pdf(respuesta.content)
    assert "Biometría hemática completa" in texto
    assert "Examen general de orina" not in texto
