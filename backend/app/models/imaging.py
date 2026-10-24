"""Estudios de imagen DICOM del paciente.

Un estudio no es un archivo adjunto: es un objeto clínico con fecha, modalidad y
procedencia, del que cuelgan series y mediciones. Por eso vive en sus propias
tablas y no dentro de ``patient_documents``: un estudio de 150 cortes no cabe en
un documento, y la comparación entre dos fechas necesita series identificables.

Los archivos se guardan tal como llegaron (el original es inmutable) y aquí solo
se indexa lo necesario para mostrarlos: qué series tiene cada estudio, en qué
orden y con qué geometría. Una fila por serie, no por corte: una angio-TC tiene
cientos de cortes y la tabla se volvería inmanejable para lo que se consulta.

``imaging_annotations`` guarda lo que el médico midió. Es dato clínico, no
anotación de visor: por eso lleva autor, fecha y si ya se llevó a la nota.
"""
import enum

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class ImagingStudySource(str, enum.Enum):
    """Por dónde entró el estudio. Se conserva para poder explicar su origen."""

    UPLOAD_FILES = "upload_files"
    UPLOAD_ARCHIVE = "upload_archive"
    EXTERNAL = "external"


class ImagingStudyStatus(str, enum.Enum):
    """``partial`` es un estado de verdad, no un error: faltan series.

    La interfaz no puede decir «estudio listo» cuando ``status`` es distinto de
    ``ready``; es la misma regla que en el resto del sistema.
    """

    RECEIVED = "received"
    INDEXING = "indexing"
    READY = "ready"
    PARTIAL = "partial"
    FAILED = "failed"


class ImagingStudy(Base):
    """Un estudio (una fecha, una modalidad, un ``StudyInstanceUID``)."""

    __tablename__ = "imaging_studies"
    __table_args__ = (
        # El mismo estudio no se guarda dos veces en el mismo consultorio: pasa
        # cuando el paciente trae el CD dos veces o hay dos copias en la carpeta.
        UniqueConstraint("tenant_id", "study_instance_uid", name="uq_imaging_studies_tenant_uid"),
    )

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    clinical_episode_id = Column(
        Integer, ForeignKey("clinical_episodes.id"), nullable=True, index=True
    )
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    study_instance_uid = Column(String(64), nullable=False, index=True)
    accession_number = Column(String(64), nullable=True)
    modality = Column(String(16), nullable=False, index=True)
    study_date = Column(DateTime, nullable=False, index=True)
    study_description = Column(String(255), nullable=True)
    body_part = Column(String(64), nullable=True)
    institution_name = Column(String(255), nullable=True)

    source = Column(String(32), nullable=False, default=ImagingStudySource.UPLOAD_FILES.value)
    status = Column(
        String(24), nullable=False, default=ImagingStudyStatus.RECEIVED.value, index=True
    )
    status_detail = Column(Text, nullable=True)

    storage_prefix = Column(String(500), nullable=False)
    series_count = Column(Integer, nullable=False, default=0)
    instance_count = Column(Integer, nullable=False, default=0)
    total_bytes = Column(BigInteger, nullable=False, default=0)

    # ``None`` significa «no se pudo determinar», nunca «no tiene contraste».
    has_contrast = Column(Boolean, nullable=True)
    # Estudio anonimizado para docencia o demostración (perfil básico DICOM).
    deidentified = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    tenant = relationship("Tenant")
    patient = relationship("Patient")
    clinical_episode = relationship("ClinicalEpisode")
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_user_id])
    series = relationship(
        "ImagingSeries",
        back_populates="study",
        cascade="all, delete-orphan",
        order_by="ImagingSeries.series_number",
    )
    annotations = relationship(
        "ImagingAnnotation", back_populates="study", cascade="all, delete-orphan"
    )

    @property
    def is_ready(self) -> bool:
        return self.status in (
            ImagingStudyStatus.READY.value,
            ImagingStudyStatus.PARTIAL.value,
        )


class ImagingSeries(Base):
    """Una serie: un protocolo concreto («T1 axial post», «sagital T2»)."""

    __tablename__ = "imaging_series"
    __table_args__ = (
        UniqueConstraint("study_id", "series_instance_uid", name="uq_imaging_series_study_uid"),
    )

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    study_id = Column(
        Integer, ForeignKey("imaging_studies.id", ondelete="CASCADE"), nullable=False, index=True
    )

    series_instance_uid = Column(String(64), nullable=False)
    series_number = Column(Integer, nullable=False, default=0)
    modality = Column(String(16), nullable=False)
    series_description = Column(String(255), nullable=True)

    # ``sequence_label`` lo deduce el sistema; ``sequence_detected_by`` dice cómo
    # («tag», «heuristic», «manual») para que nadie confunda una deducción con un
    # dato del equipo.
    sequence_label = Column(String(32), nullable=True)
    sequence_detected_by = Column(String(16), nullable=True)

    instance_count = Column(Integer, nullable=False, default=0)
    rows = Column(Integer, nullable=True)
    columns = Column(Integer, nullable=True)
    pixel_spacing_x = Column(Float, nullable=True)
    pixel_spacing_y = Column(Float, nullable=True)
    slice_thickness = Column(Float, nullable=True)

    # Sin posición y orientación del paciente no hay reconstrucción multiplanar:
    # el visor muestra la pila y lo dice, en vez de inventar geometría.
    has_geometry = Column(Boolean, nullable=False, default=False)
    is_derived = Column(Boolean, nullable=False, default=False)

    manifest_path = Column(String(500), nullable=True)
    thumbnail_path = Column(String(500), nullable=True)
    total_bytes = Column(BigInteger, nullable=False, default=0)

    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    study = relationship("ImagingStudy", back_populates="series")


class ImagingAnnotation(Base):
    """Una medición o marca hecha por el médico sobre una serie."""

    __tablename__ = "imaging_annotations"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    study_id = Column(
        Integer, ForeignKey("imaging_studies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    series_id = Column(
        Integer, ForeignKey("imaging_series.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    kind = Column(String(24), nullable=False)  # length, angle, roi, arrow, text, lesion
    geometry = Column(JSON, nullable=False, default=dict)
    value = Column(Float, nullable=True)
    unit = Column(String(16), nullable=True)
    label = Column(String(120), nullable=True)
    notes = Column(Text, nullable=True)

    # Se marca al llevarla a la nota: mientras no esté confirmada, es un trazo
    # del visor y no un dato del expediente.
    is_confirmed = Column(Boolean, nullable=False, default=False)
    confirmed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=utcnow, nullable=False)

    study = relationship("ImagingStudy", back_populates="annotations")
    series = relationship("ImagingSeries")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
