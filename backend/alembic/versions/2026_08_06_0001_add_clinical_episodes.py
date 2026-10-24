"""Add longitudinal clinical episodes for gynecology records.

Revision ID: 2026_08_06_0001
Revises: 2026_08_01_0004
Create Date: 2026-08-06
"""
from alembic import op
import sqlalchemy as sa


revision = "2026_08_06_0001"
down_revision = "2026_08_01_0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "clinical_episodes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("episode_type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("started_on", sa.Date(), nullable=False),
        sa.Column("follow_up_on", sa.Date(), nullable=True),
        sa.Column("next_action", sa.Text(), nullable=True),
        sa.Column("resolved_on", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_clinical_episodes_tenant_id", "clinical_episodes", ["tenant_id"])
    op.create_index("ix_clinical_episodes_patient_id", "clinical_episodes", ["patient_id"])
    op.create_index("ix_clinical_episodes_episode_type", "clinical_episodes", ["episode_type"])
    op.create_index("ix_clinical_episodes_status", "clinical_episodes", ["status"])
    op.create_index("ix_clinical_episodes_follow_up_on", "clinical_episodes", ["follow_up_on"])


def downgrade():
    op.drop_table("clinical_episodes")
