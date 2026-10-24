"""Correcciones de la revisión de flujos de cobros (plan 23).

Lo que se cuida aquí:

1. Que todo cobro diga de quién y de qué: la lista decía "Paciente #6" y el
   cobro al finalizar con servicio salía con concepto "-".
"""
from uuid import uuid4

from _cobros_base import PREFIX, cita, client, db_session, e, headers, pago  # noqa: F401

from app.models.appointment import AppointmentStatus


def test_la_lista_de_cobros_trae_el_nombre_de_la_paciente_y_del_servicio(client, db_session, e):
    pago(db_session, e["tenant"], e["pac_adolfo"], e["jhoany"], e["adolfo"], "800.00", service_id=e["servicio"].id)

    lista = client.get(f"{PREFIX}/payments", headers=headers(db_session, e["jhoany"])).json()

    assert lista[0]["patient_name"] == f'{e["pac_adolfo"].first_name} {e["pac_adolfo"].last_name}'
    assert lista[0]["service_name"] == "Consulta"


def test_el_cobro_al_finalizar_con_servicio_guarda_su_concepto(client, db_session, e):
    c = cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.EN_SALA)

    r = client.patch(
        f"{PREFIX}/appointments/{c.id}/status",
        json={
            "status": "atendida",
            "cobro": {
                "modo": "cobrado",
                "amount": "800.00",
                "method": "cash",
                "service_id": e["servicio"].id,
                "client_request_id": str(uuid4()),
            },
        },
        headers=headers(db_session, e["adolfo"]),
    )

    assert r.status_code == 200, r.text
    lista = client.get(f"{PREFIX}/payments", headers=headers(db_session, e["adolfo"])).json()
    assert lista[0]["description"] == "Consulta"
    assert lista[0]["service_name"] == "Consulta"


def test_un_concepto_escrito_no_se_pisa_con_el_del_servicio(client, db_session, e):
    r = client.post(
        f"{PREFIX}/payments",
        json={
            "patient_id": e["pac_adolfo"].id,
            "doctor_id": e["adolfo"].id,
            "service_id": e["servicio"].id,
            "description": "CONSULTA CON DESCUENTO",
            "amount": "500.00",
            "method": "cash",
            "client_request_id": str(uuid4()),
        },
        headers=headers(db_session, e["jhoany"]),
    )

    assert r.status_code == 201, r.text
    assert r.json()["description"] == "CONSULTA CON DESCUENTO"
    assert r.json()["patient_name"]


# ---------------------------------------------------------------------------
# Anular el cobro de una consulta express
# ---------------------------------------------------------------------------

def _express(client, db, quien, e):
    r = client.post(
        f"{PREFIX}/payments/consulta-express",
        json={
            "patient_id": e["pac_adolfo"].id,
            "doctor_id": e["adolfo"].id,
            "amount": "500.00",
            "method": "cash",
            "client_request_id": str(uuid4()),
        },
        headers=headers(db, quien),
    )
    assert r.status_code == 201, r.text
    return r.json()


def _anular(client, db, quien, pago_id, **extra):
    return client.post(
        f"{PREFIX}/payments/{pago_id}/anular",
        json={"motivo": "PACIENTE EQUIVOCADA", **extra},
        headers=headers(db, quien),
    )


def test_el_pago_express_dice_que_es_express(client, db_session, e):
    pago_express = _express(client, db_session, e["jhoany"], e)
    assert pago_express["appointment_origen"] == "express"


def test_anular_la_express_puede_cancelar_su_consulta_en_la_misma_operacion(client, db_session, e):
    """Sin esto quedaba en la agenda una consulta inventada, atendida y "por cobrar"."""
    from app.models.appointment import Appointment
    from app.models.audit_log import AuditLog

    pago_express = _express(client, db_session, e["jhoany"], e)

    r = _anular(client, db_session, e["jhoany"], pago_express["id"], cancelar_consulta_express=True)

    assert r.status_code == 200, r.text
    assert r.json()["status"] == "anulado"
    db_session.expire_all()
    consulta = db_session.get(Appointment, pago_express["appointment_id"])
    assert consulta.status == AppointmentStatus.CANCELADA
    assert consulta.cancellation_reason == "PACIENTE EQUIVOCADA"
    assert consulta.cancelled_by_user_id == e["jhoany"].id
    assert (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "appointment.cancelled", AuditLog.entity_id == consulta.id)
        .count()
        == 1
    )


