"""La bitácora trae el nombre del paciente, solo de la propia sucursal (plan 29, lote 5)."""
from app.models.audit_log import AuditLog
from app.models.tenant import Tenant
from app.models.user import Role

from _cobros_base import PREFIX, client, db_session, headers, paciente, usuario  # noqa: F401


def test_trae_el_nombre_de_la_paciente_de_su_sucursal(client, db_session):
    centro = Tenant(name="Centro", is_active=True)
    otra = Tenant(name="Otra", is_active=True)
    db_session.add_all([centro, otra])
    db_session.commit()
    admin = usuario(db_session, centro, "Admin Centro", Role.ADMIN)
    doctora = usuario(db_session, centro, "Cintia", Role.DOCTOR)
    ana = paciente(db_session, centro, doctora, "Ana")
    ajena = paciente(db_session, otra, doctora, "Berta")
    db_session.add_all([
        AuditLog(tenant_id=centro.id, actor_user_id=doctora.id, action="soap_note.created", entity_type="soap_note", patient_id=ana.id),
        # Un evento de la sucursal con un paciente de otra: no se revela el nombre.
        AuditLog(tenant_id=centro.id, actor_user_id=doctora.id, action="patient.updated", entity_type="patient", patient_id=ajena.id),
    ])
    db_session.commit()

    r = client.get(f"{PREFIX}/audit-logs", headers=headers(db_session, admin))

    assert r.status_code == 200, r.text
    nombres = {i["patient_id"]: i["patient_name"] for i in r.json()["items"]}
    assert nombres[ana.id] == "Ana De Prueba"
    assert nombres[ajena.id] is None
