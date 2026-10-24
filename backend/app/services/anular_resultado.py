"""Anular un resultado de orden (plan 29, lote 9).

Diseño aprobado por Emilio (delegado en el orquestador):

- Desde la orden, con **motivo obligatorio**. Solo la doctora que pidió el
  estudio o la administración. Nunca se borra nada: el resultado y su archivo
  se conservan anulados, con quién, cuándo y por qué.
- Anula también el **documento ligado** (el mismo efecto que anularlo desde
  Documentos, lote 7), para que el archivo equivocado no siga en el
  expediente. Después se sube el correcto como siempre.
- El **estado de la orden se recalcula** con los resultados que siguen
  vigentes: sin ninguno vuelve a «pendiente de resultado»; con alguno sin
  revisar queda en «resultado recibido» y, si todos están revisados, en
  «revisada».
- La **incidencia crítica** del resultado anulado se cierra con
  ``resultado_anulado`` solo si ningún OTRO resultado vigente de la orden
  tiene una incidencia abierta: en ese caso la orden sigue siendo crítica y
  la incidencia que vale es la del otro.
- Todo a la bitácora, y la respuesta dice exactamente qué pasó con la orden y
  con la incidencia: la pantalla no lo deduce (regla de oro, plan 22).
"""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import utcnow
from app.models.clinical_tracking import DiagnosticOrder, DiagnosticResult
from app.models.patient_document import PatientDocument
from app.models.user import User
from app.services import avisos_de_resultados
from app.services import correccion_documentos as correccion
from app.services.audit_service import log_action

# Vigente = no anulado. Toda consulta que cuente resultados (bandeja,
# incidencias, gráfica, pendientes de la consulta) filtra con esto.
VIGENTE = DiagnosticResult.anulado_at.is_(None)

ESTADO_SIN_RESULTADO = "ordered"


@dataclass
class Anulacion:
    resultado: DiagnosticResult
    estado_anterior: str
    estado_nuevo: str
    resultados_vigentes: int
    documento_anulado: bool
    # «cerrada»: era crítica y se cerró; «sigue_abierta»: otro resultado
    # vigente de la orden es crítico; «sin_incidencia»: no había nada abierto.
    incidencia: str


def puede_anular(order: DiagnosticOrder, user: User) -> bool:
    return correccion.es_administracion(user) or order.doctor_id == user.id


def _estado_por_vigentes(vigentes: list[DiagnosticResult]) -> str:
    if not vigentes:
        return ESTADO_SIN_RESULTADO
    if any(r.review_status == "received" for r in vigentes):
        return "result_received"
    return "reviewed"


def _anular_documento(db: Session, documento: PatientDocument, user: User, motivo: str) -> bool:
    if documento.anulado_at is not None:
        return False
    documento.anulado_at = utcnow()
    documento.anulado_por_user_id = user.id
    documento.anulado_motivo = motivo
    correccion._retirar_avisos(db, documento, user)
    return True


def anular(db: Session, resultado: DiagnosticResult, order: DiagnosticOrder, user: User, motivo: str) -> Anulacion:
    if not puede_anular(order, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo la doctora que pidió el estudio o la administración pueden anular un resultado.",
        )
    if resultado.anulado_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este resultado ya estaba anulado.")

    ahora = utcnow()
    estado_anterior = order.status
    resultado.anulado_at = ahora
    resultado.anulado_por_user_id = user.id
    resultado.anulado_motivo = motivo

    documento = resultado.patient_document if resultado.patient_document_id else None
    documento_anulado = _anular_documento(db, documento, user, motivo) if documento is not None else False

    db.flush()
    vigentes = (
        db.query(DiagnosticResult)
        .filter(DiagnosticResult.diagnostic_order_id == order.id, VIGENTE)
        .all()
    )
    otra_critica_abierta = any(r.is_critical and r.incidencia_cerrada_at is None for r in vigentes)
    era_abierta = bool(resultado.is_critical and resultado.incidencia_cerrada_at is None)
    if otra_critica_abierta:
        incidencia = "sigue_abierta"
    elif era_abierta:
        resultado.incidencia_cerrada_at = ahora
        resultado.incidencia_cerrada_por = "resultado_anulado"
        resultado.incidencia_cerrada_by_user_id = user.id
        incidencia = "cerrada"
    else:
        incidencia = "sin_incidencia"

    # Una orden cancelada o rechazada no cambia de estado por esto.
    if order.status in ("ordered", "accepted", "scheduled", "collected", "in_process", "result_received", "reviewed"):
        nuevo = _estado_por_vigentes(vigentes)
        # Si ya estaba en un estado «sin resultado» se respeta el que tenía.
        if not (nuevo == ESTADO_SIN_RESULTADO and order.status in ("accepted", "scheduled", "collected", "in_process")):
            order.status = nuevo
    if order.status != estado_anterior:
        order.status_changed_at = ahora
        order.status_changed_by_user_id = user.id
        order.status_reason = f"Resultado anulado: {motivo}"[:2000]
    avisos_de_resultados.resolver_resultado_si_ya_no_espera(db, order, user)
    db.commit()
    db.refresh(resultado)

    detalles = {
        "order_id": order.id,
        "patient_document_id": resultado.patient_document_id,
        "documento_anulado": documento_anulado,
        "estado_anterior": estado_anterior,
        "estado_nuevo": order.status,
        "resultados_vigentes": len(vigentes),
        "incidencia": incidencia,
        "valoracion": resultado.valoracion,
    }
    log_action(
        db, action="diagnostic_result.voided", entity_type="diagnostic_result", entity_id=resultado.id,
        actor_user_id=user.id, tenant_id=resultado.tenant_id, patient_id=order.patient_id,
        reason=motivo, details=detalles,
    )
    if documento_anulado:
        log_action(
            db, action="document.voided", entity_type="patient_document", entity_id=documento.id,
            actor_user_id=user.id, tenant_id=documento.tenant_id, patient_id=documento.patient_id,
            reason=motivo, details={"title": documento.title, "file_name": documento.file_name,
                                    "por_resultado_anulado": resultado.id},
        )
    if order.status != estado_anterior:
        log_action(
            db, action="diagnostic_order.status_changed", entity_type="diagnostic_order", entity_id=order.id,
            actor_user_id=user.id, tenant_id=order.tenant_id, patient_id=order.patient_id,
            reason=f"Resultado anulado: {motivo}",
            details={"patient_id": order.patient_id, "from": estado_anterior, "to": order.status,
                     "por_resultado_anulado": resultado.id},
        )
    return Anulacion(
        resultado=resultado, estado_anterior=estado_anterior, estado_nuevo=order.status,
        resultados_vigentes=len(vigentes), documento_anulado=documento_anulado, incidencia=incidencia,
    )
