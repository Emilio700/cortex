"""Línea base (Fase 0 del plan 20) — congela el comportamiento vigente de permisos y alcance.

Por qué existe este archivo: las fases siguientes del plan 20 mueven el motor de
permisos y, sobre todo, el **alcance de datos clínicos**. Un error ahí no rompe una
pantalla: expone o esconde el expediente de una paciente. Estas pruebas no describen
el comportamiento *deseado* sino el que hay HOY, para que cualquier cambio posterior
tenga que declararse explícitamente actualizando este archivo en vez de colarse.

Si una de estas pruebas falla, la pregunta correcta no es "¿cómo la arreglo?" sino
"¿quién gana o pierde acceso con este cambio, y está previsto en el plan?".

Se documentan también los defectos conocidos (B3/B4 y B5 del plan maestro) como
pruebas: mientras el defecto siga vivo, la prueba lo deja por escrito.
"""
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

import pytest
import re
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from fastapi import HTTPException

from app.core.clinical_access import (
    apply_doctor_patient_access_filter,
    assert_patient_clinical_access,
    can_manage_patient_care_team,
)
from app.core.deps import get_user_permissions
from app.db.session import Base, utcnow
from app.models.custom_role import CustomRole
from app.models.patient import Patient
from app.models.patient_care_team import CareTeamAccessRole, PatientCareTeamMember
from app.models.permission import ALL_PERMISSIONS, Permission
from app.models.tenant import Tenant
from app.models.user import Role, User


