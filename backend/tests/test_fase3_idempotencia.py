"""El backend no debe convertir un reenvío en un segundo documento clínico.

En producción la Dra. Cintia emitió dos recetas idénticas con un minuto de
diferencia: el formulario guardaba al oprimir "Guardar" y volvía a guardar al
confirmar la impresión. El formulario ya no hace eso, pero el backend aceptaba
el duplicado sin chistar, así que cualquier doble clic o reintento tras un
error de red lo reproducía.

Lo que se bloquea es SÓLO el duplicado exacto. Dos recetas distintas en la
misma consulta son clínicamente válidas y la interfaz ya las rotula "Receta 1
de 2": un falso positivo aquí le negaría a la doctora una receta legítima a
media consulta, que es peor que el duplicado que se quiere evitar.

Fase 3 del plan ``docs/plans/22_plan_maestro_consolidado.md`` (A13 incluido).
Usan SQLite en memoria y sobrescriben ``get_db``, igual que
``test_appointments_creacion.py``.
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
from app.models.medical_certificate import MedicalCertificate
from app.models.notification import Notification
from app.models.patient import Patient
from app.models.prescription import Prescription
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
    """Una consulta en curso: doctora, su paciente, la cita y dos secretarias."""
    tenant = Tenant(name="Clínica de prueba", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    db_session.refresh(tenant)

    def _user(email, role):
        user = User(
            email=email,
            hashed_password="no-usado-en-estas-pruebas",
            full_name=f"Usuario {role.value}",
            role=role,
            tenant_id=tenant.id,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    doctora = _user("doctora@gems.com", Role.DOCTOR)
    # Dos secretarias: el aviso de "consulta finalizada" va a todas, así que
    # con una sola no se notaría si el reintento duplica los avisos.
    secretarias = [_user("recepcion1@gems.com", Role.SECRETARIA), _user("recepcion2@gems.com", Role.SECRETARIA)]

    paciente = Patient(
        tenant_id=tenant.id,
        first_name="Paola",
        last_name="De Prueba",
        date_of_birth=datetime(1992, 3, 4).date(),
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
        status=AppointmentStatus.EN_SALA,
        notes="Motivo capturado en recepción",
    )
    db_session.add(cita)
    db_session.commit()
    db_session.refresh(cita)

    return {
        "tenant": tenant,
        "doctora": doctora,
        "secretarias": secretarias,
        "paciente": paciente,
        "cita": cita,
    }


def _cuerpo_receta(consulta, medicamentos, indicaciones="TOMAR CON ALIMENTOS"):
    return {
        "appointment_id": consulta["cita"].id,
        "patient_id": consulta["paciente"].id,
        "medications": medicamentos,
        "instructions": indicaciones,
    }


PARACETAMOL = {
    "name": "PARACETAMOL",
    "dosage": "500 MG",
    "frequency": "CADA 8 HORAS",
    "duration": "5 DÍAS",
}
IBUPROFENO = {
    "name": "IBUPROFENO",
    "dosage": "400 MG",
    "frequency": "CADA 12 HORAS",
    "duration": "3 DÍAS",
}


def test_reenviar_la_misma_receta_no_crea_una_segunda(client, db_session, consulta):
    """El caso de producción: guardar y volver a guardar al confirmar la impresión."""
    headers = _auth_headers(db_session, consulta["doctora"])
    cuerpo = _cuerpo_receta(consulta, [PARACETAMOL])

    primera = client.post(f"{PREFIX}/prescriptions", headers=headers, json=cuerpo)
    segunda = client.post(f"{PREFIX}/prescriptions", headers=headers, json=cuerpo)

    assert primera.status_code == 201, primera.text
    assert segunda.status_code == 201, segunda.text
    # Se devuelve la que ya existe: mismo registro y, sobre todo, mismo folio,
    # que es lo que la doctora tiene impreso en la mano.
    assert segunda.json()["id"] == primera.json()["id"]
    assert segunda.json()["folio_number"] == primera.json()["folio_number"]
    assert db_session.query(Prescription).count() == 1


def test_dos_recetas_distintas_en_la_misma_consulta_siguen_emitiendose(client, db_session, consulta):
    """La prueba que protege a la doctora: un tratamiento aparte no es un duplicado.

    Si esta prueba se rompe, la idempotencia se volvió una restricción única
    encubierta y la segunda receta legítima se pierde a media consulta.
    """
    headers = _auth_headers(db_session, consulta["doctora"])

    primera = client.post(
        f"{PREFIX}/prescriptions", headers=headers, json=_cuerpo_receta(consulta, [PARACETAMOL])
    )
    segunda = client.post(
        f"{PREFIX}/prescriptions", headers=headers, json=_cuerpo_receta(consulta, [IBUPROFENO])
    )

    assert primera.status_code == 201, primera.text
    assert segunda.status_code == 201, segunda.text
    assert segunda.json()["id"] != primera.json()["id"]
    assert segunda.json()["folio_number"] != primera.json()["folio_number"]
    assert db_session.query(Prescription).count() == 2


def test_cambiar_solo_las_indicaciones_tambien_es_una_receta_nueva(client, db_session, consulta):
    """Las indicaciones son parte del tratamiento, no un adorno del documento."""
    headers = _auth_headers(db_session, consulta["doctora"])

    primera = client.post(
        f"{PREFIX}/prescriptions",
        headers=headers,
        json=_cuerpo_receta(consulta, [PARACETAMOL], "TOMAR CON ALIMENTOS"),
    )
    segunda = client.post(
        f"{PREFIX}/prescriptions",
        headers=headers,
        json=_cuerpo_receta(consulta, [PARACETAMOL], "SUSPENDER SI HAY SANGRADO"),
    )

    assert segunda.json()["id"] != primera.json()["id"]
    assert db_session.query(Prescription).count() == 2


def test_cambiar_solo_el_motivo_tambien_es_una_receta_nueva(client, db_session, consulta):
    """El motivo se imprime: una receta con él y otra sin él no son el mismo papel.

    Si el motivo no entrara en la huella, reenviar el alta con el motivo
    encendido devolvería la receta anterior —sin motivo— y la pantalla diría
    que sí se guardó. Es justo el "la interfaz dice que sí y el sistema no hizo
    nada" que ya mandó a una doctora a duplicar una receta.
    """
    headers = _auth_headers(db_session, consulta["doctora"])
    sin_motivo = _cuerpo_receta(consulta, [PARACETAMOL])
    con_motivo = {**sin_motivo, "diagnosis": "SANGRADO IRREGULAR"}

    primera = client.post(f"{PREFIX}/prescriptions", headers=headers, json=sin_motivo)
    segunda = client.post(f"{PREFIX}/prescriptions", headers=headers, json=con_motivo)

    assert primera.status_code == 201, primera.text
    assert segunda.status_code == 201, segunda.text
    assert segunda.json()["id"] != primera.json()["id"]
    assert segunda.json()["diagnosis"] == "SANGRADO IRREGULAR"

    # Y reenviar el MISMO con motivo sigue siendo un reenvío, no una tercera.
    tercera = client.post(f"{PREFIX}/prescriptions", headers=headers, json=con_motivo)
    assert tercera.json()["id"] == segunda.json()["id"]
    assert db_session.query(Prescription).count() == 2


def test_apagar_el_motivo_lo_borra_de_la_receta(client, db_session, consulta):
    """Lo que deja de imprimirse tiene que dejar de estar guardado."""
    headers = _auth_headers(db_session, consulta["doctora"])
    creada = client.post(
        f"{PREFIX}/prescriptions",
        headers=headers,
        json={**_cuerpo_receta(consulta, [PARACETAMOL]), "diagnosis": "SANGRADO IRREGULAR"},
    )
    receta_id = creada.json()["id"]

    editada = client.put(
        f"{PREFIX}/prescriptions/{receta_id}",
        headers=headers,
        json={"diagnosis": None},
    )

    assert editada.status_code == 200, editada.text
    assert editada.json()["diagnosis"] is None
    db_session.expire_all()
    assert db_session.query(Prescription).filter(Prescription.id == receta_id).first().diagnosis is None


def test_el_mismo_contenido_con_otro_formato_se_reconoce_como_reenvio(client, db_session, consulta):
    """Mismo tratamiento tecleado igual, serializado distinto, sigue siendo el mismo.

    Espacios de más, mayúsculas y llaves vacías son ruido del formulario y no
    una diferencia clínica: el criterio es el mismo de
    ``scripts/reporte_recetas_duplicadas.py``.
    """
    headers = _auth_headers(db_session, consulta["doctora"])

    primera = client.post(
        f"{PREFIX}/prescriptions", headers=headers, json=_cuerpo_receta(consulta, [PARACETAMOL])
    )
    variante = dict(PARACETAMOL, name="  paracetamol  ", notes="")
    segunda = client.post(
        f"{PREFIX}/prescriptions",
        headers=headers,
        json=_cuerpo_receta(consulta, [variante], "  tomar con alimentos  "),
    )

    assert segunda.json()["id"] == primera.json()["id"]
    assert db_session.query(Prescription).count() == 1


def test_una_receta_vieja_no_bloquea_una_identica_de_hoy(client, db_session, consulta):
    """Fuera de la ventana ya no es un reenvío: es una decisión de la doctora.

    Si la paciente vuelve y necesita exactamente el mismo tratamiento, el
    sistema no puede negárselo porque hace horas emitió uno igual.
    """
    headers = _auth_headers(db_session, consulta["doctora"])
    primera = client.post(
        f"{PREFIX}/prescriptions", headers=headers, json=_cuerpo_receta(consulta, [PARACETAMOL])
    )
    receta = db_session.query(Prescription).filter(Prescription.id == primera.json()["id"]).one()
    receta.created_at = utcnow() - timedelta(hours=3)
    db_session.commit()

    segunda = client.post(
        f"{PREFIX}/prescriptions", headers=headers, json=_cuerpo_receta(consulta, [PARACETAMOL])
    )

    assert segunda.json()["id"] != primera.json()["id"]
    assert db_session.query(Prescription).count() == 2


def _cuerpo_certificado(consulta, dias=3, diagnostico="INFECCIÓN DE VÍAS URINARIAS"):
    return {
        "appointment_id": consulta["cita"].id,
        "patient_id": consulta["paciente"].id,
        "certificate_type": "sick_leave",
        "diagnosis": diagnostico,
        "days_off": dias,
        "notes": "REPOSO RELATIVO",
    }


def test_reenviar_el_mismo_certificado_no_emite_otro_folio(client, db_session, consulta):
    """El certificado tiene el bug gemelo de la receta y se arregla igual."""
    headers = _auth_headers(db_session, consulta["doctora"])
    cuerpo = _cuerpo_certificado(consulta)

    primero = client.post(f"{PREFIX}/medical-certificates", headers=headers, json=cuerpo)
    segundo = client.post(f"{PREFIX}/medical-certificates", headers=headers, json=cuerpo)

    assert primero.status_code == 201, primero.text
    assert segundo.status_code == 201, segundo.text
    assert segundo.json()["id"] == primero.json()["id"]
    assert segundo.json()["folio_number"] == primero.json()["folio_number"]
    assert db_session.query(MedicalCertificate).count() == 1


def test_dos_certificados_distintos_en_la_misma_consulta_siguen_emitiendose(client, db_session, consulta):
    """Cambiar los días de incapacidad es otro documento, no un reenvío."""
    headers = _auth_headers(db_session, consulta["doctora"])

    primero = client.post(
        f"{PREFIX}/medical-certificates", headers=headers, json=_cuerpo_certificado(consulta, dias=3)
    )
    segundo = client.post(
        f"{PREFIX}/medical-certificates", headers=headers, json=_cuerpo_certificado(consulta, dias=7)
    )

    assert segundo.json()["id"] != primero.json()["id"]
    assert segundo.json()["folio_number"] != primero.json()["folio_number"]
    assert db_session.query(MedicalCertificate).count() == 2


def test_si_dos_guardados_se_ganan_el_mismo_folio_el_segundo_toma_el_siguiente(db_session, consulta):
    """A16: el folio se leía y se le sumaba uno, sin nada que impidiera el empate.

    Se simula el empate devolviendo a propósito un folio que ya está ocupado:
    antes eso era un 500 en la cara de la doctora al cerrar la consulta, porque
    ``folio_number`` es único. Ahora el guardado se reintenta con el siguiente
    número. En Postgres además hay un candado por serie que evita llegar aquí;
    el reintento es la red para cuando el candado no aplica.
    """
    from app.services.folio_service import guardar_con_folio

    ocupado = "REC-9-2026-0007"
    db_session.add(
        Prescription(
            tenant_id=consulta["tenant"].id,
            appointment_id=consulta["cita"].id,
            doctor_id=consulta["doctora"].id,
            patient_id=consulta["paciente"].id,
            folio_number=ocupado,
            medications=[PARACETAMOL],
        )
    )
    db_session.commit()

    folios = iter([ocupado, "REC-9-2026-0008"])
    guardada = guardar_con_folio(
        db_session,
        generar_folio=lambda: next(folios),
        construir=lambda folio: Prescription(
            tenant_id=consulta["tenant"].id,
            appointment_id=consulta["cita"].id,
            doctor_id=consulta["doctora"].id,
            patient_id=consulta["paciente"].id,
            folio_number=folio,
            medications=[IBUPROFENO],
        ),
    )

    assert guardada.folio_number == "REC-9-2026-0008"
    assert db_session.query(Prescription).count() == 2


def test_finalizar_dos_veces_no_duplica_la_nota_ni_los_avisos(client, db_session, consulta):
    """A13: dos clics en Finalizar ensuciaban el expediente y saturaban el canal.

    El segundo intento tiene que seguir respondiendo la cita finalizada —el
    cliente que reintenta tras un error de red no puede recibir un fallo por
    algo que sí se hizo—, pero sin repetir los efectos.
    """
    headers = _auth_headers(db_session, consulta["doctora"])
    cuerpo = {"status": "atendida", "notes": "Precio especial acordado"}
    ruta = f"{PREFIX}/appointments/{consulta['cita'].id}/status"

    primera = client.patch(ruta, headers=headers, json=cuerpo)
    segunda = client.patch(ruta, headers=headers, json=cuerpo)

    assert primera.status_code == 200, primera.text
    assert segunda.status_code == 200, segunda.text
    assert segunda.json()["status"] == "atendida"

    db_session.refresh(consulta["cita"])
    assert consulta["cita"].notes.count("Nota del doctor") == 1
    # El motivo que capturó la secretaria se conserva: la nota se anexa.
    assert "Motivo capturado en recepción" in consulta["cita"].notes

    avisos = (
        db_session.query(Notification)
        .filter(Notification.type == "consultation_completed")
        .all()
    )
    assert len(avisos) == len(consulta["secretarias"])
    assert {aviso.user_id for aviso in avisos} == {s.id for s in consulta["secretarias"]}


@pytest.mark.parametrize(
    "generar, prefijo",
    [("generate_prescription_folio", "REC"), ("generate_certificate_folio", "CER")],
)
def test_el_folio_del_31_de_diciembre_por_la_noche_es_del_anio_que_termina(
    db_session, monkeypatch, generar, prefijo
):
    """Las 20:00 del 31 de diciembre en Mazatlán ya son el 1 de enero en UTC.

    Con el año del contenedor, la receta o el certificado de esa noche
    estrenaba la serie del año siguiente: folio ``-2027-0001`` con fecha de
    2026, y la serie de 2027 ya no empezaba en 1.
    """
    import app.services.folio_service as folio_service
    from _reloj import servidor_en_utc

    servidor_en_utc(monkeypatch, datetime(2027, 1, 1, 3, 0), folio_service)

    folio = getattr(folio_service, generar)(db_session, 7)

    # Folio homologado (plan 32); la sucursal 7 no tiene código: ``S7``.
    assert folio == f"S7-{prefijo}-2026-0001"
