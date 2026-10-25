"""Bitácora de accesos a información clínica (plan 32, punto 7; NOM-024).

La bitácora de auditoría registra cambios; esta registra **quién abrió qué
sección clínica del expediente de quién y cuándo**, aunque no haya cambiado
nada. La NOM-024 pide trazabilidad del acceso al expediente electrónico.

Agrupada por sesión para que no crezca sin control: una fila por sesión, por
paciente y por sección. Abrir la misma sección diez veces en la misma sesión
actualiza ``ultimo_acceso`` y suma ``veces``; no son diez filas. Una sesión
nueva (otro inicio de sesión, otro equipo) es otra fila.
"""
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint

from app.db.session import Base, utcnow


class SeccionClinica:
    """Las secciones que cuentan como «abrir información clínica»."""

    CONSULTAS = "consultas"          # historial con nota, notas SOAP, signos
    RECETAS = "recetas"
    CERTIFICADOS = "certificados"
    ESTUDIOS = "estudios"            # órdenes, resultados y valoraciones
    IMAGENES = "imagenes"
    DOCUMENTOS = "documentos"
    EMBARAZO = "embarazo"
    EPISODIOS = "episodios"
    CONSENTIMIENTOS = "consentimientos"
    RESUMEN_CLINICO = "resumen_clinico"
    # Escalas neurológicas (Cortex, feat/escalas-neuro)
    ESCALAS = "escalas"

    TODAS = (
        CONSULTAS, RECETAS, CERTIFICADOS, ESTUDIOS, IMAGENES, DOCUMENTOS,
        EMBARAZO, EPISODIOS, CONSENTIMIENTOS, RESUMEN_CLINICO,
        ESCALAS,
    )


class AccesoClinico(Base):
    __tablename__ = "accesos_clinicos"
    __table_args__ = (
        UniqueConstraint("session_id", "patient_id", "seccion", name="uq_accesos_clinicos_sesion_paciente_seccion"),
        # Las dos preguntas de Auditoría: «¿quién vio a este paciente?» y
        # «¿qué vio esta persona?», siempre de lo más reciente a lo más viejo.
        Index("ix_accesos_clinicos_paciente_ultimo", "patient_id", "ultimo_acceso"),
        Index("ix_accesos_clinicos_usuario_ultimo", "user_id", "ultimo_acceso"),
        Index("ix_accesos_clinicos_tenant_ultimo", "tenant_id", "ultimo_acceso"),
    )

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # El id de ``user_sessions``; sin llave foránea para que purgar sesiones
    # viejas nunca borre ni bloquee la bitácora.
    session_id = Column(String(36), nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    seccion = Column(String(30), nullable=False)
    primer_acceso = Column(DateTime, nullable=False, default=utcnow)
    ultimo_acceso = Column(DateTime, nullable=False, default=utcnow)
    veces = Column(Integer, nullable=False, default=1, server_default="1")
    device_label = Column(String(120), nullable=True)
