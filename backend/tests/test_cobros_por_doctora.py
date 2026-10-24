"""Cobros por doctora: alcance, anti cobro doble, anulación y corte (plan 23).

Lo que se cuida aquí, en el orden en que dolería si fallara en consulta:

1. Que nadie cobre dos veces la misma cita: ni por doble clic, ni porque la
   doctora y la secretaria cobraron cada una por su lado.
2. Que el médico vea el dinero que es suyo y sólo ése, en todas las vistas por
   igual (lista, detalle, historial, corte, top de servicios).
3. Que los totales cuadren: la suma por doctora más "sin doctora" es el total de
   la sucursal, y un pago anulado no cuenta en ninguno.
4. Que "el corte de hoy" sea el día de México y no el de UTC.

``SELECT … FOR UPDATE`` no existe en SQLite: aquí se ignora. El caso de dos
cobros simultáneos lo cubren la revisión con 409 y el ``client_request_id``
único, que sí son deterministas; el bloqueo sólo se observa con dos conexiones
reales a PostgreSQL.

Usan SQLite en memoria y sobrescriben ``get_db``, como ``test_triage_desde_consulta.py``.
"""
from datetime import datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import security
from app.core.config import settings
from app.core.deps import get_db
from app.core.hora_local import ahora_local, hoy_local, local_a_utc
from app.db.session import Base, utcnow
from app.main import app
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.models.patient import Patient
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.permission import Permission
from app.models.service import Service
from app.models.tenant import Tenant
from app.models.user import Role, User
from app.models.user_session import UserSession

PREFIX = settings.API_V1_PREFIX


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _headers(db, user: User) -> dict[str, str]:
    session = UserSession(
        id=str(uuid4()),
        user_id=user.id,
        tenant_id=user.tenant_id,
        refresh_jti=str(uuid4()),
        expires_at=utcnow() + timedelta(days=1),
    )
    db.add(session)
    db.commit()
    token = security.create_access_token(
        data={"sub": str(user.id), "role": user.role.value, "sid": session.id}
    )
    return {"Authorization": f"Bearer {token}"}


