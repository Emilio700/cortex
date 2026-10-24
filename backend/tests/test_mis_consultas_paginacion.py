"""Mis Consultas pagina en el servidor (plan 32, punto 4).

Con el tope fijo de 100 no había forma de llegar a la consulta 101 sin acotar
fechas, y el servidor no decía cuántas había. Ahora el total va en
``X-Total-Count`` con los mismos filtros, y la búsqueda alcanza expediente y
teléfono.
"""
from datetime import datetime, timedelta

import pytest

from app.models.appointment import AppointmentStatus
from app.models.tenant import Tenant
from app.models.user import Role

from _cobros_base import PREFIX, cita, client, db_session, headers, paciente, usuario  # noqa: F401

BASE = datetime(2026, 9, 1, 9, 0)


@pytest.fixture
def e(db_session):
    t = Tenant(name="Consultorio", is_active=True)
    otra_sucursal = Tenant(name="Otra sucursal", is_active=True)
    db_session.add_all([t, otra_sucursal])
    db_session.commit()
    doctora = usuario(db_session, t, "Cintia Castro", Role.DOCTOR)
    colega = usuario(db_session, t, "Yara Gutierrez", Role.DOCTOR)
    ajena = usuario(db_session, otra_sucursal, "Lara Ajena", Role.DOCTOR)
    ana = paciente(db_session, t, doctora, "Ana")
    ana.phone = "669 123 4567"
    bea = paciente(db_session, t, doctora, "Beatriz")
    bea.cell_phone = "6697654321"
    db_session.commit()
    return {"t": t, "otra": otra_sucursal, "doctora": doctora, "colega": colega, "ajena": ajena,
            "ana": ana, "bea": bea}


def _pedir(client, db, user, **params):
    r = client.get(f"{PREFIX}/appointments/my-appointments", headers=headers(db, user), params=params)
    assert r.status_code == 200, r.text
    return r.json(), int(r.headers["X-Total-Count"])


def test_pasa_de_la_consulta_cien_con_el_total_exacto(client, db_session, e):
    for i in range(130):
        cita(db_session, e["t"], e["ana"], e["doctora"], cuando=BASE + timedelta(hours=i))
    primera, total = _pedir(client, db_session, e["doctora"], skip=0, limit=100)
    resto, total2 = _pedir(client, db_session, e["doctora"], skip=100, limit=100)
    assert total == total2 == 130
    assert len(primera) == 100 and len(resto) == 30
    ids = [c["id"] for c in primera + resto]
    assert len(set(ids)) == 130, "ninguna cita se repite ni se pierde entre páginas"


def test_solo_las_de_la_doctora_y_de_su_sucursal(client, db_session, e):
    cita(db_session, e["t"], e["ana"], e["doctora"], cuando=BASE)
    cita(db_session, e["t"], e["ana"], e["colega"], cuando=BASE)
    externa = paciente(db_session, e["otra"], e["ajena"], "Externa")
    cita(db_session, e["otra"], externa, e["ajena"], cuando=BASE)
    datos, total = _pedir(client, db_session, e["doctora"])
    assert total == 1
    assert {c["doctor_id"] for c in datos} == {e["doctora"].id}


def test_el_total_respeta_el_estado(client, db_session, e):
    cita(db_session, e["t"], e["ana"], e["doctora"], AppointmentStatus.ATENDIDA, BASE)
    cita(db_session, e["t"], e["ana"], e["doctora"], AppointmentStatus.CANCELADA, BASE + timedelta(hours=1))
    datos, total = _pedir(client, db_session, e["doctora"], status="cancelada", limit=1)
    assert total == 1 and datos[0]["status"] == "cancelada"


