"""Validation contracts for pregnancy and prenatal visit records."""

from datetime import date, datetime, timedelta
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.pregnancy import FetalMovements, FetalPresentation, PregnancyStatus
from app.schemas.patient import NAEGELE_DAYS
from app.utils.sanitize import sanitize_text

# Texto con el que queda registrado el origen de una FPP calculada, para que en
# el expediente se distinga de la que el médico fija por ecografía.
NAEGELE_SOURCE = "Regla de Naegele (FUR + 280 días)"


class PregnancyCreate(BaseModel):
    patient_id: int = Field(gt=0)
    last_menstrual_period: date | None = None
    estimated_delivery_date: date | None = None
    dating_method: str | None = Field(default=None, max_length=40)
    dating_status: str = Field(default="pending", max_length=40)
    estimated_delivery_date_source: str | None = Field(default=None, max_length=80)
    is_multiple_gestation: bool = False
    fetus_count: int | None = Field(default=None, ge=1, le=8)
    conception_method: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=4000)

    @field_validator("notes")
    @classmethod
    def sanitize_notes(cls, value: str | None) -> str | None:
        return sanitize_text(value, 4000) if value else value

    @model_validator(mode="after")
    def validate_recorded_dates(self):
        if (
            self.last_menstrual_period
            and self.estimated_delivery_date
            and self.estimated_delivery_date < self.last_menstrual_period
        ):
            raise ValueError("La fecha estimada no puede ser anterior a la FUM registrada")
        return self

    @model_validator(mode="after")
    def calcular_fpp_por_naegele(self):
        """Red de seguridad: con FUR y sin FPP, se calcula FUR + 280 días.

        Solo rellena lo que viene vacío. Una FPP enviada por el médico (la de
        ecografía, que en obstetricia manda sobre el cálculo) nunca se toca.
        """
        if self.last_menstrual_period and not self.estimated_delivery_date:
            self.estimated_delivery_date = self.last_menstrual_period + timedelta(
                days=NAEGELE_DAYS
            )
            if not self.estimated_delivery_date_source:
                self.estimated_delivery_date_source = NAEGELE_SOURCE
        return self


class PregnancyUpdate(BaseModel):
    status: PregnancyStatus | None = None
    last_menstrual_period: date | None = None
    estimated_delivery_date: date | None = None
    dating_method: str | None = Field(default=None, max_length=40)
    dating_status: str | None = Field(default=None, max_length=40)
    estimated_delivery_date_source: str | None = Field(default=None, max_length=80)
    dating_notes: str | None = Field(default=None, max_length=4000)
    is_multiple_gestation: bool | None = None
    fetus_count: int | None = Field(default=None, ge=1, le=8)
    conception_method: str | None = Field(default=None, max_length=40)
    high_risk_status: str | None = Field(default=None, max_length=40)
    outcome: str | None = Field(default=None, max_length=40)
    outcome_date: date | None = None
    actual_delivery_date: date | None = None
    actual_gestational_age_weeks: Decimal | None = Field(default=None, ge=0, le=45, max_digits=3, decimal_places=1)
    outcome_notes: str | None = Field(default=None, max_length=4000)
    notes: str | None = Field(default=None, max_length=4000)
    # La fecha que vale y la que propuso la regla. Quien la ajusto NO se recibe
    # del cliente: lo pone el router con el usuario autenticado, porque es un
    # dato de auditoria y un dato de auditoria que el cliente puede dictar no
    # sirve de nada.
    next_review_on: date | None = None
    next_review_suggested_on: date | None = None

    @field_validator("notes", "dating_notes", "outcome_notes")
    @classmethod
    def sanitize_notes(cls, value: str | None) -> str | None:
        return sanitize_text(value, 4000) if value else value

    @model_validator(mode="after")
    def validate_recorded_dates(self):
        if (
            self.last_menstrual_period
            and self.estimated_delivery_date
            and self.estimated_delivery_date < self.last_menstrual_period
        ):
            raise ValueError("La fecha estimada no puede ser anterior a la FUM registrada")
        return self

    @model_validator(mode="after")
    def validar_proxima_revision(self):
        """Una revision anterior a la FUM registrada es un error de captura.

        No se acota por arriba: un embarazo puede reprogramarse lejos y la
        sugerencia solo orienta. Lo que no puede ser es caer antes de que el
        embarazo empezara.
        """
        if (
            self.last_menstrual_period
            and self.next_review_on
            and self.next_review_on < self.last_menstrual_period
        ):
            raise ValueError(
                "La proxima revision no puede ser anterior a la FUM registrada"
            )
        return self


class PregnancyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    patient_id: int
    doctor_id: int
    status: PregnancyStatus
    last_menstrual_period: date | None = None
    estimated_delivery_date: date | None = None
    dating_method: str | None = None
    dating_status: str
    estimated_delivery_date_source: str | None = None
    estimated_delivery_date_confirmed_at: datetime | None = None
    confirmed_by_user_id: int | None = None
    dating_notes: str | None = None
    is_multiple_gestation: bool = False
    fetus_count: int | None = None
    conception_method: str | None = None
    high_risk_status: str
    outcome: str
    outcome_date: date | None = None
    actual_delivery_date: date | None = None
    actual_gestational_age_weeks: Decimal | None = None
    outcome_notes: str | None = None
    notes: str | None = None
    next_review_on: date | None = None
    next_review_suggested_on: date | None = None
    next_review_adjusted_by_user_id: int | None = None
    next_review_adjusted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PregnancyPage(BaseModel):
    items: list[PregnancyResponse]
    total: int


class PrenatalVisitBase(BaseModel):
    appointment_id: int | None = Field(default=None, gt=0)
    visit_date: date
    gestational_age_weeks: Decimal | None = Field(
        default=None, ge=0, le=45, max_digits=3, decimal_places=1
    )
    maternal_weight_kg: Decimal | None = Field(
        default=None, ge=20, le=400, max_digits=5, decimal_places=2
    )
    systolic_bp: int | None = Field(default=None, ge=40, le=300)
    diastolic_bp: int | None = Field(default=None, ge=20, le=200)
    fundal_height_cm: Decimal | None = Field(
        default=None, ge=0, le=80, max_digits=3, decimal_places=1
    )
    fetal_heart_rate_bpm: int | None = Field(default=None, ge=30, le=300)
    fetal_movements: FetalMovements | None = None
    fetal_presentation: FetalPresentation | None = None
    maternal_observations: str | None = Field(default=None, max_length=4000)
    fetal_observations: str | None = Field(default=None, max_length=4000)
    plan_notes: str | None = Field(default=None, max_length=4000)
    next_visit_on: date | None = None

    @field_validator("maternal_observations", "fetal_observations", "plan_notes")
    @classmethod
    def sanitize_text_fields(cls, value: str | None) -> str | None:
        return sanitize_text(value, 4000) if value else value

    @model_validator(mode="after")
    def validate_next_visit_date(self):
        if self.next_visit_on and self.next_visit_on < self.visit_date:
            raise ValueError("La próxima visita no puede ser anterior a la visita registrada")
        return self


class PrenatalVisitCreate(PrenatalVisitBase):
    """Data to document a visit under the pregnancy in the route path."""


class PrenatalVisitUpdate(BaseModel):
    gestational_age_weeks: Decimal | None = Field(
        default=None, ge=0, le=45, max_digits=3, decimal_places=1
    )
    maternal_weight_kg: Decimal | None = Field(
        default=None, ge=20, le=400, max_digits=5, decimal_places=2
    )
    systolic_bp: int | None = Field(default=None, ge=40, le=300)
    diastolic_bp: int | None = Field(default=None, ge=20, le=200)
    fundal_height_cm: Decimal | None = Field(
        default=None, ge=0, le=80, max_digits=3, decimal_places=1
    )
    fetal_heart_rate_bpm: int | None = Field(default=None, ge=30, le=300)
    fetal_movements: FetalMovements | None = None
    fetal_presentation: FetalPresentation | None = None
    maternal_observations: str | None = Field(default=None, max_length=4000)
    fetal_observations: str | None = Field(default=None, max_length=4000)
    plan_notes: str | None = Field(default=None, max_length=4000)
    next_visit_on: date | None = None

    @field_validator("maternal_observations", "fetal_observations", "plan_notes")
    @classmethod
    def sanitize_text_fields(cls, value: str | None) -> str | None:
        return sanitize_text(value, 4000) if value else value


class PrenatalVisitResponse(PrenatalVisitBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    pregnancy_id: int
    doctor_id: int
    created_at: datetime
    updated_at: datetime


class PrenatalVisitPage(BaseModel):
    items: list[PrenatalVisitResponse]
    total: int
