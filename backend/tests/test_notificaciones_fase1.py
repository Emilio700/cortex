"""Avisos con prioridad y resolución (plan 27, Fase 1).

Lo que se prueba aquí es lo que hacía que los avisos se perdieran o mintieran:

- el aviso y el evento se guardan juntos o ninguno (M-4);
- «pendiente de cobro» deja de pedir algo, para todas, en cuanto alguien cobra;
- «paciente en sala» se cierra cuando la cita sale de sala, y reabrir no lo
  vuelve a mandar;
- un doble envío no duplica el aviso;
- «recepción» se decide por permiso y por asignación, no por la etiqueta del rol;
- descartar deja rastro y sólo se descarta lo propio.
"""
from datetime import datetime, timedelta

import pytest
from _cobros_base import (  # noqa: F401
    PREFIX,
    cita,
    client,
    db_session,
    e,
    headers,
    paciente,
    usuario,
)

from app.core.hora_local import ahora_local, hoy_local
from app.db.session import utcnow
from app.models.appointment import AppointmentStatus
from app.models.clinical_tracking import DiagnosticOrder
from app.models.custom_role import CustomRole
from app.models.notification import (
    Notification,
    NotificationPreference,
    NotificationPriority,
    NotificationResolution,
    NotificationType,
)
from app.models.pregnancy import Pregnancy, PregnancyStatus
from app.models.secretaria_doctora import SecretariaDoctora
from app.models.triage import Triage
from app.models.user import Role
from app.services import avisos_de_citas
from app.services.notification_service import destinatarios_de_recepcion, notify, purgar


def _avisos(db, tipo=None, **filtros):
    db.expire_all()
    query = db.query(Notification)
    if tipo:
        query = query.filter(Notification.type == tipo)
    for campo, valor in filtros.items():
        query = query.filter(getattr(Notification, campo) == valor)
    return query.order_by(Notification.id).all()


def _con_triage(db, c, quien):
    db.add(Triage(appointment_id=c.id, created_by_user_id=quien.id, weight_kg=60.0))
    db.commit()


def _estado(client, h, cita_id, estado, **cuerpo):
    return client.patch(f"{PREFIX}/appointments/{cita_id}/status", json={"status": estado, **cuerpo}, headers=h)


# ---------------------------------------------------------------------------
# Misma transacción
# ---------------------------------------------------------------------------


def test_si_el_aviso_falla_la_cita_no_cambia_de_estado(db_session, e, monkeypatch):
    from fastapi.testclient import TestClient

    from app.core.deps import get_db
    from app.main import app

    c = cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.CONFIRMADA)
    _con_triage(db_session, c, e["jhoany"])

    def falla(*args, **kwargs):
        raise RuntimeError("se cayó la tabla de avisos")

    monkeypatch.setattr(avisos_de_citas, "notify", falla)
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        with TestClient(app, raise_server_exceptions=False) as cliente:
            respuesta = _estado(cliente, headers(db_session, e["jhoany"]), c.id, "en_sala")
    finally:
        app.dependency_overrides.clear()

    assert respuesta.status_code == 500
    db_session.expire_all()
    db_session.refresh(c)
    # Antes el evento quedaba guardado y la respuesta decía «error»: recepción
    # reintentaba y el evento se duplicaba.
    assert c.status == AppointmentStatus.CONFIRMADA


def test_si_el_evento_no_procede_no_queda_aviso(client, db_session, e):
    c = cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.CONFIRMADA)
    # Sin triage no se puede pasar a sala.
    respuesta = _estado(client, headers(db_session, e["jhoany"]), c.id, "en_sala")

    assert respuesta.status_code == 400
    assert _avisos(db_session) == []


# ---------------------------------------------------------------------------
# Paciente en sala
# ---------------------------------------------------------------------------


