"""Drop unused soap_notes.diagnosis column (CIE-10 removed in Plan 05)

Revision ID: 2026_08_01_0003
Revises: 2026_08_01_0002
Create Date: 2026-08-01
"""
from alembic import op
import sqlalchemy as sa

revision = "2026_08_01_0003"
down_revision = "2026_08_01_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("soap_notes", "diagnosis")


def downgrade():
    op.add_column("soap_notes", sa.Column("diagnosis", sa.Text(), nullable=True))
