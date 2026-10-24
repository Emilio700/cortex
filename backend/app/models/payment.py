"""Payment model - Fase 3.2 of the roadmap.

Records a single cash-register-style transaction: a patient paid for a
service and/or an appointment. This is the entity the Fase 3.3 "corte de
caja" (cash-cut) report will aggregate over date ranges/payment methods.

Both ``appointment_id`` and ``service_id`` are nullable and independent of
each other: a payment can be for a scheduled appointment, a standalone
service (e.g. a walk-in), or neither (a generic charge with only a free-text
description) - matching how a real front desk actually takes payments.
"""
import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class PaymentMethod(str, enum.Enum):
    """How the payment was made"""

    CASH = "cash"
    CARD = "card"
    TRANSFER = "transfer"
    OTHER = "other"


class PaymentStatus(str, enum.Enum):
    """Vigencia de un pago.

    Un pago nunca se borra ni se edita: el corte de caja ya hecho tiene que
    poder reconstruirse. Un cobro mal capturado se anula con motivo y se captura
    el correcto (plan 23).
    """

    VIGENTE = "vigente"
    ANULADO = "anulado"


class Payment(Base):
    """A single payment received from a patient."""

    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True, index=True)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=True, index=True)
    received_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # De quién es el ingreso: el médico que atendió, no quien cobró ni la
    # titular de la cita. Anulable porque los pagos históricos sin cita no
    # tienen de dónde sacarla y no se inventa (plan 23).
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    amount = Column(Numeric(10, 2), nullable=False)
    method = Column(Enum(PaymentMethod, values_callable=lambda obj: [e.value for e in obj]), nullable=False, index=True)
    description = Column(String(255))
    notes = Column(Text)

    # Folio de la terminal o últimos dígitos del voucher: con eso se concilia
    # contra el estado de cuenta del banco.
    referencia = Column(String(60), nullable=True)
    # UUID que la pantalla genera por intento. Único: un doble clic o un
    # reintento por red devuelve el mismo pago en vez de cobrar dos veces.
    client_request_id = Column(String(64), nullable=True, unique=True, index=True)

    # VARCHAR y no ENUM nativo, igual que en la migración 0024: así bajarla no
    # deja un tipo huérfano en PostgreSQL.
    status = Column(
        Enum(
            PaymentStatus,
            values_callable=lambda obj: [e.value for e in obj],
            native_enum=False,
            length=20,
        ),
        default=PaymentStatus.VIGENTE,
        server_default=PaymentStatus.VIGENTE.value,
        nullable=False,
        index=True,
    )
    voided_at = Column(DateTime, nullable=True)
    voided_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    void_reason = Column(Text, nullable=True)

    paid_at = Column(DateTime, default=utcnow, nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    tenant = relationship("Tenant")
    patient = relationship("Patient")
    appointment = relationship("Appointment")
    service = relationship("Service")
    received_by = relationship("User", foreign_keys=[received_by_user_id])
    doctor = relationship("User", foreign_keys=[doctor_id])
    voided_by = relationship("User", foreign_keys=[voided_by_user_id])

    # Los nombres viajan en la respuesta para que la pantalla no tenga que cruzar
    # ids contra el directorio de usuarios (y para que el 409 de cobro doble
    # diga quién cobró sin otra llamada).
    @property
    def doctor_name(self):
        return self.doctor.full_name if self.doctor else None

    @property
    def received_by_name(self):
        return self.received_by.full_name if self.received_by else None

    # La lista de cobros decía "Paciente #6" y la búsqueda por paciente no
    # encontraba nada: el plan 23 exige que todo cobro diga de quién y de qué.
    @property
    def patient_name(self):
        if not self.patient:
            return None
        return f"{self.patient.first_name} {self.patient.last_name}".strip()

    @property
    def appointment_origen(self):
        if not self.appointment:
            return None
        origen = self.appointment.origen
        return getattr(origen, "value", origen)

    @property
    def service_name(self):
        return self.service.name if self.service else None

    def __repr__(self):
        return f"<Payment(id={self.id}, amount={self.amount}, method='{self.method}')>"
