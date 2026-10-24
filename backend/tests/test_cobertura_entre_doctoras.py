"""La cobertura clínica entre doctoras está cerrada — y el calendario no.

Este archivo describía lo contrario: durante unos días un médico pudo entrar
al expediente completo del paciente de otra registrándose en su equipo
tratante. Emilio lo deshabilitó —no se estaba usando y multiplicaba las formas
de entrar a datos sensibles— con una precisión que es la mitad del contenido de
estas pruebas: **se cierra el expediente, no la agenda**.

Por eso se prueban tres cosas que se rompen por separado y que en la pantalla se
parecen entre sí:

1. que un médico ya no se registra en el equipo tratante de un paciente
   ajena, ni por el alta ni por una membresía vieja que quedara viva en la base;
2. que el equipo tratante **sigue funcionando** para las cuentas de apoyo, que
   es su diseño original, y que el hueco del rol temporal —que no validaba
   nada— sigue tapado;
3. que los médicos se siguen viendo la agenda entre ellas.
"""
from datetime import timedelta
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
from app.models.patient import Patient
from app.models.patient_care_team import CareTeamAccessRole, PatientCareTeamMember
from app.models.permission import Permission
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
def consultorio(db_session):
    """Dos doctoras y una recepción; el paciente es de el Dr. B."""
    tenant = Tenant(name="Clínica de cobertura", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    def _user(role: Role, nombre: str) -> User:
        user = User(
            email=f"{nombre}@gems.test",
            hashed_password="no-se-usa",
            full_name=nombre,
            role=role,
            tenant_id=tenant.id,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    dra_b = _user(Role.DOCTOR, "dra.b")
    dra_a = _user(Role.DOCTOR, "dra.a")
    secretaria = _user(Role.SECRETARIA, "recepcion")

    paciente = Patient(
        tenant_id=tenant.id,
        first_name="Paciente",
        last_name="De la Dra B",
        owner_doctor_id=dra_b.id,
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    return {
        "tenant": tenant,
        "dra_a": dra_a,
        "dra_b": dra_b,
        "secretaria": secretaria,
        "paciente": paciente,
    }


def _otorgar(client, db, otorgante: User, paciente: Patient, **cuerpo):
    return client.post(
        f"{PREFIX}/patients/{paciente.id}/care-team",
        headers=_auth_headers(db, otorgante),
        json=cuerpo,
    )


def test_una_doctora_ya_no_se_registra_en_el_equipo_de_una_paciente_ajena(
    client, db_session, consultorio
):
    """El alta se rechaza donde la decisión se puede explicar: al concederla."""
    respuesta = _otorgar(
        client,
        db_session,
        consultorio["dra_b"],
        consultorio["paciente"],
        user_id=consultorio["dra_a"].id,
        access_role="collaborator",
        reason="Cubre mientras estoy de incapacidad",
    )

    assert respuesta.status_code == 422, respuesta.text
    # El mensaje tiene que decir qué sí quedó abierto: si sólo dijera que no se
    # puede, el médico asumiría que también perdió el calendario compartido.
    assert "agenda" in respuesta.json()["detail"].lower()


def test_tampoco_por_la_puerta_de_auxiliar_ni_por_la_de_acceso_temporal(
    client, db_session, consultorio
):
    """Los tres roles cierran igual, o el que quede abierto se vuelve el atajo."""
    casos = (
        ("assistant", {}),
        (
            "temporary",
            {
                "reason": "Guardia del fin de semana",
                "expires_at": (utcnow() + timedelta(hours=8)).isoformat(),
            },
        ),
    )
    for rol, extra in casos:
        respuesta = _otorgar(
            client,
            db_session,
            consultorio["dra_b"],
            consultorio["paciente"],
            user_id=consultorio["dra_a"].id,
            access_role=rol,
            **extra,
        )
        assert respuesta.status_code == 422, f"{rol}: {respuesta.text}"


def test_una_membresia_viva_de_cuando_la_cobertura_existia_ya_no_abre_el_expediente(
    client, db_session, consultorio
):
    """Cerrar sólo el alta dejaría dando acceso a lo que se otorgó estos días.

    No se borran esas filas: son historial de autorizaciones clínicas y su
    rastro vale para auditar. Lo que se les quita es el efecto.
    """
    membresia = PatientCareTeamMember(
        tenant_id=consultorio["tenant"].id,
        patient_id=consultorio["paciente"].id,
        user_id=consultorio["dra_a"].id,
        access_role=CareTeamAccessRole.COLLABORATOR,
        granted_by_user_id=consultorio["dra_b"].id,
        starts_at=utcnow() - timedelta(days=1),
    )
    db_session.add(membresia)
    db_session.commit()
    db_session.refresh(membresia)

    respuesta = client.get(
        f"{PREFIX}/patients/{consultorio['paciente'].id}/care-team",
        headers=_auth_headers(db_session, consultorio["dra_a"]),
    )

    assert respuesta.status_code == 403
    assert (
        db_session.query(PatientCareTeamMember)
        .filter(PatientCareTeamMember.id == membresia.id)
        .first()
        is not None
    )


def test_el_equipo_tratante_sigue_abierto_para_las_cuentas_de_apoyo(
    client, db_session, consultorio
):
    """Lo que se cerró es la cobertura entre doctoras, no el equipo tratante."""
    respuesta = _otorgar(
        client,
        db_session,
        consultorio["dra_b"],
        consultorio["paciente"],
        user_id=consultorio["secretaria"].id,
        access_role="assistant",
    )

    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["user_role"] == Role.SECRETARIA.value


def test_el_acceso_temporal_sigue_exigiendo_capacidad_y_no_cualquier_cuenta_activa(
    client, db_session, consultorio
):
    """El hueco que se tapó junto con la cobertura NO se reabre al cerrarla.

    ``TEMPORARY`` no validaba capacidad alguna, así que servía para colar acceso
    clínico a cualquier cuenta activa de la clínica. La validación por capacidad
    efectiva es lo que lo cierra, y es independiente de la cobertura: se queda.
    """
    db_session.add(
        Permission(
            role=Role.SECRETARIA.value,
            action="patients.read",
            is_granted=False,
            user_id=consultorio["secretaria"].id,
        )
    )
    db_session.commit()

    respuesta = _otorgar(
        client,
        db_session,
        consultorio["dra_b"],
        consultorio["paciente"],
        user_id=consultorio["secretaria"].id,
        access_role="temporary",
        reason="Captura de estudios del fin de semana",
        expires_at=(utcnow() + timedelta(hours=8)).isoformat(),
    )

    assert respuesta.status_code == 422
    assert "patients.read" in respuesta.json()["detail"]


def test_las_doctoras_se_siguen_viendo_la_agenda_entre_ellas(
    client, db_session, consultorio
):
    """La precisión de Emilio, escrita como prueba.

    Es lo único que impide que "cerrar la cobertura" se implemente de más: el
    calendario compartido vive en el alcance operativo, que esta decisión no
    tocó. Si alguien acota la agenda al médico dueña, aquí se cae.
    """
    headers = _auth_headers(db_session, consultorio["dra_a"])

    doctoras = client.get(f"{PREFIX}/doctor-schedule/doctors", headers=headers)
    assert doctoras.status_code == 200, doctoras.text
    assert consultorio["dra_b"].id in [d["id"] for d in doctoras.json()]

    agenda_de_la_colega = client.get(
        f"{PREFIX}/doctor-schedule/availability",
        params={"doctor_id": consultorio["dra_b"].id, "fecha": "2026-10-01"},
        headers=headers,
    )
    assert agenda_de_la_colega.status_code == 200, agenda_de_la_colega.text


def test_solo_la_dueña_del_expediente_administra_el_equipo_tratante(
    client, db_session, consultorio
):
    """Ampliar quién abre un expediente sigue siendo decisión de su dueña."""
    respuesta = _otorgar(
        client,
        db_session,
        consultorio["dra_a"],
        consultorio["paciente"],
        user_id=consultorio["secretaria"].id,
        access_role="assistant",
    )

    assert respuesta.status_code == 403


def test_master_no_se_registra_como_integrante_del_equipo(client, db_session, consultorio):
    """Ya entra por su bypass supervisorio; una membresía sólo ensucia el rastro."""
    master = User(
        email="master@gems.test",
        hashed_password="no-se-usa",
        full_name="Master",
        role=Role.MASTER,
        tenant_id=consultorio["tenant"].id,
        is_active=True,
    )
    db_session.add(master)
    db_session.commit()
    db_session.refresh(master)

    respuesta = _otorgar(
        client,
        db_session,
        consultorio["dra_b"],
        consultorio["paciente"],
        user_id=master.id,
        access_role="collaborator",
    )

    assert respuesta.status_code == 422


def test_el_apoyo_concedido_queda_en_la_bitacora_con_a_quien_se_apoya(
    client, db_session, consultorio
):
    """Auditar un acceso ajeno empieza por saber de quién se tomó el expediente."""
    from app.models.audit_log import AuditLog

    _otorgar(
        client,
        db_session,
        consultorio["dra_b"],
        consultorio["paciente"],
        user_id=consultorio["secretaria"].id,
        access_role="assistant",
    )

    registro = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "care_team.member_granted")
        .first()
    )

    assert registro is not None
    assert registro.actor_user_id == consultorio["dra_b"].id
    assert registro.details["covers_doctor_id"] == consultorio["dra_b"].id
    assert registro.details["member_user_id"] == consultorio["secretaria"].id
    assert registro.details["member_role"] == Role.SECRETARIA.value
