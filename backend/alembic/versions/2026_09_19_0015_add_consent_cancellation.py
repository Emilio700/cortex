"""Agregar cancelacion trazable de consentimientos clinicos.

Un consentimiento firmado es un documento con valor legal: cuando se emite
por error no se borra, se anula. Se guardan motivo, autor y fecha de la
cancelacion, mas la ruta del PDF marcado como cancelado. El texto original
(``rendered_body``) y el PDF firmado original nunca se tocan.

Revision ID: 2026_09_19_0015
Revises: 2026_09_19_0014
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_19_0015"
down_revision = "2026_09_19_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clinical_consents", sa.Column("cancelled_reason", sa.Text(), nullable=True))
    op.add_column("clinical_consents", sa.Column("cancelled_at", sa.DateTime(), nullable=True))
    op.add_column(
        "clinical_consents", sa.Column("cancelled_by_user_id", sa.Integer(), nullable=True)
    )
    op.add_column(
        "clinical_consents", sa.Column("cancelled_pdf_path", sa.String(length=500), nullable=True)
    )
    op.create_foreign_key(
        "fk_clinical_consents_cancelled_by_user_id_users",
        "clinical_consents",
        "users",
        ["cancelled_by_user_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_clinical_consents_cancelled_by_user_id_users", "clinical_consents", type_="foreignkey"
    )
    op.drop_column("clinical_consents", "cancelled_pdf_path")
    op.drop_column("clinical_consents", "cancelled_by_user_id")
    op.drop_column("clinical_consents", "cancelled_at")
    op.drop_column("clinical_consents", "cancelled_reason")
