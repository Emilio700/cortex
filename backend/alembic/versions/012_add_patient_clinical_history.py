"""Add allergies and antecedentes fields to patients

Revision ID: 012_patient_history
Revises: 011_cancel_trail
Create Date: 2026-07-04

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '012_patient_history'
down_revision = '011_cancel_trail'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('patients', sa.Column('allergies', sa.Text(), nullable=True))
    op.add_column('patients', sa.Column('personal_history', sa.Text(), nullable=True))
    op.add_column('patients', sa.Column('family_history', sa.Text(), nullable=True))
    op.add_column('patients', sa.Column('gynecological_history', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('patients', 'gynecological_history')
    op.drop_column('patients', 'family_history')
    op.drop_column('patients', 'personal_history')
    op.drop_column('patients', 'allergies')