# ---------------------------------------------------------------------------
# Matriz congelada: rol -> permisos efectivos, tal como los resuelve hoy
# ``get_user_permissions`` para un usuario sin overrides.
# ---------------------------------------------------------------------------
# Delta deliberado del plan 32 (punto 3): ``clinical_tracking.follow_up`` para
# admin, secretaria y doctor: registrar por qué un estudio sigue sin resultado.
# Recepción lo registra por decisión de Emilio; no abre nada clínico.
#
# Segundo delta deliberado: ``appointments.create`` para el rol doctor, para que
# pueda agendar la próxima revisión sin salir de la consulta. Se concede junto con
# el guard de ``create_appointment``, que impide agendar en la agenda ajena; el
# permiso solo es seguro acompañado de ese guard.
#
# Delta deliberado sobre la linea base original: ``patients.reassign_owner``
# (B10). Reasignar la dueña del expediente ya estaba permitido a secretaría y
# administración, pero mediante un ``if role in (...)`` dentro del router, que la
# pantalla de Master no podía tocar. El permiso nuevo reproduce exactamente a
# quién alcanzaba ese gate; la doctora sigue sin poder reasignar.
PERMISOS_POR_ROL: dict[str, set[str]] = {
    "admin": {
        "admin.dashboard.read",
        "appointments.cancel",
        "appointments.change_status",
        "appointments.create",
        "appointments.read",
        "appointments.update",
        "audit.read",
        "clinical_consents.read",
        "clinical_episodes.read",
        "clinical_images.read",
        # Por decisión, no por deriva: imprimir o reimprimir la orden de estudio
        # (O-01, decisión 1.3/1.4). Es sólo el papel; no abre el seguimiento
        # (test_orden_estudio_pdf.py).
        "clinical_tracking.print_order",
        # Por decisión, no por deriva: subir el resultado (PDF o foto) a su
        # orden (O-04, decisión 1.3/1.4). No lee indicación ni interpretación
        # (test_resultado_adjunto.py).
        "clinical_tracking.attach_result",
        # Por decisión, no por deriva: marcar la orden como entregada a la
        # paciente en el mostrador (O-09, hueco 05 G6). No cambia el ciclo
        # clínico ni lee la indicación (test_recepcion_ordenes.py).
        "clinical_tracking.deliver_order",
        "clinical_tracking.follow_up",
        "clinical_tracking.read",
        "dashboard.read",
        "doctor_profile.read",
        # Por decisión (plan 29, lote 7): anular o mover un documento subido a la
        # paciente equivocada; nunca borra (test_correccion_documentos.py).
        "documents.correct",
        "documents.delete",
        "documents.read",
        "documents.update",
        "documents.upload",
        "medical_certificates.read",
        "medical_history.read",
        "notifications.read",
        "patients.create",
        "patients.read",
        "patients.reassign_owner",
        "patients.update",
        "payments.cashcut",
        "payments.create",
        "payments.read",
        "payments.send_receipt",
        "prenatal.read",
        "preregistration.read",
        "prescriptions.read",
        "reminders.read",
        "reminders.update",
        "reports.read",
        "schedule.blocks",
        "schedule.blocks.read",
        "schedule.read",
        "schedule.working_hours",
        "services.create",
        "services.delete",
        "services.read",
        "services.update",
        "soap_notes.read",
        "triage.create",
        "triage.read",
        "users.create",
        "users.read",
        "users.update",
    },
    "secretaria": {
        "appointments.cancel",
        "appointments.change_status",
        "appointments.create",
        "appointments.read",
        "appointments.update",
        # Por decisión, no por deriva: imprimir o reimprimir la orden de estudio
        # (O-01, decisión 1.3/1.4). Es sólo el papel; no abre el seguimiento
        # (test_orden_estudio_pdf.py).
        "clinical_tracking.print_order",
        # Por decisión, no por deriva: subir el resultado (PDF o foto) a su
        # orden (O-04, decisión 1.3/1.4). No lee indicación ni interpretación
        # (test_resultado_adjunto.py).
        "clinical_tracking.attach_result",
        # Por decisión, no por deriva: marcar la orden como entregada a la
        # paciente en el mostrador (O-09, hueco 05 G6). No cambia el ciclo
        # clínico ni lee la indicación (test_recepcion_ordenes.py).
        "clinical_tracking.deliver_order",
        "clinical_tracking.follow_up",
        "dashboard.read",
        "documents.read",
        "documents.update",
        "documents.upload",
        "notifications.read",
        "patients.create",
        "patients.read",
        "patients.reassign_owner",
        "patients.update",
        "payments.create",
        "payments.read",
        "payments.send_receipt",
        "preregistration.read",
        "schedule.blocks",
        "schedule.blocks.read",
        "schedule.read",
        "services.read",
        "triage.create",
        "triage.read",
    },
    "doctor": {
        "appointments.change_status",
        "appointments.create",
        "appointments.read",
        "clinical_consents.create",
        "clinical_consents.read",
        "clinical_consents.revoke",
        "clinical_consents.sign",
        "clinical_episodes.create",
        "clinical_episodes.read",
        "clinical_episodes.update",
        "clinical_images.read",
        "clinical_images.update",
        "clinical_images.upload",
        "clinical_tracking.create",
        # Por decisión, no por deriva: imprimir o reimprimir la orden de estudio
        # (O-01, decisión 1.3/1.4). Es sólo el papel; no abre el seguimiento
        # (test_orden_estudio_pdf.py).
        "clinical_tracking.print_order",
        # Por decisión, no por deriva: subir el resultado (PDF o foto) a su
        # orden (O-04, decisión 1.3/1.4). No lee indicación ni interpretación
        # (test_resultado_adjunto.py).
        "clinical_tracking.attach_result",
        # Por decisión, no por deriva: marcar la orden como entregada a la
        # paciente en el mostrador (O-09, hueco 05 G6). No cambia el ciclo
        # clínico ni lee la indicación (test_recepcion_ordenes.py).
        "clinical_tracking.deliver_order",
        "clinical_tracking.follow_up",
        "clinical_tracking.read",
        "clinical_tracking.update",
        "dashboard.read",
        "doctor.appointments.read",
        "doctor.dashboard.read",
        "doctor_profile.read",
        "doctor_profile.update",
        # Por decisión (plan 29, lote 7): anular o mover un documento subido a la
        # paciente equivocada; nunca borra (test_correccion_documentos.py).
        "documents.correct",
        "documents.read",
        # Por decisión (plan 32, punto 6): la doctora sube documentos; antes
        # veía el botón y recibía un 403 (C7).
        "documents.upload",
        "medical_certificates.create",
        "medical_certificates.read",
        "medical_certificates.send_email",
        "medical_history.read",
        "medications.search",
        "notifications.read",
        "patient_care_team.manage",
        "patient_care_team.read",
        "patients.read",
        "patients.update",
        # Por decisión, no por deriva: la doctora cobra y ve su propio corte
        # (plan 23). El alcance la acota al ingreso que es suyo
        # (test_cobros_por_doctora.py).
        "payments.cashcut",
        "payments.create",
        "payments.read",
        "payments.send_receipt",
        "prenatal.create",
        "prenatal.read",
        "prenatal.update",
        "prescriptions.create",
        "prescriptions.read",
        "prescriptions.send_email",
        "reminders.read",
        "reminders.update",
        "schedule.blocks",
        "schedule.blocks.read",
        "schedule.read",
        "schedule.working_hours",
        "services.read",
        "soap_notes.create",
        "soap_notes.read",
        "soap_notes.update",
        # Por decisión, no por deriva: la doctora toma los signos cuando nadie
        # los tomó en la sala de espera (test_triage_desde_consulta.py).
        "triage.create",
        "triage.read",
    },
}


