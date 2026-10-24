"""Convertir un preregistro en paciente sin fecha de nacimiento (plan 29, lote 5).

El alta exprés de recepción ya la permite vacía; convertir la exigía y
bloqueaba el alta cuando la paciente no la dio por teléfono.

Desde el plan 32 (punto 5) el preregistro salió de la interfaz y convertir ya
no viene en los roles por omisión: el endpoint sigue para quien tenga el
permiso concedido a mano, que es lo que estas pruebas conceden.
"""
from datetime import date

from app.models.patient import Patient
from app.models.permission import Permission
from app.models.patient_preregistration import PatientPreregistration, PreregistrationStatus
from app.models.tenant import Tenant
from app.models.user import Role

from _cobros_base import PREFIX, client, db_session, headers, usuario  # noqa: F401


def _escenario(db):
    tenant = Tenant(name="Consultorio", is_active=True)
    db.add(tenant)
    db.commit()
    recepcion = usuario(db, tenant, "Lupita Recepcion", Role.SECRETARIA)
    db.add(Permission(role="secretaria", action="preregistration.convert", is_granted=True, user_id=recepcion.id))
    entrada = PatientPreregistration(
        tenant_id=tenant.id, full_name="LAURA MÉNDEZ SOTO", phone="6691112233",
        status=PreregistrationStatus.PENDING, created_by_user_id=recepcion.id,
    )
    db.add(entrada)
    db.commit()
    return recepcion, entrada


def test_se_convierte_sin_fecha_de_nacimiento(client, db_session):
    recepcion, entrada = _escenario(db_session)

    r = client.post(f"{PREFIX}/patient-preregistrations/{entrada.id}/convert", headers=headers(db_session, recepcion), json={})

    assert r.status_code == 201, r.text
    paciente = db_session.get(Patient, r.json()["id"])
    assert paciente.date_of_birth is None
    assert paciente.first_name == "LAURA"
    db_session.refresh(entrada)
    assert entrada.status == PreregistrationStatus.CONVERTED


def test_con_fecha_la_guarda(client, db_session):
    recepcion, entrada = _escenario(db_session)

    r = client.post(
        f"{PREFIX}/patient-preregistrations/{entrada.id}/convert",
        headers=headers(db_session, recepcion),
        json={"date_of_birth": "1990-05-20"},
    )

    assert r.status_code == 201, r.text
    assert db_session.get(Patient, r.json()["id"]).date_of_birth == date(1990, 5, 20)


def test_sin_el_permiso_concedido_ya_no_convierte(client, db_session):
    """Recepción por omisión ya no tiene «convertir» (en desuso, plan 32)."""
    tenant = Tenant(name="Otra", is_active=True)
    db_session.add(tenant)
    db_session.commit()
    recepcion = usuario(db_session, tenant, "Recepcion Sin Permiso", Role.SECRETARIA)
    entrada = PatientPreregistration(
        tenant_id=tenant.id, full_name="ROSA LUNA", phone="6690000000",
        status=PreregistrationStatus.PENDING, created_by_user_id=recepcion.id,
    )
    db_session.add(entrada)
    db_session.commit()

    r = client.post(f"{PREFIX}/patient-preregistrations/{entrada.id}/convert", headers=headers(db_session, recepcion), json={})

    assert r.status_code == 403, r.text
