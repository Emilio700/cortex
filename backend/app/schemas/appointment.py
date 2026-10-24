"""Appointment Pydantic schemas"""
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.models.appointment import AppointmentOrigen, AppointmentStatus, AppointmentType
from app.models.payment import PaymentMethod


class AppointmentBase(BaseModel):
    """Base appointment schema"""

    patient_id: int
    doctor_id: int
    # Sala física. Obligatoria donde la sucursal tenga más de una sala activa;
    # se asigna sola donde solo haya una, y se queda vacía donde no haya
    # ninguna configurada (la validación vive en appointment_service).
    room_id: Optional[int] = None
    scheduled_at: datetime
    duration_minutes: int = Field(default=30, ge=15, le=120)
    notes: Optional[str] = None
    # Nota corta para el doctor sobre el motivo de la cita. Opcional siempre:
    # nunca bloquea el guardado ni crea un tipo de cita nuevo.
    motivo_extra: Optional[str] = Field(default=None, max_length=120)
    appointment_type: AppointmentType = Field(default=AppointmentType.CONSULTA)
    # Surgery fields
    cirugia_type: Optional[str] = None
    hospital: Optional[str] = None
    anestesiologo: Optional[str] = None
    # ``preop_notes`` llega a recepción a propósito: ella la captura en el modal
    # de cirugía (preparación, ayuno, indicaciones del día). Ocultarla haría que
    # el PUT la borrara. ``postop_notes`` sí es clínica y ``_respuestas`` la
    # vacía a quien no tenga soap_notes.read (plan 32, punto 7).
    preop_notes: Optional[str] = None
    postop_notes: Optional[str] = None
    duration_hours: Optional[float] = None


class AppointmentCreate(AppointmentBase):
    """Appointment creation schema"""

    pass


class AppointmentUpdate(BaseModel):
    """Appointment update schema"""

    patient_id: Optional[int] = None
    doctor_id: Optional[int] = None
    room_id: Optional[int] = None
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(default=None, ge=15, le=120)
    notes: Optional[str] = None
    motivo_extra: Optional[str] = Field(default=None, max_length=120)
    appointment_type: Optional[AppointmentType] = None
    cirugia_type: Optional[str] = None
    hospital: Optional[str] = None
    anestesiologo: Optional[str] = None
    preop_notes: Optional[str] = None
    postop_notes: Optional[str] = None
    duration_hours: Optional[float] = None


class CobroAlFinalizar(BaseModel):
    """Qué pasa con el cobro al finalizar la consulta (plan 23).

    - ``cobrado``: la doctora ya cobró; exige ``amount`` y ``method``.
    - ``recepcion``: lo cobra recepción (lo de siempre).
    - ``sin_cargo``: no se cobra; exige ``motivo``.

    Las reglas de qué campo exige cada modo se revisan en el router y no aquí,
    para que el error llegue como una frase ("Falta el importe") y no como la
    lista de validación.
    """

    modo: Literal["cobrado", "recepcion", "sin_cargo"]
    amount: Optional[Decimal] = None
    method: Optional[PaymentMethod] = None
    service_id: Optional[int] = None
    description: Optional[str] = Field(default=None, max_length=255)
    referencia: Optional[str] = Field(default=None, max_length=60)
    client_request_id: Optional[str] = Field(default=None, max_length=64)
    motivo: Optional[str] = Field(default=None, max_length=255)


class AppointmentStatusUpdate(BaseModel):
    """Appointment status update schema.

    ``cancellation_reason`` is only meaningful (and required by the router)
    when ``status == CANCELADA``.
    ``notes`` carries the doctor's discount/special-price note when status == ATENDIDA.
    """

    status: AppointmentStatus
    cancellation_reason: Optional[str] = None
    notes: Optional[str] = None
    # Sólo con status == ATENDIDA. Sin bloque se comporta como ``recepcion``.
    cobro: Optional[CobroAlFinalizar] = None


class ReenvioConfirmacionResponse(BaseModel):
    """Resultado de reenviar el correo de confirmación de una cita (S-05).

    ``enviado`` sólo es ``True`` cuando el correo se entregó al servidor SMTP;
    la interfaz no puede decir «se reenvió» si el servidor no lo confirmó
    (regla de oro, plan 22). ``motivo`` explica el «no»:

    - ``sin_email``: la paciente no tiene correo capturado.
    - ``fallo_envio``: se intentó y el servidor de correo lo rechazó.
    - ``None``: se envió sin problema.

    ``destinatario`` va enmascarado (``a***@dominio``) para no exponer el correo
    completo de la paciente; es ``None`` cuando no hay correo a quién enviar.
    """

    enviado: bool
    motivo: Optional[Literal["sin_email", "fallo_envio"]] = None
    destinatario: Optional[str] = None


