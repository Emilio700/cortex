"""Bitácora de folios emitidos (plan 32, folios homologados).

Cada folio que GEMS imprime en un documento queda aquí con el documento, la
paciente, quién lo emitió y cuándo. Sirve para dos cosas:

- **Verificar:** quien recibe un papel (otro médico, una aseguradora) puede
  preguntar a la clínica, y la administración busca el folio en Auditoría y
  confirma que existe y de qué es.
- **Numerar:** el consecutivo de cada serie (clínica, tipo, año) sale de aquí,
  con el mismo candado por serie que ya usaban las recetas.

Lo emitido antes de la 1.2.0 no está aquí y no se renumera: conserva el folio
que trae impreso.
"""
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint

from app.db.session import Base, utcnow


class TipoDeFolio:
    """El catálogo único de tipos de documento con folio."""

    RECETA = "REC"
    CERTIFICADO = "CER"
    ORDEN = "ORD"
    RESUMEN = "RES"

    NOMBRES = {
        RECETA: "Receta",
        CERTIFICADO: "Certificado médico",
        ORDEN: "Orden de estudios",
        RESUMEN: "Resumen clínico",
    }


class FolioEmitido(Base):
    __tablename__ = "folios_emitidos"
    __table_args__ = (
        # La red de seguridad del consecutivo: aunque dos procesos calcularan
        # el mismo número, solo uno se guarda y el otro reintenta.
        UniqueConstraint("tenant_id", "tipo", "anio", "consecutivo", name="uq_folios_emitidos_serie"),
        Index("ix_folios_emitidos_paciente", "patient_id"),
        # Reimprimir el mismo papel de órdenes devuelve el mismo folio.
        Index("ix_folios_emitidos_origen", "tenant_id", "tipo", "clave_origen"),
    )

    id = Column(Integer, primary_key=True)
    folio = Column(String(40), nullable=False, unique=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False)
    tipo = Column(String(3), nullable=False)
    anio = Column(Integer, nullable=False)
    consecutivo = Column(Integer, nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=True)
    # El documento: ``prescription``, ``medical_certificate``, ``appointment``
    # (papel de la consulta), ``diagnostic_order_group`` o ``patient``.
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(Integer, nullable=True)
    clave_origen = Column(String(1000), nullable=True)
    emitted_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    emitted_at = Column(DateTime, nullable=False, default=utcnow)
