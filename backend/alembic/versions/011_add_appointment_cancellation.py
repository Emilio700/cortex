"""Add cancellation trail to appointments

Revision ID: 011_cancel_trail
Revises: 010_payments
Create Date: 2026-07-04

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '011_cancel_trail'
down_revision = '010_payments'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('appointments', sa.Column('cancellation_reason', sa.Text(), nullable=True))
    op.add_column('appointments', sa.Column('cancelled_by_user_id', sa.Integer(), nullable=True))
    op.add_column('appointments', sa.Column('cancelled_at', sa.DateTime(), nullable=True))
    op.create_foreign_key(
        'fk_appointments_cancelled_by_user_id',
        'appointments', 'users',
        ['cancelled_by_user_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_appointments_cancelled_by_user_id', 'appointments', type_='foreignkey')
    op.drop_column('appointments', 'cancelled_at')
    op.drop_column('appointments', 'cancelled_by_user_id')
    op.drop_column('appointments', 'cancellation_reason')
