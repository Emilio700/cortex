"""Add digital informed-consent records.

Revision ID: 2026_08_07_0004
Revises: 2026_08_06_0003
Create Date: 2026-08-07
"""

import sqlalchemy as sa
from alembic import op

revision = "2026_08_07_0004"
down_revision = "2026_08_06_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "clinical_consents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("appointment_id", sa.Integer(), sa.ForeignKey("appointments.id"), nullable=True),
        sa.Column(
            "clinical_episode_id",
            sa.Integer(),
            sa.ForeignKey("clinical_episodes.id"),
            nullable=True,
        ),
        sa.Column("doctor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("consent_type", sa.String(length=60), nullable=False),
        sa.Column("template_version", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("procedure_name", sa.String(length=255), nullable=True),
        sa.Column("diagnosis", sa.Text(), nullable=True),
        sa.Column("rendered_body", sa.Text(), nullable=False),
        sa.Column("field_values", sa.JSON(), nullable=False),
        sa.Column("acknowledgements", sa.JSON(), nullable=False),
        sa.Column("patient_signed_name", sa.String(length=200), nullable=True),
        sa.Column("patient_signature_path", sa.String(length=500), nullable=True),
        sa.Column("patient_signed_at", sa.DateTime(), nullable=True),
        sa.Column("doctor_confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("signed_pdf_path", sa.String(length=500), nullable=True),
        sa.Column("content_hash", sa.String(length=64), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("revoked_reason", sa.Text(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    for column in (
        "tenant_id",
        "patient_id",
        "appointment_id",
        "clinical_episode_id",
        "doctor_id",
        "consent_type",
        "status",
    ):
        op.create_index(f"ix_clinical_consents_{column}", "clinical_consents", [column])


def downgrade():
    op.drop_table("clinical_consents")
