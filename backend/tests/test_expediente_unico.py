"""El expediente único: el servidor decide qué ve cada rol (plan 32, punto 6)."""
from datetime import date, datetime, timedelta

from app.core.hora_local import ahora_local
from app.models.acceso_clinico import AccesoClinico
from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.models.clinical_consent import ClinicalConsent
from app.models.clinical_tracking import DiagnosticResult
from app.models.pregnancy import Pregnancy

from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    _orden,
    client,
    db_session,
    escenario,
)


def _get(client, db, quien, ruta):
    return client.get(f"{PREFIX}/patients/{ruta}", headers=_auth_headers(db, quien))


def _cita(db, e, cuando, estado=AppointmentStatus.AGENDADA, notas=None):
    c = Appointment(tenant_id=e["tenant"].id, patient_id=e["paciente"].id, doctor_id=e["doctora"].id,
                    scheduled_at=cuando, duration_minutes=30, appointment_type=AppointmentType.CONSULTA,
                    status=estado, notes=notas)
    db.add(c)
    db.commit()
    return c


def test_la_doctora_ve_todas_las_pestanas_y_lo_clinico(client, db_session, escenario):
    e = escenario
    e["paciente"].allergies = "Penicilina"
    db_session.add(Pregnancy(tenant_id=e["tenant"].id, patient_id=e["paciente"].id, doctor_id=e["doctora"].id,
                             status="active", last_menstrual_period=date.today() - timedelta(weeks=20)))
    db_session.commit()
    hoy = _cita(db_session, e, ahora_local().replace(hour=23, minute=0, second=0, microsecond=0))
    cuerpo = _get(client, db_session, e["doctora"], f"{e['paciente'].id}/expediente").json()

    assert cuerpo["vista_clinica"] is True
    assert {"resumen", "consultas", "estudios", "documentos", "imagenes", "embarazo", "consentimientos"} <= set(cuerpo["pestanas"])
    assert cuerpo["allergies"] == "Penicilina"
    assert cuerpo["embarazo"]["semanas"] in (19, 20, 21)
    assert cuerpo["alertas"] is not None
    assert cuerpo["cita_de_hoy"]["id"] == hoy.id
    assert db_session.query(AccesoClinico).filter_by(user_id=e["doctora"].id, seccion="resumen_clinico").count() == 1


def test_recepcion_ve_la_vista_recortada_sin_nada_clinico(client, db_session, escenario):
    e = escenario
    e["paciente"].allergies = "Penicilina"
    db_session.commit()
    cuerpo = _get(client, db_session, e["secretaria"], f"{e['paciente'].id}/expediente").json()

    assert cuerpo["vista_clinica"] is False
    assert "embarazo" not in cuerpo["pestanas"] and "equipo" not in cuerpo["pestanas"]
    assert {"resumen", "consultas", "estudios", "documentos", "consentimientos"} <= set(cuerpo["pestanas"])
    # Alergias sí (dato de seguridad, opción C); embarazo, alertas y la cita de hoy no.
    assert cuerpo["allergies"] == "Penicilina"
    assert cuerpo["embarazo"] is None and cuerpo["alertas"] is None and cuerpo["cita_de_hoy"] is None
    # El resumen clínico se le niega en el servidor.
    assert _get(client, db_session, e["secretaria"], f"{e['paciente'].id}/expediente/resumen").status_code == 403
    assert db_session.query(AccesoClinico).filter_by(user_id=e["secretaria"].id).count() == 0


def test_otra_sucursal_no_abre_el_expediente(client, db_session, escenario):
    e = escenario
    assert _get(client, db_session, e["secretaria_ajena"], f"{e['paciente'].id}/expediente").status_code == 404


def test_el_resumen_es_la_fotografia_clinica_actual(client, db_session, escenario):
    e = escenario
    _cita(db_session, e, ahora_local() - timedelta(days=10), AppointmentStatus.ATENDIDA, "Control prenatal")
    proxima = _cita(db_session, e, ahora_local() + timedelta(days=5))
    orden = _orden(db_session, e["tenant"], e["paciente"], e["doctora"], study_name="Urocultivo")
    db_session.add(DiagnosticResult(tenant_id=orden.tenant_id, diagnostic_order_id=orden.id,
                                    recorded_by_user_id=e["doctora"].id, review_status="reviewed", valoracion="bien"))
    orden.status = "reviewed"
    db_session.commit()

    cuerpo = _get(client, db_session, e["doctora"], f"{e['paciente'].id}/expediente/resumen").json()
    assert cuerpo["ultima_consulta"]["motivo"] == "Control prenatal"
    assert cuerpo["proxima_cita"]["id"] == proxima.id
    assert cuerpo["resultados_recientes"][0]["study_name"] == "Urocultivo"
    assert cuerpo["resultados_recientes"][0]["valoracion"] == "bien"


def test_recepcion_ve_si_hay_consentimientos_firmados_sin_su_contenido(client, db_session, escenario):
    e = escenario
    for estado in ("draft", "signed"):
        db_session.add(ClinicalConsent(
            tenant_id=e["tenant"].id, patient_id=e["paciente"].id, doctor_id=e["doctora"].id,
            created_by_user_id=e["doctora"].id, consent_type="procedure", template_version="1", status=estado,
            title=f"Consentimiento {estado}", rendered_body="Texto clínico", field_values={}, acknowledgements=[],
            patient_signed_at=datetime(2026, 10, 1, 10) if estado == "signed" else None,
        ))
    db_session.commit()
    lista = _get(client, db_session, e["secretaria"], f"{e['paciente'].id}/expediente/consentimientos").json()
    assert len(lista) == 1 and lista[0]["firmado"] is True
    assert "rendered_body" not in lista[0]
