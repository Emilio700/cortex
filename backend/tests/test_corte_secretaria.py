"""La secretaria ve el corte de las doctoras que apoya, y de nadie más.

El caso real: Jhoany apoya al Dr. Adolfo y tiene que cuadrar lo que él cobró
sin ver cuánto ingresó cada colega. Lo que se cuida aquí:

1. Que el corte acotado CUADRE: es exactamente la suma de los cortes de sus
   doctoras. Un corte que no cuadra con sus partes es peor que no tenerlo.
2. Que sin asignaciones no parezca un día sin cobros: la respuesta dice que
   está acotada y que no tiene doctoras.
3. Que la lista de pagos siga siendo de toda la sucursal (ella cobra a todas).
4. Que administración siga viendo la sucursal como antes.
5. Que asignar y conceder el corte lo haga administración, quede en la
   bitácora y no toque los demás permisos de la usuaria.
"""
from decimal import Decimal

from _cobros_base import PREFIX, client, db_session, e, headers, pago  # noqa: F401

from app.models.audit_log import AuditLog
from app.models.permission import Permission
from app.models.secretaria_doctora import SecretariaDoctora


def _asignar(client, db, e, secretaria, doctoras, puede_ver_corte=True):
    return client.put(
        f"{PREFIX}/users/{secretaria.id}/doctoras-que-apoya",
        json={"doctor_ids": [d.id for d in doctoras], "puede_ver_corte": puede_ver_corte},
        headers=headers(db, e["admin"]),
    )


def _corte(client, db, quien, **params):
    return client.get(f"{PREFIX}/payments/cash-cut", params=params, headers=headers(db, quien))


def _cobros_del_dia(db, e):
    """Cobros de las tres doctoras y uno histórico sin doctora."""
    t, rec = e["tenant"], e["laura"]
    pago(db, t, e["pac_adolfo"], rec, e["adolfo"], "800.00")
    pago(db, t, e["pac_adolfo"], e["adolfo"], e["adolfo"], "350.50")
    pago(db, t, e["pac_cintia"], rec, e["cintia"], "1200.00")
    pago(db, t, e["pac_rosa"], rec, e["rosa"], "600.00")
    pago(db, t, e["pac_rosa"], rec, None, "90.00")


# ---------------------------------------------------------------------------
# El corte acotado
# ---------------------------------------------------------------------------

def test_sin_el_permiso_la_secretaria_no_ve_el_corte(client, db_session, e):
    """El corte no es permiso del rol: se concede por usuaria."""
    assert _corte(client, db_session, e["jhoany"]).status_code == 403


def test_con_permiso_y_sin_asignaciones_no_ve_nada_y_se_sabe_por_que(client, db_session, e):
    _cobros_del_dia(db_session, e)
    assert _asignar(client, db_session, e, e["jhoany"], []).status_code == 200

    r = _corte(client, db_session, e["jhoany"])

    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["alcance"] == "asignadas"
    assert cuerpo["doctoras_del_alcance"] == []
    assert Decimal(cuerpo["total_amount"]) == 0
    assert cuerpo["by_doctor"] == [] and cuerpo["by_method"] == []


def test_el_corte_de_la_secretaria_es_la_suma_de_los_de_sus_doctoras(client, db_session, e):
    """El candado principal: los totales tienen que cuadrar."""
    _cobros_del_dia(db_session, e)
    assert _asignar(client, db_session, e, e["jhoany"], [e["adolfo"], e["cintia"]]).status_code == 200

    suyo = _corte(client, db_session, e["jhoany"]).json()
    de_adolfo = _corte(client, db_session, e["admin"], doctor_id=e["adolfo"].id).json()
    de_cintia = _corte(client, db_session, e["admin"], doctor_id=e["cintia"].id).json()

    assert Decimal(suyo["total_amount"]) == Decimal(de_adolfo["total_amount"]) + Decimal(
        de_cintia["total_amount"]
    )
    assert Decimal(suyo["total_amount"]) == Decimal("2350.50")
    assert suyo["total_count"] == de_adolfo["total_count"] + de_cintia["total_count"]
    # Cada desglose suma el total, igual que en el corte de la sucursal.
    for desglose in ("by_method", "by_doctor", "by_received_by"):
        assert sum(Decimal(f["total_amount"]) for f in suyo[desglose]) == Decimal(suyo["total_amount"])
    # Ni Rosa ni lo histórico sin doctora aparecen.
    assert {f["doctor_id"] for f in suyo["by_doctor"]} == {e["adolfo"].id, e["cintia"].id}
    assert [d["doctor_id"] for d in suyo["doctoras_del_alcance"]] == [e["adolfo"].id, e["cintia"].id]

    # Y el de una sola de sus doctoras es igual al que ve la propia doctora.
    solo_adolfo = _corte(client, db_session, e["jhoany"], doctor_id=e["adolfo"].id).json()
    propio = _corte(client, db_session, e["adolfo"]).json()
    assert solo_adolfo["total_amount"] == propio["total_amount"] == de_adolfo["total_amount"]


