"""La API de avisos del plan 27, Fase 1: «Por atender», estado, descartar y preferencias.

«Leído» y «atendido» dejan de ser lo mismo: lo que pide algo no se borra, se
resuelve solo o se descarta con registro; la ruta del «Ir» la arma el
servidor según lo que la persona puede abrir.
"""
from datetime import timedelta

from _cobros_base import PREFIX, client, db_session, e, headers  # noqa: F401

from app.db.session import utcnow
from app.models.audit_log import AuditLog
from app.models.notification import (
    Notification,
    NotificationPriority,
    NotificationResolution,
    NotificationType,
)
from app.services.notification_service import notify


def _avisos(db):
    db.expire_all()
    return db.query(Notification).order_by(Notification.id).all()


# ---------------------------------------------------------------------------
# API: estado, abiertos, descartar, borrar, preferencias
# ---------------------------------------------------------------------------


def _aviso(db, user, prioridad=NotificationPriority.ACCIONABLE, tipo=NotificationType.PATIENT_ARRIVED, **extra):
    a = Notification(
        tenant_id=user.tenant_id, user_id=user.id, type=tipo, title="t", message="m",
        priority=prioridad, **extra,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def test_estado_cuenta_abiertos_por_prioridad(client, db_session, e):
    _aviso(db_session, e["adolfo"])
    _aviso(db_session, e["adolfo"], resolved_at=utcnow(), is_read=True)
    ultimo = _aviso(db_session, e["adolfo"], prioridad=NotificationPriority.INFORMATIVO, tipo=NotificationType.APPOINTMENT_TODAY)

    r = client.get(f"{PREFIX}/notifications/estado", headers=headers(db_session, e["adolfo"]))

    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["abiertos"] == {"accionable": 1, "urgente": 0}
    assert cuerpo["sin_leer"] == 2
    assert cuerpo["ultimo_id"] == ultimo.id


def test_por_atender_trae_solo_lo_abierto_del_mas_viejo_al_mas_nuevo(client, db_session, e):
    viejo = _aviso(db_session, e["adolfo"], entity_type="appointment", entity_id=7)
    viejo.created_at = utcnow() - timedelta(hours=2)
    db_session.commit()
    nuevo = _aviso(db_session, e["adolfo"], entity_type="appointment", entity_id=8)
    _aviso(db_session, e["adolfo"], resolved_at=utcnow())
    _aviso(db_session, e["adolfo"], prioridad=NotificationPriority.INFORMATIVO, tipo=NotificationType.APPOINTMENT_TODAY)

    r = client.get(f"{PREFIX}/notifications?abiertos=true", headers=headers(db_session, e["adolfo"]))

    cuerpo = r.json()
    assert [i["id"] for i in cuerpo["items"]] == [viejo.id, nuevo.id]
    assert cuerpo["abiertos_count"] == 2
    # La ruta la arma el servidor según lo que la persona puede abrir.
    assert cuerpo["items"][0]["ruta"] == "/doctor/consultation/7"


def test_sin_permiso_para_la_pantalla_no_hay_ruta(client, db_session, e):
    _aviso(db_session, e["jhoany"], entity_type="appointment", entity_id=7)

    r = client.get(f"{PREFIX}/notifications", headers=headers(db_session, e["jhoany"]))

    assert r.json()["items"][0]["ruta"] is None


def test_descartar_deja_rastro(client, db_session, e):
    a = _aviso(db_session, e["adolfo"])

    r = client.patch(f"{PREFIX}/notifications/{a.id}/descartar", headers=headers(db_session, e["adolfo"]))

    assert r.status_code == 200, r.text
    assert r.json()["resolution"] == NotificationResolution.DESCARTADO
    assert r.json()["resolved_by_name"] == "Adolfo Ruiz"
    db_session.expire_all()
    assert db_session.query(AuditLog).filter(AuditLog.action == "notification.dismissed").count() == 1


def test_descartar_uno_ajeno_da_404(client, db_session, e):
    a = _aviso(db_session, e["adolfo"])

    r = client.patch(f"{PREFIX}/notifications/{a.id}/descartar", headers=headers(db_session, e["cintia"]))

    assert r.status_code == 404
    db_session.refresh(a)
    assert a.resolved_at is None


def test_lo_accionable_no_se_borra(client, db_session, e):
    a = _aviso(db_session, e["adolfo"])

    r = client.delete(f"{PREFIX}/notifications/{a.id}", headers=headers(db_session, e["adolfo"]))

    assert r.status_code == 409


def test_borrar_leidas_funciona_y_solo_borra_informativas(client, db_session, e):
    leida = _aviso(db_session, e["adolfo"], prioridad=NotificationPriority.INFORMATIVO, tipo=NotificationType.APPOINTMENT_TODAY, is_read=True)
    atendida = _aviso(db_session, e["adolfo"], is_read=True, resolved_at=utcnow())

    # «/read» antes se leía como un id y respondía 422 sin borrar nada.
    r = client.delete(f"{PREFIX}/notifications/read", headers=headers(db_session, e["adolfo"]))

    assert r.status_code == 204
    ids = {a.id for a in _avisos(db_session)}
    assert leida.id not in ids
    assert atendida.id in ids


def test_no_se_puede_silenciar_lo_accionable(client, db_session, e):
    r = client.put(
        f"{PREFIX}/notifications/preferencias",
        json={"tipos_silenciados": [NotificationType.PATIENT_ARRIVED]},
        headers=headers(db_session, e["adolfo"]),
    )

    assert r.status_code == 422


def test_lo_informativo_silenciado_no_se_escribe(client, db_session, e):
    r = client.put(
        f"{PREFIX}/notifications/preferencias",
        json={"tipos_silenciados": [NotificationType.DOCUMENT_UPLOADED], "sonido": True},
        headers=headers(db_session, e["adolfo"]),
    )
    assert r.status_code == 200, r.text
    assert r.json()["sonido"] is True

    escrito = notify(
        db_session, tenant_id=e["tenant"].id, user_id=e["adolfo"].id,
        type=NotificationType.DOCUMENT_UPLOADED, title="Nuevo documento", message="m",
    )

    assert escrito is None


def test_preferencias_arrancan_apagadas(client, db_session, e):
    r = client.get(f"{PREFIX}/notifications/preferencias", headers=headers(db_session, e["adolfo"]))

    cuerpo = r.json()
    assert (cuerpo["sonido"], cuerpo["navegador"], cuerpo["recordatorio_una_hora"]) == (False, False, False)
    assert NotificationType.PATIENT_ARRIVED not in cuerpo["tipos_silenciables"]


def test_el_aviso_de_otra_sucursal_dice_cual_y_no_lleva_ir(client, db_session, e):
    """Un médico en dos sucursales ve los avisos de ambas, pero «Ir» a una
    cita de la sucursal que no tiene activa terminaba en «no se encontró»."""
    otra = Notification(
        tenant_id=e["otra"].id, user_id=e["adolfo"].id, type=NotificationType.PATIENT_ARRIVED,
        title="Paciente en sala", message="m", priority=NotificationPriority.ACCIONABLE,
        entity_type="appointment", entity_id=9,
    )
    propia = Notification(
        tenant_id=e["tenant"].id, user_id=e["adolfo"].id, type=NotificationType.PATIENT_ARRIVED,
        title="Paciente en sala", message="m", priority=NotificationPriority.ACCIONABLE,
        entity_type="appointment", entity_id=8,
    )
    db_session.add_all([otra, propia])
    db_session.commit()

    items = {
        i["entity_id"]: i
        for i in client.get(f"{PREFIX}/notifications?abiertos=true", headers=headers(db_session, e["adolfo"])).json()["items"]
    }

    assert items[9]["de_otra_sucursal"] is True
    assert items[9]["sucursal"] == "Otra sucursal"
    assert items[9]["ruta"] is None
    assert items[8]["de_otra_sucursal"] is False
    assert items[8]["ruta"] == "/doctor/consultation/8"


def test_recepcion_no_ve_tipos_que_nunca_recibe(client, db_session, e):
    """«Citas que te agenda alguien más» le llega al médico; ofrecérselo a
    recepción era un interruptor de algo que nunca pasa (plan 29, N-1)."""
    doctora = client.get(f"{PREFIX}/notifications/preferencias", headers=headers(db_session, e["adolfo"])).json()
    recepcion = client.get(f"{PREFIX}/notifications/preferencias", headers=headers(db_session, e["jhoany"])).json()

    assert NotificationType.APPOINTMENT_SCHEDULED in doctora["tipos_silenciables"]
    assert recepcion["tipos_silenciables"] == []

    r = client.put(
        f"{PREFIX}/notifications/preferencias",
        json={"tipos_silenciados": [NotificationType.APPOINTMENT_SCHEDULED]},
        headers=headers(db_session, e["jhoany"]),
    )
    assert r.status_code == 422
