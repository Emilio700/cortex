"""A14: reabrir una consulta que se cerró por error.

Finalizar guarda la nota automáticamente, así que ahora es más fácil cerrar de
más: un clic de sobra deja la consulta en sólo lectura y el médico sin forma de
corregir la nota ni de emitir la receta que faltaba. El backend siempre permitió
la transición; lo que faltaba era que dejara rastro y que no se pudiera abusar de
ella.

Usan SQLite en memoria y sobrescriben ``get_db``, como ``test_appointments_creacion.py``.
"""
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import security
from app.core.config import settings
from app.core.deps import get_db
from app.db.session import Base, utcnow
from app.main import app
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.models.audit_log import AuditLog
from app.models.notification import Notification
from app.models.patient import Patient
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


def _auth_headers(db, user: User) -> dict[str, str]:
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
def consulta(db_session):
    """Una consulta ya finalizada, con una secretaria a la que avisarle.

    La segunda doctora comparte sucursal pero no tiene relación asistencial con
    el paciente: es la única forma de distinguir "sin acceso" de "no existe".
    La cita se crea **sin triage** a propósito, porque ése es el caso que la
    regla de `en_sala` dejaría encerrada para siempre.
    """
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    def _user(email, role):
        user = User(
            email=email,
            hashed_password="no-usado-en-estas-pruebas",
            full_name=f"Usuario {email}",
            role=role,
            tenant_id=tenant.id,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    doctora = _user("doctora@gems.com", Role.DOCTOR)
    otra_doctora = _user("otra.doctora@gems.com", Role.DOCTOR)
    secretaria = _user("secretaria@gems.com", Role.SECRETARIA)

    paciente = Patient(
        tenant_id=tenant.id,
        first_name="Paciente",
        last_name="De Prueba",
        date_of_birth=datetime(1990, 5, 20).date(),
        owner_doctor_id=doctora.id,
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    cita = Appointment(
        tenant_id=tenant.id,
        patient_id=paciente.id,
        doctor_id=doctora.id,
        scheduled_at=utcnow(),
        duration_minutes=30,
        appointment_type=AppointmentType.CONSULTA,
        status=AppointmentStatus.ATENDIDA,
        notes="Motivo capturado en recepción",
    )
    db_session.add(cita)
    db_session.commit()
    db_session.refresh(cita)

    return {
        "tenant": tenant,
        "doctora": doctora,
        "otra_doctora": otra_doctora,
        "secretaria": secretaria,
        "paciente": paciente,
        "cita": cita,
    }


def _reabrir(client, headers, cita_id):
    return client.patch(
        f"{PREFIX}/appointments/{cita_id}/status", headers=headers, json={"status": "en_sala"}
    )


def _finalizar(client, headers, cita_id, notas=None):
    cuerpo = {"status": "atendida"}
    if notas is not None:
        cuerpo["notes"] = notas
    return client.patch(f"{PREFIX}/appointments/{cita_id}/status", headers=headers, json=cuerpo)


def test_la_consulta_atendida_se_reabre_y_vuelve_a_ser_editable(client, db_session, consulta):
    """Sin esto, un clic de más dejaba el expediente congelado: ni corregir la
    nota ni agregar la receta que faltó.
    """
    headers = _auth_headers(db_session, consulta["doctora"])

    respuesta = _reabrir(client, headers, consulta["cita"].id)

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["status"] == "en_sala"
    db_session.refresh(consulta["cita"])
    assert consulta["cita"].status == AppointmentStatus.EN_SALA


def test_reabrir_no_exige_triage(client, db_session, consulta):
    """La cita de la prueba no tiene signos vitales capturados.

    El triage es requisito para *pasar* al paciente a sala, no para devolverle
    la consulta a quien ya la atendió: aplicarlo aquí habría dejado encerradas
    justo las citas con un descuido de recepción.
    """
    headers = _auth_headers(db_session, consulta["doctora"])

    respuesta = _reabrir(client, headers, consulta["cita"].id)

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["has_triage"] is False


def test_reabrir_deja_rastro_en_la_bitacora(client, db_session, consulta):
    """Una consulta cerrada, reabierta y vuelta a cerrar no puede verse igual
    que una que se cerró una sola vez.
    """
    headers = _auth_headers(db_session, consulta["doctora"])

    _reabrir(client, headers, consulta["cita"].id)

    registros = db_session.query(AuditLog).filter(AuditLog.action == "appointment.reopened").all()
    assert len(registros) == 1
    rastro = registros[0]
    assert rastro.entity_type == "appointment"
    assert rastro.entity_id == consulta["cita"].id
    assert rastro.actor_user_id == consulta["doctora"].id
    assert rastro.patient_id == consulta["paciente"].id
    assert rastro.details["estado_anterior"] == "atendida"
    assert rastro.details["estado_nuevo"] == "en_sala"


def test_al_reabrir_no_se_avisa_que_la_paciente_acaba_de_llegar(client, db_session, consulta):
    """`en_sala` normalmente significa "llegó el paciente" y le avisa a la
    doctora. Reabrir usa el mismo estado, pero nadie llegó — y el aviso le
    caería a quien apretó el botón.
    """
    headers = _auth_headers(db_session, consulta["doctora"])

    _reabrir(client, headers, consulta["cita"].id)

    avisos = db_session.query(Notification).filter(Notification.type == "patient_arrived").all()
    assert avisos == []


def test_volver_a_cerrar_no_anexa_la_nota_del_doctor_dos_veces(client, db_session, consulta):
    """El borrador de la nota para secretaría sigue en la pantalla al reabrir, y
    se re-envía tal cual al volver a cerrar. El expediente no puede acabar con el
    mismo párrafo repetido.
    """
    headers = _auth_headers(db_session, consulta["doctora"])
    nota = "Aplicar 20% de descuento"

    _reabrir(client, headers, consulta["cita"].id)
    _finalizar(client, headers, consulta["cita"].id, nota)
    _reabrir(client, headers, consulta["cita"].id)
    segunda = _finalizar(client, headers, consulta["cita"].id, nota)

    assert segunda.status_code == 200, segunda.text
    db_session.refresh(consulta["cita"])
    assert consulta["cita"].notes.count(nota) == 1
    # El motivo que capturó la secretaria se conserva: la nota se anexa.
    assert "Motivo capturado en recepción" in consulta["cita"].notes


def test_volver_a_cerrar_con_una_nota_distinta_si_la_anexa(client, db_session, consulta):
    """Lo que no se repite es el texto ya anexado, no el acto de anexar: en el
    segundo cierre puede haber algo nuevo que decirle a secretaría.
    """
    headers = _auth_headers(db_session, consulta["doctora"])

    _reabrir(client, headers, consulta["cita"].id)
    _finalizar(client, headers, consulta["cita"].id, "Aplicar 20% de descuento")
    _reabrir(client, headers, consulta["cita"].id)
    _finalizar(client, headers, consulta["cita"].id, "Corrección: cobrar consulta completa")

    db_session.refresh(consulta["cita"])
    assert "Aplicar 20% de descuento" in consulta["cita"].notes
    assert "Corrección: cobrar consulta completa" in consulta["cita"].notes


def test_volver_a_cerrar_si_vuelve_a_avisar_a_secretaria(client, db_session, consulta):
    """Secretaría cobra cuando la consulta cierra. Si se reabrió después del
    primer aviso, tiene que enterarse de que volvió a cerrarse: callarlo deja el
    cobro colgado de que alguien se acuerde de mirar la agenda.
    """
    headers = _auth_headers(db_session, consulta["doctora"])

    _reabrir(client, headers, consulta["cita"].id)
    _finalizar(client, headers, consulta["cita"].id, "Precio especial")
    _reabrir(client, headers, consulta["cita"].id)
    _finalizar(client, headers, consulta["cita"].id, "Precio especial")

    avisos = (
        db_session.query(Notification)
        .filter(Notification.type == "consultation_completed")
        .all()
    )
    assert len(avisos) == 2
    assert {aviso.user_id for aviso in avisos} == {consulta["secretaria"].id}


def test_cerrar_dos_veces_seguidas_sigue_sin_repetir_el_aviso(client, db_session, consulta):
    """A13 no se rompe: sin reapertura de por medio, el segundo clic (o el
    reintento tras un error de red) no vuelve a notificar.
    """
    headers = _auth_headers(db_session, consulta["doctora"])

    _reabrir(client, headers, consulta["cita"].id)
    _finalizar(client, headers, consulta["cita"].id, "Precio especial")
    _finalizar(client, headers, consulta["cita"].id, "Precio especial")

    avisos = (
        db_session.query(Notification)
        .filter(Notification.type == "consultation_completed")
        .all()
    )
    assert len(avisos) == 1


def test_una_doctora_sin_relacion_con_la_paciente_no_puede_reabrir(client, db_session, consulta):
    """Misma regla que la nota y la receta: relación asistencial con la
    paciente. No se inventa un permiso aparte para reabrir.
    """
    headers = _auth_headers(db_session, consulta["otra_doctora"])

    respuesta = _reabrir(client, headers, consulta["cita"].id)

    assert respuesta.status_code == 403
    db_session.refresh(consulta["cita"])
    assert consulta["cita"].status == AppointmentStatus.ATENDIDA
    assert db_session.query(AuditLog).filter(AuditLog.action == "appointment.reopened").count() == 0


def test_una_membresia_de_equipo_tratante_no_le_deja_reabrir_a_otra_doctora(
    client, db_session, consulta
):
    """Reabrir sigue la regla de la nota, y esa regla se angostó el 2026-09-24.

    Esta prueba decía lo contrario mientras la cobertura clínica entre doctoras
    estuvo habilitada. Lo que no cambió es de dónde sale el veredicto: reabrir
    no tiene reglas propias, hereda las del expediente donde va la nota. Se deja
    la membresía viva a propósito, porque el caso que hay que cubrir es el de
    las que ya existen en la base.
    """
    from app.models.patient_care_team import CareTeamAccessRole, PatientCareTeamMember

    db_session.add(
        PatientCareTeamMember(
            tenant_id=consulta["tenant"].id,
            patient_id=consulta["paciente"].id,
            user_id=consulta["otra_doctora"].id,
            access_role=CareTeamAccessRole.COLLABORATOR,
            granted_by_user_id=consulta["doctora"].id,
            starts_at=utcnow() - timedelta(hours=1),
        )
    )
    db_session.commit()
    headers = _auth_headers(db_session, consulta["otra_doctora"])

    respuesta = _reabrir(client, headers, consulta["cita"].id)

    assert respuesta.status_code == 403
    db_session.refresh(consulta["cita"])
    assert consulta["cita"].status == AppointmentStatus.ATENDIDA


def test_reabrir_una_cita_inexistente_sigue_en_404(client, db_session, consulta):
    """404 sigue queriendo decir lo mismo que en el resto del expediente."""
    headers = _auth_headers(db_session, consulta["doctora"])

    respuesta = _reabrir(client, headers, 999999)

    assert respuesta.status_code == 404