def _usuario(db, tenant, nombre, role):
    usuario = User(
        email=f"{nombre.lower().replace(' ', '.')}@gems.com",
        hashed_password="no-usado-en-estas-pruebas",
        full_name=nombre,
        role=role,
        tenant_id=tenant.id,
        is_active=True,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


def _paciente(db, tenant, duena, nombre):
    paciente = Patient(
        tenant_id=tenant.id,
        first_name=nombre,
        last_name="De Prueba",
        date_of_birth=datetime(1990, 5, 20).date(),
        owner_doctor_id=duena.id,
    )
    db.add(paciente)
    db.commit()
    db.refresh(paciente)
    return paciente


def _cita(db, tenant, paciente, doctora, estado=AppointmentStatus.ATENDIDA):
    cita = Appointment(
        tenant_id=tenant.id,
        patient_id=paciente.id,
        doctor_id=doctora.id,
        # scheduled_at va en hora local (no UTC como created_at): con utcnow()
        # la cita de la tarde quedaba "mañana" para todo lo que mira el día.
        scheduled_at=ahora_local(),
        duration_minutes=30,
        appointment_type=AppointmentType.CONSULTA,
        status=estado,
    )
    db.add(cita)
    db.commit()
    db.refresh(cita)
    return cita


def _pago(db, tenant, paciente, recibio, doctora, monto, **extra):
    pago = Payment(
        tenant_id=tenant.id,
        patient_id=paciente.id,
        received_by_user_id=recibio.id,
        doctor_id=doctora.id if doctora else None,
        amount=Decimal(monto),
        method=extra.pop("method", PaymentMethod.CASH),
        **extra,
    )
    db.add(pago)
    db.commit()
    db.refresh(pago)
    return pago


@pytest.fixture
def e(db_session):
    """Una sucursal con dos doctoras, recepción y administración."""
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    cintia = _usuario(db_session, tenant, "Cintia López", Role.DOCTOR)
    rosa = _usuario(db_session, tenant, "Rosa Méndez", Role.DOCTOR)
    secretaria = _usuario(db_session, tenant, "Laura Recepción", Role.SECRETARIA)
    admin = _usuario(db_session, tenant, "Admin Sucursal", Role.ADMIN)

    paciente_cintia = _paciente(db_session, tenant, cintia, "Ana")
    paciente_rosa = _paciente(db_session, tenant, rosa, "Berta")

    servicio = Service(tenant_id=tenant.id, name="Consulta ginecológica", price=Decimal("800.00"))
    db_session.add(servicio)
    db_session.commit()
    db_session.refresh(servicio)

    return {
        "tenant": tenant,
        "cintia": cintia,
        "rosa": rosa,
        "secretaria": secretaria,
        "admin": admin,
        "paciente_cintia": paciente_cintia,
        "paciente_rosa": paciente_rosa,
        "cita_cintia": _cita(db_session, tenant, paciente_cintia, cintia),
        "cita_rosa": _cita(db_session, tenant, paciente_rosa, rosa),
        "servicio": servicio,
    }


def _cobrar(client, headers, **datos):
    cuerpo = {"amount": "800.00", "method": "card", **datos}
    return client.post(f"{PREFIX}/payments", json=cuerpo, headers=headers)


def _vigentes_de(db, cita_id):
    return (
        db.query(Payment)
        .filter(Payment.appointment_id == cita_id, Payment.status == PaymentStatus.VIGENTE)
        .count()
    )


# ---------------------------------------------------------------------------
# Anti cobro doble
# ---------------------------------------------------------------------------

def test_cobrar_dos_veces_la_misma_cita_da_409_con_el_cobro_existente(client, db_session, e):
    """El caso real: el médico cobró con tarjeta y recepción iba a cobrar otra vez."""
    primero = _cobrar(
        client,
        _headers(db_session, e["cintia"]),
        patient_id=e["paciente_cintia"].id,
        appointment_id=e["cita_cintia"].id,
    )
    assert primero.status_code == 201, primero.text

    segundo = _cobrar(
        client,
        _headers(db_session, e["secretaria"]),
        patient_id=e["paciente_cintia"].id,
        appointment_id=e["cita_cintia"].id,
        method="cash",
    )

    assert segundo.status_code == 409, segundo.text
    cuerpo = segundo.json()
    # ``detail`` es texto plano listo para mostrar, y dice quién, cuánto y cómo.
    assert isinstance(cuerpo["detail"], str)
    assert "Cintia López" in cuerpo["detail"]
    assert "$800.00" in cuerpo["detail"]
    assert "tarjeta" in cuerpo["detail"]
    assert cuerpo["cobro_existente"]["id"] == primero.json()["id"]
    assert cuerpo["cobro_existente"]["received_by_name"] == "Cintia López"
    assert _vigentes_de(db_session, e["cita_cintia"].id) == 1


def test_con_cobro_adicional_la_misma_cita_si_se_cobra_otra_vez(client, db_session, e):
    """Un estudio agregado es un cobro legítimo; la pantalla lo confirma aparte."""
    headers = _headers(db_session, e["secretaria"])
    base = {"patient_id": e["paciente_cintia"].id, "appointment_id": e["cita_cintia"].id}
    assert _cobrar(client, headers, **base).status_code == 201

    extra = _cobrar(client, headers, **base, amount="350.00", cobro_adicional=True)

    assert extra.status_code == 201, extra.text
    assert _vigentes_de(db_session, e["cita_cintia"].id) == 2


def test_el_mismo_client_request_id_devuelve_el_mismo_pago(client, db_session, e):
    """Doble clic o reintento por red: un solo pago, no dos."""
    headers = _headers(db_session, e["secretaria"])
    solicitud = str(uuid4())
    datos = {
        "patient_id": e["paciente_cintia"].id,
        "appointment_id": e["cita_cintia"].id,
        "client_request_id": solicitud,
    }

    primero = _cobrar(client, headers, **datos)
    repetido = _cobrar(client, headers, **datos)

    assert primero.status_code == 201, primero.text
    assert repetido.status_code == 200, repetido.text
    assert repetido.json()["id"] == primero.json()["id"]
    assert db_session.query(Payment).filter(Payment.client_request_id == solicitud).count() == 1


def test_una_cita_marcada_sin_cargo_no_se_cobra_sin_confirmar(client, db_session, e):
    cita = e["cita_cintia"]
    cita.cobro_sin_cargo_motivo = "REVISIÓN INCLUIDA"
    cita.cobro_sin_cargo_por_user_id = e["cintia"].id
    db_session.commit()

    respuesta = _cobrar(
        client,
        _headers(db_session, e["secretaria"]),
        patient_id=e["paciente_cintia"].id,
        appointment_id=cita.id,
    )

    assert respuesta.status_code == 409
    assert "sin cargo" in respuesta.json()["detail"]
    assert respuesta.json()["cobro_existente"] is None


def test_la_doctora_no_cobra_la_cita_de_una_colega(client, db_session, e):
    respuesta = _cobrar(
        client,
        _headers(db_session, e["cintia"]),
        patient_id=e["paciente_rosa"].id,
        appointment_id=e["cita_rosa"].id,
    )

    assert respuesta.status_code == 404
    assert _vigentes_de(db_session, e["cita_rosa"].id) == 0


def test_la_cita_tiene_que_ser_de_la_paciente_que_se_cobra(client, db_session, e):
    respuesta = _cobrar(
        client,
        _headers(db_session, e["secretaria"]),
        patient_id=e["paciente_rosa"].id,
        appointment_id=e["cita_cintia"].id,
    )

    assert respuesta.status_code == 400
    assert isinstance(respuesta.json()["detail"], str)


def test_el_cobro_de_una_cita_es_de_quien_la_atendio_no_de_quien_cobra(client, db_session, e):
    respuesta = _cobrar(
        client,
        _headers(db_session, e["secretaria"]),
        patient_id=e["paciente_rosa"].id,
        appointment_id=e["cita_rosa"].id,
        # Recepción no puede reasignar el ingreso de una cita desde el cobro.
        doctor_id=e["cintia"].id,
    )

    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["doctor_id"] == e["rosa"].id
    assert respuesta.json()["doctor_name"] == "Rosa Méndez"
    assert respuesta.json()["received_by_name"] == "Laura Recepción"


# ---------------------------------------------------------------------------
# Cobro suelto (sin cita)
# ---------------------------------------------------------------------------

def test_el_cobro_suelto_de_recepcion_exige_doctora(client, db_session, e):
    respuesta = _cobrar(
        client,
        _headers(db_session, e["secretaria"]),
        patient_id=e["paciente_cintia"].id,
        service_id=e["servicio"].id,
    )

    assert respuesta.status_code == 400
    assert "doctora" in respuesta.json()["detail"]


def test_el_cobro_suelto_de_recepcion_queda_a_nombre_de_la_doctora_elegida(client, db_session, e):
    respuesta = _cobrar(
        client,
        _headers(db_session, e["secretaria"]),
        patient_id=e["paciente_cintia"].id,
        doctor_id=e["rosa"].id,
        description="VENTA DE ÓVULOS",
        method="card",
        referencia="4821",
    )

    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["doctor_id"] == e["rosa"].id
    assert cuerpo["appointment_id"] is None
    assert cuerpo["referencia"] == "4821"
    # Quién y cuándo los pone el sistema, no quien captura.
    assert cuerpo["received_by_user_id"] == e["secretaria"].id
    assert cuerpo["paid_at"]


def test_el_cobro_suelto_de_la_doctora_es_suyo_aunque_mande_otra(client, db_session, e):
    respuesta = _cobrar(
        client,
        _headers(db_session, e["cintia"]),
        patient_id=e["paciente_cintia"].id,
        doctor_id=e["rosa"].id,
        service_id=e["servicio"].id,
    )

    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["doctor_id"] == e["cintia"].id


def test_el_cobro_suelto_exige_concepto(client, db_session, e):
    respuesta = _cobrar(
        client,
        _headers(db_session, e["cintia"]),
        patient_id=e["paciente_cintia"].id,
    )

    assert respuesta.status_code == 400
    assert "concepto" in respuesta.json()["detail"]


def test_no_se_asigna_un_cobro_a_quien_no_es_doctora(client, db_session, e):
    respuesta = _cobrar(
        client,
        _headers(db_session, e["secretaria"]),
        patient_id=e["paciente_cintia"].id,
        doctor_id=e["admin"].id,
        description="CONCEPTO",
    )

    assert respuesta.status_code == 404


# ---------------------------------------------------------------------------
# Alcance: el médico ve lo suyo, en todas las vistas por igual
# ---------------------------------------------------------------------------

@pytest.fixture
def pagos(db_session, e):
    """Un pago de cada médico y uno histórico sin doctora."""
    return {
        "cintia": _pago(db_session, e["tenant"], e["paciente_cintia"], e["secretaria"], e["cintia"], "800.00"),
        "rosa": _pago(db_session, e["tenant"], e["paciente_rosa"], e["secretaria"], e["rosa"], "500.00"),
        "sin_doctora": _pago(db_session, e["tenant"], e["paciente_rosa"], e["secretaria"], None, "120.00"),
    }


def test_la_doctora_solo_ve_sus_pagos_en_la_lista(client, db_session, e, pagos):
    respuesta = client.get(f"{PREFIX}/payments", headers=_headers(db_session, e["cintia"]))

    assert respuesta.status_code == 200
    assert [p["id"] for p in respuesta.json()] == [pagos["cintia"].id]


def test_la_doctora_no_amplia_su_alcance_con_el_filtro_de_doctora(client, db_session, e, pagos):
    respuesta = client.get(
        f"{PREFIX}/payments",
        params={"doctor_id": e["rosa"].id},
        headers=_headers(db_session, e["cintia"]),
    )

    assert [p["id"] for p in respuesta.json()] == [pagos["cintia"].id]


def test_la_doctora_no_abre_el_pago_de_una_colega(client, db_session, e, pagos):
    headers = _headers(db_session, e["cintia"])

    assert client.get(f"{PREFIX}/payments/{pagos['cintia'].id}", headers=headers).status_code == 200
    # 404 y no 403: no se confirma que el pago existe.
    assert client.get(f"{PREFIX}/payments/{pagos['rosa'].id}", headers=headers).status_code == 404


def test_la_doctora_solo_ve_sus_pagos_en_el_historial_de_la_paciente(client, db_session, e, pagos):
    # Un pago de Cintia al paciente de Rosa (la cubrió en un cobro suelto).
    propio = _pago(db_session, e["tenant"], e["paciente_rosa"], e["cintia"], e["cintia"], "300.00")

    respuesta = client.get(
        f"{PREFIX}/payments/patient/{e['paciente_rosa'].id}/all",
        headers=_headers(db_session, e["cintia"]),
    )

    assert respuesta.status_code == 200
    assert [p["id"] for p in respuesta.json()] == [propio.id]


def test_el_corte_de_la_doctora_solo_suma_lo_suyo(client, db_session, e, pagos):
    respuesta = client.get(f"{PREFIX}/payments/cash-cut", headers=_headers(db_session, e["cintia"]))

    assert respuesta.status_code == 200, respuesta.text
    corte = respuesta.json()
    assert Decimal(corte["total_amount"]) == Decimal("800.00")
    assert corte["total_count"] == 1


def test_el_top_de_servicios_de_la_doctora_solo_cuenta_lo_suyo(client, db_session, e, pagos):
    for clave in ("cintia", "rosa"):
        pagos[clave].service_id = e["servicio"].id
    db_session.commit()
    # Los reportes no son del rol doctor; se le conceden para ver que, aun con
    # el permiso, el top no le enseña el ingreso de la colega.
    db_session.add(
        Permission(role="doctor", action="reports.read", is_granted=True, user_id=e["cintia"].id)
    )
    db_session.commit()

    respuesta = client.get(f"{PREFIX}/reports/summary", headers=_headers(db_session, e["cintia"]))

    assert respuesta.status_code == 200, respuesta.text
    top = respuesta.json()["top_services"]
    assert len(top) == 1
    assert top[0]["times_charged"] == 1
    assert Decimal(top[0]["total_amount"]) == Decimal("800.00")


def test_el_top_del_mes_corta_en_hora_local_y_no_en_utc(client, db_session, e):
    """El cobro de las 18:00 de hoy cuenta; el de la noche del mes pasado, no.

    ``paid_at`` está en UTC: las 18:00 de Mazatlán ya son "mañana" en UTC, y
    las 20:00 del último día del mes anterior ya son el día 1. Comparar esas
    marcas contra el mes en hora local dejaba fuera el cobro de la tarde y
    metía el de la noche anterior. Las fechas se fijan aquí para que la prueba
    no dependa de la hora en que se corra.
    """
    hoy = hoy_local()
    tarde_de_hoy = datetime.combine(hoy, datetime.min.time()).replace(hour=18)
    noche_del_mes_pasado = datetime.combine(hoy.replace(day=1), datetime.min.time()) - timedelta(hours=4)
    for paid_local, monto in ((tarde_de_hoy, "800.00"), (noche_del_mes_pasado, "500.00")):
        _pago(
            db_session, e["tenant"], e["paciente_cintia"], e["secretaria"], e["cintia"], monto,
            service_id=e["servicio"].id, paid_at=local_a_utc(paid_local),
        )

    respuesta = client.get(f"{PREFIX}/reports/summary", headers=_headers(db_session, e["admin"]))

    assert respuesta.status_code == 200, respuesta.text
    top = respuesta.json()["top_services"]
    assert len(top) == 1
    assert top[0]["times_charged"] == 1
    assert Decimal(top[0]["total_amount"]) == Decimal("800.00")


@pytest.mark.parametrize("rol", ["secretaria", "admin"])
def test_recepcion_y_admin_ven_toda_la_sucursal_como_antes(client, db_session, e, pagos, rol):
    """Mismos datos, mismos totales que antes del plan 23, incluidos los sin doctora."""
    headers = _headers(db_session, e[rol])

    lista = client.get(f"{PREFIX}/payments", headers=headers).json()
    assert {p["id"] for p in lista} == {p.id for p in pagos.values()}

    if rol == "admin":  # la secretaria no tiene payments.cashcut
        corte = client.get(f"{PREFIX}/payments/cash-cut", headers=headers).json()
        assert Decimal(corte["total_amount"]) == Decimal("1420.00")
        assert corte["total_count"] == 3


# ---------------------------------------------------------------------------
# Anular: nunca borrar ni editar
# ---------------------------------------------------------------------------

def test_el_anulado_no_cuenta_en_el_corte_pero_se_ve_en_la_lista(client, db_session, e, pagos):
    headers = _headers(db_session, e["admin"])

    anulado = client.post(
        f"{PREFIX}/payments/{pagos['rosa'].id}/anular",
        json={"motivo": "SE CAPTURÓ CON EL IMPORTE EQUIVOCADO"},
        headers=headers,
    )

    assert anulado.status_code == 200, anulado.text
    assert anulado.json()["status"] == "anulado"
    assert anulado.json()["void_reason"] == "SE CAPTURÓ CON EL IMPORTE EQUIVOCADO"
    assert anulado.json()["voided_at"]

    corte = client.get(f"{PREFIX}/payments/cash-cut", headers=headers).json()
    assert Decimal(corte["total_amount"]) == Decimal("920.00")
    assert sum(Decimal(d["total_amount"]) for d in corte["by_doctor"]) == Decimal("920.00")

    lista = client.get(f"{PREFIX}/payments", headers=headers).json()
    assert pagos["rosa"].id in {p["id"] for p in lista}
    solo_anulados = client.get(f"{PREFIX}/payments", params={"status": "anulado"}, headers=headers).json()
    assert [p["id"] for p in solo_anulados] == [pagos["rosa"].id]


def test_quien_registro_el_cobro_lo_anula_el_mismo_dia(client, db_session, e, pagos):
    respuesta = client.post(
        f"{PREFIX}/payments/{pagos['rosa'].id}/anular",
        json={"motivo": "DUPLICADO"},
        headers=_headers(db_session, e["secretaria"]),
    )

    assert respuesta.status_code == 200, respuesta.text


def test_quien_registro_el_cobro_no_lo_anula_otro_dia_pero_admin_si(client, db_session, e, pagos):
    pagos["rosa"].created_at = utcnow() - timedelta(days=2)
    db_session.commit()

    secretaria = client.post(
        f"{PREFIX}/payments/{pagos['rosa'].id}/anular",
        json={"motivo": "DUPLICADO"},
        headers=_headers(db_session, e["secretaria"]),
    )
    assert secretaria.status_code == 403
    assert isinstance(secretaria.json()["detail"], str)

    admin = client.post(
        f"{PREFIX}/payments/{pagos['rosa'].id}/anular",
        json={"motivo": "DUPLICADO"},
        headers=_headers(db_session, e["admin"]),
    )
    assert admin.status_code == 200, admin.text


def test_nadie_anula_el_cobro_que_registro_otra_persona(client, db_session, e):
    pago = _pago(db_session, e["tenant"], e["paciente_cintia"], e["secretaria"], e["cintia"], "800.00")
    otra = _usuario(db_session, e["tenant"], "Otra Recepción", Role.SECRETARIA)

    respuesta = client.post(
        f"{PREFIX}/payments/{pago.id}/anular",
        json={"motivo": "NO ME CONSTA"},
        headers=_headers(db_session, otra),
    )

    assert respuesta.status_code == 403
    db_session.refresh(pago)
    assert pago.status == PaymentStatus.VIGENTE


def test_anular_exige_motivo_y_no_se_anula_dos_veces(client, db_session, e, pagos):
    headers = _headers(db_session, e["admin"])
    ruta = f"{PREFIX}/payments/{pagos['rosa'].id}/anular"

    assert client.post(ruta, json={"motivo": "   "}, headers=headers).status_code == 422
    assert client.post(ruta, json={"motivo": "DUPLICADO"}, headers=headers).status_code == 200
    otra_vez = client.post(ruta, json={"motivo": "DUPLICADO"}, headers=headers)
    assert otra_vez.status_code == 409
    assert isinstance(otra_vez.json()["detail"], str)


def test_tras_anular_la_cita_vuelve_a_pendiente_y_se_puede_cobrar(client, db_session, e):
    headers = _headers(db_session, e["secretaria"])
    base = {"patient_id": e["paciente_cintia"].id, "appointment_id": e["cita_cintia"].id}
    primero = _cobrar(client, headers, **base).json()

    client.post(f"{PREFIX}/payments/{primero['id']}/anular", json={"motivo": "IMPORTE MAL"}, headers=headers)
    cita = client.get(f"{PREFIX}/appointments/{e['cita_cintia'].id}", headers=headers).json()
    assert cita["estado_cobro"] == "pendiente"
    assert cita["cobro_resumen"] == []

    correcto = _cobrar(client, headers, **base, amount="700.00")
    assert correcto.status_code == 201, correcto.text


# ---------------------------------------------------------------------------
# Corte de caja: desgloses y hora de México
# ---------------------------------------------------------------------------

def test_la_suma_por_doctora_mas_sin_doctora_es_el_corte_de_la_sucursal(client, db_session, e, pagos):
    headers = _headers(db_session, e["admin"])

    sucursal = client.get(f"{PREFIX}/payments/cash-cut", headers=headers).json()
    por_doctora = sucursal["by_doctor"]

    assert sum(Decimal(d["total_amount"]) for d in por_doctora) == Decimal(sucursal["total_amount"])
    assert sum(d["count"] for d in por_doctora) == sucursal["total_count"]
    sin_doctora = [d for d in por_doctora if d["doctor_id"] is None]
    assert sin_doctora and sin_doctora[0]["doctor_name"] == "Sin doctora asignada"
    assert Decimal(sin_doctora[0]["total_amount"]) == Decimal("120.00")

    # El corte filtrado por cada médico da lo mismo que su renglón del desglose.
    for renglon in por_doctora:
        if renglon["doctor_id"] is None:
            continue
        filtrado = client.get(
            f"{PREFIX}/payments/cash-cut",
            params={"doctor_id": renglon["doctor_id"]},
            headers=headers,
        ).json()
        assert Decimal(filtrado["total_amount"]) == Decimal(renglon["total_amount"])


def test_el_corte_dice_quien_tiene_el_dinero(client, db_session, e):
    """El médico cobró en efectivo: ese dinero no está en la caja de recepción."""
    _pago(db_session, e["tenant"], e["paciente_cintia"], e["cintia"], e["cintia"], "800.00")
    _pago(db_session, e["tenant"], e["paciente_rosa"], e["secretaria"], e["rosa"], "500.00")

    corte = client.get(f"{PREFIX}/payments/cash-cut", headers=_headers(db_session, e["admin"])).json()

    recibido = {r["user_name"]: Decimal(r["total_amount"]) for r in corte["by_received_by"]}
    assert recibido == {"Cintia López": Decimal("800.00"), "Laura Recepción": Decimal("500.00")}
    assert sum(recibido.values()) == Decimal(corte["total_amount"])


def test_el_desglose_del_corte_de_la_doctora_solo_la_nombra_a_ella(client, db_session, e, pagos):
    corte = client.get(f"{PREFIX}/payments/cash-cut", headers=_headers(db_session, e["cintia"])).json()

    assert [d["doctor_id"] for d in corte["by_doctor"]] == [e["cintia"].id]
    # Aunque pida el corte de otra, el que se aplica es el suyo.
    otra = client.get(
        f"{PREFIX}/payments/cash-cut",
        params={"doctor_id": e["rosa"].id},
        headers=_headers(db_session, e["cintia"]),
    ).json()
    assert otra["doctor_id"] == e["cintia"].id
    assert Decimal(otra["total_amount"]) == Decimal("800.00")


def test_el_corte_de_hoy_es_el_dia_de_mexico_y_no_el_de_utc(client, db_session, e):
    """Un cobro de las 20:00 en Mazatlán ya es "mañana" en UTC; es de hoy."""
    hoy = hoy_local()
    noche_de_hoy = local_a_utc(datetime.combine(hoy, datetime.min.time()) + timedelta(hours=20))
    anoche = local_a_utc(datetime.combine(hoy, datetime.min.time()) - timedelta(hours=1))
    _pago(db_session, e["tenant"], e["paciente_cintia"], e["secretaria"], e["cintia"], "800.00", paid_at=noche_de_hoy)
    _pago(db_session, e["tenant"], e["paciente_cintia"], e["secretaria"], e["cintia"], "999.00", paid_at=anoche)
    # Premisa de la prueba: en UTC el cobro de la noche cae en otro día.
    assert noche_de_hoy.date() != hoy

    corte = client.get(f"{PREFIX}/payments/cash-cut", headers=_headers(db_session, e["admin"])).json()

    assert Decimal(corte["total_amount"]) == Decimal("800.00")
    assert corte["start_date"].startswith(hoy.isoformat())


def test_las_fechas_del_corte_se_entienden_en_hora_local(client, db_session, e):
    hoy = hoy_local()
    noche_de_hoy = local_a_utc(datetime.combine(hoy, datetime.min.time()) + timedelta(hours=20))
    _pago(db_session, e["tenant"], e["paciente_cintia"], e["secretaria"], e["cintia"], "800.00", paid_at=noche_de_hoy)

    corte = client.get(
        f"{PREFIX}/payments/cash-cut",
        params={
            "start_date": f"{hoy.isoformat()}T00:00:00",
            "end_date": f"{hoy.isoformat()}T23:59:59",
        },
        headers=_headers(db_session, e["admin"]),
    ).json()

    assert Decimal(corte["total_amount"]) == Decimal("800.00")


def test_una_fecha_sin_hora_es_el_dia_completo(client, db_session, e):
    """El ``<input type="date">`` manda '2026-09-28'; como fin, incluye todo el 28."""
    hoy = hoy_local()
    noche_de_hoy = local_a_utc(datetime.combine(hoy, datetime.min.time()) + timedelta(hours=20))
    _pago(db_session, e["tenant"], e["paciente_cintia"], e["secretaria"], e["cintia"], "800.00", paid_at=noche_de_hoy)
    headers = _headers(db_session, e["admin"])
    periodo = {"start_date": hoy.isoformat(), "end_date": hoy.isoformat()}

    corte = client.get(f"{PREFIX}/payments/cash-cut", params=periodo, headers=headers).json()
    lista = client.get(f"{PREFIX}/payments", params=periodo, headers=headers).json()

    assert Decimal(corte["total_amount"]) == Decimal("800.00")
    assert len(lista) == 1


def test_una_fecha_ilegible_se_explica_en_espanol(client, db_session, e):
    respuesta = client.get(
        f"{PREFIX}/payments/cash-cut",
        params={"start_date": "el jueves"},
        headers=_headers(db_session, e["admin"]),
    )

    assert respuesta.status_code == 400
    assert isinstance(respuesta.json()["detail"], str)


# ---------------------------------------------------------------------------
# Recibo
# ---------------------------------------------------------------------------

def test_el_recibo_lleva_a_la_doctora_del_ingreso_y_no_a_quien_cobro(client, db_session, e, monkeypatch):
    """Antes el recibo cobrado en recepción salía a nombre de la secretaria."""
    e["paciente_rosa"].email = "berta@correo.com"
    db_session.commit()
    pago = _pago(db_session, e["tenant"], e["paciente_rosa"], e["secretaria"], e["rosa"], "500.00")

    capturado = {}

    def pdf_falso(payment, patient, doctor_name="", tenant_name=""):
        capturado["doctor_name"] = doctor_name
        import io

        return io.BytesIO(b"%PDF-falso")

    monkeypatch.setattr("app.utils.pdf.generate_receipt_pdf", pdf_falso)
    monkeypatch.setattr("app.routers.payments.send_email", lambda **kwargs: True)

    respuesta = client.post(
        f"{PREFIX}/payments/{pago.id}/send-receipt",
        headers=_headers(db_session, e["secretaria"]),
    )

    assert respuesta.status_code == 200, respuesta.text
    assert "Rosa Méndez" in capturado["doctor_name"]
    assert "Laura" not in capturado["doctor_name"]