def test_sin_marcarlo_la_consulta_express_se_queda(client, db_session, e):
    from app.models.appointment import Appointment

    pago_express = _express(client, db_session, e["jhoany"], e)

    assert _anular(client, db_session, e["jhoany"], pago_express["id"]).status_code == 200
    db_session.expire_all()
    assert db_session.get(Appointment, pago_express["appointment_id"]).status == AppointmentStatus.ATENDIDA


def test_con_otro_cobro_vigente_no_se_cancela_y_tampoco_se_anula(client, db_session, e):
    """Nada a medias: si no se puede cancelar la consulta, el pago sigue vigente."""
    from app.models.payment import Payment, PaymentStatus

    pago_express = _express(client, db_session, e["jhoany"], e)
    pago(
        db_session,
        e["tenant"],
        e["pac_adolfo"],
        e["jhoany"],
        e["adolfo"],
        "300.00",
        appointment_id=pago_express["appointment_id"],
    )

    r = _anular(client, db_session, e["jhoany"], pago_express["id"], cancelar_consulta_express=True)

    assert r.status_code == 409, r.text
    assert "otros cobros vigentes" in r.json()["detail"]
    db_session.expire_all()
    assert db_session.get(Payment, pago_express["id"]).status == PaymentStatus.VIGENTE


def test_una_express_ya_documentada_no_se_cancela(client, db_session, e):
    from app.models.payment import Payment, PaymentStatus
    from app.models.soap_note import SOAPNote

    pago_express = _express(client, db_session, e["jhoany"], e)
    db_session.add(
        SOAPNote(
            appointment_id=pago_express["appointment_id"],
            doctor_id=e["adolfo"].id,
            tenant_id=e["tenant"].id,
            subjective="DOLOR",
            objective="SIN HALLAZGOS",
            assessment="REVISION",
            plan="CONTROL",
        )
    )
    db_session.commit()

    r = _anular(client, db_session, e["jhoany"], pago_express["id"], cancelar_consulta_express=True)

    assert r.status_code == 409
    assert "nota, receta o certificado" in r.json()["detail"]
    db_session.expire_all()
    assert db_session.get(Payment, pago_express["id"]).status == PaymentStatus.VIGENTE


def test_sin_permiso_de_cancelar_citas_no_la_cancela(client, db_session, e):
    """El médico no cancela citas: anula el cobro y recepción cancela la consulta."""
    from app.models.payment import Payment, PaymentStatus

    r = client.post(
        f"{PREFIX}/payments/consulta-express",
        json={"patient_id": e["pac_adolfo"].id, "amount": "500.00", "method": "cash", "client_request_id": str(uuid4())},
        headers=headers(db_session, e["adolfo"]),
    )
    assert r.status_code == 201, r.text

    anulado = _anular(client, db_session, e["adolfo"], r.json()["id"], cancelar_consulta_express=True)

    assert anulado.status_code == 403
    db_session.expire_all()
    assert db_session.get(Payment, r.json()["id"]).status == PaymentStatus.VIGENTE


def test_un_cobro_normal_no_cancela_ninguna_consulta(client, db_session, e):
    c = cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"])
    p = pago(db_session, e["tenant"], e["pac_adolfo"], e["jhoany"], e["adolfo"], "800.00", appointment_id=c.id)

    r = _anular(client, db_session, e["jhoany"], p.id, cancelar_consulta_express=True)

    assert r.status_code == 409
    assert "no es de una consulta express" in r.json()["detail"]
