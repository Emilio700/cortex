"""Resumen clínico en PDF (plan 32, punto 8).

Contenido por sección y «Sin registro» donde falta; vista previa obligatoria;
solo el médico con relación asistencial; folio RES y bitácora; fechas en hora
de Mazatlán; acentos en el papel.
"""
from datetime import date, datetime

import pytest

from app.core.hora_local import hoy_local
from app.models.acceso_clinico import AccesoClinico
from app.models.appointment import AppointmentStatus
from app.models.audit_log import AuditLog
from app.models.clinical_episode import ClinicalEpisode
from app.models.clinical_tracking import DiagnosticOrder, DiagnosticResult
from app.models.folio_emitido import FolioEmitido
from app.models.soap_note import SOAPNote
from app.models.tenant import Tenant
from app.models.triage import Triage
from app.models.user import Role

from _cobros_base import PREFIX, cita, client, db_session, headers, paciente, usuario  # noqa: F401
from test_orden_estudio_pdf import _pdf_sin_comprimir, _texto_del_pdf  # noqa: F401 (fixture)

TODAS = ["alergias", "antecedentes", "diagnosticos", "embarazo", "consultas", "estudios", "medicacion"]


@pytest.fixture
def e(db_session):
    gyg = Tenant(name="Ginecología y Obstetricia", is_active=True, codigo_folio="GYG")
    db_session.add(gyg)
    db_session.commit()
    doctora = usuario(db_session, gyg, "Cintia", Role.DOCTOR)
    ajena = usuario(db_session, gyg, "Lorena", Role.DOCTOR)
    recepcion = usuario(db_session, gyg, "Lupita", Role.SECRETARIA)
    admin = usuario(db_session, gyg, "Admin", Role.ADMIN)
    ana = paciente(db_session, gyg, doctora, "Ana")
    ana.allergies = "Penicilina"
    ana.personal_history = "Hipotiroidismo"
    for n, cuando in enumerate([datetime(2026, 9, 1, 17), datetime(2026, 9, 15, 17), datetime(2026, 10, 1, 17)]):
        c = cita(db_session, gyg, ana, doctora, estado=AppointmentStatus.ATENDIDA, cuando=cuando)
        db_session.add(SOAPNote(tenant_id=gyg.id, appointment_id=c.id, doctor_id=doctora.id,
                                subjective="s", objective="o", assessment=f"Diagnóstico {n}", plan=f"Plan {n}"))
        db_session.add(Triage(appointment_id=c.id, created_by_user_id=recepcion.id, chief_complaint=f"Motivo {n}"))
    db_session.add(ClinicalEpisode(tenant_id=gyg.id, patient_id=ana.id, created_by_user_id=doctora.id,
                                   episode_type="ginecologico", status="active", title="Endometriosis",
                                   summary="En control", started_on=date(2026, 3, 1)))
    orden = DiagnosticOrder(tenant_id=gyg.id, patient_id=ana.id, doctor_id=doctora.id, category="laboratorio",
                            study_name="Biometría hemática", clinical_indication="Control",
                            requested_on=date(2026, 9, 1), status="reviewed")
    db_session.add(orden)
    db_session.commit()
    db_session.add(DiagnosticResult(tenant_id=gyg.id, diagnostic_order_id=orden.id, recorded_by_user_id=doctora.id,
                                    resulted_on=date(2026, 9, 5), valoracion="regular",
                                    clinician_interpretation="Anemia leve"))
    db_session.commit()
    return {"gyg": gyg, "doctora": doctora, "ajena": ajena, "recepcion": recepcion, "admin": admin, "ana": ana}


def _vista_previa(client, db, user, pac, secciones=TODAS, consultas=3):
    return client.post(f"{PREFIX}/patients/{pac.id}/resumen-clinico/vista-previa", headers=headers(db, user),
                       json={"secciones": secciones, "consultas": consultas})


def _emitir(client, db, user, pac, token, secciones=TODAS, consultas=3):
    return client.post(f"{PREFIX}/patients/{pac.id}/resumen-clinico", headers=headers(db, user),
                       json={"secciones": secciones, "consultas": consultas, "vista_previa": token})


def test_la_vista_previa_no_emite_folio_y_dice_que_es_vista_previa(client, db_session, e):
    r = _vista_previa(client, db_session, e["doctora"], e["ana"])
    assert r.status_code == 200, r.text
    assert r.headers["x-vista-previa"]
    texto = _texto_del_pdf(r.content)
    assert "VISTA PREVIA" in texto and "RESUMEN CLÍNICO" in texto
    assert db_session.query(FolioEmitido).count() == 0


