"""Agregar el numero de expediente del sistema anterior a pacientes.

La migracion original asigno como id de GEMS la clave del sistema legacy
(identica en G & G, con desfase +10000 en San Ignacio). Esa correspondencia
es implicita y se rompe en cuanto un expediente se recaptura a mano o hay
colision de ids, asi que se guarda de forma explicita.

Revision ID: 2026_09_18_0013
Revises: 2026_09_18_0012
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_18_0013"
down_revision = "2026_09_18_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "patients",
        sa.Column("expediente_legacy", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_patients_expediente_legacy",
        "patients",
        ["tenant_id", "expediente_legacy"],
    )


def downgrade() -> None:
    op.drop_index("ix_patients_expediente_legacy", table_name="patients")
    op.drop_column("patients", "expediente_legacy")
