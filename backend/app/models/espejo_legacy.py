"""Correspondencia entre los registros del sistema anterior y los de GEMS.

Por qué una tabla y no una columna en cada tabla clínica
-------------------------------------------------------
Los pacientes ya tienen ``patients.expediente_legacy``, porque el buscador la
usa: ahí el número de expediente es un dato del negocio. Las citas, las notas y
las recetas no: de qué fila del sistema viejo salió una cita no le importa a
nadie en el consultorio, sólo al espejo. Eso es contabilidad de la migración y
vive aparte, por tres razones:

- Se puede espejar una entidad nueva sin otra migración sobre tablas que ya
  tienen decenas de miles de renglones.
- Borrar esta tabla desactiva el espejo por completo sin tocar un solo dato
  clínico.
- La restricción única ``(tenant, tabla, clave)`` es lo que vuelve idempotente
  al job: si el vínculo existe, ese registro del legacy ya se reflejó.

``origen`` distingue dos cosas que no se pueden confundir:

- ``alta``: el espejo creó ese registro en GEMS. Sólo esos puede volver a
  tocar.
- ``reconciliado``: el registro ya existía en GEMS (lo capturó el consultorio,
  o vino de la migración original de julio) y el vínculo sólo sirve para no
  duplicarlo. **El espejo no lo modifica nunca.**
"""
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)

from app.db.session import Base, utcnow

# Valores de ``origen``.
ORIGEN_ALTA = "alta"
ORIGEN_RECONCILIADO = "reconciliado"


class VinculoLegacy(Base):
    """Un registro del sistema anterior y el registro de GEMS que le toca."""

    __tablename__ = "espejo_legacy_vinculos"
    __table_args__ = (
        # El ancla de la idempotencia: una fila del legacy se refleja una vez.
        UniqueConstraint(
            "tenant_id",
            "tabla_legacy",
            "clave_legacy",
            name="uq_espejo_legacy_origen",
        ),
        # Para poder ir en el otro sentido: de una cita de GEMS al legacy.
        Index("ix_espejo_legacy_destino", "entidad", "entidad_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    # Tabla del legacy: 'citas', 'recetas'. Los pacientes no se anotan aquí,
    # su vínculo es ``patients.expediente_legacy``.
    tabla_legacy = Column(String(20), nullable=False)
    # Llave primaria de esa fila en el legacy (id_cita, id_receta...).
    clave_legacy = Column(Integer, nullable=False)
    entidad = Column(String(30), nullable=False)  # 'appointment', 'prescription'
    entidad_id = Column(Integer, nullable=False)
    origen = Column(String(15), nullable=False, default=ORIGEN_ALTA)
    created_at = Column(DateTime, default=utcnow, nullable=False)
