"""Datos que el inicio de la doctora necesita de la cita (plan 28, Fase 3 y D-4).

- La paciente de la cita trae su fecha de nacimiento, para la edad.
- La cita trae las semanas de gestación al día de la cita, si la paciente tiene
  un embarazo activo y la sesión puede leerlo.
- «Hoy» se puede pedir como fecha local (``fecha_desde``/``fecha_hasta``) y no
  como instante UTC del navegador.
- El tablero de FPP trae el nombre, no incluye vencidas viejas y marca las
  recientes.
"""
from datetime import date, datetime, timedelta

import pytest

from app.models.appointment import AppointmentStatus
from app.models.pregnancy import Pregnancy
from app.models.tenant import Tenant
from app.models.user import Role
from app.services.datos_de_cita import edad_gestacional

from _cobros_base import PREFIX, cita, client, db_session, headers, paciente, usuario  # noqa: F401


@pytest.fixture
def e(db_session):
    tenant = Tenant(name="Consultorio", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    doctora = usuario(db_session, tenant, "Cintia Castro", Role.DOCTOR)
    otra = usuario(db_session, tenant, "Yara Gutierrez", Role.DOCTOR)
    recepcion = usuario(db_session, tenant, "Lupita Recepcion", Role.SECRETARIA)
    ana = paciente(db_session, tenant, doctora, "Ana")
    return {"tenant": tenant, "doctora": doctora, "otra": otra, "recepcion": recepcion, "ana": ana}


def _embarazo(db, e, *, fur=None, fpp=None, doctora=None, estado="active", paciente=None):
    emb = Pregnancy(
        tenant_id=e["tenant"].id,
        patient_id=(paciente or e["ana"]).id,
        doctor_id=(doctora or e["doctora"]).id,
        status=estado,
        last_menstrual_period=fur,
        estimated_delivery_date=fpp,
    )
    db.add(emb)
    db.commit()
    return emb


def _mis_citas(client, db, user, **params):
    r = client.get(f"{PREFIX}/appointments/my-appointments", headers=headers(db, user), params=params)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Regla de la edad gestacional (la misma del expediente)
# ---------------------------------------------------------------------------

def test_edad_gestacional_por_fur_al_dia_de_referencia():
    assert edad_gestacional(date(2026, 3, 1), None, date(2026, 9, 15)) == (28, 2)


def test_sin_fur_usa_la_implicita_en_la_fpp():
    # FPP − 280 días = 2026-03-01.
    assert edad_gestacional(None, date(2026, 12, 6), date(2026, 9, 15)) == (28, 2)


def test_la_fur_registrada_manda_sobre_la_fpp():
    assert edad_gestacional(date(2026, 3, 1), date(2027, 1, 1), date(2026, 9, 15)) == (28, 2)


@pytest.mark.parametrize(
    "fur, referencia",
    [
        (None, date(2026, 9, 15)),  # sin datación
        (date(2026, 3, 1), date(2026, 2, 1)),  # cita de antes del embarazo
        (date(2025, 1, 1), date(2026, 9, 15)),  # embarazo viejo sin cerrar
    ],
)
def test_no_inventa_edad_gestacional(fur, referencia):
    assert edad_gestacional(fur, None, referencia) is None


# ---------------------------------------------------------------------------
# La cita en la agenda
# ---------------------------------------------------------------------------

def test_la_paciente_de_la_cita_trae_su_fecha_de_nacimiento(client, db_session, e):
    cita(db_session, e["tenant"], e["ana"], e["doctora"], AppointmentStatus.AGENDADA, cuando=datetime(2026, 10, 4, 9))

    [c] = _mis_citas(client, db_session, e["doctora"])

    assert c["patient"]["date_of_birth"] == "1990-05-20"


def test_las_semanas_se_calculan_al_dia_de_cada_cita(client, db_session, e):
    _embarazo(db_session, e, fur=date(2026, 3, 1))
    cita(db_session, e["tenant"], e["ana"], e["doctora"], AppointmentStatus.AGENDADA, cuando=datetime(2026, 9, 15, 9))
    cita(db_session, e["tenant"], e["ana"], e["doctora"], AppointmentStatus.AGENDADA, cuando=datetime(2026, 9, 29, 9))
    # De antes del embarazo: no tiene semanas, no 0.
    cita(db_session, e["tenant"], e["ana"], e["doctora"], AppointmentStatus.ATENDIDA, cuando=datetime(2026, 1, 10, 9))

    citas = {c["scheduled_at"][:10]: c for c in _mis_citas(client, db_session, e["doctora"])}

    assert (citas["2026-09-15"]["semanas_gestacion"], citas["2026-09-15"]["dias_gestacion"]) == (28, 2)
    assert (citas["2026-09-29"]["semanas_gestacion"], citas["2026-09-29"]["dias_gestacion"]) == (30, 2)
    assert citas["2026-01-10"]["semanas_gestacion"] is None
    assert citas["2026-01-10"]["dias_gestacion"] is None


def test_sin_embarazo_activo_no_hay_semanas(client, db_session, e):
    _embarazo(db_session, e, fur=date(2026, 3, 1), estado="completed")
    cita(db_session, e["tenant"], e["ana"], e["doctora"], AppointmentStatus.AGENDADA, cuando=datetime(2026, 9, 15, 9))

    [c] = _mis_citas(client, db_session, e["doctora"])

    assert c["semanas_gestacion"] is None


def test_recepcion_no_recibe_las_semanas(client, db_session, e):
    """Es dato clínico: recepción no tiene ``prenatal.read`` por omisión."""
    _embarazo(db_session, e, fur=date(2026, 3, 1))
    cita(db_session, e["tenant"], e["ana"], e["doctora"], AppointmentStatus.AGENDADA, cuando=datetime(2026, 9, 15, 9))

    r = client.get(f"{PREFIX}/appointments", headers=headers(db_session, e["recepcion"]))

    assert r.status_code == 200
    [c] = r.json()
    assert c["semanas_gestacion"] is None
    # La fecha de nacimiento sí: recepción ya la ve en la ficha de la paciente.
    assert c["patient"]["date_of_birth"] == "1990-05-20"


def test_la_doctora_no_ve_las_semanas_de_un_embarazo_que_lleva_otra(client, db_session, e):
    _embarazo(db_session, e, fur=date(2026, 3, 1), doctora=e["otra"])
    cita(db_session, e["tenant"], e["ana"], e["doctora"], AppointmentStatus.AGENDADA, cuando=datetime(2026, 9, 15, 9))

    [c] = _mis_citas(client, db_session, e["doctora"])

    assert c["semanas_gestacion"] is None


def test_el_dia_local_incluye_la_cita_de_las_2330_y_excluye_la_del_dia_siguiente(client, db_session, e):
    """``scheduled_at`` es hora local: el día se arma con la fecha, sin pasar por UTC."""
    for cuando in (datetime(2026, 10, 3, 23, 59), datetime(2026, 10, 4, 0, 0), datetime(2026, 10, 4, 23, 30),
                   datetime(2026, 10, 5, 0, 0)):
        cita(db_session, e["tenant"], e["ana"], e["doctora"], AppointmentStatus.AGENDADA, cuando=cuando)

    citas = _mis_citas(client, db_session, e["doctora"], fecha_desde="2026-10-04", fecha_hasta="2026-10-04")

    assert [c["scheduled_at"] for c in citas] == ["2026-10-04T00:00:00", "2026-10-04T23:30:00"]


def test_el_rango_de_dias_locales_tambien_sirve_en_la_agenda(client, db_session, e):
    for dia in (1, 15, 31):
        cita(db_session, e["tenant"], e["ana"], e["doctora"], AppointmentStatus.AGENDADA, cuando=datetime(2026, 10, dia, 12))
    cita(db_session, e["tenant"], e["ana"], e["doctora"], AppointmentStatus.AGENDADA, cuando=datetime(2026, 11, 1, 8))

    r = client.get(
        f"{PREFIX}/appointments",
        headers=headers(db_session, e["recepcion"]),
        params={"fecha_desde": "2026-10-01", "fecha_hasta": "2026-10-31"},
    )

    assert [c["scheduled_at"][:10] for c in r.json()] == ["2026-10-01", "2026-10-15", "2026-10-31"]


# ---------------------------------------------------------------------------
# Tablero de FPP
# ---------------------------------------------------------------------------

def test_el_tablero_de_fpp_trae_el_nombre_y_marca_las_vencidas_recientes(client, db_session, e, monkeypatch):
    import app.routers.clinical_tracking as rutas

    hoy = date(2026, 10, 4)
    monkeypatch.setattr(rutas, "hoy_local", lambda: hoy)
    beto = paciente(db_session, e["tenant"], e["doctora"], "Berta")
    caro = paciente(db_session, e["tenant"], e["doctora"], "Carola")
    vieja = _embarazo(db_session, e, fpp=hoy - timedelta(days=90), paciente=caro)
    reciente = _embarazo(db_session, e, fpp=hoy - timedelta(days=3), paciente=beto)
    proxima = _embarazo(db_session, e, fpp=hoy + timedelta(days=10))

    r = client.get(f"{PREFIX}/clinical-tracking/obstetric-dashboard", headers=headers(db_session, e["doctora"]))

    assert r.status_code == 200, r.text
    items = {i["pregnancy_id"]: i for i in r.json()}
    assert vieja.id not in items
    assert items[reciente.id]["vencida"] is True
    assert items[reciente.id]["patient_full_name"] == "Berta De Prueba"
    assert items[proxima.id]["vencida"] is False
    assert items[proxima.id]["patient_full_name"] == "Ana De Prueba"


def test_el_limite_de_vencidas_se_cuenta_desde_hoy_local(client, db_session, e, monkeypatch):
    """A las 23:30 del 3 de octubre en Mazatlán, en UTC ya es el 4: manda el 3."""
    import app.routers.clinical_tracking as rutas

    monkeypatch.setattr(rutas, "hoy_local", lambda: date(2026, 10, 3))
    justo = _embarazo(db_session, e, fpp=date(2026, 9, 19))  # 14 días antes del 3
    fuera = _embarazo(db_session, e, fpp=date(2026, 9, 18))
    hoy_mismo = _embarazo(db_session, e, fpp=date(2026, 10, 3))

    r = client.get(f"{PREFIX}/clinical-tracking/obstetric-dashboard", headers=headers(db_session, e["doctora"]))

    items = {i["pregnancy_id"]: i for i in r.json()}
    assert justo.id in items and fuera.id not in items
    # El día de la FPP todavía no está vencida.
    assert items[hoy_mismo.id]["vencida"] is False
