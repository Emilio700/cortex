"""Contracts for auditable clinical tracking.  Values document clinician input only."""

from datetime import date, datetime
from typing import Literal
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

from app.utils.sanitize import sanitize_text
from app.core.hora_local import hoy_local


def _text(value: str | None, limit: int = 4000) -> str | None:
    return sanitize_text(value, limit) if value else value


class PregnancyDatingEventCreate(BaseModel):
    method: str = Field(min_length=2, max_length=40)
    status: str = Field(default="proposed", max_length=30)
    last_menstrual_period: date | None = None
    ultrasound_date: date | None = None
    gestational_age_weeks: Decimal | None = Field(default=None, ge=0, le=45, max_digits=3, decimal_places=1)
    measurement: str | None = Field(default=None, max_length=80)
    proposed_delivery_date: date | None = None
    accepted_delivery_date: date | None = None
    reason: str | None = Field(default=None, max_length=4000)
    source_document_id: int | None = Field(default=None, gt=0)

    @field_validator("reason")
    @classmethod
    def sanitize_reason(cls, value: str | None) -> str | None:
        return _text(value)

    @model_validator(mode="after")
    def accepted_date_is_explicit(self):
        if self.status == "accepted" and not self.accepted_delivery_date:
            raise ValueError("Una FPP aceptada requiere fecha estimada de parto")
        return self


