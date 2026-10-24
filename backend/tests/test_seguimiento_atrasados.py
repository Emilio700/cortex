"""Seguimiento de estudios atrasados (plan 32, punto 3).

- La regla usa los plazos del médico que pidió el estudio (7/15/30 de fábrica).
- Un seguimiento con «volver a revisar» lo saca de atrasados hasta esa fecha;
  el más reciente manda.
- Lo registran el médico y recepción, con alcance de sucursal; queda quién y cuándo.
- El aviso diario es uno por doctora, agrupado, y se cierra solo.
Reloj fijo: 05:30 UTC del 10 de octubre, que en Mazatlán sigue siendo el 9.
"""
from datetime import date, datetime, timedelta

import pytest

from app.models.clinical_tracking import DiagnosticOrder, DiagnosticOrderFollowUp
from app.models.doctor_profile import DoctorProfile
from app.models.notification import Notification, NotificationType
from app.services import avisos_de_atrasados, estudios_atrasados

from test_bandeja_por_paciente import _pedir, _resultado  # noqa: F401
from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _orden,
    client,
    db_session,
    escenario,
)
from _reloj import servidor_en_utc

INSTANTE = datetime(2026, 10, 10, 5, 30)
HOY = date(2026, 10, 9)
RESUMEN = f"{PREFIX}/clinical-tracking/orders/inbox-summary"


@pytest.fixture(autouse=True)
def reloj(monkeypatch):
    servidor_en_utc(monkeypatch, INSTANTE, estudios_atrasados)
    import app.schemas.clinical_tracking as esquemas
    monkeypatch.setattr(esquemas, "hoy_local", lambda: HOY)


@pytest.fixture
def e(db_session, escenario):
    db_session.query(DiagnosticOrder).delete()
    db_session.commit()
    return escenario


def _vieja(db, e, dias=40, prioridad="routine", doctora=None):
    return _orden(db, e["tenant"], e["paciente"], doctora or e["doctora"], priority=prioridad,
                  requested_on=HOY - timedelta(days=dias), desired_on=None)


def _seguir(client, db, quien, orden, **datos):
    cuerpo = {"motivo": "no_se_lo_ha_hecho", "revisar_el": (HOY + timedelta(days=5)).isoformat(), **datos}
    return client.post(f"{PREFIX}/clinical-tracking/orders/{orden.id}/seguimientos", json=cuerpo,
                       headers=_auth_headers(db, quien))


def _atrasados(client, db, quien):
    return client.get(RESUMEN, headers=_auth_headers(db, quien)).json()["atrasados"]


def test_los_plazos_de_la_doctora_mandan_sobre_los_de_fabrica(client, db_session, e):
    _vieja(db_session, e, dias=10, prioridad="urgent")
    assert _atrasados(client, db_session, e["doctora"]) == 1
    db_session.query(DoctorProfile).filter_by(user_id=e["doctora"].id).update(
        {"plazos_atrasado": {"urgent": 14, "preferential": 15, "routine": 30}}
    )
    db_session.commit()
    assert _atrasados(client, db_session, e["doctora"]) == 0


def test_plazos_en_el_perfil_validan_y_se_guardan(client, db_session, e):
    ruta = f"{PREFIX}/doctor-profile/me/plazos-atrasado"
    h = _auth_headers(db_session, e["doctora"])
    assert client.get(ruta, headers=h).json() == {"urgent": 7, "preferential": 15, "routine": 30}
    assert client.put(ruta, json={"urgent": 0, "preferential": 15, "routine": 30}, headers=h).status_code == 422
    assert client.put(ruta, json={"urgent": 3, "otra": 1}, headers=h).status_code == 422
    assert client.put(ruta, json={"urgent": 3, "preferential": 10, "routine": 20}, headers=h).status_code == 200
    assert client.get(ruta, headers=h).json() == {"urgent": 3, "preferential": 10, "routine": 20}


def test_recepcion_registra_seguimiento_y_sale_de_atrasados_hasta_la_fecha(client, db_session, e, monkeypatch):
    orden = _vieja(db_session, e)
    r = _seguir(client, db_session, e["secretaria"], orden, motivo="en_proceso_laboratorio", nota="Lab. Central dice el lunes")
    assert r.status_code == 201, r.text
    cuerpo = r.json()
    assert cuerpo["registrado_por_user_id"] == e["secretaria"].id
    assert cuerpo["motivo_texto"] == "Está en proceso en el laboratorio"
    assert _atrasados(client, db_session, e["doctora"]) == 0

    # La fila de la bandeja dice el último seguimiento y ya no la marca atrasada.
    fila = _pedir(client, db_session, e["doctora"])["items"][0]["orders"][0]
    assert fila["atrasada"] is False
    assert fila["dias_sin_resultado"] == 40
    assert fila["ultimo_seguimiento"]["nota"] == "Lab. Central dice el lunes"

    # Pasada la fecha de «volver a revisar», vuelve a contar.
    servidor_en_utc(monkeypatch, INSTANTE + timedelta(days=6), estudios_atrasados)
    assert _atrasados(client, db_session, e["doctora"]) == 1


