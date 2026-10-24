"""Add doctor working hours and schedule blocks (Fase 5.1/5.2)

Revision ID: 9b1e6c3a7d24
Revises: 7a4c5b2e1f9d
Create Date: 2026-07-09 00:01:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9b1e6c3a7d24'
down_revision: Union[str, None] = '7a4c5b2e1f9d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'doctor_working_hours',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column('weekday', sa.SmallInteger(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('end_time', sa.Time(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['doctor_id'], ['users.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_doctor_working_hours_id'), 'doctor_working_hours', ['id'], unique=False)
    op.create_index(op.f('ix_doctor_working_hours_doctor_id'), 'doctor_working_hours', ['doctor_id'], unique=False)

    op.create_table(
        'schedule_blocks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column('start_at', sa.DateTime(), nullable=False),
        sa.Column('end_at', sa.DateTime(), nullable=False),
        sa.Column('reason', sa.String(255), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['doctor_id'], ['users.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_schedule_blocks_id'), 'schedule_blocks', ['id'], unique=False)
    op.create_index(op.f('ix_schedule_blocks_doctor_id'), 'schedule_blocks', ['doctor_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_schedule_blocks_doctor_id'), table_name='schedule_blocks')
    op.drop_index(op.f('ix_schedule_blocks_id'), table_name='schedule_blocks')
    op.drop_table('schedule_blocks')
    op.drop_index(op.f('ix_doctor_working_hours_doctor_id'), table_name='doctor_working_hours')
    op.drop_index(op.f('ix_doctor_working_hours_id'), table_name='doctor_working_hours')
    op.drop_table('doctor_working_hours')
