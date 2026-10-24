"""Add password_reset_tokens table

Revision ID: 2026_08_01_0004
Revises: 2026_08_01_0003
Create Date: 2026-08-01
"""
from alembic import op
import sqlalchemy as sa

revision = "2026_08_01_0004"
down_revision = "2026_08_01_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token", sa.String(500), nullable=False, unique=True),
        sa.Column("used", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_password_reset_tokens_token", "password_reset_tokens", ["token"])
    op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"])


def downgrade():
    op.drop_table("password_reset_tokens")
