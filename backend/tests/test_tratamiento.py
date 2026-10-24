""""Dr." o "Dra.": el tratamiento se captura, no se supone.

Antes el código armaba ``f"Dr. {nombre}"`` y a las doctoras les llegaba "Dr."
en el recibo, en los avisos a secretaría y en la receta. Ahora cada usuaria
trae su tratamiento; sin él va el nombre solo, porque un "Dr." equivocado a
una doctora es peor que no poner nada (plan 23, ajustes del 2026-09-28).
"""
from types import SimpleNamespace

import pytest

from _cobros_base import PREFIX, cita, client, db_session, e, headers  # noqa: F401

from app.models.appointment import AppointmentStatus
from app.models.notification import Notification
from app.models.user import User
from app.utils.tratamiento import nombre_con_tratamiento, normalizar_tratamiento


@pytest.mark.parametrize(
    "escrito, guardado",
    [("Dra.", "Dra."), ("dra", "Dra."), (" DR. ", "Dr."), ("", None), (None, None)],
)
def test_el_tratamiento_se_normaliza(escrito, guardado):
    assert normalizar_tratamiento(escrito) == guardado


def test_un_tratamiento_que_no_es_dr_ni_dra_se_rechaza():
    with pytest.raises(ValueError):
        normalizar_tratamiento("Lic.")


def test_sin_tratamiento_va_el_nombre_solo():
    assert nombre_con_tratamiento(SimpleNamespace(full_name="Cintia Castro", tratamiento=None)) == "Cintia Castro"
    assert nombre_con_tratamiento(SimpleNamespace(full_name="Cintia Castro", tratamiento="Dra.")) == "Dra. Cintia Castro"
    assert nombre_con_tratamiento(None) == ""


def test_administracion_captura_el_tratamiento_en_el_alta_y_en_la_edicion(client, db_session, e):
    h = headers(db_session, e["admin"])
    alta = client.post(
        f"{PREFIX}/users",
        json={
            "email": "yara@gems.com",
            "full_name": "Yara Gutiérrez",
            "role": "doctor",
            "password": "Contraseña-segura-123",
            "tratamiento": "dra",
        },
        headers=h,
    )
    assert alta.status_code == 200, alta.text
    assert alta.json()["tratamiento"] == "Dra."

    quitado = client.put(f"{PREFIX}/users/{alta.json()['id']}", json={"tratamiento": ""}, headers=h)
    assert quitado.status_code == 200
    assert quitado.json()["tratamiento"] is None
    assert db_session.get(User, alta.json()["id"]).tratamiento is None

    invalido = client.put(f"{PREFIX}/users/{alta.json()['id']}", json={"tratamiento": "Doc"}, headers=h)
    assert invalido.status_code == 422


def _aviso_al_finalizar(client, db, e, doctora, quien_cierra):
    consulta = cita(db, e["tenant"], e["pac_cintia"], doctora, estado=AppointmentStatus.EN_SALA)
    r = client.patch(
        f"{PREFIX}/appointments/{consulta.id}/status",
        json={"status": "atendida", "cobro": {"modo": "recepcion"}},
        headers=headers(db, quien_cierra),
    )
    assert r.status_code == 200, r.text
    return db.query(Notification).filter_by(user_id=e["jhoany"].id).order_by(Notification.id.desc()).first()


def test_el_aviso_a_secretaria_nombra_a_la_doctora_con_su_tratamiento(client, db_session, e):
    aviso = _aviso_al_finalizar(client, db_session, e, e["cintia"], e["cintia"])

    assert "Dra. Cintia Castro" in aviso.message
    assert "Dr. Cintia" not in aviso.message


def test_sin_tratamiento_el_aviso_no_inventa_un_dr(client, db_session, e):
    aviso = _aviso_al_finalizar(client, db_session, e, e["rosa"], e["rosa"])

    assert "Rosa Méndez" in aviso.message
    assert "Dr." not in aviso.message


def test_si_cierra_recepcion_el_aviso_nombra_a_la_doctora_y_no_a_la_secretaria(client, db_session, e):
    """Antes decía "Dr. Laura Recepción" cuando cerraba la secretaria."""
    aviso = _aviso_al_finalizar(client, db_session, e, e["cintia"], e["laura"])

    assert "Dra. Cintia Castro" in aviso.message
    assert "Laura" not in aviso.message


def test_el_directorio_y_la_cita_traen_el_tratamiento(client, db_session, e):
    h = headers(db_session, e["jhoany"])
    directorio = client.get(f"{PREFIX}/users/directory", params={"role": "doctor"}, headers=h).json()
    assert {d["full_name"]: d["tratamiento"] for d in directorio}["Cintia Castro"] == "Dra."

    consulta = cita(db_session, e["tenant"], e["pac_cintia"], e["cintia"])
    detalle = client.get(f"{PREFIX}/appointments/{consulta.id}", headers=h).json()
    assert detalle["doctor"]["tratamiento"] == "Dra."
