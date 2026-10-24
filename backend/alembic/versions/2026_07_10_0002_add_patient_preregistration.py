"""Add patient preregistration / intake (Fase 6.4)

Revision ID: 5f7a1e9d3b62
Revises: 3d8f2a91c6e5
Create Date: 2026-07-10 00:02:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5f7a1e9d3b62'
down_revision: Union[str, None] = '3d8f2a91c6e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    preregistration_status = sa.Enum(
        'PENDING', 'CONTACTED', 'CONVERTED', 'DISCARDED', name='preregistrationstatus'
    )

    op.create_table(
        'patient_preregistrations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('full_name', sa.String(200), nullable=False),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('email', sa.String(100), nullable=True),
        sa.Column('specialty_id', sa.Integer(), nullable=True),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('status', preregistration_status, nullable=False),
        sa.Column('converted_patient_id', sa.Integer(), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id']),
        sa.ForeignKeyConstraint(['specialty_id'], ['specialties.id']),
        sa.ForeignKeyConstraint(['converted_patient_id'], ['patients.id']),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_patient_preregistrations_id'), 'patient_preregistrations', ['id'], unique=False)
    op.create_index(op.f('ix_patient_preregistrations_tenant_id'), 'patient_preregistrations', ['tenant_id'], unique=False)
    op.create_index(op.f('ix_patient_preregistrations_status'), 'patient_preregistrations', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_patient_preregistrations_status'), table_name='patient_preregistrations')
    op.drop_index(op.f('ix_patient_preregistrations_tenant_id'), table_name='patient_preregistrations')
    op.drop_index(op.f('ix_patient_preregistrations_id'), table_name='patient_preregistrations')
    op.drop_table('patient_preregistrations')
    sa.Enum(name='preregistrationstatus').drop(op.get_bind(), checkfirst=True)
