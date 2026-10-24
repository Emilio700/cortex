"""Add sanitized clinical image thumbnail path.

Revision ID: 2026_08_08_0010
Revises: 2026_08_08_0009
"""

import sqlalchemy as sa
from alembic import op

revision = "2026_08_08_0010"
down_revision = "2026_08_08_0009"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("clinical_images", sa.Column("thumbnail_path", sa.String(length=500), nullable=True))


def downgrade():
    op.drop_column("clinical_images", "thumbnail_path")
