"""Valoración del resultado de un estudio (plan 26, D-9).

Agrega ``diagnostic_results.valoracion`` (VARCHAR(20), nula, con índice): la
escala Excelente / Bien / Regular / Malo / Crítico con la que la doctora
califica el resultado. Elegir «critico» es lo que lo hace crítico;
``is_critical`` se conserva como dato derivado, para las órdenes viejas y para
las consultas que ya lo leen.

Relleno: los resultados que ya estaban marcados críticos quedan con
``valoracion = 'critico'``, para que las dos columnas digan lo mismo. Nada más
se rellena: no se puede inventar una valoración que la doctora no dio.

Reversible: ``downgrade`` quita la columna. ``is_critical`` no se toca en
ninguna dirección, así que se conserva qué resultados eran críticos; se
pierden las valoraciones no críticas.

Revision ID: 2026_10_03_0032
Revises: 2026_10_03_0031
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_10_03_0032"
down_revision = "2026_10_03_0031"
branch_labels = None
depends_on = None

INDICE = "ix_diagnostic_results_valoracion"


def upgrade():
    with op.batch_alter_table("diagnostic_results") as batch:
        batch.add_column(sa.Column("valoracion", sa.String(length=20), nullable=True))
        batch.create_index(INDICE, ["valoracion"])
    op.execute(sa.text("UPDATE diagnostic_results SET valoracion = 'critico' WHERE is_critical = true"))


def downgrade():
    with op.batch_alter_table("diagnostic_results") as batch:
        batch.drop_index(INDICE)
        batch.drop_column("valoracion")
