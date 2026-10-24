"""Abrir la consulta pasa la cita a «en consulta» (plan 28, D-3).

Router aparte del de citas para no mezclar esta regla con lo que el plan 27
agrega ahí; las reglas viven en ``app/services/consulta_en_curso.py``.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.access_scope import alcance_operativo_acotado, exigir_relacion_asistencial
from app.core.deps import get_db, require_permission
from app.core.tenant_scope import scoped_query
from app.models.appointment import Appointment
from app.models.user import User
from app.schemas.appointment import InicioDeConsultaResponse
from app.services.consulta_en_curso import iniciar_consulta

router = APIRouter(prefix="/appointments", tags=["Appointments"])


@router.post("/{appointment_id}/iniciar-consulta", response_model=InicioDeConsultaResponse)
def iniciar_consulta_de_la_cita(
    appointment_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_permission("doctor.appointments.read"))],
):
    """La pantalla de consulta lo llama al abrirse; es idempotente.

    Responde siempre con el estado REAL de la cita y si cambió: la pantalla no
    puede suponer que la cita quedó «en consulta» (plan 22). ``motivo`` dice por
    qué no cambió cuando no cambió; no es un error.
    """
    cita = (
        scoped_query(db.query(Appointment), Appointment, current_user)
        .filter(Appointment.id == appointment_id)
        .first()
    )
    if cita is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No se encontró la cita.")
    # Una doctora que no es la titular solo llega aquí si puede abrir la
    # consulta (la cubre); si no, la cita no existe para ella.
    if alcance_operativo_acotado(current_user) and cita.doctor_id != current_user.id:
        exigir_relacion_asistencial(db, cita.patient_id, current_user)

    motivo = iniciar_consulta(db, cita, current_user)
    db.refresh(cita)
    return InicioDeConsultaResponse(
        appointment_id=cita.id,
        status=cita.status,
        cambio=motivo is None,
        motivo=motivo,
        estado_antes_de_consulta=cita.estado_antes_de_consulta,
    )