def test_orden_explicito_y_desempate_estable(client, db_session, e):
    a = cita(db_session, e["t"], e["ana"], e["doctora"], cuando=BASE)
    b = cita(db_session, e["t"], e["bea"], e["doctora"], cuando=BASE)
    c = cita(db_session, e["t"], e["ana"], e["doctora"], cuando=BASE + timedelta(days=1))
    asc, _ = _pedir(client, db_session, e["doctora"], orden="asc")
    desc, _ = _pedir(client, db_session, e["doctora"], orden="desc")
    assert [x["id"] for x in asc] == [a.id, b.id, c.id]
    assert [x["id"] for x in desc] == [c.id, b.id, a.id]
    # Sin orden explícito, el historial sigue siendo lo más reciente primero.
    sin, _ = _pedir(client, db_session, e["doctora"])
    assert sin[0]["id"] == c.id


def test_orden_invalido_se_rechaza(client, db_session, e):
    r = client.get(f"{PREFIX}/appointments/my-appointments", headers=headers(db_session, e["doctora"]),
                   params={"orden": "x"})
    assert r.status_code == 422


@pytest.mark.parametrize("termino,quien", [
    ("beatriz", "bea"),
    ("6691234567", "ana"),
    ("669-765", "bea"),
])
def test_busca_por_nombre_y_telefono(client, db_session, e, termino, quien):
    cita(db_session, e["t"], e["ana"], e["doctora"], cuando=BASE)
    cita(db_session, e["t"], e["bea"], e["doctora"], cuando=BASE)
    datos, total = _pedir(client, db_session, e["doctora"], q=termino)
    assert total == 1 and datos[0]["patient_id"] == e[quien].id


def test_busca_por_numero_de_expediente(client, db_session, e):
    cita(db_session, e["t"], e["ana"], e["doctora"], cuando=BASE)
    cita(db_session, e["t"], e["bea"], e["doctora"], cuando=BASE)
    datos, total = _pedir(client, db_session, e["doctora"], q=str(e["bea"].id))
    assert total == 1 and datos[0]["patient_id"] == e["bea"].id


def test_la_busqueda_no_alcanza_citas_de_otra_doctora(client, db_session, e):
    cita(db_session, e["t"], e["ana"], e["colega"], cuando=BASE)
    datos, total = _pedir(client, db_session, e["doctora"], q="ana")
    assert total == 0 and datos == []


def test_comodines_se_toman_literal(client, db_session, e):
    cita(db_session, e["t"], e["ana"], e["doctora"], cuando=BASE)
    _, total = _pedir(client, db_session, e["doctora"], q="%")
    assert total == 0


def test_filtra_por_tipo_de_cita(client, db_session, e):
    from app.models.appointment import AppointmentType

    c = cita(db_session, e["t"], e["ana"], e["doctora"], cuando=BASE)
    c.appointment_type = AppointmentType.CIRUGIA
    cita(db_session, e["t"], e["bea"], e["doctora"], cuando=BASE)
    db_session.commit()
    datos, total = _pedir(client, db_session, e["doctora"], appointment_type="cirugia")
    assert total == 1 and datos[0]["id"] == c.id


def test_resumen_del_dia_lo_cuenta_el_servidor(client, db_session, e):
    dia = BASE.date()
    for estado in (AppointmentStatus.AGENDADA, AppointmentStatus.EN_SALA, AppointmentStatus.ATENDIDA,
                   AppointmentStatus.CANCELADA):
        cita(db_session, e["t"], e["ana"], e["doctora"], estado, BASE)
    cita(db_session, e["t"], e["ana"], e["doctora"], AppointmentStatus.AGENDADA, BASE + timedelta(days=1))
    cita(db_session, e["t"], e["ana"], e["colega"], AppointmentStatus.AGENDADA, BASE)
    r = client.get(f"{PREFIX}/appointments/my-appointments/resumen-del-dia", params={"fecha": dia.isoformat()},
                   headers=headers(db_session, e["doctora"]))
    assert r.status_code == 200, r.text
    assert r.json() == {"fecha": dia.isoformat(), "total": 3, "pendientes": 2, "atendidas": 1}