def test_la_secretaria_no_puede_pedir_el_corte_de_una_doctora_que_no_apoya(client, db_session, e):
    _cobros_del_dia(db_session, e)
    _asignar(client, db_session, e, e["jhoany"], [e["adolfo"]])

    r = _corte(client, db_session, e["jhoany"], doctor_id=e["rosa"].id)

    assert r.status_code == 403
    assert "no está entre las que apoyas" in r.json()["detail"]


def test_la_lista_de_pagos_de_la_secretaria_sigue_siendo_de_toda_la_sucursal(client, db_session, e):
    """Cobra a cualquiera: acotar la lista le escondería lo que ella misma cobró."""
    _cobros_del_dia(db_session, e)
    _asignar(client, db_session, e, e["jhoany"], [e["adolfo"]])

    r = client.get(f"{PREFIX}/payments", headers=headers(db_session, e["jhoany"]))

    assert r.status_code == 200
    assert len(r.json()) == 5


def test_administracion_sigue_viendo_toda_la_sucursal(client, db_session, e):
    _cobros_del_dia(db_session, e)

    cuerpo = _corte(client, db_session, e["admin"]).json()

    assert cuerpo["alcance"] == "sucursal"
    assert cuerpo["doctoras_del_alcance"] is None
    assert Decimal(cuerpo["total_amount"]) == Decimal("3040.50")


def test_la_doctora_sigue_viendo_solo_lo_suyo(client, db_session, e):
    _cobros_del_dia(db_session, e)

    cuerpo = _corte(client, db_session, e["cintia"]).json()

    assert cuerpo["alcance"] == "propio"
    assert Decimal(cuerpo["total_amount"]) == Decimal("1200.00")


def test_una_asignacion_desactivada_ya_no_abre_el_corte(client, db_session, e):
    _cobros_del_dia(db_session, e)
    _asignar(client, db_session, e, e["jhoany"], [e["adolfo"], e["cintia"]])
    _asignar(client, db_session, e, e["jhoany"], [e["adolfo"]])

    cuerpo = _corte(client, db_session, e["jhoany"]).json()

    assert Decimal(cuerpo["total_amount"]) == Decimal("1150.50")
    fila = (
        db_session.query(SecretariaDoctora)
        .filter_by(secretaria_id=e["jhoany"].id, doctor_id=e["cintia"].id)
        .one()
    )
    # Se desactiva, no se borra: la fila dice desde cuándo existía.
    assert fila.is_active is False


# ---------------------------------------------------------------------------
# La asignación desde administración
# ---------------------------------------------------------------------------

def test_asignar_concede_el_corte_sube_la_version_y_queda_en_la_bitacora(client, db_session, e):
    version_antes = e["jhoany"].permissions_version or 1

    r = _asignar(client, db_session, e, e["jhoany"], [e["adolfo"]])

    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["doctor_ids"] == [e["adolfo"].id]
    assert cuerpo["puede_ver_corte"] is True
    assert cuerpo["permissions_version"] == version_antes + 1
    registro = db_session.query(AuditLog).filter_by(action="user.doctoras_que_apoya.updated").one()
    assert registro.actor_user_id == e["admin"].id
    assert registro.entity_id == e["jhoany"].id

    leido = client.get(
        f"{PREFIX}/users/{e['jhoany'].id}/doctoras-que-apoya", headers=headers(db_session, e["admin"])
    ).json()
    assert leido["doctor_ids"] == [e["adolfo"].id] and leido["puede_ver_corte"] is True


def test_quitar_el_corte_no_toca_los_demas_permisos_de_la_usuaria(client, db_session, e):
    db_session.add(
        Permission(role="secretaria", action="reports.read", is_granted=True, user_id=e["jhoany"].id)
    )
    db_session.commit()
    _asignar(client, db_session, e, e["jhoany"], [e["adolfo"]])

    r = _asignar(client, db_session, e, e["jhoany"], [e["adolfo"]], puede_ver_corte=False)

    assert r.json()["puede_ver_corte"] is False
    acciones = {p.action for p in db_session.query(Permission).filter_by(user_id=e["jhoany"].id)}
    assert acciones == {"reports.read"}
    assert _corte(client, db_session, e["jhoany"]).status_code == 403


def test_la_secretaria_no_se_asigna_doctoras_a_si_misma(client, db_session, e):
    """Hace falta ``users.update``, que la secretaria no tiene."""
    r = client.put(
        f"{PREFIX}/users/{e['jhoany'].id}/doctoras-que-apoya",
        json={"doctor_ids": [e["adolfo"].id], "puede_ver_corte": True},
        headers=headers(db_session, e["jhoany"]),
    )
    assert r.status_code == 403


