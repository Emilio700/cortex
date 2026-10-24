"""In-app notification model (Fase 4.1).

G.E.M.S had no way to tell a user "something happened" without them
stumbling onto it manually (checking the agenda, opening a patient's
documents tab). This model backs a simple per-user inbox - no external
channel (email/SMS) involved, that's Fase 4.2+.
"""
from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class NotificationType:
    """Known notification types (plain strings, not a DB enum, so new types
    don't require a migration - the set is enforced at the service layer)."""

    APPOINTMENT_TODAY = "appointment_today"
    APPOINTMENT_REMINDER = "appointment_reminder"
    APPOINTMENT_SCHEDULED = "appointment_scheduled"
    PATIENT_ARRIVED = "patient_arrived"
    DOCUMENT_UPLOADED = "document_uploaded"
    # Va a la asistente, no al paciente ni al médico: el sistema no llama
    # a nadie, se encarga de que la persona que llama no se le pase. El médico
    # ve lo mismo en el tablero de control prenatal, que se consulta; un aviso
    # que solo dice "enterate" es lo que tiene la campanita llena sin leer.
    PRENATAL_REVIEW_DUE = "prenatal_review_due"
    # Al médico que pidió el estudio: llegó su resultado y falta que lo
    # interprete. Es un "haz algo", no un "entérate" (O-04).
    DIAGNOSTIC_RESULT_RECEIVED = "diagnostic_result_received"
    # A recepción: el médico cerró la consulta y el texto dice el estado real
    # del cobro. Se usaba como cadena suelta en el router; un tipo que no está
    # aquí es un tipo que nadie encuentra al buscar quién avisa qué.
    CONSULTATION_COMPLETED = "consultation_completed"
    # Al médico: se le cayó o se le movió una cita. Si es de hoy o de mañana
    # es un hueco (o un choque) en su agenda inmediata y pide hacer algo; si es
    # más lejos sólo hay que saberlo (plan 27, D-6).
    APPOINTMENT_CANCELLED = "appointment_cancelled"
    APPOINTMENT_RESCHEDULED = "appointment_rescheduled"
    # Al admin: un servicio del servidor dejó de responder (p. ej. el
    # antivirus). Sin él no se pueden subir archivos y el siguiente despliegue
    # se detiene; antes de la 1.2.0 llevaba días caído y nadie se enteró
    # (plan 32, punto 0). Lo escribe ``scripts/aviso_de_sistema.py``.
    SYSTEM_ALERT = "system_alert"
    # Al médico: estudios suyos que siguen sin resultado después de su
    # plazo. Uno solo por día y agrupado (plan 32, punto 3); se cierra solo
    # cuando ya no le queda ninguno atrasado.
    STUDIES_OVERDUE = "studies_overdue"


class NotificationPriority:
    """Qué tanto pide el aviso (plan 27, §3.2). La forma de aparecer sale de
    aquí y no del tipo suelto: un tipo nuevo no nace mudo ni nace gritando."""

    # «Entérate»: contador y centro de avisos, sin emergente ni sonido.
    INFORMATIVO = "informativo"
    # «Haz algo»: se queda por atender hasta que el servidor ve que ya se hizo
    # o alguien lo descarta.
    ACCIONABLE = "accionable"
    # Reservado para lo clínico urgente. Hoy el resultado crítico NO es una
    # fila de aviso: se deriva de la incidencia abierta (plan 26), para que
    # nadie pueda dar por atendido un crítico que nadie revisó.
    URGENTE = "urgente"

    TODAS = (INFORMATIVO, ACCIONABLE, URGENTE)


class NotificationResolution:
    """Cómo se cerró un aviso que pedía hacer algo."""

    # El servidor vio que pasó lo que pedía (se cobró, se atendió, se revisó).
    AUTO = "auto"
    # Una persona lo quitó a mano; queda quién y cuándo, y en la bitácora.
    DESCARTADO = "descartado"
    # Accionables viejos al estrenar la Fase 1: nadie los atendió en el
    # sistema, pero tampoco tiene sentido estrenar con 200 pendientes.
    MIGRACION = "migracion"


class Notification(Base):
    """A single in-app notification for one recipient user."""

    __tablename__ = "notifications"
    __table_args__ = (
        # «Por atender» de una persona: sus avisos sin resolver, por fecha.
        Index("ix_notifications_user_resolved_created", "user_id", "resolved_at", "created_at"),
        # Un doble clic o un job que corre dos veces no generan dos avisos
        # iguales. Sólo entre los abiertos: si el mismo hecho vuelve a pasar
        # después de resuelto, es un aviso nuevo.
        Index(
            "uq_notifications_dedupe_abierto",
            "user_id",
            "dedupe_key",
            unique=True,
            postgresql_where=text("dedupe_key IS NOT NULL AND resolved_at IS NULL"),
            sqlite_where=text("dedupe_key IS NOT NULL AND resolved_at IS NULL"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(String(500), nullable=False)
    # Optional pointer back to the entity this notification is about (e.g.
    # entity_type="appointment", entity_id=42), so the frontend can link to it.
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(Integer, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)
    # Plan 27, Fase 1. «Leído» y «atendido» dejan de ser lo mismo: abrir la
    # campana no cobra a nadie.
    priority = Column(
        String(20), nullable=False, default=NotificationPriority.INFORMATIVO,
        server_default=NotificationPriority.INFORMATIVO,
    )
    resolved_at = Column(DateTime, nullable=True)
    resolved_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolution = Column(String(20), nullable=True)
    dedupe_key = Column(String(150), nullable=True)

    tenant = relationship("Tenant")
    user = relationship("User", foreign_keys=[user_id])
    resolved_by = relationship("User", foreign_keys=[resolved_by_user_id])

    def __repr__(self):
        return f"<Notification(type='{self.type}', user_id={self.user_id}, is_read={self.is_read})>"


class NotificationPreference(Base):
    """Cómo quiere cada persona que le lleguen los avisos (plan 27, §3.7).

    Se guarda en el servidor para que la siga de un equipo a otro. Todo lo que
    hace ruido arranca apagado: sonido y notificación del navegador son
    opt-in, y el recordatorio de cita de una hora sólo sale si el médico lo
    pide (D-1). Las informativas se pueden silenciar por tipo; lo accionable no,
    porque un «paciente en sala» que nadie ve es el problema que este plan
    resuelve.
    """

    __tablename__ = "notification_preferences"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    sonido = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    navegador = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    recordatorio_una_hora = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    tipos_silenciados = Column(JSON, nullable=False, default=list)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
