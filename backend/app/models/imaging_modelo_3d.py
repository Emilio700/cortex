"""Modelo 3D del paciente reconstruido desde una serie de su estudio (Cortex).

Es un derivado del estudio, como una captura: el original DICOM no se toca. Lo
arma el servicio segmentador (TotalSegmentator, fuera del backend) y aquí sólo
se registra qué se pidió, en qué va, qué salió y dónde quedó el archivo de
mallas (GLB, en milímetros y en el sistema del paciente LPS).

El estado se dice tal cual: ``pendiente`` → ``procesando`` → ``listo`` o
``fallo`` (con su motivo). La interfaz no puede decir «listo» si esta fila no
lo dice.

``confirmado_por`` / ``confirmado_en`` registran que el médico revisó la
reconstrucción contra las imágenes. No la vuelve diagnóstico: deja rastro de que
alguien la miró antes de usarla.
"""
import enum

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class EstadoModelo3D(str, enum.Enum):
    PENDIENTE = "pendiente"
    PROCESANDO = "procesando"
    LISTO = "listo"
    FALLO = "fallo"


class ImagingModelo3D(Base):
    __tablename__ = "imaging_modelos_3d"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    study_id = Column(
        Integer, ForeignKey("imaging_studies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    series_id = Column(
        Integer, ForeignKey("imaging_series.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # «columna» hoy; «encefalo» en la fase 2.
    region = Column(String(24), nullable=False, default="columna")
    estado = Column(String(16), nullable=False, default=EstadoModelo3D.PENDIENTE.value, index=True)
    motivo_fallo = Column(Text, nullable=True)

    archivo_path = Column(String(500), nullable=True)
    archivo_bytes = Column(Integer, nullable=True)
    estructuras = Column(Integer, nullable=True)
    motor = Column(String(64), nullable=True)
    motor_version = Column(String(32), nullable=True)
    # Lo dice el segmentador cuando corre en modo falso: una columna de prueba
    # nunca se presenta como la del paciente.
    sintetico = Column(Boolean, nullable=False, default=False)

    solicitado_por_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    solicitado_en = Column(DateTime, nullable=False, default=utcnow)
    iniciado_en = Column(DateTime, nullable=True)
    terminado_en = Column(DateTime, nullable=True)

    confirmado_por_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    confirmado_en = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    study = relationship("ImagingStudy")
    series = relationship("ImagingSeries")
    solicitado_por = relationship("User", foreign_keys=[solicitado_por_user_id])
    confirmado_por = relationship("User", foreign_keys=[confirmado_por_user_id])
