"""Add university to doctor profile

Revision ID: 007
Revises: 006_documents
Create Date: 2026-02-08 21:00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '007_add_university'
down_revision = '006_documents'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if column exists before adding to avoid error if manually added
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('doctor_profiles')]
    
    if 'university' not in columns:
        op.add_column('doctor_profiles', sa.Column('university', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('doctor_profiles', 'university')
