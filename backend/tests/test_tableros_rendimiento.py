"""El costo de los tableros prenatales no crece con el nº de embarazos (B-07).

Antes, cada tablero hacía una (o varias) consultas por embarazo dentro del bucle
(hueco 06 M2). Con muchos embarazos activos eso es lo que se siente lento. Aquí
se cuenta cuántas consultas SQL dispara cada tablero y se comprueba que el número
es el mismo con 1 embarazo que con muchos: la corrección quedó, o estas pruebas
fallan.
"""
from contextlib import contextmanager
from datetime import date, datetime, timedelta

from sqlalchemy import event

from app.models.pregnancy import Pregnancy, PregnancyStatus, PrenatalVisit

from test_tablero_revision_prenatal import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _embarazo,
    client,
    consultorio,
    db_session,
)


@contextmanager
def _contar_consultas(engine):
    """Cuenta cuántas sentencias SQL se ejecutan mientras dura el bloque."""
    contador = {"n": 0}

    def _cuenta(conn, cursor, statement, params, context, executemany):
        contador["n"] += 1

    event.listen(engine, "before_cursor_execute", _cuenta)
    try:
        yield contador
    finally:
        event.remove(engine, "before_cursor_execute", _cuenta)


def _visita(db, embarazo, *, proxima: date):
    visita = PrenatalVisit(
        tenant_id=embarazo.tenant_id,
        pregnancy_id=embarazo.id,
        doctor_id=embarazo.doctor_id,
        visit_date=date.today(),
        next_visit_on=proxima,
    )
    db.add(visita)
    db.commit()


def test_el_tablero_de_revision_no_dispara_una_consulta_por_embarazo(client, db_session, consultorio):
    hoy = date.today()
    doctora = consultorio["dra_a"]
    engine = db_session.get_bind()

    # Un embarazo pendiente (sin cita, dentro de la ventana).
    _embarazo(db_session, consultorio, doctora, revision=hoy - timedelta(days=3), nombre="Uno")
    headers = _auth_headers(db_session, doctora)
    with _contar_consultas(engine) as con_uno:
        r1 = client.get(f"{PREFIX}/clinical-tracking/prenatal-review-board", headers=headers)
    assert r1.status_code == 200
    assert len(r1.json()) == 1

    # Once embarazos más, todos pendientes.
    for i in range(11):
        _embarazo(db_session, consultorio, doctora, revision=hoy - timedelta(days=2), nombre=f"P{i}")
    headers = _auth_headers(db_session, doctora)
    with _contar_consultas(engine) as con_doce:
        r12 = client.get(f"{PREFIX}/clinical-tracking/prenatal-review-board", headers=headers)
    assert r12.status_code == 200
    assert len(r12.json()) == 12

    # El número de consultas no cambia con el nº de embarazos.
    assert con_doce["n"] == con_uno["n"], (
        f"El tablero escaló de {con_uno['n']} a {con_doce['n']} consultas: volvió el N+1"
    )


def _embarazo_con_fpp(db, consultorio, doctora, *, edd: date, nombre: str):
    embarazo = _embarazo(db, consultorio, doctora, revision=edd - timedelta(days=30), nombre=nombre)
    embarazo.estimated_delivery_date = edd
    db.commit()
    db.refresh(embarazo)
    return embarazo


def test_el_tablero_obstetrico_no_dispara_una_consulta_por_embarazo(client, db_session, consultorio):
    hoy = date.today()
    doctora = consultorio["dra_a"]
    engine = db_session.get_bind()

    e1 = _embarazo_con_fpp(db_session, consultorio, doctora, edd=hoy + timedelta(days=10), nombre="FppUno")
    _visita(db_session, e1, proxima=hoy + timedelta(days=5))
    headers = _auth_headers(db_session, doctora)
    with _contar_consultas(engine) as con_uno:
        r1 = client.get(f"{PREFIX}/clinical-tracking/obstetric-dashboard", headers=headers)
    assert r1.status_code == 200
    assert len(r1.json()) == 1

    for i in range(11):
        ei = _embarazo_con_fpp(db_session, consultorio, doctora, edd=hoy + timedelta(days=12), nombre=f"Fpp{i}")
        _visita(db_session, ei, proxima=hoy + timedelta(days=6))
    headers = _auth_headers(db_session, doctora)
    with _contar_consultas(engine) as con_doce:
        r12 = client.get(f"{PREFIX}/clinical-tracking/obstetric-dashboard", headers=headers)
    assert r12.status_code == 200
    assert len(r12.json()) == 12
    # La próxima revisión de cada embarazo se resolvió sin consultar por embarazo.
    assert r12.json()[0]["next_visit_on"] is not None

    assert con_doce["n"] == con_uno["n"], (
        f"El tablero obstétrico escaló de {con_uno['n']} a {con_doce['n']} consultas: volvió el N+1"
    )
