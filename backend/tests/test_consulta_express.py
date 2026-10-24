"""Consulta express: cobrar una consulta que no se agendó deja rastro en la agenda.

Emilio ajustó la decisión anterior de no crear citas automáticas (plan 23,
ajustes del 2026-09-28): la consulta rápida sin cita sí se registra, pero
marcada ``express`` para que nadie la confunda con una agendada. Se cuida:

1. Que cita y pago nazcan juntos o no nazcan: nunca una cita sin pago ni un
   pago "express" sin su cita.
2. Que la idempotencia y el anti cobro doble valgan igual que en un cobro
   normal: el doble clic no crea dos consultas.
3. Que no se avise "paciente en sala" ni se revisen choques: ya ocurrió.
"""
from datetime import datetime, time, timedelta
from uuid import uuid4

import pytest

from _cobros_base import PREFIX, cita, client, db_session, e, headers  # noqa: F401

from app.core.hora_local import hoy_local
from app.models.appointment import Appointment, AppointmentOrigen, AppointmentStatus
from app.models.audit_log import AuditLog
from app.models.notification import Notification
from app.models.payment import Payment
from app.routers import payments as payments_router
from app.services import cobro_service


@pytest.fixture
def mediodia(monkeypatch):
    """El "ahora" del consultorio fijo a las 12:00 de hoy.

    Las pruebas de "la consulta de hoy" ponen citas unos minutos antes o
    después de ahora; con el reloj real, a las 00:10 la de "hace 20 minutos"
    ya era de ayer y a las 23:30 la de "dentro de 40" ya era de mañana, y
    fallaban sin que el código estuviera mal. Al mediodía ningún margen de
    estas pruebas cruza la medianoche.
    """
    momento = datetime.combine(hoy_local(), time(12, 0))
    monkeypatch.setattr(payments_router, "ahora_local", lambda: momento)
    return momento


def _express(client, db, quien, **datos):
    cuerpo = {"amount": "500.00", "method": "cash", **datos}
    return client.post(f"{PREFIX}/payments/consulta-express", json=cuerpo, headers=headers(db, quien))


def test_la_secretaria_registra_la_express_con_cita_atendida_y_pago_ligado(client, db_session, e):
    r = _express(
        client, db_session, e["jhoany"], patient_id=e["pac_adolfo"].id, doctor_id=e["adolfo"].id
    )

    assert r.status_code == 201, r.text
    pago = r.json()
    nueva = db_session.get(Appointment, pago["appointment_id"])
    assert nueva is not None
    assert nueva.origen == AppointmentOrigen.EXPRESS
    assert nueva.status == AppointmentStatus.ATENDIDA
    assert nueva.doctor_id == nueva.attended_by_user_id == e["adolfo"].id
    assert nueva.duration_minutes == 15
    assert pago["doctor_id"] == e["adolfo"].id
    assert pago["received_by_user_id"] == e["jhoany"].id

    # La agenda la ve marcada y ya cobrada.
    agenda = client.get(
        f"{PREFIX}/appointments/{nueva.id}", headers=headers(db_session, e["jhoany"])
    ).json()
    assert agenda["origen"] == "express"
    assert agenda["estado_cobro"] == "cobrada"


def test_si_cobra_una_doctora_la_express_es_suya_aunque_pida_otra(client, db_session, e):
    r = _express(
        client, db_session, e["cintia"], patient_id=e["pac_cintia"].id, doctor_id=e["rosa"].id
    )

    assert r.status_code == 201, r.text
    nueva = db_session.get(Appointment, r.json()["appointment_id"])
    assert nueva.doctor_id == e["cintia"].id
    assert r.json()["doctor_id"] == e["cintia"].id


def test_recepcion_tiene_que_decir_de_que_doctora_es(client, db_session, e):
    r = _express(client, db_session, e["jhoany"], patient_id=e["pac_adolfo"].id)

    assert r.status_code == 400
    assert db_session.query(Appointment).count() == 0
    assert db_session.query(Payment).count() == 0


