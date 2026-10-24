"""Corrección de documentos clínicos: anular y mover (plan 29, lote 7).

Columnas nuevas, todas nulas, en ``patient_documents``:

- ``anulado_at`` (con índice: las vistas normales filtran por ella),
  ``anulado_por_user_id`` → users, ``anulado_motivo`` VARCHAR(500);
- ``movido_desde_patient_id`` → patients, ``movido_at``,
  ``movido_por_user_id`` → users, ``movido_motivo`` VARCHAR(500).

Un documento existente queda igual que antes: vigente y sin movimientos. No
se borra ni se cambia ningún dato.

Reversible: el downgrade quita las columnas. Ojo: un documento anulado
volvería a verse como vigente (no hay a dónde llevar la anulación), y uno
movido se queda con la paciente a la que se movió.

Revision ID: 2026_10_04_0038
Revises: 2026_10_04_0037
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_10_04_0038"
down_revision = "2026_10_04_0037"
branch_labels = None
depends_on = None

TABLA = "patient_documents"


def upgrade() -> None:
    # batch_alter_table: en SQLite (las pruebas) las llaves foráneas nuevas
    # requieren recrear la tabla; en PostgreSQL es un ALTER normal.
    with op.batch_alter_table(TABLA) as tabla:
        tabla.add_column(sa.Column("anulado_at", sa.DateTime(), nullable=True))
        tabla.add_column(sa.Column("anulado_por_user_id", sa.Integer(), nullable=True))
        tabla.add_column(sa.Column("anulado_motivo", sa.String(length=500), nullable=True))
        tabla.add_column(sa.Column("movido_desde_patient_id", sa.Integer(), nullable=True))
        tabla.add_column(sa.Column("movido_at", sa.DateTime(), nullable=True))
        tabla.add_column(sa.Column("movido_por_user_id", sa.Integer(), nullable=True))
        tabla.add_column(sa.Column("movido_motivo", sa.String(length=500), nullable=True))
        tabla.create_foreign_key("fk_patient_documents_anulado_por", "users", ["anulado_por_user_id"], ["id"])
        tabla.create_foreign_key("fk_patient_documents_movido_desde", "patients", ["movido_desde_patient_id"], ["id"])
        tabla.create_foreign_key("fk_patient_documents_movido_por", "users", ["movido_por_user_id"], ["id"])
        tabla.create_index("ix_patient_documents_anulado_at", ["anulado_at"])


def downgrade() -> None:
    with op.batch_alter_table(TABLA) as tabla:
        tabla.drop_index("ix_patient_documents_anulado_at")
        tabla.drop_constraint("fk_patient_documents_movido_por", type_="foreignkey")
        tabla.drop_constraint("fk_patient_documents_movido_desde", type_="foreignkey")
        tabla.drop_constraint("fk_patient_documents_anulado_por", type_="foreignkey")
        for columna in (
            "movido_motivo",
            "movido_por_user_id",
            "movido_at",
            "movido_desde_patient_id",
            "anulado_motivo",
            "anulado_por_user_id",
            "anulado_at",
        ):
            tabla.drop_column(columna)
