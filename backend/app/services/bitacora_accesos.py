"""Registrar que alguien abrió una sección clínica de una paciente.

Se llama desde las lecturas clínicas **después** de que pasó la revisión de
permisos y de alcance: solo queda lo que de verdad se entregó. Una lectura
negada (403/404) no es un acceso.

Es de mejor esfuerzo: si escribir la bitácora falla, la doctora sigue viendo
el expediente a media consulta y el fallo queda en el log del servidor. Negarle
la información clínica porque no se pudo anotar que la vio sería peor para la
paciente.
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.request_context import current_audit_context
from app.db.session import utcnow
from app.models.acceso_clinico import AccesoClinico, SeccionClinica
from app.models.patient import Patient
from app.models.user import User

logger = logging.getLogger(__name__)


def _sumar(db: Session, fila: AccesoClinico) -> None:
    fila.ultimo_acceso = utcnow()
    fila.veces = (fila.veces or 0) + 1


def registrar_acceso(
    db: Session, user: User, patient_id: int, seccion: str, *, tenant_id: Optional[int] = None
) -> None:
    """Una fila por sesión, paciente y sección; si ya existe, suma. Confirma."""
    if seccion not in SeccionClinica.TODAS:
        raise ValueError(f"Sección clínica desconocida: {seccion}")
    session_id = getattr(user, "sesion_actual_id", None)
    if not session_id:
        # Sin sesión no hay a qué agrupar (p. ej. un script); no es un acceso
        # de una persona desde la aplicación.
        return
    try:
        fila = (
            db.query(AccesoClinico)
            .filter(
                AccesoClinico.session_id == session_id,
                AccesoClinico.patient_id == patient_id,
                AccesoClinico.seccion == seccion,
            )
            .first()
        )
        if fila is not None:
            _sumar(db, fila)
            db.commit()
            return
        contexto = current_audit_context()
        nueva = AccesoClinico(
            # La sucursal de la paciente, no la de quien mira: Master cruza
            # sucursales y su acceso tiene que verlo la admin de esa paciente.
            tenant_id=tenant_id
            or db.query(Patient.tenant_id).filter(Patient.id == patient_id).scalar()
            or user.tenant_id,
            user_id=user.id,
            session_id=session_id,
            patient_id=patient_id,
            seccion=seccion,
            device_label=contexto[1] if contexto else None,
        )
        try:
            # Dos pestañas abriendo lo mismo a la vez: el índice único deja
            # entrar una y la otra suma sobre ella.
            with db.begin_nested():
                db.add(nueva)
                db.flush()
        except IntegrityError:
            fila = (
                db.query(AccesoClinico)
                .filter(
                    AccesoClinico.session_id == session_id,
                    AccesoClinico.patient_id == patient_id,
                    AccesoClinico.seccion == seccion,
                )
                .first()
            )
            if fila is not None:
                _sumar(db, fila)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("No se pudo registrar el acceso a %s de la paciente %s", seccion, patient_id)