def test_solo_a_una_secretaria_se_le_asignan_doctoras(client, db_session, e):
    r = _asignar(client, db_session, e, e["cintia"], [e["adolfo"]])
    assert r.status_code == 400


def test_no_se_asigna_una_doctora_de_otra_sucursal(client, db_session, e):
    r = _asignar(client, db_session, e, e["jhoany"], [e["ajena"]])

    assert r.status_code == 400
    assert db_session.query(SecretariaDoctora).count() == 0


# ---------------------------------------------------------------------------
# Mi caja: el arqueo de la secretaria (plan 23, revisión de flujos)
# ---------------------------------------------------------------------------

def test_su_caja_cuadra_con_todo_lo_que_cobro_aunque_sea_de_doctoras_que_no_apoya(client, db_session, e):
    """Ella cobra para toda la sucursal: su caja no puede salir del corte acotado.

    Antes su fila de «Por quién lo recibió» sólo sumaba lo de sus doctoras y
    no cuadraba con el cajón: faltaba el efectivo que cobró para las demás.
    """
    from app.models.payment import PaymentMethod, PaymentStatus

    t, jhoany = e["tenant"], e["jhoany"]
    pago(db_session, t, e["pac_adolfo"], jhoany, e["adolfo"], "800.00")
    pago(db_session, t, e["pac_rosa"], jhoany, e["rosa"], "600.00")  # Rosa: no la apoya
    pago(db_session, t, e["pac_cintia"], jhoany, e["cintia"], "1200.00", method=PaymentMethod.CARD)
    pago(db_session, t, e["pac_rosa"], jhoany, None, "90.00")  # histórico sin doctora
    pago(db_session, t, e["pac_rosa"], jhoany, e["rosa"], "999.00", status=PaymentStatus.ANULADO)
    pago(db_session, t, e["pac_adolfo"], e["laura"], e["adolfo"], "300.00")  # lo recibió otra
    assert _asignar(client, db_session, e, jhoany, [e["adolfo"]]).status_code == 200

    corte = _corte(client, db_session, jhoany).json()
    caja = corte["mi_caja"]

    # Su caja: la suma de sus cobros vigentes del día en la lista de pagos.
    lista = client.get(f"{PREFIX}/payments", headers=headers(db_session, jhoany)).json()
    suyos = [p for p in lista if p["received_by_user_id"] == jhoany.id and p["status"] == "vigente"]
    assert Decimal(caja["total_amount"]) == sum(Decimal(p["amount"]) for p in suyos) == Decimal("2690.00")
    assert caja["count"] == len(suyos) == 4
    assert caja["user_id"] == jhoany.id
    efectivo = next(m for m in caja["by_method"] if m["method"] == "cash")
    assert Decimal(efectivo["total_amount"]) == Decimal("1490.00")
    assert sum(Decimal(m["total_amount"]) for m in caja["by_method"]) == Decimal(caja["total_amount"])

    # El corte por doctora sigue acotado a las que apoya y cuadra consigo mismo.
    assert {f["doctor_id"] for f in corte["by_doctor"]} == {e["adolfo"].id}
    assert Decimal(corte["total_amount"]) == Decimal("1100.00")
    for desglose in ("by_method", "by_doctor", "by_received_by"):
        assert sum(Decimal(f["total_amount"]) for f in corte[desglose]) == Decimal(corte["total_amount"])


def test_su_caja_no_cambia_con_el_selector_de_doctora(client, db_session, e):
    """El selector acota el corte; el cajón es uno solo."""
    t, jhoany = e["tenant"], e["jhoany"]
    pago(db_session, t, e["pac_adolfo"], jhoany, e["adolfo"], "800.00")
    pago(db_session, t, e["pac_cintia"], jhoany, e["cintia"], "500.00")
    assert _asignar(client, db_session, e, jhoany, [e["adolfo"], e["cintia"]]).status_code == 200

    de_adolfo = _corte(client, db_session, jhoany, doctor_id=e["adolfo"].id).json()

    assert Decimal(de_adolfo["total_amount"]) == Decimal("800.00")
    assert Decimal(de_adolfo["mi_caja"]["total_amount"]) == Decimal("1300.00")


def test_sin_doctoras_asignadas_igual_ve_su_caja(client, db_session, e):
    pago(db_session, e["tenant"], e["pac_rosa"], e["jhoany"], e["rosa"], "600.00")
    assert _asignar(client, db_session, e, e["jhoany"], []).status_code == 200

    corte = _corte(client, db_session, e["jhoany"]).json()

    assert Decimal(corte["total_amount"]) == 0
    assert Decimal(corte["mi_caja"]["total_amount"]) == Decimal("600.00")


def test_administracion_y_la_doctora_no_reciben_mi_caja(client, db_session, e):
    """Su corte ya es la sucursal o lo propio; no cambia nada para ellas."""
    assert _corte(client, db_session, e["admin"]).json()["mi_caja"] is None
    assert _corte(client, db_session, e["adolfo"]).json()["mi_caja"] is None
