"""Add consent-gated clinical image metadata.

Revision ID: 2026_08_06_0003
Revises: 2026_08_06_0002
Create Date: 2026-08-06
"""

import sqlalchemy as sa
from alembic import op


revision = "2026_08_06_0003"
down_revision = "2026_08_06_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "clinical_images",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("appointment_id", sa.Integer(), sa.ForeignKey("appointments.id"), nullable=True),
        sa.Column("clinical_episode_id", sa.Integer(), sa.ForeignKey("clinical_episodes.id"), nullable=True),
        sa.Column("uploaded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=False),
        sa.Column("body_region", sa.String(length=100), nullable=True),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.Column("taken_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("consent_obtained", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("consent_recorded_at", sa.DateTime(), nullable=True),
        sa.Column("is_reference", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    for column in ("tenant_id", "patient_id", "appointment_id", "clinical_episode_id", "category", "taken_at", "is_reference", "is_archived"):
        op.create_index(f"ix_clinical_images_{column}", "clinical_images", [column])


def downgrade():
    op.drop_table("clinical_images")
