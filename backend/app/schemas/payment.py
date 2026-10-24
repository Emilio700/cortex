"""Payment Pydantic schemas"""
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.models.payment import PaymentMethod, PaymentStatus
from app.utils.sanitize import sanitize_text


class PaymentBase(BaseModel):
    """Base payment schema"""

    patient_id: int
    appointment_id: Optional[int] = None
    service_id: Optional[int] = None
    amount: Decimal
    method: PaymentMethod
    description: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def _validate_amount(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("El importe debe ser mayor que cero.")
        return v

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_text(v, max_length=255) if v else v


class PaymentCreate(PaymentBase):
    """Alta de un pago.

    ``doctor_id`` sólo se lee en un cobro suelto (sin cita) hecho por recepción:
    con cita, el ingreso es de quien atendió; si cobra un médico, es suyo.
    ``cobro_adicional`` es la única forma de cobrar otra vez una cita que ya
    tiene pago vigente, y la pantalla lo pide confirmar aparte.
    """

    doctor_id: Optional[int] = None
    referencia: Optional[str] = None
    # UUID por intento: un reintento con el mismo valor devuelve el mismo pago.
    client_request_id: Optional[str] = Field(default=None, max_length=64)
    cobro_adicional: bool = False

    @field_validator("referencia")
    @classmethod
    def _sanitize_referencia(cls, v: Optional[str]) -> Optional[str]:
        return (sanitize_text(v, max_length=60) or None) if v else None


class ConsultaExpressCreate(BaseModel):
    """Cobro de una consulta rápida que no se agendó (plan 23, ajustes).

    El servidor crea la cita (``origen = express``, ya ``atendida``) y el pago
    ligado en una sola transacción. ``doctor_id`` sólo lo lee si cobra
    recepción; si cobra un médico, la consulta es suya.

    ``confirmar_otra_consulta``: el paciente ya tiene una consulta hoy con esa
    doctora y quien cobra confirmó que ésta es otra. Sin eso, 409.
    """

    patient_id: int
    doctor_id: Optional[int] = None
    service_id: Optional[int] = None
    amount: Decimal
    method: PaymentMethod
    description: Optional[str] = None
    notes: Optional[str] = None
    referencia: Optional[str] = None
    client_request_id: Optional[str] = Field(default=None, max_length=64)
    confirmar_otra_consulta: bool = False

    @field_validator("amount")
    @classmethod
    def _validate_amount(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("El importe debe ser mayor que cero.")
        return v

    @field_validator("description")
    @classmethod
    def _sanitize_description(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_text(v, max_length=255) if v else v

    @field_validator("referencia")
    @classmethod
    def _sanitize_referencia(cls, v: Optional[str]) -> Optional[str]:
        return (sanitize_text(v, max_length=60) or None) if v else None


class PaymentResponse(PaymentBase):
    """Payment response schema"""

    id: int
    tenant_id: int
    received_by_user_id: int
    received_by_name: Optional[str] = None
    patient_name: Optional[str] = None
    service_name: Optional[str] = None
    # Anulable: los pagos históricos sin cita no tienen doctora ("Sin doctora
    # asignada" en pantalla).
    doctor_id: Optional[int] = None
    doctor_name: Optional[str] = None
    status: PaymentStatus = PaymentStatus.VIGENTE
    referencia: Optional[str] = None
    # "express" si el pago es de una consulta registrada al cobrar: la pantalla
    # de anular ofrece cancelarla también.
    appointment_origen: Optional[str] = None
    void_reason: Optional[str] = None
    voided_at: Optional[datetime] = None
    voided_by_user_id: Optional[int] = None
    paid_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class AnularPago(BaseModel):
    """Anular un pago exige decir por qué: queda en el historial y en la bitácora."""

    motivo: str = Field(max_length=500)
    # Si el pago es de una consulta express, cancelar también la cita que se
    # creó al cobrarla, en la misma transacción y con el mismo motivo. Sin
    # esto, anular dejaba en la agenda una consulta inventada "por cobrar".
    cancelar_consulta_express: bool = False

    @field_validator("motivo")
    @classmethod
    def _motivo(cls, v: str) -> str:
        limpio = sanitize_text(v, max_length=500)
        if not limpio:
            raise ValueError("Escribe el motivo de la anulación.")
        return limpio


class CashCutMethodBreakdown(BaseModel):
    """Totals for a single payment method within a cash-cut report"""

    method: PaymentMethod
    total_amount: Decimal
    count: int


class CashCutDoctorBreakdown(BaseModel):
    """De quién es el ingreso. ``doctor_id`` nulo = pagos sin doctora asignada."""

    doctor_id: Optional[int] = None
    doctor_name: str
    total_amount: Decimal
    count: int


class CashCutReceivedByBreakdown(BaseModel):
    """Quién recibió el dinero.

    Sin esto el corte de recepción no cuadra con la caja: si el médico cobró en
    efectivo, el dinero está con ella y no en el cajón.
    """

    user_id: int
    user_name: str
    total_amount: Decimal
    count: int


class CajaDeQuienRecibe(BaseModel):
    """Lo que recibió una persona en el periodo, de cualquier doctora: su arqueo.

    Existe para la secretaria (plan 23, revisión de flujos): ella cobra para
    toda la sucursal, pero su corte se acota a los médicos que apoya. Si su
    caja saliera de ese corte acotado, no cuadraría con el cajón: faltaría lo
    que cobró para las demás. No abre nada nuevo: la lista de cobros de la
    sucursal ya la ve completa.
    """

    user_id: int
    user_name: str
    total_amount: Decimal
    count: int
    by_method: list[CashCutMethodBreakdown]


class DoctoraDelCorte(BaseModel):
    """Un médico que la secretaria apoya: lo que necesita el selector del corte."""

    doctor_id: int
    doctor_name: str


class CashCutReport(BaseModel):
    """Corte de caja sobre un periodo; las fechas van en hora local del consultorio.

    ``alcance`` dice qué abarca el total, para que la pantalla lo pueda decir:
    ``sucursal`` (administración), ``propio`` (el médico) o ``asignadas`` (la
    secretaria, sólo los médicos que apoya; ``doctoras_del_alcance`` las
    lista). Una secretaria sin asignaciones recibe ``asignadas`` con la lista
    vacía: la pantalla tiene que decirle eso y no un "no hubo cobros".
    """

    start_date: datetime
    end_date: datetime
    doctor_id: Optional[int] = None
    total_amount: Decimal
    total_count: int
    by_method: list[CashCutMethodBreakdown]
    by_doctor: list[CashCutDoctorBreakdown] = []
    by_received_by: list[CashCutReceivedByBreakdown] = []
    alcance: Literal["sucursal", "propio", "asignadas"] = "sucursal"
    doctoras_del_alcance: Optional[list[DoctoraDelCorte]] = None
    # Sólo para la secretaria: todo lo que ella recibió en el periodo, sin el
    # recorte por doctora ni el filtro del selector. Es lo que debe haber en su
    # caja; ``by_received_by`` sigue siendo el desglose del corte acotado.
    mi_caja: Optional[CajaDeQuienRecibe] = None
