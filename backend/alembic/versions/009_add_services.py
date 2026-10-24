"""Add services table

Revision ID: 009_services
Revises: 008_audit_log
Create Date: 2026-07-04

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '009_services'
down_revision = '008_audit_log'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'services',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_services_id', 'services', ['id'])
    op.create_index('ix_services_tenant_id', 'services', ['tenant_id'])


def downgrade() -> None:
    op.drop_index('ix_services_tenant_id', 'services')
    op.drop_index('ix_services_id', 'services')
    op.drop_table('services')
