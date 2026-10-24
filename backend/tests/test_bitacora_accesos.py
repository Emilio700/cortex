"""Bitácora de accesos a información clínica (plan 32, punto 7; NOM-024).

Lo que tiene que cumplir:
- abrir una sección clínica deja quién, de qué paciente, qué sección y cuándo;
- agrupado por sesión: abrir lo mismo diez veces es una fila con ``veces=10``;
- una lectura negada no es un acceso;
- solo admin (``audit.read``) lo consulta, y solo de su sucursal.
"""
import pytest

from app.models.acceso_clinico import AccesoClinico, SeccionClinica
from app.models.soap_note import SOAPNote
from app.models.tenant import Tenant
from app.models.user import Role

from _cobros_base import PREFIX, cita, client, db_session, headers, paciente, usuario  # noqa: F401


@pytest.fixture
def e(db_session):
    centro, otra = Tenant(name="Centro", is_active=True), Tenant(name="Otra", is_active=True)
    db_session.add_all([centro, otra])
    db_session.commit()
    doctora = usuario(db_session, centro, "Cintia", Role.DOCTOR)
    ajena = usuario(db_session, centro, "Lorena", Role.DOCTOR)
    recepcion = usuario(db_session, centro, "Lupita", Role.SECRETARIA)
    admin = usuario(db_session, centro, "Admin", Role.ADMIN)
    admin_otra = usuario(db_session, otra, "Admin Otra", Role.ADMIN)
    ana = paciente(db_session, centro, doctora, "Ana")
    c = cita(db_session, centro, ana, doctora)
    db_session.add(SOAPNote(tenant_id=centro.id, appointment_id=c.id, doctor_id=doctora.id,
                            subjective="s", objective="o", assessment="a", plan="p"))
    db_session.commit()
    return {"doctora": doctora, "ajena": ajena, "recepcion": recepcion, "admin": admin,
            "admin_otra": admin_otra, "ana": ana}


def _accesos(db):
    db.expire_all()
    return db.query(AccesoClinico).all()


def test_abrir_las_notas_deja_quien_que_y_de_quien(client, db_session, e):
    r = client.get(f"{PREFIX}/soap-notes/patient/{e['ana'].id}/all", headers=headers(db_session, e["doctora"]))
    assert r.status_code == 200, r.text
    [acceso] = _accesos(db_session)
    assert (acceso.user_id, acceso.patient_id, acceso.seccion, acceso.veces) == (
        e["doctora"].id, e["ana"].id, SeccionClinica.CONSULTAS, 1)


def test_la_misma_sesion_suma_y_otra_sesion_es_otra_fila(client, db_session, e):
    h = headers(db_session, e["doctora"])
    for _ in range(3):
        client.get(f"{PREFIX}/soap-notes/patient/{e['ana'].id}/all", headers=h)
    client.get(f"{PREFIX}/prescriptions/patient/{e['ana'].id}/all", headers=h)
    filas = _accesos(db_session)
    assert sorted((f.seccion, f.veces) for f in filas) == [(SeccionClinica.CONSULTAS, 3), (SeccionClinica.RECETAS, 1)]
    client.get(f"{PREFIX}/soap-notes/patient/{e['ana'].id}/all", headers=headers(db_session, e["doctora"]))
    assert len(_accesos(db_session)) == 3


def test_una_lectura_negada_no_es_un_acceso(client, db_session, e):
    r = client.get(f"{PREFIX}/soap-notes/patient/{e['ana'].id}/all", headers=headers(db_session, e["ajena"]))
    assert r.status_code in (403, 404)
    r = client.get(f"{PREFIX}/soap-notes/patient/{e['ana'].id}/all", headers=headers(db_session, e["recepcion"]))
    assert r.status_code == 403
    assert _accesos(db_session) == []


def test_el_historial_solo_cuenta_si_entrego_algo_clinico(client, db_session, e):
    client.get(f"{PREFIX}/patients/{e['ana'].id}/history", headers=headers(db_session, e["recepcion"]))
    assert _accesos(db_session) == []
    client.get(f"{PREFIX}/patients/{e['ana'].id}/history", headers=headers(db_session, e["doctora"]))
    assert [a.seccion for a in _accesos(db_session)] == [SeccionClinica.CONSULTAS]


def test_admin_lo_ve_agrupado_por_sesion_y_solo_de_su_sucursal(client, db_session, e):
    h = headers(db_session, e["doctora"])
    client.get(f"{PREFIX}/soap-notes/patient/{e['ana'].id}/all", headers=h)
    client.get(f"{PREFIX}/prescriptions/patient/{e['ana'].id}/all", headers=h)

    r = client.get(f"{PREFIX}/audit-logs/accesos", headers=headers(db_session, e["admin"]))
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["total"] == 1
    [visita] = cuerpo["items"]
    assert visita["user_name"] == "Cintia" and visita["patient_name"] == "Ana De Prueba"
    assert sorted(s["seccion"] for s in visita["secciones"]) == ["consultas", "recetas"]

    otra = client.get(f"{PREFIX}/audit-logs/accesos", headers=headers(db_session, e["admin_otra"])).json()
    assert otra["total"] == 0
    filtrada = client.get(f"{PREFIX}/audit-logs/accesos", params={"actor_user_id": e["admin"].id},
                          headers=headers(db_session, e["admin"])).json()
    assert filtrada["total"] == 0


def test_solo_quien_tiene_audit_read_consulta_la_bitacora_de_accesos(client, db_session, e):
    for quien in ("doctora", "recepcion"):
        assert client.get(f"{PREFIX}/audit-logs/accesos", headers=headers(db_session, e[quien])).status_code == 403