def test_el_seguimiento_mas_reciente_manda(client, db_session, e):
    orden = _vieja(db_session, e)
    _seguir(client, db_session, e["doctora"], orden, revisar_el=(HOY + timedelta(days=30)).isoformat())
    db_session.query(DiagnosticOrderFollowUp).update({"created_at": datetime(2026, 10, 1)})
    db_session.commit()
    # El nuevo dice «mañana»: lo de dentro de un mes ya no vale.
    db_session.add(DiagnosticOrderFollowUp(
        tenant_id=orden.tenant_id, diagnostic_order_id=orden.id, motivo="reagendado", revisar_el=HOY,
        registrado_por_user_id=e["doctora"].id, created_at=datetime(2026, 10, 9, 12),
    ))
    db_session.commit()
    assert _atrasados(client, db_session, e["doctora"]) == 1


@pytest.mark.parametrize("datos,mensaje", [
    ({"revisar_el": HOY.isoformat()}, "después de hoy"),
    ({"motivo": "otro"}, "Otro"),
    ({"motivo": "inventado"}, None),
])
def test_validaciones_del_seguimiento(client, db_session, e, datos, mensaje):
    r = _seguir(client, db_session, e["doctora"], _vieja(db_session, e), **datos)
    assert r.status_code == 422
    if mensaje:
        assert mensaje in r.text


def test_no_se_le_da_seguimiento_a_lo_que_ya_tiene_resultado(client, db_session, e):
    orden = _vieja(db_session, e)
    _resultado(db_session, orden)
    assert _seguir(client, db_session, e["doctora"], orden).status_code == 409


def test_otra_sucursal_no_lo_alcanza(client, db_session, e):
    r = _seguir(client, db_session, e["secretaria_ajena"], _vieja(db_session, e))
    assert r.status_code == 404


def test_el_historial_trae_todos_con_autor(client, db_session, e):
    orden = _vieja(db_session, e)
    _seguir(client, db_session, e["secretaria"], orden)
    _seguir(client, db_session, e["doctora"], orden, motivo="reagendado")
    lista = client.get(f"{PREFIX}/clinical-tracking/orders/{orden.id}/seguimientos",
                       headers=_auth_headers(db_session, e["doctora"])).json()
    assert [s["motivo"] for s in lista] == ["reagendado", "no_se_lo_ha_hecho"]
    assert all(s["registrado_por_nombre"] for s in lista)


def test_recepcion_ve_solo_los_atrasados_en_subir_resultado(client, db_session, e):
    _vieja(db_session, e)
    _orden(db_session, e["tenant"], e["paciente"], e["doctora"], requested_on=HOY, desired_on=None)
    r = client.get(f"{PREFIX}/clinical-tracking/orders/awaiting-result", params={"solo_atrasadas": True},
                   headers=_auth_headers(db_session, e["secretaria"]))
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1 and items[0]["atrasada"] is True and items[0]["dias_sin_resultado"] == 40


def _avisos(db, doctora):
    return db.query(Notification).filter(
        Notification.user_id == doctora.id, Notification.type == NotificationType.STUDIES_OVERDUE
    ).all()


def test_un_solo_aviso_agrupado_por_dia_y_se_cierra_solo(client, db_session, e):
    a, b = _vieja(db_session, e), _vieja(db_session, e, dias=50)
    avisos_de_atrasados.ejecutar(db_session, HOY)
    avisos_de_atrasados.ejecutar(db_session, HOY)  # repetir no abre otro
    avisos = _avisos(db_session, e["doctora"])
    assert len(avisos) == 1 and avisos[0].title == "2 estudios atrasados"
    assert avisos[0].resolved_at is None

    _seguir(client, db_session, e["secretaria"], a)
    db_session.refresh(avisos[0])
    assert avisos[0].resolved_at is None  # todavía queda uno
    _seguir(client, db_session, e["doctora"], b)
    db_session.refresh(avisos[0])
    assert avisos[0].resolved_at is not None


def test_la_corrida_actualiza_el_numero_del_aviso_abierto(db_session, e):
    _vieja(db_session, e)
    avisos_de_atrasados.ejecutar(db_session, HOY)
    _vieja(db_session, e, dias=45)
    avisos_de_atrasados.ejecutar(db_session, HOY)
    avisos = _avisos(db_session, e["doctora"])
    assert len(avisos) == 1 and avisos[0].title == "2 estudios atrasados"


def test_la_franja_y_las_filas_de_la_bandeja_dicen_lo_mismo(client, db_session, e):
    """Lo que cuenta el segmento «Atrasados» son exactamente las filas marcadas."""
    from app.models.patient import Patient

    otra = Patient(tenant_id=e["tenant"].id, first_name="Otra", last_name="Paciente", owner_doctor_id=e["doctora"].id)
    db_session.add(otra)
    db_session.commit()
    _vieja(db_session, e, dias=50, prioridad="urgent")
    _orden(db_session, e["tenant"], otra, e["doctora"], priority="urgent", requested_on=HOY - timedelta(days=49),
           desired_on=None, study_name="Perfil tiroideo")
    _orden(db_session, e["tenant"], otra, e["doctora"], priority="routine", requested_on=HOY, desired_on=None)

    conteo = _atrasados(client, db_session, e["doctora"])
    for filtro in ("atrasados", "activas"):
        cuerpo = _pedir(client, db_session, e["doctora"], filtro=filtro)
        marcadas = [o for item in cuerpo["items"] for o in item["orders"] if o["atrasada"]]
        assert len(marcadas) == conteo == 2, filtro
        assert all(o["dias_sin_resultado"] >= 49 for o in marcadas)