def test_el_mismo_client_request_id_no_crea_otra_consulta(client, db_session, e):
    """Doble clic: un pago y UNA cita."""
    datos = {
        "patient_id": e["pac_adolfo"].id,
        "doctor_id": e["adolfo"].id,
        "client_request_id": str(uuid4()),
    }
    primero = _express(client, db_session, e["jhoany"], **datos)
    repetido = _express(client, db_session, e["jhoany"], **datos)

    assert primero.status_code == 201
    assert repetido.status_code == 200
    assert repetido.json()["id"] == primero.json()["id"]
    assert db_session.query(Appointment).count() == 1
    assert db_session.query(Payment).count() == 1


def test_si_ya_hay_una_consulta_hoy_con_esa_doctora_pide_confirmar(client, db_session, e, mediodia):
    """Lo más probable es que sea la misma consulta y se cobre dos veces."""
    previa = cita(
        db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], cuando=mediodia - timedelta(minutes=20)
    )

    r = _express(
        client, db_session, e["jhoany"], patient_id=e["pac_adolfo"].id, doctor_id=e["adolfo"].id
    )

    assert r.status_code == 409, r.text
    cuerpo = r.json()
    assert cuerpo["cita_existente"]["id"] == previa.id
    assert "Cobro de cita" in cuerpo["detail"]
    assert db_session.query(Appointment).count() == 1
    assert db_session.query(Payment).count() == 0

    confirmada = _express(
        client,
        db_session,
        e["jhoany"],
        patient_id=e["pac_adolfo"].id,
        doctor_id=e["adolfo"].id,
        confirmar_otra_consulta=True,
    )
    assert confirmada.status_code == 201, confirmada.text
    assert db_session.query(Appointment).count() == 2


def test_una_cita_agendada_para_mas_tarde_no_frena_la_express(client, db_session, e, mediodia):
    """La revisión de la tarde todavía no pasa: no es la consulta que se cobra ahora."""
    cita(
        db_session,
        e["tenant"],
        e["pac_adolfo"],
        e["adolfo"],
        estado=AppointmentStatus.CONFIRMADA,
        cuando=mediodia + timedelta(hours=3),
    )

    r = _express(
        client, db_session, e["jhoany"], patient_id=e["pac_adolfo"].id, doctor_id=e["adolfo"].id
    )

    assert r.status_code == 201, r.text


def test_una_cita_de_mas_tarde_que_ya_esta_en_sala_si_cuenta(client, db_session, e, mediodia):
    """Llegó temprano y ya la pasaron: ésa sí es la consulta que se está cobrando."""
    cita(
        db_session,
        e["tenant"],
        e["pac_adolfo"],
        e["adolfo"],
        estado=AppointmentStatus.EN_SALA,
        cuando=mediodia + timedelta(minutes=40),
    )

    r = _express(
        client, db_session, e["jhoany"], patient_id=e["pac_adolfo"].id, doctor_id=e["adolfo"].id
    )

    assert r.status_code == 409, r.text
    assert "Cobro de cita" in r.json()["detail"]


def test_si_la_cita_de_hoy_no_esta_en_cobro_de_cita_no_manda_ahi_sin_mas(client, db_session, e, mediodia):
    """Una cita confirmada que nadie pasó a sala no aparece en «Cobro de cita».

    Decir "cóbrala desde «Cobro de cita»" dejaba a recepción sin salida y la
    empujaba a registrar otra consulta: justo el cobro doble.
    """
    cita(
        db_session,
        e["tenant"],
        e["pac_adolfo"],
        e["adolfo"],
        estado=AppointmentStatus.CONFIRMADA,
        cuando=mediodia - timedelta(minutes=30),
    )

    r = _express(
        client, db_session, e["jhoany"], patient_id=e["pac_adolfo"].id, doctor_id=e["adolfo"].id
    )

    assert r.status_code == 409, r.text
    detalle = r.json()["detail"]
    assert "pásala a sala" in detalle
    assert "confirmada" in detalle
    assert not detalle.startswith("Este paciente ya tiene una consulta hoy")


