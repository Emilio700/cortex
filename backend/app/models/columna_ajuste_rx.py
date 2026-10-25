"""Ajuste de la columna de Neuro 3D desde radiografías (Cortex).

Guarda **los puntos que marcó el médico**, no sólo los ángulos: si mañana se
corrige una fórmula, los puntos permiten recalcular, y en la consulta de
control se ve dónde se midió. Las mediciones las calcula el servidor
(``services/columna_rx.py``) con ``version_calculo``.

La imagen de origen no se copia: se referencia, una por vista (lateral y AP),
como imagen clínica (una foto de la placa) o como serie DICOM (CR/DX).

No se borra: se **anula** con motivo, como las escalas aplicadas. Neuro 3D usa el
ajuste vigente más reciente del paciente.
"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from app.db.session import Base, utcnow


class OrigenRx:
    """De dónde sale cada vista."""

    IMAGEN_CLINICA = "imagen_clinica"
    SERIE_DICOM = "serie_dicom"
    TODOS = (IMAGEN_CLINICA, SERIE_DICOM)


class ColumnaAjusteRx(Base):
    __tablename__ = "columna_ajustes_rx"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # Origen de cada vista: tipo («imagen_clinica» | «serie_dicom») e id. Una
    # de las dos puede faltar (sólo trajo la lateral, por ejemplo).
    lateral_origen = Column(String(20), nullable=True)
    lateral_origen_id = Column(Integer, nullable=True)
    ap_origen = Column(String(20), nullable=True)
    ap_origen_id = Column(Integer, nullable=True)
    # MarcasRx: píxeles de la imagen, tal como los validó el servidor.
    puntos = Column(JSON, nullable=False)
    # {lateral, ap}: «ninguna», «dicom» (espaciado leído de la serie) o «referencia».
    calibracion = Column(JSON, nullable=False)
    # Derecha del paciente en la AP y vértebras límite elegidas para el Cobb.
    opciones = Column(JSON, nullable=False)
    # Lo que calculó el servidor (ResultadoRx).
    mediciones = Column(JSON, nullable=False)
    version_calculo = Column(String(20), nullable=False)
    notas = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    anulado_at = Column(DateTime, nullable=True, index=True)
    anulado_por_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    anulado_motivo = Column(String(500), nullable=True)

    tenant = relationship("Tenant")
    patient = relationship("Patient")
    doctor = relationship("User", foreign_keys=[doctor_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    anulado_por = relationship("User", foreign_keys=[anulado_por_user_id])
