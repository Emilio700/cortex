"""Add must_change_password flag to users

Revision ID: 2026_08_01_0002
Revises: 2026_08_01_0001
Create Date: 2026-08-01
"""
from alembic import op
import sqlalchemy as sa

revision = "2026_08_01_0002"
down_revision = "2026_08_01_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade():
    op.drop_column("users", "must_change_password")
