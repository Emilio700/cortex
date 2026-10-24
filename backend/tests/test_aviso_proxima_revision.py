"""El recordatorio de control prenatal: a quién avisa, cuántas veces y cuándo no.

Las tres cosas que este trabajo puede romper en producción no son que deje de
avisar, sino que avise de más: la destinataria es **una** persona, y un buzón
con cien avisos no se lee, se ignora. Por eso las pruebas cargan hacia ese lado.

Escenario común: un médico, una asistente y pacientes con embarazo activo.
"""
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.models.notification import Notification, NotificationType
from app.models.patient import Patient
from app.models.pregnancy import Pregnancy, PregnancyStatus
from app.models.tenant import Tenant
from app.models.user import Role, User

from scripts import aviso_proxima_revision as job

HOY = date(2026, 10, 1)


@pytest.fixture
def db():
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
def consultorio(db):
    tenant = Tenant(name="Clínica prenatal", is_active=True)
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    def _user(role, email):
        user = User(
            email=email,
            hashed_password="no-se-usa",
            full_name=f"Usuario {email}",
            role=role,
            tenant_id=tenant.id,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    return {
        "tenant": tenant,
        "doctora": _user(Role.DOCTOR, "doctora@gems.test"),
        "asistente": _user(Role.SECRETARIA, "recepcion@gems.test"),
    }


def _embarazo(db, consultorio, *, revision, nombre="Paciente", estado=PregnancyStatus.ACTIVE):
    paciente = Patient(
        tenant_id=consultorio["tenant"].id,
        first_name=nombre,
        last_name="Prenatal",
        owner_doctor_id=consultorio["doctora"].id,
    )
    db.add(paciente)
    db.commit()
    db.refresh(paciente)

    embarazo = Pregnancy(
        tenant_id=consultorio["tenant"].id,
        patient_id=paciente.id,
        doctor_id=consultorio["doctora"].id,
        status=estado.value,
        next_review_on=revision,
    )
    db.add(embarazo)
    db.commit()
    db.refresh(embarazo)
    return embarazo


def _citar(db, consultorio, embarazo, cuando):
    cita = Appointment(
        tenant_id=consultorio["tenant"].id,
        patient_id=embarazo.patient_id,
        doctor_id=consultorio["doctora"].id,
        scheduled_at=datetime.combine(cuando, datetime.min.time()) + timedelta(hours=10),
        duration_minutes=30,
        appointment_type=AppointmentType.CONSULTA,
        status=AppointmentStatus.AGENDADA,
    )
    db.add(cita)
    db.commit()
    return cita


def _avisos(db):
    return (
        db.query(Notification)
        .filter(Notification.type == NotificationType.PRENATAL_REVIEW_DUE)
        .all()
    )


def test_la_revision_que_se_viene_sin_cita_le_avisa_a_la_asistente(db, consultorio):
    """El aviso va a recepción, que es quien llama; el paciente no es usuaria."""
    _embarazo(db, consultorio, revision=HOY + timedelta(days=5))

    resumen = job.ejecutar(db, hoy=HOY)

    avisos = _avisos(db)
    assert resumen.avisados == 1
    assert len(avisos) == 1
    assert avisos[0].user_id == consultorio["asistente"].id


def test_a_la_doctora_no_se_le_avisa_nada(db, consultorio):
    """Decisión de Emilio: lo que ella necesita saber va en el tablero.

    Enterarse no es una acción, y el médico ya acumula avisos sin leer. Si
    alguien agrega aquí un aviso "informativo", esta prueba se cae.
    """
    _embarazo(db, consultorio, revision=HOY + timedelta(days=3))

    job.ejecutar(db, hoy=HOY)

    assert [a.user_id for a in _avisos(db)] == [consultorio["asistente"].id]


def test_correr_el_trabajo_diez_veces_manda_un_solo_aviso(db, consultorio):
    """La idempotencia es lo único que separa este trabajo de una inundación.

    No depende de cada cuánto corra el programador: la marca guarda **de qué
    fecha** ya se avisó, así que repetir la corrida no cambia nada.
    """
    _embarazo(db, consultorio, revision=HOY + timedelta(days=4))

    for _ in range(10):
        job.ejecutar(db, hoy=HOY)

    assert len(_avisos(db)) == 1


def test_mover_la_fecha_de_revision_vuelve_a_armar_el_aviso(db, consultorio):
    """La contraparte de la idempotencia: no avisar dos veces no es no avisar.

    Si el médico adelanta la revisión, recepción tiene que enterarse de la
    fecha nueva; una marca booleana habría dejado ese caso mudo para siempre.
    """
    embarazo = _embarazo(db, consultorio, revision=HOY + timedelta(days=6))
    job.ejecutar(db, hoy=HOY)

    embarazo.next_review_on = HOY + timedelta(days=2)
    db.commit()
    job.ejecutar(db, hoy=HOY)

    assert len(_avisos(db)) == 2


def test_la_paciente_que_ya_tiene_cita_no_genera_aviso(db, consultorio):
    """El aviso es por el hueco, no por la fecha: citada, no hay nada que hacer."""
    embarazo = _embarazo(db, consultorio, revision=HOY + timedelta(days=5))
    _citar(db, consultorio, embarazo, HOY + timedelta(days=5))

    resumen = job.ejecutar(db, hoy=HOY)

    assert resumen.con_cita == 1
    assert _avisos(db) == []


def test_una_cita_cancelada_no_cuenta_como_cita(db, consultorio):
    """Cancelar deja el hueco igual que no haber agendado nunca."""
    embarazo = _embarazo(db, consultorio, revision=HOY + timedelta(days=5))
    cita = _citar(db, consultorio, embarazo, HOY + timedelta(days=5))
    cita.status = AppointmentStatus.CANCELADA
    db.commit()

    job.ejecutar(db, hoy=HOY)

    assert len(_avisos(db)) == 1


def test_fuera_de_la_ventana_de_anticipacion_todavia_no_se_avisa(db, consultorio):
    """Emilio pidió de cinco días a una semana, no un mes antes.

    Avisar con un mes de anticipación llegaría cuando no se puede hacer nada y
    se leería como ruido: para cuando toque, el aviso ya estaría enterrado.
    """
    _embarazo(db, consultorio, revision=HOY + timedelta(days=30))

    resumen = job.ejecutar(db, hoy=HOY)

    assert resumen.candidatos == 0
    assert _avisos(db) == []


def test_un_embarazo_ya_cerrado_no_genera_avisos(db, consultorio):
    """Una revisión pendiente en un embarazo terminado es un registro, no un pendiente."""
    _embarazo(
        db,
        consultorio,
        revision=HOY + timedelta(days=3),
        estado=PregnancyStatus.COMPLETED,
    )

    assert job.ejecutar(db, hoy=HOY).candidatos == 0


def test_si_la_corrida_pasa_del_tope_no_manda_ni_un_solo_aviso(db, consultorio, monkeypatch):
    """El freno del espejo del legacy, aplicado aquí: mejor nada que inundar.

    En producción hay 223 embarazos activos y la columna de próxima revisión se
    acaba de poblar. Que la primera corrida pueda encontrarse decenas a la vez
    no es hipotético, y la destinataria es una sola persona. El freno es todo o
    nada a propósito: media corrida aplicada dejaría unos embarazos marcados y
    otros no, y la siguiente tendría un tope distinto del que alguien revisó.
    """
    monkeypatch.setattr(job, "TOPE_AVISOS", 2)
    for i in range(3):
        _embarazo(db, consultorio, revision=HOY + timedelta(days=2), nombre=f"Paciente{i}")

    resumen = job.ejecutar(db, hoy=HOY)

    assert resumen.bloqueados_por_tope == 3
    assert resumen.avisados == 0
    assert _avisos(db) == []
    assert db.query(Pregnancy).filter(Pregnancy.next_review_reminded_on.isnot(None)).count() == 0


def test_sin_cuenta_de_recepcion_no_se_marca_como_avisado(db, consultorio):
    """Si no hay a quién avisarle, el pendiente sigue pendiente.

    Marcarlo aquí lo perdería para siempre: el día que exista una cuenta de
    recepción, el aviso tiene que salir y nadie va a ir a destapar la marca.
    """
    consultorio["asistente"].is_active = False
    db.commit()
    _embarazo(db, consultorio, revision=HOY + timedelta(days=3))

    resumen = job.ejecutar(db, hoy=HOY)

    assert resumen.sin_destinatario == 1
    assert _avisos(db) == []
    assert db.query(Pregnancy).filter(Pregnancy.next_review_reminded_on.isnot(None)).count() == 0


def test_la_corrida_en_seco_no_escribe_nada(db, consultorio):
    """Poder mirar qué saldría es lo que hace revisable subir el tope a mano."""
    _embarazo(db, consultorio, revision=HOY + timedelta(days=3))

    resumen = job.ejecutar(db, aplicar=False, hoy=HOY)

    assert resumen.avisados == 1
    assert _avisos(db) == []


def test_el_resumen_dice_cuando_el_freno_detuvo_la_corrida(db, consultorio, monkeypatch):
    """Un trabajo que decide no mandar nada no puede verse igual que uno que no corrió.

    Es lo mismo que se acaba de arreglar en el programador, que corría a ciegas.
    """
    monkeypatch.setattr(job, "TOPE_AVISOS", 0)
    _embarazo(db, consultorio, revision=HOY + timedelta(days=3))

    lineas = job.lineas_resumen(job.ejecutar(db, hoy=HOY))

    assert any("FRENO" in linea for linea in lineas)
