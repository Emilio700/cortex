"""Paginated administrative audit viewer."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user, get_db, require_permission
from app.core.hora_local import local_a_utc
from app.models.acceso_clinico import AccesoClinico
from app.models.audit_log import AuditLog
from app.models.folio_emitido import FolioEmitido, TipoDeFolio
from app.models.medical_certificate import MedicalCertificate
from app.models.patient import Patient
from app.models.prescription import Prescription
from app.models.user import Role, User
from app.schemas.audit_log import (
    AccesoSeccion,
    AccesoSesionItem,
    AccesoSesionPage,
    AuditLogItem,
    AuditLogPage,
    FolioItem,
    FolioPage,
)

router = APIRouter(prefix="/audit-logs", tags=["Audit logs"])


def _nombre_de_paciente(row: AuditLog, user: User) -> str | None:
    """El nombre de la paciente del evento, solo si es de la sucursal de quien lee.

    La bitácora ya está acotada a la sucursal; esto lo asegura también para el
    nombre por si un evento quedó con una paciente de otra sucursal.
    """
    paciente = row.patient
    if paciente is None:
        return None
    if user.role != Role.MASTER and paciente.tenant_id != user.tenant_id:
        return None
    return f"{paciente.first_name} {paciente.last_name}".strip() or None


# Por permiso y no por rol: la pantalla de Master ofrece conceder audit.read, y
# con require_role concederlo no abria nada. Admin lo trae por defecto y Master
# pasa siempre, asi que nadie que ya entraba se queda fuera.
@router.get("", response_model=AuditLogPage, dependencies=[Depends(require_permission("audit.read"))])
def list_audit_logs(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    action: str | None = Query(None, max_length=100),
    outcome: str | None = Query(None, max_length=20),
    actor_user_id: int | None = Query(None, ge=1),
    patient_id: int | None = Query(None, ge=1),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    query = db.query(AuditLog).options(joinedload(AuditLog.actor), joinedload(AuditLog.patient))
    if current_user.role != Role.MASTER:
        query = query.filter(AuditLog.tenant_id == current_user.tenant_id)
    if action:
        query = query.filter(AuditLog.action.ilike(f"%{action}%"))
    if outcome:
        query = query.filter(AuditLog.outcome == outcome)
    if actor_user_id:
        query = query.filter(AuditLog.actor_user_id == actor_user_id)
    if patient_id:
        query = query.filter(AuditLog.patient_id == patient_id)
    # ``created_at`` se guarda en UTC y quien filtra piensa en el día del
    # consultorio: sin traducir, pedir "el 3" dejaba fuera lo de esa noche
    # desde las 17:00 y metía lo de la noche anterior. Una fecha con zona se
    # respeta tal cual (``local_a_utc``), igual que en la lista de cobros.
    if date_from:
        query = query.filter(AuditLog.created_at >= local_a_utc(date_from))
    if date_to:
        query = query.filter(AuditLog.created_at <= local_a_utc(date_to))

    total = query.count()
    rows = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset(skip).limit(limit).all()
    items = [
        AuditLogItem(
            id=row.id,
            actor_user_id=row.actor_user_id,
            actor_name=row.actor.full_name if row.actor else None,
            action=row.action,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            patient_id=row.patient_id,
            patient_name=_nombre_de_paciente(row, current_user),
            outcome=row.outcome,
            ip_anonymized=f"{row.ip_hash[:12]}…" if row.ip_hash else None,
            device_label=row.device_label,
            reason=row.reason,
            details=row.details,
            created_at=row.created_at,
        )
        for row in rows
    ]
    return AuditLogPage(items=items, total=total, skip=skip, limit=limit)


@router.get("/accesos", response_model=AccesoSesionPage, dependencies=[Depends(require_permission("audit.read"))])
def list_accesos_clinicos(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    actor_user_id: int | None = Query(None, ge=1),
    patient_id: int | None = Query(None, ge=1),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    """Quién abrió qué sección clínica de quién y cuándo (plan 32, punto 7).

    Una fila por sesión y paciente, con las secciones que se abrieron en ella:
    así se lee «Cintia, el martes, vio consultas y estudios de Ana», no cien
    renglones de la misma visita. Lo más reciente primero.
    """
    filtros = []
    if current_user.role != Role.MASTER:
        filtros.append(AccesoClinico.tenant_id == current_user.tenant_id)
    if actor_user_id:
        filtros.append(AccesoClinico.user_id == actor_user_id)
    if patient_id:
        filtros.append(AccesoClinico.patient_id == patient_id)
    # Mismo criterio de fechas que la bitácora: el día del consultorio. Una
    # visita cuenta si alguna de sus aperturas cae en el rango.
    if date_from:
        filtros.append(AccesoClinico.ultimo_acceso >= local_a_utc(date_from))
    if date_to:
        filtros.append(AccesoClinico.primer_acceso <= local_a_utc(date_to))

    grupos = (
        db.query(
            AccesoClinico.session_id,
            AccesoClinico.patient_id,
            func.min(AccesoClinico.primer_acceso).label("primer"),
            func.max(AccesoClinico.ultimo_acceso).label("ultimo"),
        )
        .filter(*filtros)
        .group_by(AccesoClinico.session_id, AccesoClinico.patient_id)
    )
    total = grupos.count()
    pagina = grupos.order_by(func.max(AccesoClinico.ultimo_acceso).desc(), AccesoClinico.session_id).offset(skip).limit(limit).all()

    claves = {(g.session_id, g.patient_id) for g in pagina}
    filas: dict[tuple[str, int], list[AccesoClinico]] = {clave: [] for clave in claves}
    if claves:
        for fila in (
            db.query(AccesoClinico)
            .filter(*filtros)
            .filter(AccesoClinico.session_id.in_({c[0] for c in claves}))
            .order_by(AccesoClinico.primer_acceso)
            .all()
        ):
            if (fila.session_id, fila.patient_id) in filas:
                filas[(fila.session_id, fila.patient_id)].append(fila)

    usuarios = {
        u.id: u.full_name
        for u in db.query(User).filter(User.id.in_({f[0].user_id for f in filas.values() if f})).all()
    } if claves else {}
    pacientes = {
        p.id: p
        for p in db.query(Patient).filter(Patient.id.in_({c[1] for c in claves})).all()
    } if claves else {}

    items = []
    for g in pagina:
        grupo = filas[(g.session_id, g.patient_id)]
        paciente = pacientes.get(g.patient_id)
        nombre = None
        if paciente is not None and (current_user.role == Role.MASTER or paciente.tenant_id == current_user.tenant_id):
            nombre = f"{paciente.first_name} {paciente.last_name}".strip() or None
        items.append(AccesoSesionItem(
            sesion=g.session_id[:8],
            user_id=grupo[0].user_id,
            user_name=usuarios.get(grupo[0].user_id),
            patient_id=g.patient_id,
            patient_name=nombre,
            device_label=next((f.device_label for f in grupo if f.device_label), None),
            primer_acceso=g.primer,
            ultimo_acceso=g.ultimo,
            secciones=[
                AccesoSeccion(seccion=f.seccion, veces=f.veces, primer_acceso=f.primer_acceso, ultimo_acceso=f.ultimo_acceso)
                for f in grupo
            ],
        ))
    return AccesoSesionPage(items=items, total=total, skip=skip, limit=limit)


def _nombre_si_es_de_su_sucursal(paciente: Patient | None, user: User) -> str | None:
    if paciente is None or (user.role != Role.MASTER and paciente.tenant_id != user.tenant_id):
        return None
    return f"{paciente.first_name} {paciente.last_name}".strip() or None


@router.get("/folios", response_model=FolioPage, dependencies=[Depends(require_permission("audit.read"))])
def buscar_folios(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    folio: str | None = Query(None, max_length=40),
    tipo: str | None = Query(None, max_length=3),
    patient_id: int | None = Query(None, ge=1),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
):
    """Verificar un folio: qué documento es, de qué paciente, quién y cuándo (plan 32).

    Quien recibe un papel de la clínica (otro médico, una aseguradora) puede
    preguntar si es auténtico; la administración lo busca aquí. Busca los
    folios homologados por coincidencia parcial; un folio de antes de la 1.2.0
    (receta o certificado) se encuentra escribiéndolo completo.
    """
    query = db.query(FolioEmitido)
    if current_user.role != Role.MASTER:
        query = query.filter(FolioEmitido.tenant_id == current_user.tenant_id)
    texto = (folio or "").strip().upper()
    if texto:
        query = query.filter(FolioEmitido.folio.ilike(f"%{texto}%"))
    if tipo:
        query = query.filter(FolioEmitido.tipo == tipo.upper())
    if patient_id:
        query = query.filter(FolioEmitido.patient_id == patient_id)
    total = query.count()
    filas = query.order_by(FolioEmitido.emitted_at.desc(), FolioEmitido.id.desc()).offset(skip).limit(limit).all()

    pacientes = {p.id: p for p in db.query(Patient).filter(Patient.id.in_({f.patient_id for f in filas if f.patient_id})).all()}
    usuarios = {u.id: u.full_name for u in db.query(User).filter(User.id.in_({f.emitted_by_user_id for f in filas if f.emitted_by_user_id})).all()}
    items = [
        FolioItem(
            folio=f.folio, tipo=f.tipo, tipo_nombre=TipoDeFolio.NOMBRES.get(f.tipo, f.tipo),
            patient_id=f.patient_id, patient_name=_nombre_si_es_de_su_sucursal(pacientes.get(f.patient_id), current_user),
            emitted_by_name=usuarios.get(f.emitted_by_user_id), emitted_at=f.emitted_at,
            entity_type=f.entity_type, entity_id=f.entity_id,
        )
        for f in filas
    ]

    # Lo de antes de la 1.2.0 no está en la bitácora de folios, pero el
    # documento sí guarda el suyo: se confirma por el folio exacto.
    if texto and not items and skip == 0 and not tipo:
        for modelo, clave, nombre in (
            (Prescription, TipoDeFolio.RECETA, "prescription"),
            (MedicalCertificate, TipoDeFolio.CERTIFICADO, "medical_certificate"),
        ):
            documento_q = db.query(modelo).filter(modelo.folio_number == texto)
            if current_user.role != Role.MASTER:
                documento_q = documento_q.filter(modelo.tenant_id == current_user.tenant_id)
            documento = documento_q.first()
            if documento is not None:
                paciente = db.query(Patient).filter(Patient.id == documento.patient_id).first()
                emisor = db.query(User.full_name).filter(User.id == documento.doctor_id).scalar()
                items.append(FolioItem(
                    folio=documento.folio_number, tipo=clave, tipo_nombre=TipoDeFolio.NOMBRES[clave],
                    patient_id=documento.patient_id, patient_name=_nombre_si_es_de_su_sucursal(paciente, current_user),
                    emitted_by_name=emisor, emitted_at=documento.created_at,
                    entity_type=nombre, entity_id=documento.id, homologado=False,
                ))
        total = len(items)
    return FolioPage(items=items, total=total, skip=skip, limit=limit)
