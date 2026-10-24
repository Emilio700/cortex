"""Quién escribió y quién editó la interpretación de un resultado (plan 32, punto 3).

Columnas nuevas, todas nulas, en ``diagnostic_results``:

- ``interpretacion_escrita_at`` e ``interpretacion_escrita_por_user_id``;
- ``interpretacion_editada_at`` e ``interpretacion_editada_por_user_id``.

Aditiva: los resultados existentes quedan en NULL y la pantalla dice «sin
registro» en vez de inventar quién escribió lo de antes.

Reversible: el downgrade quita las columnas (se pierde ese rastro).

Revision ID: 2026_10_10_0045
Revises: 2026_10_09_0044
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_10_10_0045"
down_revision = "2026_10_09_0044"
branch_labels = None
depends_on = None

TABLA = "diagnostic_results"


def upgrade() -> None:
    with op.batch_alter_table(TABLA) as tabla:
        tabla.add_column(sa.Column("interpretacion_escrita_at", sa.DateTime(), nullable=True))
        tabla.add_column(sa.Column("interpretacion_escrita_por_user_id", sa.Integer(), nullable=True))
        tabla.add_column(sa.Column("interpretacion_editada_at", sa.DateTime(), nullable=True))
        tabla.add_column(sa.Column("interpretacion_editada_por_user_id", sa.Integer(), nullable=True))
        tabla.create_foreign_key("fk_diagnostic_results_interp_escrita_por", "users", ["interpretacion_escrita_por_user_id"], ["id"])
        tabla.create_foreign_key("fk_diagnostic_results_interp_editada_por", "users", ["interpretacion_editada_por_user_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table(TABLA) as tabla:
        tabla.drop_constraint("fk_diagnostic_results_interp_editada_por", type_="foreignkey")
        tabla.drop_constraint("fk_diagnostic_results_interp_escrita_por", type_="foreignkey")
        for columna in (
            "interpretacion_editada_por_user_id", "interpretacion_editada_at",
            "interpretacion_escrita_por_user_id", "interpretacion_escrita_at",
        ):
            tabla.drop_column(columna)