class InicioDeConsultaResponse(BaseModel):
    """Qué pasó al abrir la consulta (plan 28, D-3).

    ``cambio`` solo es ``True`` si esta llamada pasó la cita a «en consulta».
    ``motivo`` explica el «no»: ``ya_en_consulta``, ``no_es_su_cita``,
    ``estado_no_inicia`` (atendida o cancelada) o ``cita_de_otro_dia``.
    """

    appointment_id: int
    status: AppointmentStatus
    cambio: bool
    motivo: Optional[str] = None
    # A dónde vuelve si se sale sin cerrar; nulo si no está en consulta.
    estado_antes_de_consulta: Optional[str] = None


class PatientInAppointment(BaseModel):
    """Nested patient info in appointment response"""

    id: int
    first_name: str
    last_name: str
    phone: Optional[str] = None
    # Para la edad en la agenda (plan 28). Las citas ya llegan acotadas a lo
    # que la sesión puede ver, y quien ve la cita ya puede ver a la paciente.
    # El frontend oculta el relleno legacy 1900-01-01 (``formatEdad``).
    date_of_birth: Optional[date] = None

    class Config:
        from_attributes = True


class DoctorInAppointment(BaseModel):
    """Nested doctor info in appointment response"""

    id: int
    full_name: str
    email: str
    # "Dr." / "Dra." o nulo: la agenda antepone esto y no un "Dr." fijo.
    tratamiento: Optional[str] = None

    class Config:
        from_attributes = True


class CobroResumen(BaseModel):
    """Un pago vigente de la cita, lo justo para decir "ya se cobró" y quién."""

    id: int
    amount: Decimal
    method: PaymentMethod
    received_by_name: Optional[str] = None
    doctor_name: Optional[str] = None
    referencia: Optional[str] = None
    paid_at: datetime


class AppointmentResponse(BaseModel):
    """Appointment response schema with nested info"""

    id: int
    patient_id: int
    doctor_id: int
    tenant_id: int
    # La cita devuelve también el nombre de la sala para que el frontend no
    # tenga que cruzarlo contra el catálogo.
    room_id: Optional[int] = None
    room_name: Optional[str] = None
    scheduled_at: datetime
    duration_minutes: int
    status: AppointmentStatus
    # De dónde entró a consulta; a dónde vuelve si se sale sin cerrarla.
    # Nulo fuera de consulta (plan 28, D-3).
    estado_antes_de_consulta: Optional[str] = None
    # Recepción SÍ recibe ``notes`` a propósito (plan 32, punto 7, decisión
    # 2026-10-09): la «Nota del doctor» que se anexa al cerrar es un mensaje de
    # la doctora PARA secretaría (descuentos, indicaciones de cobro). Ocultarla
    # rompería ese canal; no es una fuga.
    notes: Optional[str] = None
    motivo_extra: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    # Cancellation trail (Fase 3.5) - null unless status is CANCELADA
    cancellation_reason: Optional[str] = None
    cancelled_by_user_id: Optional[int] = None
    cancelled_at: Optional[datetime] = None

    # Appointment type + surgery fields
    appointment_type: AppointmentType = AppointmentType.CONSULTA
    cirugia_type: Optional[str] = None
    hospital: Optional[str] = None
    anestesiologo: Optional[str] = None
    preop_notes: Optional[str] = None
    postop_notes: Optional[str] = None
    duration_hours: Optional[float] = None

    # Cobro (plan 23). ``estado_cobro``: pendiente | cobrada | sin_cargo, o
    # nulo si todavía no toca cobrar la cita.
    attended_by_user_id: Optional[int] = None
    estado_cobro: Optional[str] = None
    total_cobrado: Decimal = Decimal("0.00")
    cobro_resumen: list[CobroResumen] = []
    cobro_sin_cargo_motivo: Optional[str] = None
    # ``express``: consulta rápida que no se agendó y se registró al cobrarla.
    # La agenda y el historial la marcan para que no parezca una agendada.
    origen: AppointmentOrigen = AppointmentOrigen.AGENDA

    # Nested relationships
    patient: Optional[PatientInAppointment] = None
    doctor: Optional[DoctorInAppointment] = None
    has_triage: bool = False

    # Edad gestacional al día de la cita, si la paciente tiene un embarazo
    # activo y la sesión puede leerlo (plan 28, D-4). Nulas si no aplica:
    # nunca 0 por falta de dato.
    semanas_gestacion: Optional[int] = None
    dias_gestacion: Optional[int] = None

    class Config:
        from_attributes = True