def test_en_sala_avisa_a_la_doctora_como_accionable_y_se_cierra_al_atender(client, db_session, e):
    c = cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.CONFIRMADA)
    _con_triage(db_session, c, e["jhoany"])

    assert _estado(client, headers(db_session, e["jhoany"]), c.id, "en_sala").status_code == 200
    [aviso] = _avisos(db_session, NotificationType.PATIENT_ARRIVED)
    assert aviso.user_id == e["adolfo"].id
    assert aviso.priority == NotificationPriority.ACCIONABLE
    assert aviso.resolved_at is None

    assert _estado(client, headers(db_session, e["adolfo"]), c.id, "atendida").status_code == 200
    [aviso] = _avisos(db_session, NotificationType.PATIENT_ARRIVED)
    assert aviso.resolved_at is not None
    assert aviso.resolution == NotificationResolution.AUTO
    assert aviso.resolved_by_user_id == e["adolfo"].id


def test_cancelar_en_sala_cierra_el_aviso_de_sala(client, db_session, e):
    c = cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.CONFIRMADA)
    _con_triage(db_session, c, e["jhoany"])
    h = headers(db_session, e["jhoany"])
    _estado(client, h, c.id, "en_sala")

    assert _estado(client, h, c.id, "cancelada", cancellation_reason="Se fue").status_code == 200

    [aviso] = _avisos(db_session, NotificationType.PATIENT_ARRIVED)
    assert aviso.resolved_at is not None


def test_reabrir_no_avisa_en_sala(client, db_session, e):
    c = cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.ATENDIDA)

    respuesta = _estado(client, headers(db_session, e["adolfo"]), c.id, "en_sala")

    assert respuesta.status_code == 200, respuesta.text
    assert _avisos(db_session, NotificationType.PATIENT_ARRIVED) == []


# ---------------------------------------------------------------------------
# Pendiente de cobro
# ---------------------------------------------------------------------------


def test_cobrar_cierra_el_pendiente_de_todas_las_asistentes(client, db_session, e):
    c = cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.EN_SALA)

    assert _estado(client, headers(db_session, e["adolfo"]), c.id, "atendida").status_code == 200
    pendientes = _avisos(db_session, NotificationType.CONSULTATION_COMPLETED)
    assert {a.user_id for a in pendientes} == {e["jhoany"].id, e["laura"].id}
    assert all(a.priority == NotificationPriority.ACCIONABLE for a in pendientes)

    cobro = client.post(
        f"{PREFIX}/payments",
        json={"patient_id": e["pac_adolfo"].id, "appointment_id": c.id, "amount": "800.00", "method": "cash"},
        headers=headers(db_session, e["laura"]),
    )
    assert cobro.status_code == 201, cobro.text

    for aviso in _avisos(db_session, NotificationType.CONSULTATION_COMPLETED):
        # Si la otra asistente siguiera leyendo «puede proceder al registro del
        # pago», cobraría dos veces.
        assert aviso.resolved_at is not None
        assert aviso.resolved_by_user_id == e["laura"].id


def test_cerrar_ya_cobrada_es_solo_informativo(client, db_session, e):
    c = cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.EN_SALA)

    respuesta = _estado(
        client, headers(db_session, e["adolfo"]), c.id, "atendida",
        cobro={"modo": "cobrado", "amount": "800.00", "method": "card", "referencia": "1"},
    )

    assert respuesta.status_code == 200, respuesta.text
    avisos = _avisos(db_session, NotificationType.CONSULTATION_COMPLETED)
    assert avisos and all(a.priority == NotificationPriority.INFORMATIVO for a in avisos)


def test_anular_el_cobro_vuelve_a_pedir_cobrar(client, db_session, e):
    c = cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.ATENDIDA)
    cobro = client.post(
        f"{PREFIX}/payments",
        json={"patient_id": e["pac_adolfo"].id, "appointment_id": c.id, "amount": "800.00", "method": "cash"},
        headers=headers(db_session, e["laura"]),
    )
    assert cobro.status_code == 201

    anulado = client.post(
        f"{PREFIX}/payments/{cobro.json()['id']}/anular",
        json={"motivo": "Se capturó en la cita equivocada"},
        headers=headers(db_session, e["laura"]),
    )

    assert anulado.status_code == 200, anulado.text
    abiertos = [a for a in _avisos(db_session, NotificationType.CONSULTATION_COMPLETED) if a.resolved_at is None]
    assert {a.user_id for a in abiertos} == {e["jhoany"].id}


