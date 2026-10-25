"""Escalas neurológicas del paciente (Cortex).

Tres cosas: listar (para el historial y la gráfica de evolución), aplicar y
anular. No hay editar: una escala mal capturada se anula con su motivo y se
vuelve a aplicar, para que el rastro de lo que se registró no se pierda.

**El puntaje lo calcula el servidor** (``services/escalas.py``). La pantalla lo
sugiere mientras se llena, pero lo que se guarda y lo que se le devuelve al
médico es lo que calculó este lado.

Alcance: variante ``own`` (solo el médico dueño del expediente), como el resto
de lo clínico estructurado. Anular exige además ser quien la aplicó.
"""
from datetime import timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.access_scope import exigir_autoria_clinica, resolver_paciente_de_su_duena
from app.core.deps import get_db, require_permission
from app.core.tenant_scope import scoped_query
from app.db.session import utcnow
from app.models.acceso_clinico import SeccionClinica
from app.models.appointment import Appointment
from app.models.escala_aplicada import EscalaAplicada
from app.models.patient import Patient
from app.models.user import Role, User
from app.schemas.escala import EscalaAnular, EscalaAplicadaCreate, EscalaAplicadaResponse
from app.services import escalas as motor
from app.services.audit_service import log_action
from app.services.bitacora_accesos import registrar_acceso
from app.utils.sanitize import sanitize_text

router = APIRouter(prefix="/patients", tags=["escalas"])

# Margen para el reloj del equipo del consultorio: una escala «aplicada» unos
# minutos en el futuro es un reloj adelantado, no un error de captura.
TOLERANCIA_FUTURO = timedelta(minutes=10)


def _paciente(db: Session, patient_id: int, user: User) -> Patient:
    return resolver_paciente_de_su_duena(
        db,
        patient_id,
        user,
        detalle_403="Solo puedes ver y aplicar escalas a pacientes de tu expediente.",
    )


def _respuesta(registro: EscalaAplicada) -> EscalaAplicadaResponse:
    salida = EscalaAplicadaResponse.model_validate(registro)
    escala = motor.escala_por_id(registro.escala)
    if escala is not None and escala.version == registro.version_escala:
        calculado = motor.calcular(escala, registro.respuestas or {})
        salida.tono = calculado.tono
        salida.avisos = calculado.avisos
    return salida


def _a_utc_sin_zona(fecha):
    """La base guarda UTC sin zona (``utcnow``); una fecha con zona se convierte."""
    if fecha.tzinfo is not None:
        return fecha.astimezone(timezone.utc).replace(tzinfo=None)
    return fecha


@router.get("/{patient_id}/escalas", response_model=list[EscalaAplicadaResponse])
def listar_escalas(
    patient_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_scales.read"))],
    escala: Optional[str] = Query(default=None, max_length=40),
    incluir_anuladas: bool = Query(default=True),
) -> list[EscalaAplicadaResponse]:
    """Las escalas del paciente, de la más reciente a la más antigua.

    Las anuladas vienen por omisión, marcadas: el historial las enseña tachadas
    con su motivo. La gráfica las pide sin ellas.
    """
    _paciente(db, patient_id, current_user)
    registrar_acceso(db, current_user, patient_id, SeccionClinica.ESCALAS)
    consulta = scoped_query(db.query(EscalaAplicada), EscalaAplicada, current_user).filter(
        EscalaAplicada.patient_id == patient_id
    )
    if escala:
        consulta = consulta.filter(EscalaAplicada.escala == escala)
    if not incluir_anuladas:
        consulta = consulta.filter(EscalaAplicada.anulado_at.is_(None))
    registros = consulta.order_by(EscalaAplicada.aplicada_en.desc(), EscalaAplicada.id.desc()).all()
    return [_respuesta(r) for r in registros]