class PregnancyDatingEventResponse(PregnancyDatingEventCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    pregnancy_id: int
    recorded_by_user_id: int
    recorded_at: datetime


class FetalRecordCreate(BaseModel):
    sequence_number: int = Field(ge=1, le=8)
    clinical_identifier: str | None = Field(default=None, max_length=100)
    chorionicity: str | None = Field(default=None, max_length=60)
    amnionicity: str | None = Field(default=None, max_length=60)
    reported_sex: str | None = Field(default=None, max_length=30)
    notes: str | None = Field(default=None, max_length=4000)

    @field_validator("notes")
    @classmethod
    def sanitize_notes(cls, value: str | None) -> str | None:
        return _text(value)


class FetalRecordResponse(FetalRecordCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    pregnancy_id: int
    created_at: datetime
    updated_at: datetime


class FetalAssessmentCreate(BaseModel):
    appointment_id: int | None = Field(default=None, gt=0)
    source_document_id: int | None = Field(default=None, gt=0)
    assessed_on: date
    gestational_age_weeks: Decimal | None = Field(default=None, ge=0, le=45, max_digits=3, decimal_places=1)
    fetal_heart_rate_bpm: int | None = Field(default=None, ge=30, le=300)
    presentation: str | None = Field(default=None, max_length=30)
    estimated_weight_g: int | None = Field(default=None, ge=1, le=10000)
    reported_percentile: str | None = Field(default=None, max_length=40)
    findings: str | None = Field(default=None, max_length=4000)

    @field_validator("findings")
    @classmethod
    def sanitize_findings(cls, value: str | None) -> str | None:
        return _text(value)


class FetalAssessmentResponse(FetalAssessmentCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    fetal_record_id: int
    recorded_by_user_id: int
    created_at: datetime
    updated_at: datetime


class PrenatalMilestoneCreate(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    status: str = Field(default="suggested", max_length=30)
    due_on: date | None = None
    notes: str | None = Field(default=None, max_length=4000)

    @field_validator("title", "notes")
    @classmethod
    def sanitize_fields(cls, value: str | None) -> str | None:
        return _text(value, 4000)


class PrenatalMilestoneResponse(PrenatalMilestoneCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    pregnancy_id: int
    created_by_user_id: int
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ImmunizationCreate(BaseModel):
    patient_id: int = Field(gt=0)
    pregnancy_id: int | None = Field(default=None, gt=0)
    appointment_id: int | None = Field(default=None, gt=0)
    vaccine_name: str = Field(min_length=2, max_length=180)
    product_name: str | None = Field(default=None, max_length=180)
    manufacturer: str | None = Field(default=None, max_length=180)
    lot_number: str | None = Field(default=None, max_length=100)
    dose: str | None = Field(default=None, max_length=100)
    route: str | None = Field(default=None, max_length=80)
    site: str | None = Field(default=None, max_length=100)
    administered_on: date | None = None
    source: str = Field(default="clinic", max_length=80)
    status: str = Field(default="not_evaluated", max_length=40)
    reason: str | None = Field(default=None, max_length=4000)
    adverse_event: str | None = Field(default=None, max_length=4000)

    @field_validator("reason", "adverse_event")
    @classmethod
    def sanitize_long_text(cls, value: str | None) -> str | None:
        return _text(value)


class ImmunizationResponse(ImmunizationCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    recorded_by_user_id: int
    created_at: datetime
    updated_at: datetime


class MedicationExposureCreate(BaseModel):
    patient_id: int = Field(gt=0)
    pregnancy_id: int | None = Field(default=None, gt=0)
    appointment_id: int | None = Field(default=None, gt=0)
    prescription_id: int | None = Field(default=None, gt=0)
    medication_name: str = Field(min_length=2, max_length=255)
    active_ingredient: str | None = Field(default=None, max_length=255)
    dose: str | None = Field(default=None, max_length=120)
    frequency: str | None = Field(default=None, max_length=120)
    route: str | None = Field(default=None, max_length=80)
    started_on: date | None = None
    ended_on: date | None = None
    source: str = Field(default="patient_report", max_length=80)
    indication: str | None = Field(default=None, max_length=4000)
    review_status: str = Field(default="pending", max_length=60)
    next_review_on: date | None = None
    review_notes: str | None = Field(default=None, max_length=4000)

    @field_validator("indication", "review_notes")
    @classmethod
    def sanitize_long_text(cls, value: str | None) -> str | None:
        return _text(value)

    @model_validator(mode="after")
    def date_range_is_valid(self):
        if self.started_on and self.ended_on and self.ended_on < self.started_on:
            raise ValueError("La fecha de término no puede ser anterior al inicio")
        return self


class MedicationExposureResponse(MedicationExposureCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    recorded_by_user_id: int
    created_at: datetime
    updated_at: datetime


class MedicationMonitoringPlanCreate(BaseModel):
    parameter_name: str = Field(min_length=2, max_length=180)
    due_on: date | None = None
    status: str = Field(default="pending", max_length=40)
    notes: str | None = Field(default=None, max_length=4000)

    @field_validator("notes")
    @classmethod
    def sanitize_notes(cls, value: str | None) -> str | None:
        return _text(value)


class MedicationMonitoringPlanResponse(MedicationMonitoringPlanCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    exposure_id: int
    created_by_user_id: int
    created_at: datetime
    updated_at: datetime


# Conjunto cerrado de estados y prioridades de una orden (O-05). Antes eran
# texto libre y los valores válidos sólo los conocía el frontend
# (``clinicalTracking.ts``); ahora el servidor los valida al escribir. Al leer
# NO se validan: una fila vieja con un valor raro se tiene que seguir viendo,
# no reventar la lista de la paciente.
ESTADOS_DE_ORDEN = (
    "draft", "ordered", "accepted", "scheduled", "collected", "in_process",
    "result_received", "reviewed", "cancelled", "rejected",
)
PRIORIDADES_DE_ORDEN = ("routine", "preferential", "urgent")

# El ciclo que se gestiona a mano (POST /orders/{id}/status). ``result_received``
# y ``reviewed`` no están como destino: los pone el resultado, no un botón.
# Cancelar o rechazar se puede mientras no haya resultado; después, lo que
# procede es revisarlo. Una orden cancelada no se reabre: se crea otra
# (plan 14 §10).
TRANSICIONES_DE_ORDEN: dict[str, tuple[str, ...]] = {
    "draft": ("ordered", "cancelled"),
    "ordered": ("accepted", "scheduled", "collected", "in_process", "cancelled", "rejected"),
    "accepted": ("scheduled", "collected", "in_process", "cancelled", "rejected"),
    "scheduled": ("collected", "in_process", "cancelled", "rejected"),
    "collected": ("in_process", "cancelled", "rejected"),
    "in_process": ("cancelled", "rejected"),
    "result_received": (),
    "reviewed": (),
    "cancelled": (),
    "rejected": (),
}
ESTADOS_QUE_EXIGEN_MOTIVO = ("cancelled", "rejected")

# Lo que la interfaz enseña (plan 26, D-1). GEMS no tiene laboratorio propio:
# «aceptada», «programada», «muestra tomada» y «en proceso» no se pueden
# medir, así que para la pantalla son lo mismo que «pendiente de resultado».
# No se borran del modelo ni de ``TRANSICIONES_DE_ORDEN``: las órdenes viejas
# que quedaron en esos estados siguen siendo válidas.
ESTADO_VISIBLE_DE_ORDEN = {
    "draft": "borrador",
    "ordered": "pendiente",
    "accepted": "pendiente",
    "scheduled": "pendiente",
    "collected": "pendiente",
    "in_process": "pendiente",
    "result_received": "resultado_recibido",
    "reviewed": "revisada",
    "cancelled": "cancelada",
    "rejected": "rechazada",
}
# Los únicos cambios de estado a mano que ofrece la interfaz: emitir un
# borrador, cancelar o rechazar (con motivo).
TRANSICIONES_VISIBLES = ("ordered", "cancelled", "rejected")


def _prioridad_valida(value: str | None) -> str | None:
    if value is not None and value not in PRIORIDADES_DE_ORDEN:
        raise ValueError("La prioridad debe ser routine, preferential o urgent")
    return value


class _DiagnosticOrderBase(BaseModel):
    patient_id: int = Field(gt=0)
    pregnancy_id: int | None = Field(default=None, gt=0)
    fetal_record_id: int | None = Field(default=None, gt=0)
    appointment_id: int | None = Field(default=None, gt=0)
    clinical_episode_id: int | None = Field(default=None, gt=0)
    consent_id: int | None = Field(default=None, gt=0)
    category: str = Field(min_length=2, max_length=60)
    study_name: str = Field(min_length=2, max_length=255)
    catalog_code: str | None = Field(default=None, max_length=100)
    clinical_indication: str = Field(min_length=2, max_length=4000)
    priority: str = Field(default="routine", max_length=30)
    # Opcional al crear: si no viene, el servidor pone hoy en la hora del
    # consultorio. El navegador la calculaba en UTC y en la tarde guardaba la
    # de mañana (plan 26, F-1). Guardada nunca es nula.
    requested_on: date | None = None
    desired_on: date | None = None
    preparation_instructions: str | None = Field(default=None, max_length=4000)
    specimen_or_body_site: str | None = Field(default=None, max_length=180)
    destination: str | None = Field(default=None, max_length=255)
    status: str = Field(default="ordered", max_length=40)

    @field_validator("clinical_indication", "preparation_instructions")
    @classmethod
    def sanitize_long_text(cls, value: str | None) -> str | None:
        return _text(value)

    @model_validator(mode="after")
    def desired_date_is_valid(self):
        if self.desired_on and self.desired_on < (self.requested_on or hoy_local()):
            raise ValueError("La fecha deseada no puede ser anterior a la solicitud")
        return self


class DiagnosticOrderCreate(_DiagnosticOrderBase):
    @field_validator("priority")
    @classmethod
    def prioridad_cerrada(cls, value: str) -> str:
        return _prioridad_valida(value)

    @field_validator("status")
    @classmethod
    def nace_emitida_o_en_borrador(cls, value: str) -> str:
        # Una orden no nace tomada ni con resultado: el resto del ciclo se
        # recorre con POST /orders/{id}/status y con el resultado.
        if value not in ("draft", "ordered"):
            raise ValueError("Una orden nueva sólo puede crearse como draft u ordered")
        return value


class DiagnosticOrderStatusChange(BaseModel):
    """Mover una orden por su ciclo (O-05). El motivo es obligatorio al cancelar o rechazar."""

    status: str = Field(max_length=40)
    reason: str | None = Field(default=None, max_length=500)

    @field_validator("status")
    @classmethod
    def estado_gestionable(cls, value: str) -> str:
        if value in ("result_received", "reviewed"):
            raise ValueError("Ese estado se marca al registrar o revisar el resultado, no a mano")
        if value not in ESTADOS_DE_ORDEN:
            raise ValueError(f"Estado desconocido: {value}")
        return value

    @field_validator("reason")
    @classmethod
    def sanitize_reason(cls, value: str | None) -> str | None:
        value = _text(value, 500)
        return value.strip() if value else None

    @model_validator(mode="after")
    def motivo_obligatorio(self):
        if self.status in ESTADOS_QUE_EXIGEN_MOTIVO and (not self.reason or len(self.reason) < 3):
            raise ValueError("Escribe el motivo de la cancelación (al menos 3 caracteres)")
        return self


class DiagnosticOrderUpdate(BaseModel):
    status: str | None = Field(default=None, max_length=40)
    desired_on: date | None = None
    preparation_instructions: str | None = Field(default=None, max_length=4000)
    destination: str | None = Field(default=None, max_length=255)

    @field_validator("preparation_instructions")
    @classmethod
    def sanitize_instructions(cls, value: str | None) -> str | None:
        return _text(value)


class DiagnosticOrderResponse(_DiagnosticOrderBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    doctor_id: int
    # Nulo en una orden suelta; con valor, el lote con el que se imprimió (O-02).
    order_group_id: int | None = None
    # Motivo, fecha y autora del último cambio manual de estado (O-05).
    status_reason: str | None = None
    status_changed_at: datetime | None = None
    status_changed_by_user_id: int | None = None
    # ``externo``: estudio de otro lugar, sin orden de GEMS (plan 32, punto 6).
    origen: str | None = None
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def allowed_transitions(self) -> list[str]:
        """A qué estados se puede mover a mano, para que la pantalla no ofrezca botones que darían 409."""
        return list(TRANSICIONES_DE_ORDEN.get(self.status, ()))

    @computed_field
    @property
    def estado_visible(self) -> str:
        """El estado como lo enseña la interfaz, sin los pasos del laboratorio (D-1)."""
        return ESTADO_VISIBLE_DE_ORDEN.get(self.status, self.status)

    @computed_field
    @property
    def acciones_de_estado(self) -> list[str]:
        """Los cambios a mano que la interfaz ofrece: emitir, cancelar o rechazar (D-1)."""
        # Un estudio externo no se pidió ni se manda al laboratorio: no se cancela ni se rechaza.
        if self.origen == "externo":
            return []
        return [estado for estado in TRANSICIONES_DE_ORDEN.get(self.status, ()) if estado in TRANSICIONES_VISIBLES]


class ResultadoEnHistorial(BaseModel):
    """Un resultado tal como se lee en el historial de estudios del expediente (O-08).

    Trae el enlace al archivo (``patient_document_id``, que se abre con
    ``GET /documents/{id}/download``) y su nombre para que la pantalla lo
    muestre sin pedir el documento aparte.
    """

    model_config = ConfigDict(from_attributes=True)
    id: int
    review_status: str
    collected_on: date | None = None
    resulted_on: date | None = None
    reporting_provider: str | None = None
    report_text: str | None = None
    is_critical: bool = False
    valoracion: str | None = None
    clinician_interpretation: str | None = None
    next_action: str | None = None
    reviewed_at: datetime | None = None
    reviewed_by_user_id: int | None = None
    patient_document_id: int | None = None
    document_file_name: str | None = None
    document_mime_type: str | None = None
    # Quién lo subió y si ya se le comunicó a la paciente: la bandeja por
    # paciente distingue «revisada» de «revisada y comunicada» (plan 26, B-7).
    recorded_by_user_id: int | None = None
    communicated_at: datetime | None = None
    communication_note: str | None = None
    communication_channel: str | None = None
    reviewed_in_appointment_id: int | None = None
    incidencia_cerrada_at: datetime | None = None
    incidencia_cerrada_por: str | None = None
    # Rastro con autor (plan 32, punto 3). ``None`` en el nombre con la fecha
    # puesta es «sin registro»: el pasado no guardó quién.
    communicated_by_user_id: int | None = None
    interpretacion_escrita_at: datetime | None = None
    interpretacion_escrita_por_user_id: int | None = None
    interpretacion_editada_at: datetime | None = None
    interpretacion_editada_por_user_id: int | None = None
    recorded_by_nombre: str | None = None
    reviewed_by_nombre: str | None = None
    communicated_by_nombre: str | None = None
    interpretacion_escrita_por_nombre: str | None = None
    interpretacion_editada_por_nombre: str | None = None
    # Solo la administración recibe anulados (plan 29, lote 9).
    anulado_at: datetime | None = None
    anulado_motivo: str | None = None
    created_at: datetime

    @computed_field
    @property
    def incidencia_abierta(self) -> bool:
        """Crítico y sin cerrar (D-8): sigue en el dashboard de la doctora."""
        return bool(self.is_critical and self.incidencia_cerrada_at is None)


class OrdenEnHistorial(DiagnosticOrderResponse):
    """Una orden con todos sus resultados, del más reciente al más antiguo."""

    results: list[ResultadoEnHistorial] = []


# Un perfil prenatal completo son 6–8 estudios; 20 deja holgura sin permitir
# que un error de la pantalla mande cientos de órdenes en una llamada.
MAX_ESTUDIOS_POR_LOTE = 20


class DiagnosticOrderGroupStudy(BaseModel):
    """Un estudio dentro de un lote. Lo que no traiga, lo toma del lote."""

    category: str = Field(min_length=2, max_length=60)
    study_name: str = Field(min_length=2, max_length=255)
    catalog_code: str | None = Field(default=None, max_length=100)
    specimen_or_body_site: str | None = Field(default=None, max_length=180)
    preparation_instructions: str | None = Field(default=None, max_length=4000)
    # Si vienen, mandan sobre las del lote sólo para este estudio.
    clinical_indication: str | None = Field(default=None, min_length=2, max_length=4000)
    priority: str | None = Field(default=None, max_length=30)
    desired_on: date | None = None
    destination: str | None = Field(default=None, max_length=255)

    @field_validator("clinical_indication", "preparation_instructions")
    @classmethod
    def sanitize_long_text(cls, value: str | None) -> str | None:
        return _text(value)

    @field_validator("priority")
    @classmethod
    def prioridad_cerrada(cls, value: str | None) -> str | None:
        return _prioridad_valida(value)


class DiagnosticOrderGroupCreate(BaseModel):
    """Varios estudios de una paciente pedidos juntos, en una sola llamada (O-02)."""

    patient_id: int = Field(gt=0)
    pregnancy_id: int | None = Field(default=None, gt=0)
    appointment_id: int | None = Field(default=None, gt=0)
    clinical_episode_id: int | None = Field(default=None, gt=0)
    clinical_indication: str = Field(min_length=2, max_length=4000)
    priority: str = Field(default="routine", max_length=30)
    # Opcional, como en la orden suelta: sin fecha, la del consultorio.
    requested_on: date | None = None
    desired_on: date | None = None
    destination: str | None = Field(default=None, max_length=255)
    studies: list[DiagnosticOrderGroupStudy] = Field(min_length=1, max_length=MAX_ESTUDIOS_POR_LOTE)

    @field_validator("clinical_indication")
    @classmethod
    def sanitize_long_text(cls, value: str | None) -> str | None:
        return _text(value)

    @field_validator("priority")
    @classmethod
    def prioridad_cerrada(cls, value: str) -> str:
        return _prioridad_valida(value)

    @model_validator(mode="after")
    def lote_coherente(self):
        fechas = [self.desired_on] + [estudio.desired_on for estudio in self.studies]
        solicitada = self.requested_on or hoy_local()
        if any(fecha and fecha < solicitada for fecha in fechas):
            raise ValueError("La fecha deseada no puede ser anterior a la solicitud")
        # El mismo estudio dos veces en un lote casi siempre es un doble clic,
        # y en el papel se leería como que hay que hacerlo dos veces.
        vistos = set()
        for estudio in self.studies:
            clave = (estudio.catalog_code or estudio.study_name).strip().casefold()
            if clave in vistos:
                raise ValueError(f"El estudio «{estudio.study_name}» está repetido en la orden")
            vistos.add(clave)
        return self


class DiagnosticOrderGroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    patient_id: int
    doctor_id: int
    appointment_id: int | None = None
    clinical_indication: str
    requested_on: date
    created_at: datetime
    orders: list[DiagnosticOrderResponse]


# Escala de la valoración del resultado (plan 26, D-9). «critico» es lo que
# abre la incidencia en el dashboard de la doctora.
VALORACIONES = ("excelente", "bien", "regular", "malo", "critico")
Valoracion = Literal["excelente", "bien", "regular", "malo", "critico"]


# Medios con los que se le hace llegar el resultado a la paciente (D-8).
CanalDeComunicacion = Literal["en_mano", "llamada", "whatsapp", "correo"]
MENSAJE_SIN_CANAL = "Indica cómo se le hizo llegar el resultado: en mano, llamada, WhatsApp o correo"


# Estados de revisión de un resultado. Antes eran texto libre: un valor mal
# escrito dejaba la orden «revisada» con un resultado en un estado que ninguna
# pantalla sabe leer.
ESTADOS_DE_REVISION = ("received", "reviewed", "requires_action", "communicated")
MENSAJE_SIN_NOTA = "Registra cómo y a quién se comunicó el resultado"


def _revision_valida(value: str) -> str:
    if value not in ESTADOS_DE_REVISION:
        raise ValueError(f"Estado de revisión desconocido: {value}")
    return value


class DiagnosticResultCreate(BaseModel):
    patient_document_id: int | None = Field(default=None, gt=0)
    collected_on: date | None = None
    resulted_on: date | None = None
    reporting_provider: str | None = Field(default=None, max_length=255)
    report_text: str | None = Field(default=None, max_length=8000)
    structured_values: dict | None = None
    review_status: str = Field(default="received", max_length=40)
    # Derivado de ``valoracion``; se sigue aceptando por compatibilidad.
    is_critical: bool = False
    valoracion: Valoracion | None = None
    clinician_interpretation: str | None = Field(default=None, max_length=8000)
    communication_note: str | None = Field(default=None, max_length=4000)
    communication_channel: CanalDeComunicacion | None = None
    next_action: str | None = Field(default=None, max_length=4000)
    # La cita de la paciente en la que se revisa: cierra la incidencia (D-8).
    appointment_id: int | None = Field(default=None, gt=0, exclude=True)

    @field_validator("report_text", "clinician_interpretation", "next_action", "communication_note")
    @classmethod
    def sanitize_result_text(cls, value: str | None) -> str | None:
        return _text(value, 8000)

    @field_validator("review_status")
    @classmethod
    def revision_cerrada(cls, value: str) -> str:
        return _revision_valida(value)

    @model_validator(mode="after")
    def comunicacion_con_nota(self):
        if self.review_status == "communicated" and not (self.communication_note or "").strip():
            raise ValueError(MENSAJE_SIN_NOTA)
        if self.review_status == "communicated" and not self.communication_channel:
            raise ValueError(MENSAJE_SIN_CANAL)
        return self

    @model_validator(mode="after")
    def critico_derivado(self):
        # La valoración manda; sin ella, la casilla vieja de crítico se traduce.
        if self.valoracion is not None:
            self.is_critical = self.valoracion == "critico"
        elif self.is_critical:
            self.valoracion = "critico"
        return self


class DiagnosticResultResponse(DiagnosticResultCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tenant_id: int
    diagnostic_order_id: int
    recorded_by_user_id: int
    reviewed_by_user_id: int | None = None
    communicated_by_user_id: int | None = None
    reviewed_at: datetime | None = None
    communicated_at: datetime | None = None
    # Nombre y tipo del archivo, para que la pantalla diga cuál es y lo abra
    # en el visor con su MIME en vez de «archivo adjunto» (plan 26, B-4).
    document_file_name: str | None = None
    document_mime_type: str | None = None
    # Estado de la orden tras registrar o revisar el resultado.
    order_status: str | None = None
    # Qué pasó con la cita de la revisión (ronda 5): «aplicada» si sirvió
    # para cerrar la incidencia; «cita_de_otro_dia» si la revisión se guardó
    # pero la cita no es de hoy (ni de ayer en sala) y la incidencia sigue
    # abierta; ``None`` sin cita o sin revisión.
    cierre_en_consulta: str | None = None
    reviewed_in_appointment_id: int | None = None
    incidencia_cerrada_at: datetime | None = None
    incidencia_cerrada_por: str | None = None

    @computed_field
    @property
    def incidencia_abierta(self) -> bool:
        """Crítico y sin cerrar (D-8)."""
        return bool(self.is_critical and self.incidencia_cerrada_at is None)

    # Las reglas de ESCRIBIR un resultado no se aplican al leerlo: una fila
    # vieja (comunicada sin nota, o con un estado de antes del conjunto
    # cerrado) se tiene que seguir viendo, no tumbar la respuesta con un 500.
    @field_validator("review_status")
    @classmethod
    def revision_cerrada(cls, value: str) -> str:
        return value

    @model_validator(mode="after")
    def comunicacion_con_nota(self):
        return self
    created_at: datetime
    updated_at: datetime


class DiagnosticResultUpdate(BaseModel):
    # Opcional: un PATCH sólo con la valoración (por ejemplo, desmarcar un
    # «crítico» de un archivo viejo de la orden) no mueve la revisión ni el
    # estado de la orden.
    review_status: str | None = Field(default=None, max_length=40)
    clinician_interpretation: str | None = Field(default=None, max_length=8000)
    next_action: str | None = Field(default=None, max_length=4000)
    communication_note: str | None = Field(default=None, max_length=4000)
    # Derivado de ``valoracion`` (D-9); se acepta por compatibilidad.
    is_critical: bool | None = None
    # ``null`` explícito la quita; omitirla no la cambia.
    valoracion: Valoracion | None = None
    communication_channel: CanalDeComunicacion | None = None
    # La cita de la paciente en la que se revisa: cierra la incidencia (D-8).
    appointment_id: int | None = Field(default=None, gt=0)

    @field_validator("clinician_interpretation", "next_action", "communication_note")
    @classmethod
    def sanitize_update_text(cls, value: str | None) -> str | None:
        return _text(value, 8000)

    @field_validator("review_status")
    @classmethod
    def revision_cerrada(cls, value: str | None) -> str | None:
        return None if value is None else _revision_valida(value)

    # Se valida aquí, antes de tocar nada: el router cambiaba el resultado y la
    # orden en la sesión y DESPUÉS respondía 422 por la nota faltante, dejando
    # la sesión con cambios a medias.
    @model_validator(mode="after")
    def comunicacion_con_nota(self):
        if self.review_status == "communicated" and not (self.communication_note or "").strip():
            raise ValueError(MENSAJE_SIN_NOTA)
        if self.review_status == "communicated" and not self.communication_channel:
            raise ValueError(MENSAJE_SIN_CANAL)
        return self


class AnularResultado(BaseModel):
    """El motivo es obligatorio y queda en la bitácora (plan 29, lote 9)."""

    motivo: str

    @field_validator("motivo")
    @classmethod
    def _motivo(cls, v: str) -> str:
        limpio = sanitize_text(v or "", max_length=500).strip()
        if len(limpio) < 3:
            raise ValueError("Escribe por qué se anula el resultado.")
        return limpio


class AnulacionDeResultado(BaseModel):
    """Lo que el servidor hizo, para que la pantalla lo diga tal cual."""

    result_id: int
    order_id: int
    estado_anterior: str
    order_status: str
    estado_visible: str
    resultados_vigentes: int
    documento_anulado: bool
    # «cerrada», «sigue_abierta» (otro resultado vigente es crítico) o
    # «sin_incidencia».
    incidencia: str


class DiagnosticOrderInboxItem(BaseModel):
    order: DiagnosticOrderResponse
    patient_name: str
    latest_result: DiagnosticResultResponse | None = None


class DiagnosticOrderInboxPage(BaseModel):
    items: list[DiagnosticOrderInboxItem]
    total: int
    skip: int
    limit: int


class AdjuntoDeOrden(BaseModel):
    """Un archivo ya ligado a la orden, para que recepción vea lo que subió (plan 26, R-1).

    Sólo lo que identifica al archivo: nada de su interpretación. Se abre con
    ``GET /documents/{patient_document_id}/download`` (recepción tiene
    ``documents.read``).
    """

    result_id: int
    patient_document_id: int
    file_name: str
    mime_type: str | None = None
    uploaded_at: datetime


class OrdenPorRecibirItem(BaseModel):
    """Lo que recepción ve de una orden para ligarle su resultado (O-04).

    Sólo lo necesario para reconocerla con el papel en la mano: paciente,
    estudio, fecha y folio. A propósito no trae la indicación clínica, la
    prioridad ni nada del resultado o su interpretación: recepción recibe el
    sobre del laboratorio, no lee el expediente.
    """

    order_id: int
    order_group_id: int | None = None
    patient_id: int
    patient_name: str
    study_name: str
    requested_on: date
    status: str
    # Cuántos archivos de resultado tiene ya la orden: sirve para no subir dos
    # veces el mismo sobre, sin enseñar qué dicen.
    attachments: int
    # Y cuáles son, para abrirlos y detectar el sobre equivocado o repetido.
    adjuntos: list[AdjuntoDeOrden] = []
    # La prioridad ordena la lista (D-10): no es expediente, es qué atender
    # primero. La doctora, para imprimir el papel de cada una por separado (M5).
    priority: str = "routine"
    doctor_id: int | None = None
    doctor_name: str | None = None
    # Atrasado y su último seguimiento (plan 32, punto 3): recepción suele ser
    # quien llama a la paciente o al laboratorio. Es operativo, no clínico.
    atrasada: bool = False
    dias_sin_resultado: int | None = None
    ultimo_seguimiento: "SeguimientoDeOrden | None" = None


class OrdenPorRecibirPage(BaseModel):
    items: list[OrdenPorRecibirItem]
    total: int
    skip: int
    limit: int


class OrdenPorEntregarItem(BaseModel):
    """Lo que recepción ve de una orden emitida del día para entregarla (O-09).

    Igual que en «por recibir»: sólo lo necesario para reconocerla con el papel
    en la mano (paciente, estudio, fecha, folio y estado). A propósito no trae la
    indicación clínica, la prioridad ni nada del expediente: recepción entrega el
    papel, no lee el porqué del estudio.
    """

    order_id: int
    order_group_id: int | None = None
    patient_id: int
    patient_name: str
    study_name: str
    requested_on: date
    status: str
    # Si ya se registró la entrega (para poder listar también las entregadas del
    # día y no volver a marcarlas).
    delivered: bool
    delivered_at: datetime | None = None
    # Qué entregar primero (D-10): no es expediente, es el orden de atención.
    priority: str = "routine"
    # Para agrupar por doctora e imprimir el papel de cada una (M5).
    doctor_id: int | None = None
    doctor_name: str | None = None


class OrdenPorEntregarPage(BaseModel):
    items: list[OrdenPorEntregarItem]
    total: int
    skip: int
    limit: int


class PlantillaOrdenEstudio(BaseModel):
    """Un estudio precargado por una plantilla clínica (O-03).

    Tiene la misma forma que ``DiagnosticOrderGroupStudy`` (O-02) para que el
    frontend lo copie tal cual al formulario de la orden agrupada; ahí la doctora
    lo revisa, lo cambia si quiere y confirma. La plantilla no crea nada.
    """

    category: str
    study_name: str
    catalog_code: str | None = None
    specimen_or_body_site: str | None = None
    preparation_instructions: str | None = None


class PlantillaOrdenResumen(BaseModel):
    """Una plantilla en el índice: lo justo para elegirla (O-03)."""

    clave: str
    nombre: str
    descripcion: str
    num_estudios: int


class PlantillaOrdenDetalle(BaseModel):
    """Una plantilla con sus estudios, para precargar la orden agrupada (O-03)."""

    clave: str
    nombre: str
    descripcion: str
    # Texto sugerido para la indicación clínica del lote; la doctora lo confirma
    # o lo cambia. El alta de O-02 exige indicación, así que ayuda tenerla.
    indicacion_sugerida: str | None = None
    estudios: list[PlantillaOrdenEstudio]


class PlantillasOrdenPage(BaseModel):
    """Índice de plantillas. ``version`` sube cuando cambia el contenido, para
    que el frontend invalide lo que tenga cacheado."""

    version: int
    plantillas: list[PlantillaOrdenResumen]


class EntregaOrdenResponse(BaseModel):
    """Resultado de marcar una orden como entregada a la paciente (O-09)."""

    order_id: int
    delivered: bool
    delivered_at: datetime | None = None
    delivered_by_user_id: int | None = None
    # ``True`` si ya estaba entregada desde antes: la interfaz no vuelve a decir
    # «entregada ahora» cuando otra persona ya la marcó.
    ya_estaba_entregada: bool = False


class ResultadoAdjuntoResponse(BaseModel):
    """Confirmación de un resultado adjunto. Sin interpretación ni indicación."""

    result_id: int
    order_id: int
    order_status: str
    patient_document_id: int
    file_name: str
    mime_type: str | None = None
    file_size: int | None = None
    uploaded_at: datetime


FILTROS_DE_BANDEJA = (
    "activas", "pendientes", "por_revisar", "sin_comunicar", "criticos", "todos", "atrasados", "urgentes",
)


class ResumenDeBandeja(BaseModel):
    """Los números de la franja de la bandeja, contados en el servidor (plan 32, punto 3)."""

    pendientes: int
    por_revisar: int
    sin_comunicar: int
    criticos: int
    atrasados: int
    # Urgentes y preferentes que siguen sin resultado.
    urgentes: int
    activas: int


class SeguimientoCreate(BaseModel):
    """Registrar por qué un estudio sigue sin resultado (plan 32, punto 3)."""

    motivo: Literal["no_se_lo_ha_hecho", "en_proceso_laboratorio", "reagendado", "no_se_localiza", "otro"]
    nota: str | None = Field(default=None, max_length=500)
    revisar_el: date

    @field_validator("nota")
    @classmethod
    def _limpiar_nota(cls, valor: str | None) -> str | None:
        if not valor:
            return None
        return (sanitize_text(valor, max_length=500) or "").strip() or None

    @model_validator(mode="after")
    def _nota_si_es_otro(self):
        # «Otro» sin explicar no le dice nada a quien lo lea después.
        if self.motivo == "otro" and not self.nota:
            raise ValueError("Con «Otro», escribe en la nota qué pasó.")
        return self

    @field_validator("revisar_el")
    @classmethod
    def _revisar_despues(cls, valor: date) -> date:
        hoy = hoy_local()
        if valor <= hoy:
            raise ValueError("«Volver a revisar el» tiene que ser una fecha después de hoy.")
        if (valor - hoy).days > 366:
            raise ValueError("«Volver a revisar el» no puede ser a más de un año.")
        return valor


class SeguimientoDeOrden(BaseModel):
    """Un seguimiento ya registrado: quién, cuándo, por qué y hasta cuándo."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    diagnostic_order_id: int
    motivo: str
    motivo_texto: str = ""
    nota: str | None = None
    revisar_el: date
    registrado_por_user_id: int
    registrado_por_nombre: str | None = None
    created_at: datetime


class EventoDeRastro(BaseModel):
    """Un paso de la línea de tiempo de un estudio."""

    tipo: str
    titulo: str
    cuando: datetime | None = None
    solo_fecha: bool = False
    autor: str | None = None
    detalle: str | None = None


class RastroDeEstudio(BaseModel):
    order_id: int
    ultima_actualizacion: EventoDeRastro | None = None
    eventos: list[EventoDeRastro]


class OrdenEnBandeja(OrdenEnHistorial):
    """Una orden en la bandeja por paciente, con todos sus resultados."""

    # Algún resultado ya se le comunicó a la paciente.
    comunicada: bool = False
    # Algún resultado crítico con la incidencia abierta (D-8): ni comunicado a
    # la paciente ni revisado en una consulta suya. Se conserva el nombre de
    # la primera ronda; ``incidencia_abierta`` dice lo mismo.
    critico_sin_comunicar: bool = False
    incidencia_abierta: bool = False
    # De qué cita salió (plan 32, punto 3): «Lote G-3» solo no decía de qué
    # consulta ni de qué fecha venía, y en el rastro se perdía el origen.
    # El estado deja a la pantalla ofrecer «Ver la consulta» solo cuando
    # abrirla es releerla y no empezarla.
    cita_fecha: datetime | None = None
    cita_estado: str | None = None
    # Atrasado con el plazo de su doctora, y el último seguimiento (plan 32, punto 3).
    atrasada: bool = False
    dias_sin_resultado: int | None = None
    ultimo_seguimiento: SeguimientoDeOrden | None = None
    # «Última actualización: 3 oct 2026, 18:42 · Jhoany» (plan 32, punto 3).
    ultima_actualizacion_at: datetime | None = None
    ultima_actualizacion_por: str | None = None


class PacienteEnBandeja(BaseModel):
    """Una tarjeta de la bandeja: la paciente con sus órdenes (plan 26, B-1)."""

    patient_id: int
    patient_name: str
    total_ordenes: int
    por_revisar: int
    tiene_criticos: bool
    prioridad_maxima: str
    solicitada_mas_antigua: date | None = None
    orders: list[OrdenEnBandeja]


class BandejaPorPacientePage(BaseModel):
    """Página de pacientes, no de órdenes: una paciente nunca queda partida."""

    items: list[PacienteEnBandeja]
    total: int
    skip: int
    limit: int


class IncidenciaCritica(BaseModel):
    """Un resultado crítico que la doctora autora todavía no revisa (plan 26, D-3).

    Sale en su dashboard y se queda ahí hasta que lo revisa
    (``PATCH /results/{id}`` con ``review_status`` distinto de ``received``).
    No hay campo «notificado»: no se manda aviso, así que no hay nada que
    pueda decir que se avisó sin haberlo hecho.
    """

    result_id: int
    order_id: int
    patient_id: int
    patient_name: str
    study_name: str
    is_critical: bool = True
    valoracion: str | None = None
    review_status: str
    reviewed_at: datetime | None = None
    resulted_on: date | None = None
    created_at: datetime
    patient_document_id: int | None = None
    document_file_name: str | None = None
    document_mime_type: str | None = None


class IncidenciasCriticasPage(BaseModel):
    items: list[IncidenciaCritica]
    total: int


class PuntoDeValoracion(BaseModel):
    """Una valoración en el tiempo, para la gráfica de progreso del expediente (D-9)."""

    result_id: int
    order_id: int
    fecha: date
    study_name: str
    catalog_code: str | None = None
    category: str
    valoracion: str


class ValoracionesDePaciente(BaseModel):
    items: list[PuntoDeValoracion]


class RegistroDeImpresion(BaseModel):
    """Lo que la pantalla avisa al pulsar Imprimir o Descargar en el visor (M2).

    Generar el PDF para la vista previa ya no cuenta como impresión: la
    bitácora tiene que decir lo que realmente pasó.
    """

    order_ids: list[int] = Field(min_length=1, max_length=100)
    folio: str | None = Field(default=None, max_length=40)
    accion: Literal["impreso", "descargado"]

    model_config = ConfigDict(extra="forbid")

    @field_validator("order_ids")
    @classmethod
    def ids_validos(cls, value: list[int]) -> list[int]:
        if any(numero <= 0 for numero in value):
            raise ValueError("Los números de orden tienen que ser positivos")
        return list(dict.fromkeys(value))

    @field_validator("folio")
    @classmethod
    def folio_limpio(cls, value: str | None) -> str | None:
        return _text(value, 40)


class RegistroDeImpresionResponse(BaseModel):
    registrado: bool
    order_ids: list[int]
    accion: str


class TrackingOverview(BaseModel):
    active_pregnancy_id: int | None = None
    immunizations: list[ImmunizationResponse]
    medication_exposures: list[MedicationExposureResponse]
    diagnostic_orders: list[DiagnosticOrderResponse]


class ObstetricDashboardItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    pregnancy_id: int
    patient_id: int
    # El nombre, no «Embarazo #123»: la doctora reconoce a la paciente, no al
    # número del registro (plan 28).
    patient_full_name: str | None = None
    estimated_delivery_date: date
    # La FPP ya pasó (hasta ``dias_vencida`` días atrás): la paciente sigue
    # embarazada después de su fecha probable, o el parto no se registró.
    vencida: bool = False
    dating_status: str
    next_visit_on: date | None = None


class PrenatalReviewBoardItem(BaseModel):
    """Una paciente que debía volver a control y no está citada.

    Es una lista que se consulta, no un aviso: la doctora ya acumula avisos sin
    leer y enterarse no es una acción. Lo que sí es una acción —llamar a la
    paciente— le llega a recepción por notificación, y sale de la misma regla
    que arma esta lista.
    """

    model_config = ConfigDict(from_attributes=True)
    pregnancy_id: int
    patient_id: int
    patient_full_name: str
    next_review_on: date
    # Negativo si la revisión todavía no llega. Se manda calculado y no se deja
    # al navegador porque la fecha vive en hora del consultorio, no del equipo
    # de quien mira la pantalla: el mismo renglón diría "hoy" o "ayer" según la
    # computadora.
    dias_de_atraso: int
    vencida: bool
    estimated_delivery_date: date | None = None
    # Si a recepción ya se le avisó de esta fecha. Sirve para distinguir "nadie
    # sabe" de "ya está en manos de recepción", que es lo primero que la doctora
    # pregunta antes de ponerse a llamar ella.
    avisado_a_recepcion: bool


OrdenPorRecibirItem.model_rebuild()