# ---------------------------------------------------------------------------
# Destinatarios
# ---------------------------------------------------------------------------


def test_la_asistente_de_otra_doctora_no_recibe_el_cierre(client, db_session, e):
    db_session.add(SecretariaDoctora(tenant_id=e["tenant"].id, secretaria_id=e["jhoany"].id, doctor_id=e["adolfo"].id))
    db_session.commit()
    c = cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.EN_SALA)

    _estado(client, headers(db_session, e["adolfo"]), c.id, "atendida")

    assert {a.user_id for a in _avisos(db_session, NotificationType.CONSULTATION_COMPLETED)} == {e["jhoany"].id}


def test_sin_asistentes_asignadas_avisa_a_toda_la_recepcion(db_session, e):
    destinatarias = destinatarios_de_recepcion(
        db_session, tenant_id=e["tenant"].id, permiso="payments.create", doctor_id=e["cintia"].id
    )
    # Ni doctoras ni administración: tienen permiso de cobrar, pero no están
    # en el mostrador.
    assert {u.id for u in destinatarias} == {e["jhoany"].id, e["laura"].id}


def test_un_perfil_personalizado_de_recepcion_si_recibe(db_session, e):
    perfil = CustomRole(tenant_id=e["tenant"].id, name="Caja", base_role="admin")
    db_session.add(perfil)
    db_session.commit()
    caja = usuario(db_session, e["tenant"], "Caja Personalizada", Role.ADMIN, custom_role_id=perfil.id)

    destinatarias = destinatarios_de_recepcion(db_session, tenant_id=e["tenant"].id, permiso="payments.create")

    assert caja.id in {u.id for u in destinatarias}


# ---------------------------------------------------------------------------
# Duplicados
# ---------------------------------------------------------------------------


def test_la_misma_llave_no_duplica_el_aviso_abierto(db_session, e):
    for _ in range(2):
        notify(
            db_session, tenant_id=e["tenant"].id, user_id=e["adolfo"].id,
            type=NotificationType.PATIENT_ARRIVED, title="Paciente en sala", message="Ana está en sala.",
            entity_type="appointment", entity_id=42, dedupe_key="patient_arrived:appointment:42",
        )
    db_session.commit()

    assert len(_avisos(db_session, NotificationType.PATIENT_ARRIVED)) == 1


def test_resuelto_el_aviso_la_misma_llave_vuelve_a_avisar(db_session, e):
    llave = "patient_arrived:appointment:42"
    primero = notify(
        db_session, tenant_id=e["tenant"].id, user_id=e["adolfo"].id,
        type=NotificationType.PATIENT_ARRIVED, title="t", message="m", dedupe_key=llave,
    )
    primero.resolved_at = utcnow()
    db_session.commit()

    segundo = notify(
        db_session, tenant_id=e["tenant"].id, user_id=e["adolfo"].id,
        type=NotificationType.PATIENT_ARRIVED, title="t", message="m", dedupe_key=llave,
    )
    db_session.commit()

    assert segundo is not None


# ---------------------------------------------------------------------------
# Cancelación y reprogramación (D-6)
# ---------------------------------------------------------------------------


def test_cancelar_una_cita_de_hoy_es_accionable_para_la_doctora(client, db_session, e):
    c = cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.AGENDADA, cuando=ahora_local())

    _estado(client, headers(db_session, e["jhoany"]), c.id, "cancelada", cancellation_reason="Enfermó")

    [aviso] = _avisos(db_session, NotificationType.APPOINTMENT_CANCELLED)
    assert aviso.user_id == e["adolfo"].id
    assert aviso.priority == NotificationPriority.ACCIONABLE
    assert "Enfermó" in aviso.message


