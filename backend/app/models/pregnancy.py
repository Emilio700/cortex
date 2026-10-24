"""Pregnancy and prenatal-visit records without diagnostic automation."""

import enum

from sqlalchemy import (
    CheckConstraint,
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class PregnancyStatus(str, enum.Enum):
    """Administrative state of a recorded pregnancy."""

    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class FetalMovements(str, enum.Enum):
    """Observed/reported movement status; never a diagnostic interpretation."""

    REPORTED = "reported"
    NOT_REPORTED = "not_reported"
    NOT_ASSESSED = "not_assessed"


class FetalPresentation(str, enum.Enum):
    """Presentation recorded by the clinician, when assessed."""

    CEPHALIC = "cephalic"
    BREECH = "breech"
    TRANSVERSE = "transverse"
    OTHER = "other"
    NOT_ASSESSED = "not_assessed"


class Pregnancy(Base):
    """A patient pregnancy record owned by its responsible doctor."""

    __tablename__ = "pregnancies"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default=PregnancyStatus.ACTIVE.value, index=True)
    last_menstrual_period = Column(Date, nullable=True)
    estimated_delivery_date = Column(Date, nullable=True)
    # Dating is a clinical decision with its own history.  These columns hold
    # only the currently accepted decision; prior calculations live in
    # PregnancyDatingEvent and are never overwritten.
    dating_method = Column(String(40), nullable=True)
    dating_status = Column(String(40), nullable=False, default="pending", index=True)
    estimated_delivery_date_source = Column(String(80), nullable=True)
    estimated_delivery_date_confirmed_at = Column(DateTime, nullable=True)
    confirmed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    dating_notes = Column(Text, nullable=True)
    # Boolean, no Integer: los schemas siempre lo declararon bool y PostgreSQL
    # rechazaba el INSERT (migracion 2026_09_19_0016).
    is_multiple_gestation = Column(Boolean, nullable=False, default=False)
    fetus_count = Column(Integer, nullable=True)
    conception_method = Column(String(40), nullable=True)
    high_risk_status = Column(String(40), nullable=False, default="not_recorded")
    outcome = Column(String(40), nullable=False, default="ongoing")
    outcome_date = Column(Date, nullable=True)
    actual_delivery_date = Column(Date, nullable=True)
    actual_gestational_age_weeks = Column(Numeric(4, 1), nullable=True)
    outcome_notes = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    # Proxima revision prenatal.  Hasta ahora la fecha se calculaba en el
    # navegador y se perdia al recargar, asi que ningun proceso del servidor
    # podia recordarla: el recordatorio de "ya toca revision" corre aqui, no
    # en el browser de la doctora.  Se guardan dos fechas a proposito:
    # `next_review_on` es la que vale (la que la doctora acepto o movio) y
    # `next_review_suggested_on` es la que propuso la regla de intervalos, para
    # poder saber despues si la sugerencia se respeto o se ajusto.
    next_review_on = Column(Date, nullable=True, index=True)
    next_review_suggested_on = Column(Date, nullable=True)
    next_review_adjusted_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    next_review_adjusted_at = Column(DateTime, nullable=True)
    # De que fecha de revision ya se le aviso a la asistente. No es "si se
    # aviso" sino "de cual": el trabajo corre todos los dias sobre el mismo
    # embarazo, y comparar contra `next_review_on` es lo que hace que reenviar
    # sea imposible y que mover la fecha vuelva a armar el aviso.
    next_review_reminded_on = Column(Date, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant")
    patient = relationship("Patient", back_populates="pregnancies")
    doctor = relationship("User", foreign_keys=[doctor_id])
    confirmed_by = relationship("User", foreign_keys=[confirmed_by_user_id])
    next_review_adjusted_by = relationship(
        "User", foreign_keys=[next_review_adjusted_by_user_id]
    )
    visits = relationship(
        "PrenatalVisit",
        back_populates="pregnancy",
        cascade="all, delete-orphan",
        order_by="PrenatalVisit.visit_date.desc()",
    )
    dating_events = relationship(
        "PregnancyDatingEvent", back_populates="pregnancy", cascade="all, delete-orphan",
        order_by="PregnancyDatingEvent.recorded_at.desc()",
    )
    fetuses = relationship(
        "FetalRecord", back_populates="pregnancy", cascade="all, delete-orphan",
        order_by="FetalRecord.sequence_number.asc()",
    )
    milestones = relationship(
        "PrenatalMilestone", back_populates="pregnancy", cascade="all, delete-orphan",
        order_by="PrenatalMilestone.due_on.asc()",
    )


class PregnancyDatingEvent(Base):
    """An auditable dating proposal or accepted FPP revision."""

    __tablename__ = "pregnancy_dating_events"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    pregnancy_id = Column(Integer, ForeignKey("pregnancies.id"), nullable=False, index=True)
    recorded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    method = Column(String(40), nullable=False)
    status = Column(String(30), nullable=False, default="proposed")
    last_menstrual_period = Column(Date, nullable=True)
    ultrasound_date = Column(Date, nullable=True)
    gestational_age_weeks = Column(Numeric(4, 1), nullable=True)
    measurement = Column(String(80), nullable=True)
    proposed_delivery_date = Column(Date, nullable=True)
    accepted_delivery_date = Column(Date, nullable=True)
    reason = Column(Text, nullable=True)
    source_document_id = Column(Integer, ForeignKey("patient_documents.id"), nullable=True)
    recorded_at = Column(DateTime, default=utcnow, nullable=False)

    tenant = relationship("Tenant")
    pregnancy = relationship("Pregnancy", back_populates="dating_events")
    recorded_by = relationship("User", foreign_keys=[recorded_by_user_id])


class FetalRecord(Base):
    """A clinical fetal record; it intentionally does not create a patient identity."""

    __tablename__ = "fetal_records"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    pregnancy_id = Column(Integer, ForeignKey("pregnancies.id"), nullable=False, index=True)
    sequence_number = Column(Integer, nullable=False)
    clinical_identifier = Column(String(100), nullable=True)
    chorionicity = Column(String(60), nullable=True)
    amnionicity = Column(String(60), nullable=True)
    reported_sex = Column(String(30), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant")
    pregnancy = relationship("Pregnancy", back_populates="fetuses")
    assessments = relationship(
        "FetalAssessment", back_populates="fetal_record", cascade="all, delete-orphan",
        order_by="FetalAssessment.assessed_on.desc()",
    )


class FetalAssessment(Base):
    """Findings explicitly documented for one fetus in a visit or study."""

    __tablename__ = "fetal_assessments"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    fetal_record_id = Column(Integer, ForeignKey("fetal_records.id"), nullable=False, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True)
    source_document_id = Column(Integer, ForeignKey("patient_documents.id"), nullable=True)
    recorded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assessed_on = Column(Date, nullable=False, index=True)
    gestational_age_weeks = Column(Numeric(4, 1), nullable=True)
    fetal_heart_rate_bpm = Column(Integer, nullable=True)
    presentation = Column(String(30), nullable=True)
    estimated_weight_g = Column(Integer, nullable=True)
    reported_percentile = Column(String(40), nullable=True)
    findings = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant")
    fetal_record = relationship("FetalRecord", back_populates="assessments")
    appointment = relationship("Appointment")
    recorded_by = relationship("User", foreign_keys=[recorded_by_user_id])


class PrenatalMilestone(Base):
    """A clinician-configured prenatal task or contact, never an automatic order."""

    __tablename__ = "prenatal_milestones"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    pregnancy_id = Column(Integer, ForeignKey("pregnancies.id"), nullable=False, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(180), nullable=False)
    status = Column(String(30), nullable=False, default="suggested", index=True)
    due_on = Column(Date, nullable=True, index=True)
    notes = Column(Text, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant")
    pregnancy = relationship("Pregnancy", back_populates="milestones")
    created_by = relationship("User", foreign_keys=[created_by_user_id])


class PrenatalVisit(Base):
    """Structured observations documented during one prenatal visit."""

    __tablename__ = "prenatal_visits"
    __table_args__ = (
        CheckConstraint(
            "gestational_age_weeks IS NULL OR (gestational_age_weeks >= 0 AND gestational_age_weeks <= 45)",
            name="ck_prenatal_visits_gestational_age",
        ),
        CheckConstraint(
            "maternal_weight_kg IS NULL OR (maternal_weight_kg >= 20 AND maternal_weight_kg <= 400)",
            name="ck_prenatal_visits_weight",
        ),
        CheckConstraint(
            "systolic_bp IS NULL OR (systolic_bp >= 40 AND systolic_bp <= 300)",
            name="ck_prenatal_visits_systolic_bp",
        ),
        CheckConstraint(
            "diastolic_bp IS NULL OR (diastolic_bp >= 20 AND diastolic_bp <= 200)",
            name="ck_prenatal_visits_diastolic_bp",
        ),
        CheckConstraint(
            "fundal_height_cm IS NULL OR (fundal_height_cm >= 0 AND fundal_height_cm <= 80)",
            name="ck_prenatal_visits_fundal_height",
        ),
        CheckConstraint(
            "fetal_heart_rate_bpm IS NULL OR (fetal_heart_rate_bpm >= 30 AND fetal_heart_rate_bpm <= 300)",
            name="ck_prenatal_visits_fetal_heart_rate",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    pregnancy_id = Column(Integer, ForeignKey("pregnancies.id"), nullable=False, index=True)
    appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True, unique=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    visit_date = Column(Date, nullable=False, index=True)
    gestational_age_weeks = Column(Numeric(4, 1), nullable=True)
    maternal_weight_kg = Column(Numeric(5, 2), nullable=True)
    systolic_bp = Column(Integer, nullable=True)
    diastolic_bp = Column(Integer, nullable=True)
    fundal_height_cm = Column(Numeric(4, 1), nullable=True)
    fetal_heart_rate_bpm = Column(Integer, nullable=True)
    fetal_movements = Column(String(20), nullable=True)
    fetal_presentation = Column(String(20), nullable=True)
    maternal_observations = Column(Text, nullable=True)
    fetal_observations = Column(Text, nullable=True)
    plan_notes = Column(Text, nullable=True)
    next_visit_on = Column(Date, nullable=True, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant")
    pregnancy = relationship("Pregnancy", back_populates="visits")
    appointment = relationship("Appointment", foreign_keys=[appointment_id])
    doctor = relationship("User", foreign_keys=[doctor_id])