@router.post(
    "/{patient_id}/escalas",
    response_model=EscalaAplicadaResponse,
    status_code=status.HTTP_201_CREATED,
)
def aplicar_escala(
    patient_id: int,
    datos: EscalaAplicadaCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_scales.write"))],
) -> EscalaAplicadaResponse:
    paciente = _paciente(db, patient_id, current_user)

    escala = motor.escala_por_id(datos.escala)
    if escala is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esa escala no está disponible en Cortex. Elige una de la lista.",
        )
    if datos.version_escala != escala.version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"La escala {escala.nombre} se actualizó mientras la llenabas. "
                "Recarga la página y vuelve a capturarla: las respuestas podrían significar otra cosa."
            ),
        )
    errores = motor.validar(escala, datos.respuestas)
    if errores:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=" ".join(errores))

    cita: Optional[Appointment] = None
    if datos.appointment_id is not None:
        cita = (
            scoped_query(db.query(Appointment), Appointment, current_user)
            .filter(Appointment.id == datos.appointment_id)
            .first()
        )
        if cita is None or cita.patient_id != paciente.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La consulta indicada no es de este paciente. Recarga la consulta y vuelve a intentarlo.",
            )

    ahora = utcnow()
    aplicada_en = _a_utc_sin_zona(datos.aplicada_en) if datos.aplicada_en else ahora
    if aplicada_en > ahora + TOLERANCIA_FUTURO:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La fecha en que se aplicó la escala no puede ser futura.",
        )

    resultado = motor.calcular(escala, datos.respuestas)
    # El médico responsable del registro: quien la aplica si es médico; si la
    # captura otra cuenta con el permiso (master), el de la consulta o el dueño.
    if current_user.role == Role.DOCTOR:
        doctor_id = current_user.id
    else:
        doctor_id = (cita.doctor_id if cita else None) or paciente.owner_doctor_id or current_user.id

    registro = EscalaAplicada(
        tenant_id=paciente.tenant_id,
        patient_id=paciente.id,
        appointment_id=cita.id if cita else None,
        doctor_id=doctor_id,
        escala=escala.id,
        version_escala=escala.version,
        respuestas={k: v for k, v in datos.respuestas.items() if v},
        puntaje=resultado.puntaje,
        interpretacion=resultado.interpretacion,
        detalle=resultado.detalle,
        notas=(sanitize_text(datos.notas, 2000) or None) if datos.notas else None,
        aplicada_en=aplicada_en,
        created_by_user_id=current_user.id,
    )
    db.add(registro)
    db.commit()
    db.refresh(registro)

    # Sin respuestas ni puntaje en la bitácora: es dato clínico y ya vive en
    # su tabla. Aquí basta saber qué se aplicó, a quién y cuándo.
    log_action(
        db,
        action="clinical_scale.applied",
        entity_type="escala_aplicada",
        entity_id=registro.id,
        actor_user_id=current_user.id,
        tenant_id=registro.tenant_id,
        patient_id=registro.patient_id,
        details={
            "escala": escala.id,
            "version_escala": escala.version,
            "appointment_id": registro.appointment_id,
        },
    )
    return _respuesta(registro)


@router.post(
    "/{patient_id}/escalas/{escala_id}/anular",
    response_model=EscalaAplicadaResponse,
)
def anular_escala(
    patient_id: int,
    escala_id: int,
    datos: EscalaAnular,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("clinical_scales.write"))],
) -> EscalaAplicadaResponse:
    """Anula sin borrar: deja de contar en la gráfica y conserva el motivo."""
    _paciente(db, patient_id, current_user)
    registro = (
        scoped_query(db.query(EscalaAplicada), EscalaAplicada, current_user)
        .filter(EscalaAplicada.id == escala_id, EscalaAplicada.patient_id == patient_id)
        .first()
    )
    if registro is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontró esa escala. Actualiza el expediente.",
        )
    exigir_autoria_clinica(
        registro.doctor_id,
        current_user,
        detalle="Solo quien aplicó la escala puede anularla.",
    )
    if registro.anulado_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esta escala ya estaba anulada.",
        )
    motivo = sanitize_text(datos.motivo, 500)
    if len(motivo) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Escribe el motivo de la anulación (al menos 5 caracteres).",
        )
    registro.anulado_at = utcnow()
    registro.anulado_por_user_id = current_user.id
    registro.anulado_motivo = motivo
    db.commit()
    db.refresh(registro)

    log_action(
        db,
        action="clinical_scale.voided",
        entity_type="escala_aplicada",
        entity_id=registro.id,
        actor_user_id=current_user.id,
        tenant_id=registro.tenant_id,
        patient_id=registro.patient_id,
        reason=motivo,
        details={"escala": registro.escala},
    )
    return _respuesta(registro)
