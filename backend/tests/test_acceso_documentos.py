"""Receta y certificado usan la MISMA regla de acceso que la nota de consulta.

Antes había dos reglas distintas para la misma consulta: la nota preguntaba si
el médico tiene relación asistencial con el paciente y la receta exigía ser la
doctora ASIGNADA A LA CITA. A la que atendía le salía la nota pero un 403 en las
recetas, así que la sección se dibujaba vacía sin explicación.

A12 del eje A / B9 del plan de RBAC. No se inventó una tercera regla: se borró
la divergente y se reusa ``assert_patient_clinical_access``, que es el helper
que ya usaba la nota. Estas pruebas son la red que impide que vuelvan a
separarse.

Qué se movió al cerrar la cobertura clínica entre doctoras (2026-09-24)
-----------------------------------------------------------------------
La regla única se conservó; lo que se angostó es a quién deja pasar. Un médico
entra sólo si es la dueña del expediente, y una membresía de equipo tratante ya
no la mete. Estas pruebas comparan **el veredicto de la receta contra el de la
nota**, así que siguen midiendo lo mismo: que no vuelva a haber dos reglas. La
integrante ``equipo`` se conserva a propósito en el escenario, con su membresía
viva, porque el caso que hay que poder distinguir es el que más se parece a un
defecto: la puerta cerrada ya no depende de que alguien recuerde revocarla.

Fase 3 del plan ``docs/plans/22_plan_maestro_consolidado.md``.
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
from app.models.patient import Patient
from app.models.patient_care_team import CareTeamAccessRole, PatientCareTeamMember
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
def cobertura(db_session):
    """El escenario real: la cita se agendó con un médico y la atiende otra.

    - ``duena``: dueña del paciente, pero la cita NO está a su nombre.
    - ``equipo``: doctora con una membresía de equipo tratante vigente, que
      desde que se cerró la cobertura clínica ya no le abre el expediente.
    - ``asignada``: es el médico de la cita y nada más.
    - ``ajena``: misma clínica, ninguna relación con el paciente.
    - ``apoyo``: cuenta de administración de la clínica.
    """
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    def _doctora(email):
        user = User(
            email=email,
            hashed_password="no-usado-en-estas-pruebas",
            full_name=f"Médico {email}",
            role=Role.DOCTOR,
            tenant_id=tenant.id,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    duena = _doctora("duena@gems.com")
    equipo = _doctora("equipo@gems.com")
    asignada = _doctora("asignada@gems.com")
    ajena = _doctora("ajena@gems.com")
    apoyo = User(
        email="apoyo@gems.com",
        hashed_password="no-usado-en-estas-pruebas",
        full_name="Administración",
        role=Role.ADMIN,
        tenant_id=tenant.id,
        is_active=True,
    )
    db_session.add(apoyo)
    db_session.commit()
    db_session.refresh(apoyo)

    paciente = Patient(
        tenant_id=tenant.id,
        first_name="Paciente",
        last_name="De Prueba",
        date_of_birth=datetime(1988, 7, 1).date(),
        owner_doctor_id=duena.id,
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    db_session.add(
        PatientCareTeamMember(
            tenant_id=tenant.id,
            patient_id=paciente.id,
            user_id=equipo.id,
            access_role=CareTeamAccessRole.COLLABORATOR,
            granted_by_user_id=duena.id,
            reason="Cobertura de consulta",
        )
    )
    cita = Appointment(
        tenant_id=tenant.id,
        patient_id=paciente.id,
        doctor_id=asignada.id,
        scheduled_at=utcnow(),
        duration_minutes=30,
        appointment_type=AppointmentType.CONSULTA,
        status=AppointmentStatus.EN_SALA,
    )
    db_session.add(cita)
    db_session.commit()
    db_session.refresh(cita)

    return {
        "duena": duena,
        "equipo": equipo,
        "asignada": asignada,
        "ajena": ajena,
        "apoyo": apoyo,
        "paciente": paciente,
        "cita": cita,
    }


def _receta(cobertura):
    return {
        "appointment_id": cobertura["cita"].id,
        "patient_id": cobertura["paciente"].id,
        "medications": [
            {"name": "ÁCIDO FÓLICO", "dosage": "5 MG", "frequency": "CADA 24 HORAS", "duration": "30 DÍAS"}
        ],
        "instructions": "CONTROL EN UN MES",
    }


def _certificado(cobertura):
    return {
        "appointment_id": cobertura["cita"].id,
        "patient_id": cobertura["paciente"].id,
        "certificate_type": "fitness",
        "diagnosis": "SIN CONTRAINDICACIONES",
    }


def test_con_relacion_asistencial_se_leen_y_emiten_recetas(client, db_session, cobertura):
    """La dueña necesita la receta aunque la cita esté a nombre de otra.

    Es el defecto que originó este archivo: la nota de consulta le abría y la
    receta le daba 403 sobre la MISMA consulta.
    """
    headers = _auth_headers(db_session, cobertura["duena"])

    listado = client.get(
        f"{PREFIX}/prescriptions/appointment/{cobertura['cita'].id}/all", headers=headers
    )
    creacion = client.post(f"{PREFIX}/prescriptions", headers=headers, json=_receta(cobertura))

    assert listado.status_code == 200, listado.text
    assert creacion.status_code == 201, creacion.text


def test_con_relacion_asistencial_se_leen_y_emiten_certificados(client, db_session, cobertura):
    headers = _auth_headers(db_session, cobertura["duena"])

    listado = client.get(
        f"{PREFIX}/medical-certificates/appointment/{cobertura['cita'].id}/all", headers=headers
    )
    creacion = client.post(
        f"{PREFIX}/medical-certificates", headers=headers, json=_certificado(cobertura)
    )

    assert listado.status_code == 200, listado.text
    assert creacion.status_code == 201, creacion.text


def test_sin_relacion_con_la_paciente_no_hay_receta_ni_certificado(client, db_session, cobertura):
    """Homologar no es abrir: estar en la misma clínica nunca bastó y sigue sin bastar."""
    headers = _auth_headers(db_session, cobertura["ajena"])

    respuestas = [
        client.get(f"{PREFIX}/prescriptions/appointment/{cobertura['cita'].id}/all", headers=headers),
        client.post(f"{PREFIX}/prescriptions", headers=headers, json=_receta(cobertura)),
        client.get(
            f"{PREFIX}/medical-certificates/appointment/{cobertura['cita'].id}/all", headers=headers
        ),
        client.post(f"{PREFIX}/medical-certificates", headers=headers, json=_certificado(cobertura)),
    ]

    assert [r.status_code for r in respuestas] == [403, 403, 403, 403]


def test_el_acceso_al_documento_coincide_con_el_de_la_nota_de_consulta(client, db_session, cobertura):
    """La misma matriz, medida contra la nota: una sola regla, no dos.

    La nota responde 204 cuando hay acceso y todavía no se documenta nada, y
    403 cuando no lo hay. Lo que se compara es el veredicto de acceso, no el
    cuerpo: si alguien vuelve a separar las reglas, aquí se ve.
    """
    for relacion in ("duena",):
        headers = _auth_headers(db_session, cobertura[relacion])
        nota = client.get(f"{PREFIX}/soap-notes/appointment/{cobertura['cita'].id}", headers=headers)
        receta = client.get(
            f"{PREFIX}/prescriptions/appointment/{cobertura['cita'].id}/all", headers=headers
        )
        certificado = client.get(
            f"{PREFIX}/medical-certificates/appointment/{cobertura['cita'].id}/all", headers=headers
        )
        assert nota.status_code != 403, f"{relacion}: la nota ya daba acceso"
        assert receta.status_code == 200, f"{relacion}: {receta.text}"
        assert certificado.status_code == 200, f"{relacion}: {certificado.text}"

    # ``equipo`` entra aquí y no arriba desde que se cerró la cobertura clínica:
    # lo que se comprueba es que las tres respuestas sigan coincidiendo entre sí,
    # no cuál de los dos lados. Una regla, no tres.
    for relacion in ("ajena", "equipo"):
        headers = _auth_headers(db_session, cobertura[relacion])
        nota = client.get(f"{PREFIX}/soap-notes/appointment/{cobertura['cita'].id}", headers=headers)
        receta = client.get(
            f"{PREFIX}/prescriptions/appointment/{cobertura['cita'].id}/all", headers=headers
        )
        certificado = client.get(
            f"{PREFIX}/medical-certificates/appointment/{cobertura['cita'].id}/all", headers=headers
        )
        assert nota.status_code == 403, relacion
        assert receta.status_code == 403, relacion
        assert certificado.status_code == 403, relacion


def test_tener_la_cita_asignada_no_sustituye_a_la_relacion_con_la_paciente(client, db_session, cobertura):
    """Queda documentado hacia qué lado se homologó.

    El médico de la cita sin relación asistencial ya recibía 403 antes de este
    cambio, y la nota de consulta también se lo da: alinear con la regla de la
    nota no le quitó ni le dio acceso a nadie por esta vía. Para cubrir a otra
    doctora, el camino es el equipo de atención, que es explícito y revocable.
    """
    headers = _auth_headers(db_session, cobertura["asignada"])

    nota = client.get(f"{PREFIX}/soap-notes/appointment/{cobertura['cita'].id}", headers=headers)
    receta = client.get(
        f"{PREFIX}/prescriptions/appointment/{cobertura['cita'].id}/all", headers=headers
    )

    assert nota.status_code == 403
    assert receta.status_code == 403


def test_la_receta_emitida_por_la_doctora_se_reimprime_pero_no_se_reescribe(
    client, db_session, cobertura
):
    """Reimprimir la receta que emitió el médico, sí; reescribirla, no.

    Son dos cosas distintas y conviene que sigan separadas: leer el documento
    depende del alcance sobre el paciente, y reescribirlo depende de haberlo
    firmado. La cuenta de apoyo sirve de testigo porque tiene lo primero y no lo
    segundo; una receta que recepción pudiera corregir dejaría de ser un
    documento firmado.
    """
    headers_duena = _auth_headers(db_session, cobertura["duena"])
    emitida = client.post(f"{PREFIX}/prescriptions", headers=headers_duena, json=_receta(cobertura))
    assert emitida.status_code == 201, emitida.text
    receta_id = emitida.json()["id"]

    headers_apoyo = _auth_headers(db_session, cobertura["apoyo"])
    lectura = client.get(f"{PREFIX}/prescriptions/{receta_id}", headers=headers_apoyo)
    edicion = client.put(
        f"{PREFIX}/prescriptions/{receta_id}",
        headers=headers_apoyo,
        json={"instructions": "OTRA INDICACIÓN"},
    )

    assert lectura.status_code == 200, lectura.text
    assert edicion.status_code == 403


def test_la_doctora_que_cubre_tambien_puede_escribir_la_nota(client, db_session, cobertura):
    """El ultimo resto de A12: leer la nota y emitir receta ya se habian
    homologado, pero crearla seguia exigiendo ser el médico asignado a la cita.

    El hueco era absurdo en la practica: el médico que cubre abria el
    expediente, emitia la receta, y se topaba con un 403 al documentar lo que
    acababa de atender — justo el paso que ya nos costo dos meses de notas.
    """
    headers = _auth_headers(db_session, cobertura["duena"])

    respuesta = client.post(
        f"{PREFIX}/soap-notes",
        headers=headers,
        json={
            "appointment_id": cobertura["cita"].id,
            "subjective": "REFIERE DOLOR",
            "plan": "CONTROL EN UNA SEMANA",
        },
    )

    assert respuesta.status_code == 201, respuesta.text