def test_una_express_ya_cobrada_hoy_se_reporta_con_el_cobro(client, db_session, e):
    datos = {"patient_id": e["pac_adolfo"].id, "doctor_id": e["adolfo"].id}
    assert _express(client, db_session, e["jhoany"], **datos).status_code == 201

    otra = _express(client, db_session, e["laura"], **datos)

    assert otra.status_code == 409
    assert otra.json()["cobro_existente"]["received_by_name"] == "Jhoany Asistente"
    assert "Jhoany Asistente" in otra.json()["detail"]


def test_si_falla_el_pago_no_queda_la_cita(client, db_session, e, monkeypatch):
    """Nada a medias: la cita express sin su pago sería una consulta sin cobrar inventada."""

    def revienta(*_a, **_k):
        raise RuntimeError("falla simulada al guardar el pago")

    monkeypatch.setattr(cobro_service, "crear_pago", revienta)

    with pytest.raises(RuntimeError):
        _express(
            client, db_session, e["jhoany"], patient_id=e["pac_adolfo"].id, doctor_id=e["adolfo"].id
        )

    assert db_session.query(Appointment).count() == 0
    assert db_session.query(Payment).count() == 0


def test_un_servicio_inexistente_no_deja_nada(client, db_session, e):
    r = _express(
        client,
        db_session,
        e["jhoany"],
        patient_id=e["pac_adolfo"].id,
        doctor_id=e["adolfo"].id,
        service_id=9999,
    )

    assert r.status_code == 404
    assert db_session.query(Appointment).count() == 0


def test_no_avisa_paciente_en_sala_y_queda_en_la_bitacora(client, db_session, e):
    r = _express(
        client, db_session, e["jhoany"], patient_id=e["pac_adolfo"].id, doctor_id=e["adolfo"].id
    )

    assert r.status_code == 201
    assert db_session.query(Notification).count() == 0
    registro = db_session.query(AuditLog).filter_by(action="appointment.express_created").one()
    assert registro.actor_user_id == e["jhoany"].id
    assert registro.entity_id == r.json()["appointment_id"]
    assert db_session.query(AuditLog).filter_by(action="payment.created").count() == 1


def test_la_express_cuenta_en_el_corte_de_su_doctora(client, db_session, e):
    _express(client, db_session, e["jhoany"], patient_id=e["pac_adolfo"].id, doctor_id=e["adolfo"].id)

    corte = client.get(f"{PREFIX}/payments/cash-cut", headers=headers(db_session, e["adolfo"])).json()

    assert corte["total_amount"] == "500.00"


def test_la_doctora_puede_reabrir_la_express_para_documentar(client, db_session, e):
    r = _express(client, db_session, e["adolfo"], patient_id=e["pac_adolfo"].id)
    cita_id = r.json()["appointment_id"]

    reabierta = client.patch(
        f"{PREFIX}/appointments/{cita_id}/status",
        json={"status": "en_sala"},
        headers=headers(db_session, e["adolfo"]),
    )

    assert reabierta.status_code == 200, reabierta.text
    assert reabierta.json()["origen"] == "express"


def test_el_historial_de_la_paciente_marca_la_express(client, db_session, e):
    r = _express(client, db_session, e["adolfo"], patient_id=e["pac_adolfo"].id)
    cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"])

    historial = client.get(
        f"{PREFIX}/patients/{e['pac_adolfo'].id}/history", headers=headers(db_session, e["adolfo"])
    )

    assert historial.status_code == 200, historial.text
    origenes = {h["appointment_id"]: h["origen"] for h in historial.json()["history"]}
    assert origenes[r.json()["appointment_id"]] == "express"
    assert sorted(origenes.values()) == ["agenda", "express"]
