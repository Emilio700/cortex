"""Pruebas del endpoint de disponibilidad (GET /doctor-schedule/availability).

Lo que hay que defender aquí no es que el endpoint responda, sino que **no
mienta**: el modal de cita pinta "Horarios disponibles" a partir de esto, así
que si dice libre y luego ``POST /appointments`` rechaza, habremos empeorado la
pantalla. La prueba que de verdad importa es
``test_lo_que_dice_libre_se_puede_agendar_de_verdad``.

Mismo patrón de SQLite en memoria que ``test_salas_consulta.py``.
"""
from datetime import date, datetime, time, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import security
from app.core.config import settings
from app.core.deps import get_db
from app.db.session import Base
from app.main import app
from app.models.appointment import Appointment, AppointmentStatus
from app.models.consultation_room import ConsultationRoom
from app.models.doctor_schedule import DoctorWorkingHours, ScheduleBlock
from app.models.patient import Patient
from app.models.tenant import Tenant
from app.models.user import Role, User
from app.models.user_session import UserSession
from app.services.availability_service import (
    JORNADA_POR_DEFECTO_FIN,
    JORNADA_POR_DEFECTO_INICIO,
    MOTIVO_BLOQUEO,
    MOTIVO_CITA,
    MOTIVO_PASADO,
    MOTIVO_SALAS,
    Ventana,
    generar_franjas,
    meridiano_de,
)

PREFIX = settings.API_V1_PREFIX

# Un lunes futuro y fijo: las pruebas no pueden depender del reloj, y tiene
# que estar en el futuro porque las horas pasadas se ofrecen como ocupadas.
DIA = date(2027, 3, 8)
assert DIA.weekday() == 0


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


def _auth_headers(db, user: User) -> dict[str, str]:
    from app.db.session import utcnow

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


