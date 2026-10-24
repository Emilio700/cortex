"""Resumen clínico exportable del expediente (plan 32, punto 8).

Dos pasos, como la orden de estudios (plan 26): primero la vista previa, sin
folio y con la marca «VISTA PREVIA»; después la emisión, que solo se acepta
con la constancia de esa vista previa y las mismas secciones. Así la vista
previa es obligatoria también para quien llame a la API sin la pantalla.

Solo lo emite un médico con relación asistencial con el paciente: el papel
lleva su membrete y su firma. Recepción no lo genera.
"""
from __future__ import annotations

import hashlib
import hmac
import time
from io import BytesIO
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.access_scope import resolver_paciente_con_relacion_asistencial
from app.core.config import settings
from app.core.deps import get_db, require_permission
from app.models.acceso_clinico import SeccionClinica
from app.models.folio_emitido import TipoDeFolio
from app.models.tenant import Tenant
from app.models.user import Role, User
from app.services.audit_service import log_action
from app.services.bitacora_accesos import registrar_acceso
from app.services.folio_service import emitir_folio
from app.services.resumen_clinico import (
    CONSULTAS_MAXIMAS,
    CONSULTAS_POR_OMISION,
    armar_resumen,
    normalizar_secciones,
)
from app.utils.resumen_pdf import generar_resumen_pdf

router = APIRouter(prefix="/patients", tags=["Resumen clínico"])

PERMISO = "soap_notes.read"
# Lo que dura la constancia de la vista previa: lo de una consulta, no más.
VIGENCIA_DE_VISTA_PREVIA_S = 30 * 60
CABECERA_VISTA_PREVIA = "X-Vista-Previa"
CABECERA_FOLIO = "X-Folio"


class OpcionesDeResumen(BaseModel):
    secciones: list[str] = Field(default_factory=list, max_length=10)
    consultas: int = Field(CONSULTAS_POR_OMISION, ge=1, le=CONSULTAS_MAXIMAS)


class EmisionDeResumen(OpcionesDeResumen):
    vista_previa: str = Field(min_length=10, max_length=200)


def _solo_doctora(user: User) -> None:
    if user.role != Role.DOCTOR:
        raise HTTPException(
            status_code=403,
            detail="El resumen clínico lo emite el médico: lleva su membrete y su firma.",
        )


def _secciones(opciones: OpcionesDeResumen) -> list[str]:
    try:
        return normalizar_secciones(opciones.secciones)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _firma(user_id: int, patient_id: int, secciones: list[str], consultas: int, momento: int) -> str:
    mensaje = f"resumen:{user_id}:{patient_id}:{','.join(secciones)}:{consultas}:{momento}"
    return hmac.new(settings.SECRET_KEY.encode(), mensaje.encode(), hashlib.sha256).hexdigest()


def _constancia(user_id: int, patient_id: int, secciones: list[str], consultas: int) -> str:
    momento = int(time.time())
    return f"{momento}.{_firma(user_id, patient_id, secciones, consultas, momento)}"


def _exigir_constancia(token: str, user_id: int, patient_id: int, secciones: list[str], consultas: int) -> None:
    momento_texto, _, firma = token.partition(".")
    valida = momento_texto.isdigit() and hmac.compare_digest(
        firma, _firma(user_id, patient_id, secciones, consultas, int(momento_texto))
    )
    if not valida:
        raise HTTPException(
            status_code=409,
            detail="Revisa la vista previa con estas mismas secciones antes de emitir el resumen.",
        )
    if time.time() - int(momento_texto) > VIGENCIA_DE_VISTA_PREVIA_S:
        raise HTTPException(
            status_code=409,
            detail="La vista previa ya es de hace más de 30 minutos. Vuelve a abrirla antes de emitir.",
        )


def _perfil(db: Session, user: User):
    from app.routers.clinical_tracking import _perfil_para_orden

    return _perfil_para_orden(db, user.id)


def _nombre_de_clinica(db: Session, tenant_id: int) -> str:
    return db.query(Tenant.name).filter(Tenant.id == tenant_id).scalar() or ""


@router.post("/{patient_id}/resumen-clinico/vista-previa")
def vista_previa_resumen(
    patient_id: int,
    opciones: OpcionesDeResumen,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission(PERMISO))],
):
    """El resumen tal como saldría, sin folio y con la marca de vista previa."""
    _solo_doctora(user)
    patient = resolver_paciente_con_relacion_asistencial(db, patient_id, user)
    secciones = _secciones(opciones)
    registrar_acceso(db, user, patient.id, SeccionClinica.RESUMEN_CLINICO)
    resumen = armar_resumen(db, patient, secciones, opciones.consultas)
    pdf = generar_resumen_pdf(resumen, _perfil(db, user), folio=None, tenant_name=_nombre_de_clinica(db, patient.tenant_id))
    return StreamingResponse(BytesIO(pdf.read()), media_type="application/pdf", headers={
        "Content-Disposition": 'inline; filename="Resumen_clinico_vista_previa.pdf"',
        CABECERA_VISTA_PREVIA: _constancia(user.id, patient.id, secciones, opciones.consultas),
    })


@router.post("/{patient_id}/resumen-clinico")
def emitir_resumen(
    patient_id: int,
    datos: EmisionDeResumen,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_permission(PERMISO))],
):
    """Emite el resumen con folio ``RES`` y lo deja en la bitácora.

    El folio se reserva, el PDF se arma y solo entonces se confirma: si el
    papel no se pudo generar no queda un folio emitido de un documento que
    nadie recibió.
    """
    _solo_doctora(user)
    patient = resolver_paciente_con_relacion_asistencial(db, patient_id, user)
    secciones = _secciones(datos)
    _exigir_constancia(datos.vista_previa, user.id, patient.id, secciones, datos.consultas)

    resumen = armar_resumen(db, patient, secciones, datos.consultas)
    emitido = emitir_folio(
        db, tenant_id=patient.tenant_id, tipo=TipoDeFolio.RESUMEN, user_id=user.id,
        patient_id=patient.id, entity_type="patient", entity_id=patient.id,
    )
    try:
        pdf = generar_resumen_pdf(
            resumen, _perfil(db, user), folio=emitido.folio, tenant_name=_nombre_de_clinica(db, patient.tenant_id),
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    log_action(
        db, action="clinical_summary.issued", entity_type="patient", entity_id=patient.id,
        actor_user_id=user.id, tenant_id=patient.tenant_id, patient_id=patient.id,
        details={"folio": emitido.folio, "secciones": secciones, "consultas": datos.consultas},
    )
    registrar_acceso(db, user, patient.id, SeccionClinica.RESUMEN_CLINICO)
    return StreamingResponse(BytesIO(pdf.read()), media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="Resumen_clinico_{emitido.folio}.pdf"',
        CABECERA_FOLIO: emitido.folio,
    })
