"""Anular un resultado de orden (plan 29, lote 9).

Columnas nuevas, todas nulas, en ``diagnostic_results``:

- ``anulado_at`` (con índice: la bandeja, la gráfica de valoraciones y los
  pendientes de la consulta filtran por ella),
- ``anulado_por_user_id`` → users,
- ``anulado_motivo`` VARCHAR(500).

Un resultado existente queda igual que antes: vigente. No se borra ni se
cambia ningún dato.

Reversible: el downgrade quita las columnas. Ojo: un resultado anulado
volvería a contar como vigente; su documento sigue anulado (eso vive en
``patient_documents``, 0038).

Revision ID: 2026_10_04_0039
Revises: 2026_10_04_0038
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_10_04_0039"
down_revision = "2026_10_04_0038"
branch_labels = None
depends_on = None

TABLA = "diagnostic_results"


def upgrade() -> None:
    # batch_alter_table: en SQLite (las pruebas) la llave foránea nueva
    # requiere recrear la tabla; en PostgreSQL es un ALTER normal.
    with op.batch_alter_table(TABLA) as tabla:
        tabla.add_column(sa.Column("anulado_at", sa.DateTime(), nullable=True))
        tabla.add_column(sa.Column("anulado_por_user_id", sa.Integer(), nullable=True))
        tabla.add_column(sa.Column("anulado_motivo", sa.String(length=500), nullable=True))
        tabla.create_foreign_key("fk_diagnostic_results_anulado_por", "users", ["anulado_por_user_id"], ["id"])
        tabla.create_index("ix_diagnostic_results_anulado_at", ["anulado_at"])


def downgrade() -> None:
    with op.batch_alter_table(TABLA) as tabla:
        tabla.drop_index("ix_diagnostic_results_anulado_at")
        tabla.drop_constraint("fk_diagnostic_results_anulado_por", type_="foreignkey")
        for columna in ("anulado_motivo", "anulado_por_user_id", "anulado_at"):
            tabla.drop_column(columna)
