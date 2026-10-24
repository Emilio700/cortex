"""El recorrido completo de una consulta, de punta a punta por la API.

Esta prueba existe por un caso real: entre el 1 de agosto y el 24 de
septiembre de 2026 **no se guardó una sola nota de consulta en producción**.
Casi dos meses de doctoras documentando pacientes reales y perdiéndolo todo.
La causa técnica era chica — un campo del esquema sin columna en la tabla —
pero lo grave fue por qué nadie lo vio: no existía ninguna prueba que
recorriera la consulta entera. Las que había validaban los esquemas por
separado, y un esquema solo nunca falla. La suite estaba verde mientras el
sistema perdía notas clínicas todos los días.

``test_soap_guardar_regresion.py`` cerró el alta de la nota. Aquí se cierra el
hueco completo: la cita, el triage, el pase a sala, la nota, la receta, la
relectura y el cierre, en una sola secuencia, porque los defectos que costaron
datos vivían justo en las costuras entre esos pasos y no dentro de ninguno.

Dos reglas de fondo, ganadas a base de incidentes:

1. **Se afirma contra la BASE, no contra el código de respuesta.** Lo que se
   perdió en producción fueron notas clínicas, no respuestas HTTP: un 201 no
   prueba que algo haya quedado guardado. La API de aquel agosto respondía
   500, pero incluso un 201 mentiroso habría pasado desapercibido.
2. **Se relee por la API.** Guardar y no poder volver a leerlo es el otro
   defecto del mismo día: la consulta cerrada se dibujaba vacía encima de una
   nota que sí existía, invitando a la doctora a escribirla otra vez.

Mismo arnés que ``test_appointments_creacion.py``: SQLite en memoria,
``TestClient`` y ``get_db`` sobrescrito. No hace falta una Postgres levantada.
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
from app.models.appointment import Appointment, AppointmentStatus
from app.models.patient import Patient
from app.models.prescription import Prescription
from app.models.soap_note import SOAPNote
from app.models.tenant import Tenant
from app.models.triage import Triage
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
    """Una sucursal con secretaria, doctora y paciente: el reparto de una consulta.

    La paciente queda a cargo de la doctora (``owner_doctor_id``) porque sin esa
    relación asistencial la API le niega el expediente, y entonces la prueba
    mediría el control de acceso en vez del flujo clínico.
    """
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    def _usuario(email, role, nombre):
        usuario = User(
            email=email,
            hashed_password="no-usado-en-estas-pruebas",
            full_name=nombre,
            role=role,
            tenant_id=tenant.id,
            is_active=True,
        )
        db_session.add(usuario)
        db_session.commit()
        db_session.refresh(usuario)
        return usuario

    secretaria = _usuario("secretaria@gems.com", Role.SECRETARIA, "Secretaria de prueba")
    doctora = _usuario("doctora@gems.com", Role.DOCTOR, "Doctora de prueba")

    paciente = Patient(
        tenant_id=tenant.id,
        first_name="María José",
        last_name="Hernández Ruiz",
        date_of_birth=datetime(1992, 3, 14).date(),
        owner_doctor_id=doctora.id,
    )
    db_session.add(paciente)
    db_session.commit()
    db_session.refresh(paciente)

    return {
        "tenant": tenant,
        "secretaria": secretaria,
        "doctora": doctora,
        "paciente": paciente,
    }


def _agendar(client, headers, consultorio, *, dentro_de_dias=1):
    """Agenda una cita y devuelve su id. Atajo de los casos que no prueban el alta."""
    respuesta = client.post(
        f"{PREFIX}/appointments",
        headers=headers,
        json={
            "patient_id": consultorio["paciente"].id,
            "doctor_id": consultorio["doctora"].id,
            "scheduled_at": (utcnow() + timedelta(days=dentro_de_dias)).isoformat(),
            "duration_minutes": 30,
        },
    )
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()["id"]


# --- El recorrido completo --------------------------------------------------


def test_el_recorrido_completo_de_una_consulta_deja_todo_guardado(
    client, db_session, consultorio
):
    """La consulta entera, paso a paso, como la vive la doctora.

    Es la prueba que no existía. Cada paso comprueba la respuesta *y* el
    registro en la base, porque el sistema puede contestar que sí y no haber
    guardado nada: eso fue exactamente lo que pasó durante dos meses.
    """
    secretaria = _auth_headers(db_session, consultorio["secretaria"])
    doctora = _auth_headers(db_session, consultorio["doctora"])

    # 1. La secretaria agenda la cita.
    agendada = client.post(
        f"{PREFIX}/appointments",
        headers=secretaria,
        json={
            "patient_id": consultorio["paciente"].id,
            "doctor_id": consultorio["doctora"].id,
            "scheduled_at": (utcnow() + timedelta(days=1)).isoformat(),
            "duration_minutes": 30,
            "motivo_extra": "CONTROL",
        },
    )
    assert agendada.status_code == 201, agendada.text
    cita_id = agendada.json()["id"]

    db_session.expire_all()
    cita = db_session.query(Appointment).filter(Appointment.id == cita_id).one()
    assert cita.status == AppointmentStatus.AGENDADA
    assert cita.patient_id == consultorio["paciente"].id

    # 2. La secretaria registra el triage.
    triage = client.post(
        f"{PREFIX}/triage",
        headers=secretaria,
        json={
            "appointment_id": cita_id,
            "weight_kg": 62.5,
            "height_cm": 163,
            "blood_pressure_systolic": 118,
            "blood_pressure_diastolic": 76,
            "temperature_celsius": 36.6,
            "chief_complaint": "DOLOR PÉLVICO DE 3 DÍAS",
        },
    )
    assert triage.status_code == 201, triage.text

    db_session.expire_all()
    triage_guardado = (
        db_session.query(Triage).filter(Triage.appointment_id == cita_id).one()
    )
    assert triage_guardado.chief_complaint == "DOLOR PÉLVICO DE 3 DÍAS"
    assert triage_guardado.weight_kg == 62.5

    # 3. La paciente pasa a sala. El sistema exige triage previo, así que este
    #    paso también confirma que el anterior quedó registrado de verdad.
    a_sala = client.patch(
        f"{PREFIX}/appointments/{cita_id}/status",
        headers=secretaria,
        json={"status": "en_sala"},
    )
    assert a_sala.status_code == 200, a_sala.text

    db_session.expire_all()
    cita = db_session.query(Appointment).filter(Appointment.id == cita_id).one()
    assert cita.status == AppointmentStatus.EN_SALA

    # 4. La doctora guarda la nota de consulta. ESTE es el paso que estuvo
    #    roto dos meses: respondía 500 y la nota no llegaba nunca a la tabla.
    nota = client.post(
        f"{PREFIX}/soap-notes",
        headers=doctora,
        json={
            "appointment_id": cita_id,
            "subjective": "DOLOR PÉLVICO DE 3 DÍAS, SIN FIEBRE",
            "objective": "ABDOMEN BLANDO, SIN DATOS DE IRRITACIÓN PERITONEAL",
            "assessment": "DISMENORREA PRIMARIA",
            "plan": "ANALGÉSICO POR 5 DÍAS Y CONTROL EN UNA SEMANA",
        },
    )
    assert nota.status_code == 201, nota.text
    nota_id = nota.json()["id"]

    db_session.expire_all()
    nota_guardada = (
        db_session.query(SOAPNote).filter(SOAPNote.appointment_id == cita_id).one()
    )
    assert nota_guardada is not None, "La nota respondió bien pero no quedó en la base"
    assert nota_guardada.subjective == "DOLOR PÉLVICO DE 3 DÍAS, SIN FIEBRE"
    assert nota_guardada.assessment == "DISMENORREA PRIMARIA"
    assert nota_guardada.plan == "ANALGÉSICO POR 5 DÍAS Y CONTROL EN UNA SEMANA"
    assert nota_guardada.doctor_id == consultorio["doctora"].id

    # 5. La doctora emite la receta.
    receta = client.post(
        f"{PREFIX}/prescriptions",
        headers=doctora,
        json={
            "appointment_id": cita_id,
            "patient_id": consultorio["paciente"].id,
            "medications": [
                {
                    "name": "IBUPROFENO 400 MG",
                    "dosage": "1 TABLETA",
                    "frequency": "CADA 8 HORAS",
                    "duration": "5 DÍAS",
                }
            ],
            "instructions": "TOMAR CON ALIMENTOS",
        },
    )
    assert receta.status_code == 201, receta.text
    receta_id = receta.json()["id"]

    db_session.expire_all()
    receta_guardada = (
        db_session.query(Prescription).filter(Prescription.id == receta_id).one()
    )
    assert receta_guardada.appointment_id == cita_id
    assert receta_guardada.medications[0]["name"] == "IBUPROFENO 400 MG"
    assert receta_guardada.folio_number, "Una receta sin folio no se puede rastrear"

    # 6. La doctora relee la consulta y ENCUENTRA lo que capturó. El otro
    #    defecto del mismo día era éste: la consulta se abría en blanco encima
    #    de lo ya documentado. Por eso no basta con que la base tenga el dato:
    #    tiene que llegar por la misma puerta que usa la pantalla.
    relectura_nota = client.get(
        f"{PREFIX}/soap-notes/appointment/{cita_id}", headers=doctora
    )
    assert relectura_nota.status_code == 200, relectura_nota.text
    assert relectura_nota.json()["assessment"] == "DISMENORREA PRIMARIA"

    relectura_triage = client.get(f"{PREFIX}/triage/appointment/{cita_id}", headers=doctora)
    assert relectura_triage.status_code == 200, relectura_triage.text
    assert relectura_triage.json()["chief_complaint"] == "DOLOR PÉLVICO DE 3 DÍAS"

    relectura_recetas = client.get(
        f"{PREFIX}/prescriptions/appointment/{cita_id}/all", headers=doctora
    )
    assert relectura_recetas.status_code == 200, relectura_recetas.text
    assert [r["id"] for r in relectura_recetas.json()] == [receta_id]

    # 7. La doctora finaliza la consulta.
    finalizada = client.patch(
        f"{PREFIX}/appointments/{cita_id}/status",
        headers=doctora,
        json={"status": "atendida"},
    )
    assert finalizada.status_code == 200, finalizada.text

    db_session.expire_all()
    cita = db_session.query(Appointment).filter(Appointment.id == cita_id).one()
    assert cita.status == AppointmentStatus.ATENDIDA

    # 8. Tras cerrar, la nota y la receta SIGUEN ahí y se pueden leer. Cerrar
    #    la consulta no puede ser una forma silenciosa de perder el expediente:
    #    lo documentado es el expediente clínico de la paciente.
    despues_nota = client.get(f"{PREFIX}/soap-notes/{nota_id}", headers=doctora)
    assert despues_nota.status_code == 200, despues_nota.text
    assert despues_nota.json()["plan"] == "ANALGÉSICO POR 5 DÍAS Y CONTROL EN UNA SEMANA"

    despues_receta = client.get(f"{PREFIX}/prescriptions/{receta_id}", headers=doctora)
    assert despues_receta.status_code == 200, despues_receta.text
    assert despues_receta.json()["instructions"] == "TOMAR CON ALIMENTOS"

    db_session.expire_all()
    assert db_session.query(SOAPNote).filter(SOAPNote.appointment_id == cita_id).count() == 1
    assert (
        db_session.query(Prescription).filter(Prescription.appointment_id == cita_id).count()
        == 1
    )


# --- Casos que ya nos mordieron --------------------------------------------


def test_la_nota_releida_es_exactamente_la_que_se_escribio(client, db_session, consultorio):
    """Lo que la doctora escribió es lo que tiene que volver, acentos incluidos.

    Una nota clínica que regresa con la ñ rota o la tilde comida no es la nota
    que se firmó. Se compara carácter por carácter contra el texto original,
    contra la base y contra lo que devuelve la API.
    """
    doctora = _auth_headers(db_session, consultorio["doctora"])
    secretaria = _auth_headers(db_session, consultorio["secretaria"])
    cita_id = _agendar(client, secretaria, consultorio)

    escrito = {
        "subjective": "Refiere dolor en región lumbar tras esfuerzo; niega fiebre.",
        "objective": "T.A. 120/80. Abdomen blando. Exploración ginecológica sin hallazgos.",
        "assessment": "Lumbalgia mecánica. Descartar infección de vías urinarias.",
        "plan": "Ibuprofeno 400 mg c/8 h por 5 días. EGO y cita de revisión el próximo día 30.",
    }

    creada = client.post(
        f"{PREFIX}/soap-notes",
        headers=doctora,
        json={"appointment_id": cita_id, **escrito},
    )
    assert creada.status_code == 201, creada.text

    releida = client.get(f"{PREFIX}/soap-notes/appointment/{cita_id}", headers=doctora)
    assert releida.status_code == 200, releida.text
    cuerpo = releida.json()
    for seccion, texto in escrito.items():
        assert cuerpo[seccion] == texto, f"La sección «{seccion}» volvió distinta"

    db_session.expire_all()
    guardada = db_session.query(SOAPNote).filter(SOAPNote.appointment_id == cita_id).one()
    for seccion, texto in escrito.items():
        assert getattr(guardada, seccion) == texto


def test_sin_nota_responde_204_y_con_nota_responde_200(client, db_session, consultorio):
    """El contrato del que depende la pantalla de consulta.

    204 significa «esta cita todavía no tiene nota, dibuja el formulario
    vacío» y 200 significa «aquí está lo documentado». Confundirlos fue lo que
    puso a la doctora a escribir encima de una nota existente. Se prueban los
    dos estados sobre la MISMA cita, antes y después de guardar, que es como
    los vive el frontend.
    """
    doctora = _auth_headers(db_session, consultorio["doctora"])
    secretaria = _auth_headers(db_session, consultorio["secretaria"])
    cita_id = _agendar(client, secretaria, consultorio)

    vacia = client.get(f"{PREFIX}/soap-notes/appointment/{cita_id}", headers=doctora)
    assert vacia.status_code == 204, vacia.text
    assert not vacia.content, "Un 204 con cuerpo confunde al cliente"

    creada = client.post(
        f"{PREFIX}/soap-notes",
        headers=doctora,
        json={"appointment_id": cita_id, "plan": "REPOSO RELATIVO"},
    )
    assert creada.status_code == 201, creada.text

    con_nota = client.get(f"{PREFIX}/soap-notes/appointment/{cita_id}", headers=doctora)
    assert con_nota.status_code == 200, con_nota.text
    assert con_nota.json()["plan"] == "REPOSO RELATIVO"


def test_dos_recetas_distintas_en_la_misma_consulta(client, db_session, consultorio):
    """Recetar dos cosas en una consulta es clínico normal, no un error.

    Una paciente puede salir con el analgésico y con el antibiótico en recetas
    separadas. Lo que no debe pasar es que la segunda pise a la primera ni que
    compartan folio: el folio es como se rastrea una receta después.
    """
    doctora = _auth_headers(db_session, consultorio["doctora"])
    secretaria = _auth_headers(db_session, consultorio["secretaria"])
    cita_id = _agendar(client, secretaria, consultorio)

    def _recetar(nombre, dosis):
        return client.post(
            f"{PREFIX}/prescriptions",
            headers=doctora,
            json={
                "appointment_id": cita_id,
                "patient_id": consultorio["paciente"].id,
                "medications": [
                    {"name": nombre, "dosage": dosis, "frequency": "CADA 8 HORAS"}
                ],
            },
        )

    primera = _recetar("IBUPROFENO 400 MG", "1 TABLETA")
    assert primera.status_code == 201, primera.text
    segunda = _recetar("AMOXICILINA 500 MG", "1 CÁPSULA")
    assert segunda.status_code == 201, segunda.text

    assert primera.json()["id"] != segunda.json()["id"]
    assert primera.json()["folio_number"] != segunda.json()["folio_number"]

    db_session.expire_all()
    guardadas = (
        db_session.query(Prescription)
        .filter(Prescription.appointment_id == cita_id)
        .order_by(Prescription.id)
        .all()
    )
    assert len(guardadas) == 2, "La segunda receta pisó a la primera"
    assert [r.medications[0]["name"] for r in guardadas] == [
        "IBUPROFENO 400 MG",
        "AMOXICILINA 500 MG",
    ]

    listadas = client.get(
        f"{PREFIX}/prescriptions/appointment/{cita_id}/all", headers=doctora
    )
    assert listadas.status_code == 200, listadas.text
    assert {r["id"] for r in listadas.json()} == {
        primera.json()["id"],
        segunda.json()["id"],
    }


def test_finalizar_la_consulta_no_pierde_la_nota(client, db_session, consultorio):
    """Cerrar la cita no puede borrar ni bloquear lo documentado.

    En producción la nota vivía sólo en el estado del formulario: finalizar
    cambiaba el estado de la cita y el texto se iba con la pantalla. El
    frontend ya guarda antes de cerrar, pero eso sólo es seguro si la API
    cumple dos cosas, y son las que se fijan aquí: finalizar deja intacta la
    nota que ya existe, y una nota que llega DESPUÉS del cierre se sigue
    aceptando — si la consulta se cerrara al guardado, cualquier carrera entre
    los dos pasos se convertiría en una nota perdida.
    """
    doctora = _auth_headers(db_session, consultorio["doctora"])
    secretaria = _auth_headers(db_session, consultorio["secretaria"])

    # Caso A: hay nota y se cierra la consulta. La nota no se toca.
    con_nota = _agendar(client, secretaria, consultorio, dentro_de_dias=1)
    creada = client.post(
        f"{PREFIX}/soap-notes",
        headers=doctora,
        json={"appointment_id": con_nota, "plan": "CONTROL EN UN MES"},
    )
    assert creada.status_code == 201, creada.text

    cerrada = client.patch(
        f"{PREFIX}/appointments/{con_nota}/status",
        headers=doctora,
        json={"status": "atendida"},
    )
    assert cerrada.status_code == 200, cerrada.text

    db_session.expire_all()
    intacta = db_session.query(SOAPNote).filter(SOAPNote.appointment_id == con_nota).one()
    assert intacta.plan == "CONTROL EN UN MES"
    releida = client.get(f"{PREFIX}/soap-notes/appointment/{con_nota}", headers=doctora)
    assert releida.status_code == 200, releida.text
    assert releida.json()["plan"] == "CONTROL EN UN MES"

    # Caso B: la consulta se cerró antes de guardar. La nota que llega tarde
    # tiene que entrar igual; rechazarla sería perder el trabajo de la doctora.
    sin_nota = _agendar(client, secretaria, consultorio, dentro_de_dias=2)
    cerrada_antes = client.patch(
        f"{PREFIX}/appointments/{sin_nota}/status",
        headers=doctora,
        json={"status": "atendida"},
    )
    assert cerrada_antes.status_code == 200, cerrada_antes.text

    tardia = client.post(
        f"{PREFIX}/soap-notes",
        headers=doctora,
        json={
            "appointment_id": sin_nota,
            "assessment": "CERVICOVAGINITIS",
            "plan": "ÓVULOS POR 7 DÍAS",
        },
    )
    assert tardia.status_code == 201, (
        "La nota escrita después de cerrar la consulta se rechazó: "
        f"{tardia.text}. Eso es trabajo clínico perdido."
    )

    db_session.expire_all()
    guardada = db_session.query(SOAPNote).filter(SOAPNote.appointment_id == sin_nota).one()
    assert guardada.assessment == "CERVICOVAGINITIS"
    assert guardada.plan == "ÓVULOS POR 7 DÍAS"
