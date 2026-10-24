"""Add payments table

Revision ID: 010_payments
Revises: 009_services
Create Date: 2026-07-04

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '010_payments'
down_revision = '009_services'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Let op.create_table create the 'paymentmethod' type implicitly (the
    # standard Alembic idiom) - a separate explicit .create() call before
    # this caused a "type already exists" error on PostgreSQL (the type got
    # created twice within the same upgrade transaction).
    payment_method = sa.Enum('cash', 'card', 'transfer', 'other', name='paymentmethod')

    op.create_table(
        'payments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('appointment_id', sa.Integer(), nullable=True),
        sa.Column('service_id', sa.Integer(), nullable=True),
        sa.Column('received_by_user_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('method', payment_method, nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('paid_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['appointment_id'], ['appointments.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['service_id'], ['services.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['received_by_user_id'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_payments_id', 'payments', ['id'])
    op.create_index('ix_payments_tenant_id', 'payments', ['tenant_id'])
    op.create_index('ix_payments_patient_id', 'payments', ['patient_id'])
    op.create_index('ix_payments_appointment_id', 'payments', ['appointment_id'])
    op.create_index('ix_payments_service_id', 'payments', ['service_id'])
    op.create_index('ix_payments_method', 'payments', ['method'])
    op.create_index('ix_payments_paid_at', 'payments', ['paid_at'])


def downgrade() -> None:
    op.drop_index('ix_payments_paid_at', 'payments')
    op.drop_index('ix_payments_method', 'payments')
    op.drop_index('ix_payments_service_id', 'payments')
    op.drop_index('ix_payments_appointment_id', 'payments')
    op.drop_index('ix_payments_patient_id', 'payments')
    op.drop_index('ix_payments_tenant_id', 'payments')
    op.drop_index('ix_payments_id', 'payments')
    # op.drop_table implicitly drops the 'paymentmethod' type too (mirroring
    # how create_table created it) - no separate .drop() call needed.
    op.drop_table('payments')