@pytest.fixture
def escenario(db_session):
    """Sucursal con secretaria, dos doctores y un paciente. Sin salas aún."""
    tenant = Tenant(name="Consultorio de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    def _user(email, role, full_name=None):
        user = User(
            email=email,
            hashed_password="no-usado",
            full_name=full_name or f"Usuario {role.value}",
            role=role,
            tenant_id=tenant.id,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    paciente = Patient(
        tenant_id=tenant.id,
        first_name="Paciente",
        last_name="De Prueba",
        date_of_birth=datetime(1990, 5, 20).date(),
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    return {
        "tenant": tenant,
        "secretaria": _user("secretaria@gems.com", Role.SECRETARIA),
        "doctora_a": _user("doctora.a@gems.com", Role.DOCTOR, "Dra. Alvarez"),
        "doctor_b": _user("doctor.b@gems.com", Role.DOCTOR, "Dr. Bernal"),
        "paciente": paciente,
    }


def _sala(db, tenant, nombre, orden=0):
    sala = ConsultationRoom(tenant_id=tenant.id, name=nombre, display_order=orden, is_active=True)
    db.add(sala)
    db.commit()
    db.refresh(sala)
    return sala


def _horario(db, tenant, doctor, weekday, desde, hasta):
    fila = DoctorWorkingHours(
        tenant_id=tenant.id,
        doctor_id=doctor.id,
        weekday=weekday,
        start_time=desde,
        end_time=hasta,
    )
    db.add(fila)
    db.commit()
    return fila


def _cita(db, escenario, doctor, inicio, duracion=30, sala=None, estado=AppointmentStatus.AGENDADA):
    cita = Appointment(
        tenant_id=escenario["tenant"].id,
        patient_id=escenario["paciente"].id,
        doctor_id=doctor.id,
        room_id=sala.id if sala else None,
        scheduled_at=inicio,
        duration_minutes=duracion,
        status=estado,
    )
    db.add(cita)
    db.commit()
    db.refresh(cita)
    return cita


def _consultar(client, headers, doctor, **extra):
    params = {"doctor_id": doctor.id, "fecha": DIA.isoformat(), "duration_minutes": 30}
    params.update(extra)
    return client.get(f"{PREFIX}/doctor-schedule/availability", headers=headers, params=params)


def _por_hora(cuerpo) -> dict[str, dict]:
    return {f["hora"]: f for f in cuerpo["franjas"]}


# ─────────────────── funciones puras (sin base de datos) ───────────────────


def test_generar_franjas_solo_ofrece_las_que_caben_enteras():
    """La última franja de 30 min de una ventana que acaba a las 10:00 empieza
    a las 09:30, no a las 09:45: media cita fuera de horario no vale."""
    inicios = generar_franjas(DIA, [Ventana(time(9, 0), time(10, 0))], 30, 15)
    assert [i.strftime("%H:%M") for i in inicios] == ["09:00", "09:15", "09:30"]


def test_generar_franjas_con_dos_ventanas_no_ofrece_el_hueco_de_enmedio():
    inicios = generar_franjas(
        DIA, [Ventana(time(9, 0), time(10, 0)), Ventana(time(16, 0), time(17, 0))], 60, 30
    )
    assert [i.strftime("%H:%M") for i in inicios] == ["09:00", "16:00"]


def test_generar_franjas_con_ventana_mas_corta_que_la_cita_no_ofrece_nada():
    assert generar_franjas(DIA, [Ventana(time(9, 0), time(9, 20))], 30, 15) == []


def test_reparto_am_pm():
    """Las 12:00 en punto es p. m., que es como se lee en el mostrador."""
    assert meridiano_de(datetime.combine(DIA, time(0, 0))) == "am"
    assert meridiano_de(datetime.combine(DIA, time(11, 59))) == "am"
    assert meridiano_de(datetime.combine(DIA, time(12, 0))) == "pm"
    assert meridiano_de(datetime.combine(DIA, time(19, 30))) == "pm"


# ─────────────────────────── el endpoint ───────────────────────────


def test_dia_vacio_esta_todo_libre_dentro_del_horario_de_atencion(client, db_session, escenario):
    _horario(db_session, escenario["tenant"], escenario["doctora_a"], 0, time(9, 0), time(12, 0))
    headers = _auth_headers(db_session, escenario["secretaria"])

    r = _consultar(client, headers, escenario["doctora_a"])
    assert r.status_code == 200, r.text
    cuerpo = r.json()

    assert cuerpo["jornada_por_defecto"] is False
    horas = [f["hora"] for f in cuerpo["franjas"]]
    assert horas[0] == "09:00"
    assert horas[-1] == "11:30"
    assert all(f["disponible"] for f in cuerpo["franjas"])


def test_franja_ocupada_por_el_doctor_se_marca_no_disponible(client, db_session, escenario):
    _horario(db_session, escenario["tenant"], escenario["doctora_a"], 0, time(9, 0), time(12, 0))
    _cita(db_session, escenario, escenario["doctora_a"], datetime.combine(DIA, time(10, 0)), 30)
    headers = _auth_headers(db_session, escenario["secretaria"])

    franjas = _por_hora(_consultar(client, headers, escenario["doctora_a"]).json())

    # 09:45-10:15 ya se pisa con la cita: el solapamiento parcial cuenta.
    assert franjas["09:45"]["disponible"] is False
    assert franjas["10:00"]["disponible"] is False
    assert franjas["10:00"]["motivo"] == MOTIVO_CITA
    assert franjas["09:30"]["disponible"] is True
    assert franjas["10:30"]["disponible"] is True


def test_una_cita_cancelada_no_ocupa(client, db_session, escenario):
    _horario(db_session, escenario["tenant"], escenario["doctora_a"], 0, time(9, 0), time(12, 0))
    _cita(
        db_session,
        escenario,
        escenario["doctora_a"],
        datetime.combine(DIA, time(10, 0)),
        30,
        estado=AppointmentStatus.CANCELADA,
    )
    headers = _auth_headers(db_session, escenario["secretaria"])

    franjas = _por_hora(_consultar(client, headers, escenario["doctora_a"]).json())
    assert franjas["10:00"]["disponible"] is True


def test_todas_las_salas_ocupadas_deja_la_franja_sin_hueco(client, db_session, escenario):
    """La franja está libre para el médico, pero no queda dónde atender."""
    tenant = escenario["tenant"]
    sala_1 = _sala(db_session, tenant, "Sala 1", 1)
    sala_2 = _sala(db_session, tenant, "Sala 2", 2)
    _horario(db_session, tenant, escenario["doctora_a"], 0, time(9, 0), time(12, 0))

    # Dos citas de OTRO doctor, una en cada sala, a la misma hora.
    _cita(db_session, escenario, escenario["doctor_b"], datetime.combine(DIA, time(10, 0)), 30, sala_1)
    _cita(db_session, escenario, escenario["doctor_b"], datetime.combine(DIA, time(10, 0)), 30, sala_2)

    headers = _auth_headers(db_session, escenario["secretaria"])
    franjas = _por_hora(_consultar(client, headers, escenario["doctora_a"]).json())

    assert franjas["10:00"]["disponible"] is False
    assert franjas["10:00"]["motivo"] == MOTIVO_SALAS
    assert franjas["10:30"]["disponible"] is True


def test_con_una_sala_ocupada_y_otra_libre_la_franja_sigue_disponible(client, db_session, escenario):
    tenant = escenario["tenant"]
    sala_1 = _sala(db_session, tenant, "Sala 1", 1)
    _sala(db_session, tenant, "Sala 2", 2)
    _horario(db_session, tenant, escenario["doctora_a"], 0, time(9, 0), time(12, 0))
    _cita(db_session, escenario, escenario["doctor_b"], datetime.combine(DIA, time(10, 0)), 30, sala_1)

    headers = _auth_headers(db_session, escenario["secretaria"])
    cuerpo = _consultar(client, headers, escenario["doctora_a"]).json()
    assert _por_hora(cuerpo)["10:00"]["disponible"] is True

    # Pero preguntando por la Sala 1 en concreto, no.
    cuerpo_sala = _consultar(client, headers, escenario["doctora_a"], room_id=sala_1.id).json()
    assert _por_hora(cuerpo_sala)["10:00"]["disponible"] is False


def test_dia_bloqueado_no_ofrece_nada(client, db_session, escenario):
    tenant = escenario["tenant"]
    _horario(db_session, tenant, escenario["doctora_a"], 0, time(9, 0), time(12, 0))
    db_session.add(
        ScheduleBlock(
            tenant_id=tenant.id,
            doctor_id=escenario["doctora_a"].id,
            start_at=datetime.combine(DIA, time(0, 0)),
            end_at=datetime.combine(DIA, time(23, 59)),
            reason="Vacaciones",
            created_by_user_id=escenario["secretaria"].id,
        )
    )
    db_session.commit()

    headers = _auth_headers(db_session, escenario["secretaria"])
    cuerpo = _consultar(client, headers, escenario["doctora_a"]).json()

    assert cuerpo["franjas"], "el día sigue teniendo rejilla, sólo que toda ocupada"
    assert all(f["disponible"] is False for f in cuerpo["franjas"])
    assert all(f["motivo"] == MOTIVO_BLOQUEO for f in cuerpo["franjas"])


def test_fuera_del_horario_de_atencion_ni_se_ofrece(client, db_session, escenario):
    """No se marcan como "no disponibles": directamente no están en la rejilla.
    Ofrecer las 08:00 tachadas todos los días sólo estorba."""
    _horario(db_session, escenario["tenant"], escenario["doctora_a"], 0, time(9, 0), time(12, 0))
    headers = _auth_headers(db_session, escenario["secretaria"])

    franjas = _por_hora(_consultar(client, headers, escenario["doctora_a"]).json())
    assert "08:00" not in franjas
    assert "12:00" not in franjas
    assert "11:30" in franjas


def test_doctor_sin_horario_configurado_usa_la_jornada_del_consultorio(client, db_session, escenario):
    """Fallo conocido: el servidor trata "sin horario" como "sin restricción" y
    aceptaría las 3 de la madrugada. Aquí no se corrige el agendado; sólo se
    ofrece la jornada 07:00-20:00 y se avisa con ``jornada_por_defecto``."""
    headers = _auth_headers(db_session, escenario["secretaria"])
    cuerpo = _consultar(client, headers, escenario["doctora_a"]).json()

    assert cuerpo["jornada_por_defecto"] is True
    horas = [f["hora"] for f in cuerpo["franjas"]]
    assert horas[0] == JORNADA_POR_DEFECTO_INICIO.strftime("%H:%M")
    assert horas[-1] == "19:30"
    assert JORNADA_POR_DEFECTO_FIN.strftime("%H:%M") not in horas
    assert all(f["disponible"] for f in cuerpo["franjas"])


def test_la_cita_que_se_edita_no_se_bloquea_a_si_misma(client, db_session, escenario):
    _horario(db_session, escenario["tenant"], escenario["doctora_a"], 0, time(9, 0), time(12, 0))
    cita = _cita(db_session, escenario, escenario["doctora_a"], datetime.combine(DIA, time(10, 0)), 30)
    headers = _auth_headers(db_session, escenario["secretaria"])

    sin_excluir = _por_hora(_consultar(client, headers, escenario["doctora_a"]).json())
    assert sin_excluir["10:00"]["disponible"] is False

    excluyendo = _por_hora(
        _consultar(client, headers, escenario["doctora_a"], exclude_appointment_id=cita.id).json()
    )
    assert excluyendo["10:00"]["disponible"] is True


def test_las_horas_pasadas_no_se_ofrecen(client, db_session, escenario):
    """Divergencia deliberada: el servidor deja agendar en el pasado (se usa
    para registrar a toro pasado), pero el modal no debe ofrecerlo."""
    from app.core.hora_local import hoy_local

    ayer = hoy_local() - timedelta(days=1)
    headers = _auth_headers(db_session, escenario["secretaria"])
    r = client.get(
        f"{PREFIX}/doctor-schedule/availability",
        headers=headers,
        params={"doctor_id": escenario["doctora_a"].id, "fecha": ayer.isoformat()},
    )
    cuerpo = r.json()
    assert cuerpo["franjas"]
    assert all(f["disponible"] is False for f in cuerpo["franjas"])
    assert all(f["motivo"] == MOTIVO_PASADO for f in cuerpo["franjas"])


def test_el_mes_marca_que_dias_tienen_hueco(client, db_session, escenario):
    tenant = escenario["tenant"]
    # Sólo atiende los lunes, de 9 a 10: el resto del mes no tiene hueco.
    _horario(db_session, tenant, escenario["doctora_a"], 0, time(9, 0), time(10, 0))
    for weekday in range(1, 7):
        db_session.add(
            DoctorWorkingHours(
                tenant_id=tenant.id,
                doctor_id=escenario["doctora_a"].id,
                weekday=weekday,
                start_time=time(9, 0),
                end_time=time(9, 10),  # más corto que una cita: no cabe nada
            )
        )
    db_session.commit()

    headers = _auth_headers(db_session, escenario["secretaria"])
    cuerpo = _consultar(client, headers, escenario["doctora_a"], incluir_mes=True).json()

    dias = {d["fecha"]: d for d in cuerpo["dias"]}
    assert len(dias) == 31  # marzo
    assert dias["2027-03-08"]["disponible"] is True  # lunes
    assert dias["2027-03-09"]["disponible"] is False  # martes
    assert dias["2027-03-15"]["disponible"] is True  # lunes siguiente


def test_el_mes_marca_sin_hueco_el_dia_que_se_llena(client, db_session, escenario):
    tenant = escenario["tenant"]
    _horario(db_session, tenant, escenario["doctora_a"], 0, time(9, 0), time(10, 0))
    _cita(db_session, escenario, escenario["doctora_a"], datetime.combine(DIA, time(9, 0)), 60)

    headers = _auth_headers(db_session, escenario["secretaria"])
    cuerpo = _consultar(client, headers, escenario["doctora_a"], incluir_mes=True).json()
    dias = {d["fecha"]: d for d in cuerpo["dias"]}
    assert dias["2027-03-08"]["disponible"] is False
    assert dias["2027-03-08"]["huecos"] == 0
    assert dias["2027-03-15"]["disponible"] is True


def test_doctor_inexistente_responde_en_espanol(client, db_session, escenario):
    headers = _auth_headers(db_session, escenario["secretaria"])
    r = client.get(
        f"{PREFIX}/doctor-schedule/availability",
        headers=headers,
        params={"doctor_id": 9999, "fecha": DIA.isoformat()},
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "No se encontró al doctor."


# ────────────── la prueba que de verdad importa: no mentir ──────────────


def test_lo_que_dice_libre_se_puede_agendar_de_verdad(client, db_session, escenario):
    """Contrato con ``POST /appointments``: cada franja que el endpoint marca
    disponible tiene que aceptarse al agendar, y cada una que marca ocupada
    tiene que rechazarse. Si esto se rompe, el modal miente.

    Se monta un día con de todo: citas del médico, un bloqueo, y salas con
    ocupación parcial y total.
    """
    tenant = escenario["tenant"]
    sala_1 = _sala(db_session, tenant, "Sala 1", 1)
    sala_2 = _sala(db_session, tenant, "Sala 2", 2)
    _horario(db_session, tenant, escenario["doctora_a"], 0, time(9, 0), time(13, 0))

    # Cita propia (empalme del doctor)
    _cita(db_session, escenario, escenario["doctora_a"], datetime.combine(DIA, time(9, 30)), 30, sala_1)
    # Las dos salas tomadas por el otro doctor a las 11:00
    _cita(db_session, escenario, escenario["doctor_b"], datetime.combine(DIA, time(11, 0)), 30, sala_1)
    _cita(db_session, escenario, escenario["doctor_b"], datetime.combine(DIA, time(11, 0)), 30, sala_2)
    # Sólo una sala tomada a las 12:00: debe seguir habiendo hueco
    _cita(db_session, escenario, escenario["doctor_b"], datetime.combine(DIA, time(12, 0)), 30, sala_2)
    # Bloqueo del médico a mediodía
    db_session.add(
        ScheduleBlock(
            tenant_id=tenant.id,
            doctor_id=escenario["doctora_a"].id,
            start_at=datetime.combine(DIA, time(10, 0)),
            end_at=datetime.combine(DIA, time(10, 45)),
            reason="Junta",
            created_by_user_id=escenario["secretaria"].id,
        )
    )
    db_session.commit()

    headers = _auth_headers(db_session, escenario["secretaria"])
    # Se pregunta por la Sala 1 en concreto: así lo que se agenda después usa
    # exactamente la misma sala y la comparación es honesta.
    cuerpo = _consultar(client, headers, escenario["doctora_a"], room_id=sala_1.id).json()
    franjas = cuerpo["franjas"]
    assert franjas

    libres = [f for f in franjas if f["disponible"]]
    ocupadas = [f for f in franjas if not f["disponible"]]
    assert libres and ocupadas, "el escenario debe tener de las dos"

    for franja in franjas:
        r = client.post(
            f"{PREFIX}/appointments",
            headers=headers,
            json={
                "patient_id": escenario["paciente"].id,
                "doctor_id": escenario["doctora_a"].id,
                "scheduled_at": franja["inicio"],
                "duration_minutes": 30,
                "room_id": sala_1.id,
            },
        )
        if franja["disponible"]:
            assert r.status_code == 201, (
                f'{franja["hora"]} se ofrecía como libre y el servidor la rechazó: {r.text}'
            )
            # Se deshace para que la siguiente franja no se pise con ésta.
            cita_id = r.json()["id"]
            creada = db_session.query(Appointment).filter(Appointment.id == cita_id).first()
            db_session.delete(creada)
            db_session.commit()
        else:
            assert r.status_code == 400, (
                f'{franja["hora"]} se ofrecía como ocupada y el servidor la aceptó'
            )
            # El motivo que se enseña siempre está redactado en español. No se
            # exige que sea literalmente el `detail` del POST: el choque de
            # sala del servidor nombra la sala y al doctor de la otra cita
            # ("Sala 1 ya está ocupada… por Dr. Bernal"), y aquí sólo hace
            # falta decir que esa hora no está libre.
            assert franja["motivo"]
