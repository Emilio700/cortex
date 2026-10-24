"""Patient model"""

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class Patient(Base):
    """Patient model"""

    __tablename__ = "patients"
    # El buscador del mostrador hace ILIKE '%palabra%' en estas columnas: con
    # el comodín al inicio sólo sirve un índice de trigramas (pg_trgm). Existen
    # sólo en PostgreSQL; en SQLite no se crean (migración 2026_09_29_0027, B-05).
    __table_args__ = tuple(
        Index(
            f"ix_patients_{columna}_trgm",
            columna,
            postgresql_using="gin",
            postgresql_ops={columna: "gin_trgm_ops"},
        ).ddl_if(dialect="postgresql")
        for columna in ("first_name", "last_name", "phone", "cell_phone", "email")
    )

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    date_of_birth = Column(Date, nullable=True)  # opcional: captura express en recepción
    gender = Column(String(20))  # Male, Female, Other
    phone = Column(String(20))
    email = Column(String(100))
    address = Column(String(500))
    # Clinical background (Fase 3.6). All nullable/free-text: "no registrado"
    # is a different, honest state from "registrado como negativo" - the PDF
    # generator must not collapse the two (see app/utils/pdf.py).
    allergies = Column(Text, nullable=True)
    personal_history = Column(Text, nullable=True)  # antecedentes personales
    family_history = Column(Text, nullable=True)  # antecedentes familiares
    gynecological_history = Column(Text, nullable=True)  # antecedentes gineco-obstétricos
    # ── Structured clinical fields (legacy migration) ──
    blood_type = Column(String(5), nullable=True)  # A+, A-, B+, B-, AB+, AB-, O+, O-
    cell_phone = Column(String(20), nullable=True)
    religion = Column(String(50), nullable=True)
    patient_type = Column(String(30), nullable=True)  # OBSTETRICAS, GINECOLOGICAS, etc.
    menarca_age = Column(Integer, nullable=True)
    menstrual_rhythm = Column(String(30), nullable=True)  # e.g. "30X4 DIS"
    ivsa_age = Column(Integer, nullable=True)  # edad de inicio de vida sexual
    birth_control = Column(String(50), nullable=True)  # método anticonceptivo
    last_menstrual_period = Column(Date, nullable=True)  # FUR
    expected_delivery_date = Column(Date, nullable=True)  # FPP
    gestas = Column(Integer, nullable=True)
    paras = Column(Integer, nullable=True)
    cesareas = Column(Integer, nullable=True)
    abortos = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    # Notas del doctor para reconocer al paciente (de donde es, quien la
    # recomendo). Separado de allergies, que se imprime en las recetas.
    notas_referencia = Column(Text, nullable=True)

    # Numero de expediente del sistema anterior. Permite cruzar pacientes aunque
    # el id de GEMS no coincida (recapturas manuales, colisiones de id).
    expediente_legacy = Column(Integer, nullable=True, index=True)

    owner_doctor_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    owner_doctor = relationship("User", foreign_keys=[owner_doctor_id])
    tenant = relationship("Tenant", back_populates="patients")
    appointments = relationship("Appointment", back_populates="patient")
    documents = relationship("Document", back_populates="patient")
    prescriptions = relationship("Prescription", back_populates="patient")
    medical_certificates = relationship("MedicalCertificate", back_populates="patient")
    clinical_episodes = relationship("ClinicalEpisode", back_populates="patient")
    clinical_images = relationship("ClinicalImage", back_populates="patient")
    clinical_consents = relationship("ClinicalConsent", back_populates="patient")
    pregnancies = relationship("Pregnancy", back_populates="patient")
    care_team_members = relationship("PatientCareTeamMember", back_populates="patient")
