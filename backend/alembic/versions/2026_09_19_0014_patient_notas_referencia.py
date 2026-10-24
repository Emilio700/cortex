"""Agregar notas de referencia del paciente.

El doctor usaba el campo libre del sistema anterior para acordarse de la
paciente (de donde es, quien la recomendo). Eso acabo dentro de ``allergies``,
que se imprime en las recetas. Se le da su propio campo para separar la
referencia personal de la informacion de seguridad clinica.

Revision ID: 2026_09_19_0014
Revises: 2026_09_18_0013
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_19_0014"
down_revision = "2026_09_18_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("notas_referencia", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("patients", "notas_referencia")