def test_cancelar_una_cita_lejana_solo_informa(client, db_session, e):
    lejos = ahora_local() + timedelta(days=10)
    c = cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.AGENDADA, cuando=lejos)

    _estado(client, headers(db_session, e["jhoany"]), c.id, "cancelada", cancellation_reason="Viaje")

    [aviso] = _avisos(db_session, NotificationType.APPOINTMENT_CANCELLED)
    assert aviso.priority == NotificationPriority.INFORMATIVO


def test_la_doctora_que_cancela_no_se_avisa_a_si_misma(client, db_session, e):
    c = cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.AGENDADA)

    _estado(client, headers(db_session, e["adolfo"]), c.id, "cancelada", cancellation_reason="Congreso")

    assert _avisos(db_session, NotificationType.APPOINTMENT_CANCELLED) == []


def test_reprogramar_avisa_a_la_doctora(db_session, e):
    antes = ahora_local() + timedelta(days=10)
    c = cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.AGENDADA, cuando=antes)
    c.scheduled_at = ahora_local() + timedelta(hours=3)

    avisos_de_citas.avisar_reprogramacion(db_session, c, antes=antes, doctora_antes=e["adolfo"].id, actor=e["jhoany"])
    db_session.commit()

    [aviso] = _avisos(db_session, NotificationType.APPOINTMENT_RESCHEDULED)
    assert aviso.user_id == e["adolfo"].id
    # La hora nueva cae hoy: es un cambio en su agenda inmediata.
    assert aviso.priority == NotificationPriority.ACCIONABLE


# ---------------------------------------------------------------------------
# Resultados
# ---------------------------------------------------------------------------


def _orden(db, e, estado="ordered"):
    orden = DiagnosticOrder(
        tenant_id=e["tenant"].id, patient_id=e["pac_adolfo"].id, doctor_id=e["adolfo"].id,
        category="laboratory", study_name="Biometría hemática", status=estado,
        clinical_indication="Control", requested_on=hoy_local(),
    )
    db.add(orden)
    db.commit()
    db.refresh(orden)
    return orden


def test_revisar_el_resultado_cierra_su_aviso(db_session, e):
    from app.services.avisos_de_resultados import (
        avisar_resultado_recibido,
        resolver_resultado_si_ya_no_espera,
    )

    orden = _orden(db_session, e, estado="result_received")
    avisar_resultado_recibido(db_session, orden, e["pac_adolfo"], e["jhoany"])
    db_session.commit()
    [aviso] = _avisos(db_session, NotificationType.DIAGNOSTIC_RESULT_RECEIVED)
    assert aviso.priority == NotificationPriority.ACCIONABLE

    orden.status = "reviewed"
    resolver_resultado_si_ya_no_espera(db_session, orden, e["adolfo"])
    db_session.commit()

    [aviso] = _avisos(db_session, NotificationType.DIAGNOSTIC_RESULT_RECEIVED)
    assert aviso.resolved_at is not None


# ---------------------------------------------------------------------------
# Control prenatal
# ---------------------------------------------------------------------------


def test_agendar_el_control_cierra_el_aviso_prenatal(db_session, e):
    embarazo = Pregnancy(
        tenant_id=e["tenant"].id, patient_id=e["pac_adolfo"].id, doctor_id=e["adolfo"].id,
        status=PregnancyStatus.ACTIVE.value, next_review_on=hoy_local() + timedelta(days=5),
    )
    db_session.add(embarazo)
    db_session.commit()
    notify(
        db_session, tenant_id=e["tenant"].id, user_id=e["jhoany"].id,
        type=NotificationType.PRENATAL_REVIEW_DUE, title="Control prenatal sin cita", message="m",
        entity_type="patient", entity_id=e["pac_adolfo"].id,
    )
    db_session.commit()

    c = cita(
        db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.AGENDADA,
        cuando=datetime.combine(hoy_local() + timedelta(days=5), datetime.min.time()) + timedelta(hours=10),
    )
    avisos_de_citas.avisar_cita_agendada(db_session, c, e["jhoany"])
    db_session.commit()

    [aviso] = _avisos(db_session, NotificationType.PRENATAL_REVIEW_DUE)
    assert aviso.resolved_at is not None