@pytest.fixture
def db():
    """SQLite en memoria, mismo patrón que ``test_appointments_creacion.py``."""
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
def tenant(db):
    t = Tenant(name="Clínica de línea base", is_active=True)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def _crear_usuario(db, tenant, role: Role, email: str | None = None, **extra) -> User:
    user = User(
        email=email or f"{role.value}-{uuid4().hex[:8]}@gems.test",
        hashed_password="no-se-usa",
        full_name=f"Usuario {role.value}",
        role=role,
        tenant_id=tenant.id,
        is_active=True,
        **extra,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ---------------------------------------------------------------------------
# 1. Permisos efectivos por rol
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("role_name", sorted(PERMISOS_POR_ROL))
def test_los_permisos_efectivos_de_cada_rol_son_los_congelados(db, tenant, role_name):
    """Cualquier alta o baja en ROLE_DEFAULT_PERMISSIONS debe declararse aquí.

    Es el único punto del repositorio donde el conjunto exacto queda por escrito;
    sin él, agregar un permiso al rol doctor pasa inadvertido en revisión.
    """
    user = _crear_usuario(db, tenant, Role(role_name))

    assert get_user_permissions(user, db) == PERMISOS_POR_ROL[role_name]


def test_master_recibe_el_catalogo_completo(db, tenant):
    """El bypass de MASTER es una de las tres excepciones documentadas del plan."""
    master = _crear_usuario(db, tenant, Role.MASTER)

    assert get_user_permissions(master, db) == set(ALL_PERMISSIONS.keys())


def test_los_overrides_por_usuario_se_suman_a_los_del_rol(db, tenant):
    """Hoy el override NO reemplaza los defaults, los complementa.

    De esto depende que cambiar un default alcance a todos los usuarios, incluso
    a los que ya tienen permisos materializados.
    """
    doctora = _crear_usuario(db, tenant, Role.DOCTOR)
    # ``reports.read`` y no ``payments.create``: desde el plan 23 la doctora ya
    # cobra por defecto y el override no probaría nada.
    db.add(Permission(role="doctor", action="reports.read", is_granted=True, user_id=doctora.id))
    db.commit()

    efectivos = get_user_permissions(doctora, db)

    assert "reports.read" in efectivos
    assert PERMISOS_POR_ROL["doctor"] <= efectivos


def test_una_denegacion_explicita_le_gana_al_default_del_rol(db, tenant):
    secretaria = _crear_usuario(db, tenant, Role.SECRETARIA)
    db.add(Permission(role="secretaria", action="payments.create", is_granted=False, user_id=secretaria.id))
    db.commit()

    assert "payments.create" not in get_user_permissions(secretaria, db)


def test_la_denegacion_explicita_no_alcanza_a_master(db, tenant):
    """El bypass de MASTER ignora incluso una denegación escrita a mano."""
    master = _crear_usuario(db, tenant, Role.MASTER)
    db.add(Permission(role="master", action="settings.global", is_granted=False, user_id=master.id))
    db.commit()

    assert "settings.global" in get_user_permissions(master, db)


# ---------------------------------------------------------------------------
# 2. Defectos conocidos, congelados como tales (B3/B4 y B5 del plan maestro)
# ---------------------------------------------------------------------------

def test_defecto_conocido_el_perfil_personalizado_no_altera_los_permisos(db, tenant):
    """B3/B4: ``custom_role_id`` se guarda y se ignora al resolver permisos.

    Se deja escrito para que la Fase 1 del plan 20, cuando dé permisos propios a
    los perfiles, tenga que borrar esta prueba a conciencia y no por accidente.
    """
    perfil = CustomRole(tenant_id=tenant.id, name="Recepción médica", base_role="secretaria")
    db.add(perfil)
    db.commit()
    db.refresh(perfil)

    doctora = _crear_usuario(db, tenant, Role.DOCTOR, custom_role_id=perfil.id)

    assert get_user_permissions(doctora, db) == PERMISOS_POR_ROL["doctor"]


def test_defecto_conocido_las_filas_permission_de_nivel_rol_son_codigo_muerto(db, tenant):
    """B5: las filas con ``user_id IS NULL`` que siembra el seed nunca se leen.

    Son la segunda fuente de verdad que el ADR-001 manda eliminar. Mientras
    existan, esta prueba documenta que conceder algo ahí no tiene ningún efecto.
    """
    # ``reports.read`` porque ``payments.cashcut`` ya es del rol doctor (plan 23).
    db.add(Permission(role="doctor", action="reports.read", is_granted=True, user_id=None))
    db.add(Permission(role="doctor", action="soap_notes.create", is_granted=False, user_id=None))
    db.commit()

    doctora = _crear_usuario(db, tenant, Role.DOCTOR)

    efectivos = get_user_permissions(doctora, db)
    assert "reports.read" not in efectivos
    assert "soap_notes.create" in efectivos


# ---------------------------------------------------------------------------
# 3. Contrato del catálogo
# ---------------------------------------------------------------------------

def test_todo_permiso_exigido_por_un_router_existe_en_el_catalogo():
    """Un ``require_permission("typo")`` es un 403 permanente que nadie detecta.

    La verificación es estática a propósito: no depende de que exista una prueba
    de integración por endpoint.
    """
    routers = Path(__file__).resolve().parents[1] / "app" / "routers"
    exigidos: dict[str, str] = {}
    for archivo in routers.glob("*.py"):
        for accion in re.findall(r'require_permission\(\s*["\']([^"\']+)["\']', archivo.read_text(encoding="utf-8")):
            exigidos.setdefault(accion, archivo.name)

    desconocidos = {a: f for a, f in exigidos.items() if a not in ALL_PERMISSIONS}
    assert desconocidos == {}, f"Permisos exigidos que no están en ALL_PERMISSIONS: {desconocidos}"


def test_todo_permiso_por_defecto_existe_en_el_catalogo():
    for role_name, acciones in PERMISOS_POR_ROL.items():
        fuera = acciones - set(ALL_PERMISSIONS)
        assert fuera == set(), f"El rol {role_name} trae permisos fuera del catálogo: {fuera}"


# ---------------------------------------------------------------------------
# 4. Alcance de datos clínicos (B6) — lo más delicado del plan
# ---------------------------------------------------------------------------

@pytest.fixture
def escenario_clinico(db, tenant):
    """Dos doctoras del mismo consultorio, cada una con su paciente."""
    dra_a = _crear_usuario(db, tenant, Role.DOCTOR, email="dra.a@gems.test")
    dra_b = _crear_usuario(db, tenant, Role.DOCTOR, email="dra.b@gems.test")
    secretaria = _crear_usuario(db, tenant, Role.SECRETARIA)
    admin = _crear_usuario(db, tenant, Role.ADMIN)

    def _paciente(nombre, owner):
        p = Patient(
            tenant_id=tenant.id,
            first_name=nombre,
            last_name="Apellido",
            owner_doctor_id=owner.id,
        )
        db.add(p)
        db.commit()
        db.refresh(p)
        return p

    return {
        "dra_a": dra_a,
        "dra_b": dra_b,
        "secretaria": secretaria,
        "admin": admin,
        "paciente_a": _paciente("PacienteDeA", dra_a),
        "paciente_b": _paciente("PacienteDeB", dra_b),
    }


def test_el_listado_de_pacientes_de_una_doctora_excluye_las_de_su_colega(db, escenario_clinico):
    query = apply_doctor_patient_access_filter(db.query(Patient), escenario_clinico["dra_a"])

    assert [p.id for p in query.all()] == [escenario_clinico["paciente_a"].id]


def test_el_filtro_de_pacientes_no_acota_a_secretaria_ni_a_admin(db, escenario_clinico):
    """Hoy el alcance operativo de recepción es toda la clínica; se congela así.

    La Fase 2 del plan 20 lo vuelve configurable; hasta entonces debe seguir igual
    o la agenda deja de funcionar.
    """
    for quien in ("secretaria", "admin"):
        query = apply_doctor_patient_access_filter(db.query(Patient), escenario_clinico[quien])
        assert len(query.all()) == 2, f"{quien} dejó de ver a todas las pacientes"


def test_la_doctora_dueña_entra_al_expediente(db, escenario_clinico):
    acceso = assert_patient_clinical_access(
        db, escenario_clinico["paciente_a"].id, escenario_clinico["dra_a"]
    )

    assert acceso.relation == "owner"


def test_una_doctora_no_entra_al_expediente_de_la_paciente_de_su_colega(db, escenario_clinico):
    with pytest.raises(HTTPException) as exc:
        assert_patient_clinical_access(
            db, escenario_clinico["paciente_b"].id, escenario_clinico["dra_a"]
        )

    assert exc.value.status_code == 403


def test_una_membresia_de_equipo_tratante_no_le_abre_el_expediente_a_otra_doctora(
    db, escenario_clinico
):
    """Cambio declarado: la cobertura clínica entre doctoras quedó cerrada.

    Esta prueba decía lo contrario hasta el 2026-09-24. Se actualiza porque el
    acceso cambió a propósito —Emilio lo pidió— y no porque estorbara: quien
    pierde acceso es una doctora sobre la paciente de una colega, y lo hace por
    la vía del equipo tratante. La membresía sigue existiendo en la base; lo que
    ya no hace es abrir el expediente.
    """
    db.add(
        PatientCareTeamMember(
            tenant_id=escenario_clinico["paciente_b"].tenant_id,
            patient_id=escenario_clinico["paciente_b"].id,
            user_id=escenario_clinico["dra_a"].id,
            access_role=CareTeamAccessRole.COLLABORATOR,
            granted_by_user_id=escenario_clinico["dra_b"].id,
            starts_at=utcnow() - timedelta(hours=1),
        )
    )
    db.commit()

    with pytest.raises(HTTPException) as exc:
        assert_patient_clinical_access(
            db, escenario_clinico["paciente_b"].id, escenario_clinico["dra_a"]
        )

    assert exc.value.status_code == 403


def test_una_membresia_activa_abre_el_expediente_a_una_cuenta_de_apoyo(db, escenario_clinico):
    """El equipo tratante conserva su diseño original: apoyo, no cobertura clínica.

    Sin esta prueba, cerrar la puerta a doctoras se vería idéntico a haber
    apagado el equipo tratante entero, que es lo que NO se decidió.
    """
    db.add(
        PatientCareTeamMember(
            tenant_id=escenario_clinico["paciente_a"].tenant_id,
            patient_id=escenario_clinico["paciente_a"].id,
            user_id=escenario_clinico["secretaria"].id,
            access_role=CareTeamAccessRole.ASSISTANT,
            granted_by_user_id=escenario_clinico["dra_a"].id,
            starts_at=utcnow() - timedelta(hours=1),
        )
    )
    db.commit()

    acceso = assert_patient_clinical_access(
        db, escenario_clinico["paciente_a"].id, escenario_clinico["secretaria"]
    )

    assert acceso.relation == CareTeamAccessRole.ASSISTANT.value


def test_una_membresia_vencida_deja_de_abrir_el_expediente(db, escenario_clinico):
    """El acceso temporal caduca solo; nadie tiene que acordarse de revocarlo.

    Se cambia la integrante de doctora a recepción por la misma razón: con una
    doctora la prueba seguiría pasando en verde aunque el vencimiento dejara de
    respetarse, porque el 403 ya lo produce el cierre de la cobertura.
    """
    db.add(
        PatientCareTeamMember(
            tenant_id=escenario_clinico["paciente_a"].tenant_id,
            patient_id=escenario_clinico["paciente_a"].id,
            user_id=escenario_clinico["secretaria"].id,
            access_role=CareTeamAccessRole.TEMPORARY,
            granted_by_user_id=escenario_clinico["dra_a"].id,
            starts_at=utcnow() - timedelta(days=3),
            expires_at=utcnow() - timedelta(hours=1),
        )
    )
    db.commit()

    with pytest.raises(HTTPException) as exc:
        assert_patient_clinical_access(
            db, escenario_clinico["paciente_a"].id, escenario_clinico["secretaria"]
        )

    assert exc.value.status_code == 403


def test_el_listado_de_una_doctora_tampoco_incluye_a_la_paciente_que_cubria(
    db, escenario_clinico
):
    """El buscador y el expediente tienen que decir lo mismo.

    Si la lista siguiera mostrando a la paciente cubierta, la doctora la
    encontraría por nombre y recibiría un 403 al abrirla: enterarse de que
    existe ya es información que no le toca.
    """
    db.add(
        PatientCareTeamMember(
            tenant_id=escenario_clinico["paciente_b"].tenant_id,
            patient_id=escenario_clinico["paciente_b"].id,
            user_id=escenario_clinico["dra_a"].id,
            access_role=CareTeamAccessRole.COLLABORATOR,
            granted_by_user_id=escenario_clinico["dra_b"].id,
            starts_at=utcnow() - timedelta(hours=1),
        )
    )
    db.commit()

    query = apply_doctor_patient_access_filter(db.query(Patient), escenario_clinico["dra_a"])

    assert [p.id for p in query.all()] == [escenario_clinico["paciente_a"].id]


def test_la_secretaria_no_tiene_relacion_asistencial_con_ninguna_paciente(db, escenario_clinico):
    """Ver la agenda no es ver el expediente: son dos dominios distintos."""
    with pytest.raises(HTTPException) as exc:
        assert_patient_clinical_access(
            db, escenario_clinico["paciente_a"].id, escenario_clinico["secretaria"]
        )

    assert exc.value.status_code == 403


def test_master_conserva_su_acceso_supervisorio(db, tenant, escenario_clinico):
    master = _crear_usuario(db, tenant, Role.MASTER)

    acceso = assert_patient_clinical_access(db, escenario_clinico["paciente_a"].id, master)

    assert acceso.relation == "master"


def test_solo_la_dueña_del_expediente_administra_el_equipo_tratante(escenario_clinico):
    paciente = escenario_clinico["paciente_a"]

    assert can_manage_patient_care_team(paciente, escenario_clinico["dra_a"]) is True
    assert can_manage_patient_care_team(paciente, escenario_clinico["dra_b"]) is False
    assert can_manage_patient_care_team(paciente, escenario_clinico["admin"]) is False
    assert can_manage_patient_care_team(paciente, escenario_clinico["secretaria"]) is False
