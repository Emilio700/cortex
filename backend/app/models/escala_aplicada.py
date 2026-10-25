"""Una escala neurológica aplicada a un paciente (Cortex).

Guarda **qué se respondió**, no solo el total: un ODI de 40 % puede venir de
dolor al caminar o de no poder dormir, y en la consulta de control eso es lo
que se compara. El puntaje y la interpretación los calcula el servidor
(``services/escalas.py``) con ``version_escala``; si la escala cambia mañana,
este registro sigue diciendo con qué reglas se calculó.

No se borra: se **anula** con motivo, igual que un resultado de estudio
(``DiagnosticResult.anulado_*``). La anulada deja de contar en la gráfica de
evolución, pero sigue en el expediente con quién, cuándo y por qué.
"""
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class EscalaAplicada(Base):
    __tablename__ = "escalas_aplicadas"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    # La consulta en la que se aplicó, si fue en una. Una escala de control
    # puede capturarse desde el expediente, sin cita.
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    escala = Column(String(40), nullable=False, index=True)
    version_escala = Column(String(20), nullable=False)
    # id del ítem → código de la opción elegida, tal como lo validó el servidor.
    respuestas = Column(JSON, nullable=False)
    # Nulo cuando un componente «no valorable» impide el total (Glasgow con T).
    puntaje = Column(Float, nullable=True)
    interpretacion = Column(String(255), nullable=True)
    # «O3 VT M5», «No valorable: 5a» o «1 sección sin responder».
    detalle = Column(String(255), nullable=True)
    notas = Column(Text, nullable=True)
    # Cuándo se aplicó la escala; puede ser antes de capturarla.
    aplicada_en = Column(DateTime, nullable=False, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    anulado_at = Column(DateTime, nullable=True, index=True)
    anulado_por_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    anulado_motivo = Column(String(500), nullable=True)

    tenant = relationship("Tenant")
    patient = relationship("Patient")
    appointment = relationship("Appointment")
    doctor = relationship("User", foreign_keys=[doctor_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    anulado_por = relationship("User", foreign_keys=[anulado_por_user_id])
