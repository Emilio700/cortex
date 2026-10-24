"""Estado «en consulta» automático (plan 28, D-3).

Decisión de Emilio (2026-10-04): la cita pasa a «en consulta» cuando la doctora
abre la consulta y a «atendida» cuando la cierra; nadie lo marca a mano. Reglas
de la coordinación: solo la doctora de la cita, solo hoy (Mazatlán), solo desde
agendada, confirmada o en sala; idempotente; de ahí se sale a sala, atendida o
cancelada, y siempre queda rastro.
"""
from datetime import date, datetime

import pytest

from app.models.appointment import AppointmentStatus
from app.models.audit_log import AuditLog
from app.models.notification import Notification
from app.models.tenant import Tenant
from app.models.triage import Triage
from app.models.user import Role
from app.services import appointment_service, cobro_service

from _cobros_base import PREFIX, cita, client, db_session, headers, paciente, usuario  # noqa: F401

HOY = date(2026, 10, 4)
A_LAS_DIEZ = datetime(2026, 10, 4, 10, 0)


@pytest.fixture(autouse=True)
def hoy_en_mazatlan(monkeypatch):
    import app.services.consulta_en_curso as reglas

    monkeypatch.setattr(reglas, "hoy_local", lambda: HOY)


@pytest.fixture
def e(db_session):
    tenant = Tenant(name="Consultorio", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    doctora = usuario(db_session, tenant, "Cintia Castro", Role.DOCTOR)
    otra = usuario(db_session, tenant, "Yara Gutierrez", Role.DOCTOR)
    recepcion = usuario(db_session, tenant, "Lupita Recepcion", Role.SECRETARIA)
    master = usuario(db_session, tenant, "Master Soporte", Role.MASTER)
    pac = paciente(db_session, tenant, doctora, "Ana")
    return {"tenant": tenant, "doctora": doctora, "otra": otra, "recepcion": recepcion, "master": master, "paciente": pac}


def _cita(db, e, estado=AppointmentStatus.EN_SALA, cuando=A_LAS_DIEZ):
    return cita(db, e["tenant"], e["paciente"], e["doctora"], estado=estado, cuando=cuando)


def _iniciar(client, db, user, cita_id):
    return client.post(f"{PREFIX}/appointments/{cita_id}/iniciar-consulta", headers=headers(db, user))


def _estado(client, db, user, cita_id, estado, **extra):
    return client.patch(
        f"{PREFIX}/appointments/{cita_id}/status", headers=headers(db, user), json={"status": estado, **extra}
    )


def _bitacora(db, accion):
    return db.query(AuditLog).filter(AuditLog.action == accion).all()


# ---------------------------------------------------------------------------
# Entrar a «en consulta»
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("estado", [AppointmentStatus.AGENDADA, AppointmentStatus.CONFIRMADA, AppointmentStatus.EN_SALA])
def test_abrir_la_consulta_de_hoy_la_pasa_a_en_consulta(client, db_session, e, estado):
    c = _cita(db_session, e, estado)

    r = _iniciar(client, db_session, e["doctora"], c.id)

    assert r.status_code == 200, r.text
    assert r.json() == {
        "appointment_id": c.id, "status": "en_consulta", "cambio": True, "motivo": None,
        "estado_antes_de_consulta": estado.value,
    }
    db_session.refresh(c)
    assert c.status == AppointmentStatus.EN_CONSULTA
    [rastro] = _bitacora(db_session, "appointment.consultation_started")
    assert rastro.details == {"estado_anterior": estado.value, "estado_nuevo": "en_consulta"}
    assert rastro.actor_user_id == e["doctora"].id
    assert rastro.patient_id == e["paciente"].id


def test_es_idempotente_y_no_repite_la_bitacora(client, db_session, e):
    """Dos pestañas o un reintento de red no son dos inicios de consulta."""
    c = _cita(db_session, e)
    _iniciar(client, db_session, e["doctora"], c.id)

    r = _iniciar(client, db_session, e["doctora"], c.id)

    assert r.status_code == 200
    assert r.json()["cambio"] is False
    assert r.json()["motivo"] == "ya_en_consulta"
    assert r.json()["status"] == "en_consulta"
    assert len(_bitacora(db_session, "appointment.consultation_started")) == 1


def test_abrir_la_consulta_cierra_el_aviso_de_paciente_en_sala(client, db_session, e):
    """Plan 27 + 28: la doctora ya tiene a la paciente enfrente; la campana no
    puede seguir pidiéndole que la atienda."""
    from app.services.notification_service import notify

    c = _cita(db_session, e, AppointmentStatus.EN_SALA)
    aviso = notify(
        db_session,
        tenant_id=e["tenant"].id,
        user_id=e["doctora"].id,
        type="patient_arrived",
        title="Paciente en sala",
        message="Ana está en sala de espera.",
        entity_type="appointment",
        entity_id=c.id,
        dedupe_key=f"patient_arrived:appointment:{c.id}",
    )
    db_session.commit()

    r = _iniciar(client, db_session, e["doctora"], c.id)

    assert r.status_code == 200, r.text
    db_session.refresh(aviso)
    assert aviso.resolved_at is not None
    assert aviso.resolution == "auto"
    assert aviso.resolved_by_user_id == e["doctora"].id


def test_master_mirando_no_cierra_el_aviso_de_paciente_en_sala(client, db_session, e):
    from app.services.notification_service import notify

    c = _cita(db_session, e, AppointmentStatus.EN_SALA)
    aviso = notify(
        db_session,
        tenant_id=e["tenant"].id,
        user_id=e["doctora"].id,
        type="patient_arrived",
        title="Paciente en sala",
        message="Ana está en sala de espera.",
        entity_type="appointment",
        entity_id=c.id,
    )
    db_session.commit()

    _iniciar(client, db_session, e["master"], c.id)

    db_session.refresh(aviso)
    assert aviso.resolved_at is None


def test_master_mirando_no_cambia_el_estado(client, db_session, e):
    c = _cita(db_session, e)

    r = _iniciar(client, db_session, e["master"], c.id)

    assert r.status_code == 200
    assert r.json() == {
        "appointment_id": c.id, "status": "en_sala", "cambio": False, "motivo": "no_es_su_cita",
        "estado_antes_de_consulta": None,
    }
    db_session.refresh(c)
    assert c.status == AppointmentStatus.EN_SALA


def test_una_doctora_sin_relacion_con_la_paciente_no_la_ve(client, db_session, e):
    c = _cita(db_session, e)

    r = _iniciar(client, db_session, e["otra"], c.id)

    assert r.status_code in (403, 404)
    db_session.refresh(c)
    assert c.status == AppointmentStatus.EN_SALA


def test_recepcion_no_puede_iniciar_una_consulta(client, db_session, e):
    c = _cita(db_session, e)

    r = _iniciar(client, db_session, e["recepcion"], c.id)

    assert r.status_code == 403


@pytest.mark.parametrize("estado", [AppointmentStatus.ATENDIDA, AppointmentStatus.CANCELADA])
def test_releer_una_consulta_cerrada_o_cancelada_no_cambia_nada(client, db_session, e, estado):
    c = _cita(db_session, e, estado)

    r = _iniciar(client, db_session, e["doctora"], c.id)

    assert r.json()["cambio"] is False
    assert r.json()["motivo"] == "estado_no_inicia"
    assert r.json()["status"] == estado.value
    assert _bitacora(db_session, "appointment.consultation_started") == []


@pytest.mark.parametrize("cuando", [datetime(2026, 10, 3, 23, 30), datetime(2026, 10, 5, 0, 15)])
def test_solo_cuenta_la_cita_de_hoy_en_mazatlan(client, db_session, e, cuando):
    """La de anoche a las 23:30 o la de mañana temprano no es «la paciente que tengo enfrente»."""
    c = _cita(db_session, e, AppointmentStatus.CONFIRMADA, cuando=cuando)

    r = _iniciar(client, db_session, e["doctora"], c.id)

    assert r.json()["cambio"] is False
    assert r.json()["motivo"] == "cita_de_otro_dia"


def test_la_cita_inexistente_da_404(client, db_session, e):
    assert _iniciar(client, db_session, e["doctora"], 9999).status_code == 404


# ---------------------------------------------------------------------------
# Cambios a mano
# ---------------------------------------------------------------------------

def test_en_consulta_no_se_marca_a_mano(client, db_session, e):
    c = _cita(db_session, e)

    r = _estado(client, db_session, e["recepcion"], c.id, "en_consulta")

    assert r.status_code == 400
    assert "no se marca a mano" in r.json()["detail"]
    db_session.refresh(c)
    assert c.status == AppointmentStatus.EN_SALA


@pytest.mark.parametrize("destino", ["agendada", "confirmada"])
def test_desde_en_consulta_no_se_regresa_a_agendada_ni_confirmada(client, db_session, e, destino):
    c = _cita(db_session, e, AppointmentStatus.EN_CONSULTA)

    r = _estado(client, db_session, e["recepcion"], c.id, destino)

    assert r.status_code == 400
    db_session.refresh(c)
    assert c.status == AppointmentStatus.EN_CONSULTA


def test_regresar_a_sala_no_pide_triage_ni_avisa_llegada_y_deja_rastro(client, db_session, e):
    """La doctora abrió la consulta sin signos y la regresa a sala para que se los tomen."""
    c = _cita(db_session, e, AppointmentStatus.EN_CONSULTA)

    r = _estado(client, db_session, e["doctora"], c.id, "en_sala")

    assert r.status_code == 200, r.text
    assert r.json()["status"] == "en_sala"
    assert db_session.query(Notification).filter(Notification.type == "patient_arrived").count() == 0
    [rastro] = _bitacora(db_session, "appointment.consultation_left")
    assert rastro.details == {"estado_anterior": "en_consulta", "estado_nuevo": "en_sala"}


def test_pasar_a_sala_desde_agendada_sigue_pidiendo_triage(client, db_session, e):
    c = _cita(db_session, e, AppointmentStatus.AGENDADA)

    r = _estado(client, db_session, e["recepcion"], c.id, "en_sala")

    assert r.status_code == 400


def test_cerrar_la_consulta_la_deja_atendida_y_avisa_a_recepcion(client, db_session, e):
    c = _cita(db_session, e, AppointmentStatus.EN_CONSULTA)

    r = _estado(client, db_session, e["doctora"], c.id, "atendida")

    assert r.status_code == 200, r.text
    assert r.json()["status"] == "atendida"
    assert db_session.query(Notification).filter(Notification.type == "consultation_completed").count() == 1
    [rastro] = _bitacora(db_session, "appointment.consultation_left")
    assert rastro.details["estado_nuevo"] == "atendida"


def test_se_puede_cancelar_desde_en_consulta(client, db_session, e):
    c = _cita(db_session, e, AppointmentStatus.EN_CONSULTA)

    r = _estado(client, db_session, e["recepcion"], c.id, "cancelada", cancellation_reason="Se retiró")

    assert r.status_code == 200, r.text
    assert r.json()["status"] == "cancelada"


def test_abrir_cerrar_y_volver_a_abrir_el_mismo_dia(client, db_session, e):
    """Regresar a sala y volver a abrirla es un segundo inicio legítimo."""
    c = _cita(db_session, e)
    _iniciar(client, db_session, e["doctora"], c.id)
    _estado(client, db_session, e["doctora"], c.id, "en_sala")

    r = _iniciar(client, db_session, e["doctora"], c.id)

    assert r.json()["cambio"] is True
    assert len(_bitacora(db_session, "appointment.consultation_started")) == 2


# ---------------------------------------------------------------------------
# Consumidores del estado
# ---------------------------------------------------------------------------

def test_en_consulta_ocupa_el_horario_como_en_sala(db_session, e):
    _cita(db_session, e, AppointmentStatus.EN_CONSULTA)

    assert AppointmentStatus.EN_CONSULTA in appointment_service.ESTADOS_QUE_OCUPAN
    assert appointment_service.check_appointment_collision(db_session, e["doctora"].id, datetime(2026, 10, 4, 10, 15), 30)


def test_en_consulta_ya_se_puede_cobrar(db_session, e):
    c = _cita(db_session, e, AppointmentStatus.EN_CONSULTA)

    assert cobro_service.estado_de_cobro(c, []) == "pendiente"


# ---------------------------------------------------------------------------
# Salir sin cerrar: vuelve al estado del que entró (revisión de la coordinación)
# ---------------------------------------------------------------------------

def test_abrir_una_agendada_y_salir_la_regresa_a_agendada_y_la_llegada_sigue_normal(client, db_session, e):
    """El caso que motivó la columna: la doctora abre a las 8:00 una cita que
    todavía no llega (para prepararla) y sale. Antes «Regresar a sala» la ponía
    en sala sin triage y la llegada real ya no avisaba a nadie.
    """
    c = _cita(db_session, e, AppointmentStatus.AGENDADA)
    _iniciar(client, db_session, e["doctora"], c.id)
    db_session.refresh(c)
    assert c.estado_antes_de_consulta == "agendada"

    # A sala no: la paciente no ha llegado.
    assert _estado(client, db_session, e["doctora"], c.id, "en_sala").status_code == 400
    r = _estado(client, db_session, e["doctora"], c.id, "agendada")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "agendada"
    assert r.json()["estado_antes_de_consulta"] is None
    assert db_session.query(Notification).filter(Notification.type == "patient_arrived").count() == 0

    # Llega de verdad: sin triage no pasa a sala.
    assert _estado(client, db_session, e["recepcion"], c.id, "en_sala").status_code == 400
    db_session.add(Triage(appointment_id=c.id, created_by_user_id=e["recepcion"].id))
    db_session.commit()
    db_session.expire_all()
    r = _estado(client, db_session, e["recepcion"], c.id, "en_sala")
    assert r.status_code == 200, r.text
    # Y la doctora recibe «Paciente en sala».
    avisos = db_session.query(Notification).filter(Notification.type == "patient_arrived").all()
    assert [a.user_id for a in avisos] == [e["doctora"].id]


def test_abrir_una_confirmada_y_salir_la_regresa_a_confirmada(client, db_session, e):
    c = _cita(db_session, e, AppointmentStatus.CONFIRMADA)
    _iniciar(client, db_session, e["doctora"], c.id)

    r = _estado(client, db_session, e["doctora"], c.id, "confirmada")

    assert r.status_code == 200, r.text
    assert r.json()["status"] == "confirmada"
    [rastro] = _bitacora(db_session, "appointment.consultation_left")
    assert rastro.details == {"estado_anterior": "en_consulta", "estado_nuevo": "confirmada"}


def test_la_que_estaba_en_sala_regresa_a_sala_sin_triage_ni_aviso(client, db_session, e):
    c = _cita(db_session, e, AppointmentStatus.EN_SALA)
    _iniciar(client, db_session, e["doctora"], c.id)

    assert _estado(client, db_session, e["doctora"], c.id, "agendada").status_code == 400
    r = _estado(client, db_session, e["doctora"], c.id, "en_sala")

    assert r.status_code == 200, r.text
    assert db_session.query(Notification).filter(Notification.type == "patient_arrived").count() == 0


def test_la_respuesta_dice_de_donde_entro(client, db_session, e):
    c = _cita(db_session, e, AppointmentStatus.CONFIRMADA)
    _iniciar(client, db_session, e["doctora"], c.id)

    r = client.get(f"{PREFIX}/appointments/{c.id}", headers=headers(db_session, e["doctora"]))

    assert r.json()["status"] == "en_consulta"
    assert r.json()["estado_antes_de_consulta"] == "confirmada"


def test_al_finalizar_se_limpia_el_estado_guardado(client, db_session, e):
    c = _cita(db_session, e, AppointmentStatus.EN_SALA)
    _iniciar(client, db_session, e["doctora"], c.id)

    r = _estado(client, db_session, e["doctora"], c.id, "atendida")

    assert r.json()["estado_antes_de_consulta"] is None


def test_reabrir_y_volver_a_entrar_guarda_en_sala(client, db_session, e):
    """Reabrir lleva a sala (regla de siempre) y la pantalla vuelve a pedir consulta:
    si la doctora sale otra vez sin cerrar, regresa a sala, que es donde quedó."""
    c = _cita(db_session, e, AppointmentStatus.ATENDIDA)
    assert _estado(client, db_session, e["doctora"], c.id, "en_sala").status_code == 200

    assert _iniciar(client, db_session, e["doctora"], c.id).json()["cambio"] is True
    db_session.refresh(c)
    assert c.estado_antes_de_consulta == "en_sala"
