"""Hacer opcional la fecha de nacimiento de la paciente (captura express).

El alta rápida en recepción sólo exige nombre, apellidos y celular, así que
``patients.date_of_birth`` pasa a ser NULL-able.

RIESGO DEL DOWNGRADE: volver la columna a NOT NULL falla si para entonces ya
existen pacientes registradas sin fecha de nacimiento. Antes de revertir hay
que resolver esas filas a mano (capturar la fecha real o decidir un valor
centinela); esta migración no inventa fechas por nadie.

Revision ID: 2026_09_18_0012
Revises: 2026_08_08_0011
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_18_0012"
down_revision = "2026_08_08_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "patients",
        "date_of_birth",
        existing_type=sa.Date(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "patients",
        "date_of_birth",
        existing_type=sa.Date(),
        nullable=False,
    )
