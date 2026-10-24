"""«Borrar leídas» de la campana sí borra.

La ruta ``DELETE /notifications/read`` estaba declarada después de
``DELETE /notifications/{notification_id}``: «read» se intentaba leer como id,
la respuesta era 422 y no se borraba nada, sin que la campana lo dijera.
"""
from _cobros_base import PREFIX, client, db_session, e, headers  # noqa: F401
from app.models.notification import Notification


def test_borrar_leidas_borra_las_leidas_y_no_las_demas(client, db_session, e):
    leida = Notification(tenant_id=e["tenant"].id, user_id=e["adolfo"].id, type="appointment_today",
                         title="Agenda de hoy", message="m", is_read=True)
    sin_leer = Notification(tenant_id=e["tenant"].id, user_id=e["adolfo"].id, type="appointment_today",
                            title="Agenda de hoy", message="m", is_read=False)
    db_session.add_all([leida, sin_leer])
    db_session.commit()
    sin_leer_id = sin_leer.id

    respuesta = client.delete(f"{PREFIX}/notifications/read", headers=headers(db_session, e["adolfo"]))

    assert respuesta.status_code == 204, respuesta.text
    db_session.expire_all()
    assert [n.id for n in db_session.query(Notification).all()] == [sin_leer_id]
