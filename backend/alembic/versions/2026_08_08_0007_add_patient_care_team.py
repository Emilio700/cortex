"""Add explicit, revocable patient care-team memberships.

Revision ID: 2026_08_08_0007
Revises: 2026_08_08_0006
Create Date: 2026-08-08
"""

import sqlalchemy as sa

from alembic import op

revision = "2026_08_08_0007"
down_revision = "2026_08_08_0006"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "patient_care_team_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("episode_id", sa.Integer(), sa.ForeignKey("clinical_episodes.id"), nullable=True),
        sa.Column("access_role", sa.String(length=20), nullable=False),
        sa.Column("granted_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("revocation_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "access_role IN ('collaborator', 'assistant', 'temporary')",
            name="ck_care_team_access_role",
        ),
        sa.CheckConstraint(
            "expires_at IS NULL OR expires_at > starts_at",
            name="ck_care_team_expiry_after_start",
        ),
        sa.CheckConstraint(
            "access_role != 'temporary' OR reason IS NOT NULL",
            name="ck_care_team_temporary_reason",
        ),
    )
    op.create_index("ix_care_team_tenant", "patient_care_team_members", ["tenant_id"])
    op.create_index("ix_care_team_patient", "patient_care_team_members", ["patient_id"])
    op.create_index("ix_care_team_user", "patient_care_team_members", ["user_id"])
    op.create_index("ix_care_team_episode", "patient_care_team_members", ["episode_id"])
    op.create_index("ix_care_team_granted_by", "patient_care_team_members", ["granted_by_user_id"])
    op.create_index("ix_care_team_active_window", "patient_care_team_members", ["patient_id", "user_id", "revoked_at", "expires_at"])


def downgrade():
    op.drop_index("ix_care_team_active_window", table_name="patient_care_team_members")
    op.drop_index("ix_care_team_granted_by", table_name="patient_care_team_members")
    op.drop_index("ix_care_team_episode", table_name="patient_care_team_members")
    op.drop_index("ix_care_team_user", table_name="patient_care_team_members")
    op.drop_index("ix_care_team_patient", table_name="patient_care_team_members")
    op.drop_index("ix_care_team_tenant", table_name="patient_care_team_members")
    op.drop_table("patient_care_team_members")