def test_contenido_por_seccion_y_sin_registro_donde_falta(client, db_session, e):
    texto = _texto_del_pdf(_vista_previa(client, db_session, e["doctora"], e["ana"], consultas=2).content)
    for esperado in ("Penicilina", "Hipotiroidismo", "Endometriosis", "Biometría hemática", "Anemia leve",
                     "Regular", "Diagnóstico 2", "Motivo 1", "Últimas consultas".upper(), "Neurológicos"):
        assert esperado in texto, esperado
    # La consulta más vieja no entra con 2; los familiares nadie los capturó.
    assert "Diagnóstico 0" not in texto
    assert "Familiares:" in texto and "Sin registro" in texto
    assert "Sin embarazo activo registrado" in texto


def test_solo_salen_las_secciones_elegidas(client, db_session, e):
    texto = _texto_del_pdf(_vista_previa(client, db_session, e["doctora"], e["ana"], secciones=["alergias"]).content)
    assert "Penicilina" in texto
    assert "Endometriosis" not in texto and "Biometría" not in texto
    assert "Ana De Prueba" in texto  # los datos del paciente van siempre


def test_emitir_exige_la_vista_previa_con_las_mismas_secciones(client, db_session, e):
    token = _vista_previa(client, db_session, e["doctora"], e["ana"], secciones=["alergias"]).headers["x-vista-previa"]
    assert _emitir(client, db_session, e["doctora"], e["ana"], "1.inventada-xxxxxxxx").status_code == 409
    assert _emitir(client, db_session, e["doctora"], e["ana"], token).status_code == 409
    assert db_session.query(FolioEmitido).count() == 0


def test_la_vista_previa_vieja_ya_no_sirve(client, db_session, e, monkeypatch):
    token = _vista_previa(client, db_session, e["doctora"], e["ana"]).headers["x-vista-previa"]
    import app.routers.resumen_clinico as modulo

    real = modulo.time.time
    monkeypatch.setattr(modulo.time, "time", lambda: real() + 31 * 60)
    r = _emitir(client, db_session, e["doctora"], e["ana"], token)
    assert r.status_code == 409 and "30 minutos" in r.json()["detail"]


def test_emitir_da_folio_res_bitacora_y_acceso(client, db_session, e):
    token = _vista_previa(client, db_session, e["doctora"], e["ana"]).headers["x-vista-previa"]
    r = _emitir(client, db_session, e["doctora"], e["ana"], token)
    assert r.status_code == 200, r.text
    folio = f"GYG-RES-{hoy_local().year}-0001"
    assert r.headers["x-folio"] == folio
    texto = _texto_del_pdf(r.content)
    assert f"FOLIO: {folio}" in texto and "VISTA PREVIA" not in texto
    fila = db_session.query(FolioEmitido).one()
    assert (fila.tipo, fila.patient_id, fila.emitted_by_user_id) == ("RES", e["ana"].id, e["doctora"].id)
    registro = db_session.query(AuditLog).filter(AuditLog.action == "clinical_summary.issued").one()
    assert registro.details["folio"] == folio and registro.details["secciones"] == TODAS
    assert registro.actor_user_id == e["doctora"].id and registro.patient_id == e["ana"].id
    # Cada llamada de la prueba abre su propia sesión: una fila por sesión.
    assert db_session.query(AccesoClinico).filter(AccesoClinico.seccion == "resumen_clinico",
                                                  AccesoClinico.user_id == e["doctora"].id).count() == 2


@pytest.mark.parametrize("quien,codigo", [("recepcion", 403), ("admin", 403), ("ajena", 404)])
def test_solo_la_doctora_de_la_paciente_lo_genera(client, db_session, e, quien, codigo):
    r = _vista_previa(client, db_session, e[quien], e["ana"])
    assert r.status_code in ((403, 404) if codigo == 404 else (codigo,)), r.text


def test_la_hora_de_emision_es_la_de_mazatlan(client, db_session, e, monkeypatch):
    from _reloj import servidor_en_utc

    import app.utils.pdf as pdf_mod
    import app.utils.resumen_pdf as resumen_mod

    # 03:00 del 1 de enero en UTC = 20:00 del 31 de diciembre en Mazatlán.
    servidor_en_utc(monkeypatch, datetime(2027, 1, 1, 3, 0), pdf_mod, resumen_mod)
    texto = _texto_del_pdf(_vista_previa(client, db_session, e["doctora"], e["ana"], secciones=["alergias"]).content)
    assert "Emitido: 31/12/2026 20:00 (hora de Mazatlán)" in texto


def test_seccion_desconocida_es_422(client, db_session, e):
    assert _vista_previa(client, db_session, e["doctora"], e["ana"], secciones=["inventada"]).status_code == 422


def test_la_medicacion_se_titula_ultima_receta_y_no_vigente(client, db_session, e):
    """GEMS no sabe cuándo termina un tratamiento: no afirma que esté vigente."""
    texto = _texto_del_pdf(_vista_previa(client, db_session, e["doctora"], e["ana"], secciones=["medicacion"]).content)
    assert "ÚLTIMA RECETA" in texto
    assert "VIGENTE" not in texto.upper().replace("SIN VALIDEZ", "")