def _aviso(db, user, prioridad=NotificationPriority.ACCIONABLE, tipo=NotificationType.PATIENT_ARRIVED, **extra):
    a = Notification(
        tenant_id=user.tenant_id, user_id=user.id, type=tipo, title="t", message="m",
        priority=prioridad, **extra,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


# ---------------------------------------------------------------------------
# Recordatorios (D-1) y purga (D-9)
# ---------------------------------------------------------------------------


def test_el_correo_a_la_paciente_ya_no_avisa_en_la_campana(db_session, e):
    """El recordatorio por correo (perfil) y el aviso a la doctora (centro de
    avisos) van separados: antes el de una hora sólo salía si además tenía
    encendido el correo a pacientes con «1 hora antes» (plan 29)."""
    from app.services.appointment_reminder_service import send_appointment_reminder

    db_session.add(NotificationPreference(user_id=e["adolfo"].id, recordatorio_una_hora=True, tipos_silenciados=[]))
    db_session.commit()
    c = cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.AGENDADA)

    for minutos in (1440, 60):
        send_appointment_reminder(db_session, c, minutos)

    assert _avisos(db_session, NotificationType.APPOINTMENT_REMINDER) == []


@pytest.mark.parametrize("quiere, sale", [(False, False), (True, True)])
def test_el_aviso_de_una_hora_solo_si_la_doctora_lo_pidio(db_session, e, quiere, sale):
    from app.services.appointment_reminder_service import avisar_cita_en_una_hora

    if quiere:
        db_session.add(NotificationPreference(user_id=e["adolfo"].id, recordatorio_una_hora=True, tipos_silenciados=[]))
        db_session.commit()
    c = cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.AGENDADA)

    avisar_cita_en_una_hora(db_session, c)
    avisar_cita_en_una_hora(db_session, c)  # el trabajo puede correr dos veces
    db_session.commit()

    assert len(_avisos(db_session, NotificationType.APPOINTMENT_REMINDER)) == (1 if sale else 0)


def test_el_trabajo_avisa_una_hora_antes_aunque_el_correo_a_pacientes_este_apagado(db_session, e, monkeypatch):
    import app.core.scheduler as programador
    import app.db.session as sesion

    ahora = datetime(2026, 10, 5, 9, 0)
    monkeypatch.setattr(programador, "ahora_local", lambda: ahora)
    monkeypatch.setattr(sesion, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(db_session, "close", lambda: None)
    db_session.add(NotificationPreference(user_id=e["adolfo"].id, recordatorio_una_hora=True, tipos_silenciados=[]))
    db_session.commit()
    cita(db_session, e["tenant"], e["pac_adolfo"], e["adolfo"], estado=AppointmentStatus.AGENDADA,
         cuando=ahora + timedelta(minutes=58))

    programador._send_appointment_reminders()

    [aviso] = _avisos(db_session, NotificationType.APPOINTMENT_REMINDER)
    assert aviso.user_id == e["adolfo"].id


def test_la_purga_borra_lo_viejo_y_nunca_lo_abierto(db_session, e):
    hace = lambda dias: utcnow() - timedelta(days=dias)  # noqa: E731
    vieja_leida = _aviso(db_session, e["adolfo"], prioridad=NotificationPriority.INFORMATIVO, tipo=NotificationType.APPOINTMENT_TODAY, is_read=True, created_at=hace(100))
    vieja_sin_leer = _aviso(db_session, e["adolfo"], prioridad=NotificationPriority.INFORMATIVO, tipo=NotificationType.APPOINTMENT_TODAY, created_at=hace(100))
    resuelta_vieja = _aviso(db_session, e["adolfo"], resolved_at=hace(400), created_at=hace(400))
    abierta_vieja = _aviso(db_session, e["adolfo"], created_at=hace(400))
    borrar = {vieja_leida.id, resuelta_vieja.id}
    conservar = {vieja_sin_leer.id, abierta_vieja.id}

    purgar(db_session)

    ids = {a.id for a in _avisos(db_session)}
    assert not borrar & ids
    assert conservar <= ids

