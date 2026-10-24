"""Add appointment reminders (Fase 4.3)

Revision ID: 7a4c5b2e1f9d
Revises: 013_notifications
Create Date: 2026-07-04 00:01:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a4c5b2e1f9d'
down_revision: Union[str, None] = '013_notifications'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'appointment_reminders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column('appointment_id', sa.Integer(), nullable=False),
        sa.Column('reminder_minutes_before', sa.Integer(), nullable=False),
        sa.Column('sent_at', sa.DateTime(), nullable=False),
        sa.Column('channel', sa.String(50), default='email_and_inapp', nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['appointment_id'], ['appointments.id']),
        sa.ForeignKeyConstraint(['doctor_id'], ['users.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_appointment_reminders_id'), 'appointment_reminders', ['id'], unique=False)

    op.create_table(
        'appointment_reminder_preferences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column('enabled', sa.Boolean(), default=True, nullable=False),
        sa.Column('reminder_times', sa.String(255), default='1440,60', nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['doctor_id'], ['users.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('doctor_id', name='uq_one_reminder_preference_per_doctor'),
    )
    op.create_index(op.f('ix_appointment_reminder_preferences_id'), 'appointment_reminder_preferences', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_appointment_reminder_preferences_id'), table_name='appointment_reminder_preferences')
    op.drop_table('appointment_reminder_preferences')
    op.drop_index(op.f('ix_appointment_reminders_id'), table_name='appointment_reminders')
    op.drop_table('appointment_reminders')
