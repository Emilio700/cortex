"""La nota postoperatoria no viaja con la agenda (plan 32, revisión del punto 7).

``appointments.read`` lo tiene recepción y devolvía la nota postoperatoria de
la cirugía, que escribe la doctora. Ahora solo la recibe quien puede leer
notas clínicas. Lo que recepción captura (motivo, notas, preoperatorias) sigue
igual, y editar la cirugía no borra la postoperatoria.
"""
from datetime import datetime, timedelta

import pytest

from app.models.appointment import AppointmentStatus, AppointmentType
from app.models.tenant import Tenant
from app.models.user import Role

from _cobros_base import PREFIX, cita, client, db_session, headers, paciente, usuario  # noqa: F401

POSTOP = "Sangrado mínimo, evolución favorable"


@pytest.fixture
def e(db_session):
    centro = Tenant(name="Centro", is_active=True)
    db_session.add(centro)
    db_session.commit()
    doctora = usuario(db_session, centro, "Cintia", Role.DOCTOR)
    recepcion = usuario(db_session, centro, "Lupita", Role.SECRETARIA)
    ana = paciente(db_session, centro, doctora, "Ana")
    c = cita(db_session, centro, ana, doctora, estado=AppointmentStatus.AGENDADA,
             cuando=datetime.now() + timedelta(days=3))
    c.appointment_type = AppointmentType.CIRUGIA
    c.notes = "Trae estudios"
    c.preop_notes = "AYUNO 8 HORAS"
    c.postop_notes = POSTOP
    db_session.commit()
    return {"doctora": doctora, "recepcion": recepcion, "cita": c}


def _cita(client, db, user, cita_id):
    r = client.get(f"{PREFIX}/appointments/{cita_id}", headers=headers(db, user))
    assert r.status_code == 200, r.text
    return r.json()


def test_recepcion_no_recibe_la_nota_postoperatoria_pero_si_lo_suyo(client, db_session, e):
    datos = _cita(client, db_session, e["recepcion"], e["cita"].id)
    assert datos["postop_notes"] is None
    assert datos["preop_notes"] == "AYUNO 8 HORAS" and datos["notes"] == "Trae estudios"
    lista = client.get(f"{PREFIX}/appointments", headers=headers(db_session, e["recepcion"]))
    assert lista.status_code == 200
    assert POSTOP not in lista.text


def test_la_doctora_si_la_recibe(client, db_session, e):
    assert _cita(client, db_session, e["doctora"], e["cita"].id)["postop_notes"] == POSTOP


def test_recepcion_edita_la_cirugia_sin_borrar_la_postoperatoria(client, db_session, e):
    r = client.put(f"{PREFIX}/appointments/{e['cita'].id}", headers=headers(db_session, e["recepcion"]),
                   json={"preop_notes": "AYUNO 12 HORAS"})
    assert r.status_code == 200, r.text
    assert r.json()["postop_notes"] is None
    db_session.refresh(e["cita"])
    assert e["cita"].postop_notes == POSTOP and e["cita"].preop_notes == "AYUNO 12 HORAS"
