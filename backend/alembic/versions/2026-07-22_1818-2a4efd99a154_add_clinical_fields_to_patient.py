"""add_clinical_fields_to_patient

Revision ID: 2a4efd99a154
Revises: b8f3c1d4e9a0
Create Date: 2026-07-22 18:18:30.487733

Adds structured clinical fields from the legacy FoxPro/MySQL system:
- blood_type, cell_phone, religion, patient_type
- menarca_age, menstrual_rhythm, ivsa_age, birth_control
- last_menstrual_period, expected_delivery_date
- gestas, paras, cesareas, abortos (obstetric history as numbers)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '2a4efd99a154'
down_revision: Union[str, None] = 'b8f3c1d4e9a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('patients', sa.Column('blood_type', sa.String(5), nullable=True))
    op.add_column('patients', sa.Column('cell_phone', sa.String(20), nullable=True))
    op.add_column('patients', sa.Column('religion', sa.String(50), nullable=True))
    op.add_column('patients', sa.Column('patient_type', sa.String(30), nullable=True))
    op.add_column('patients', sa.Column('menarca_age', sa.Integer(), nullable=True))
    op.add_column('patients', sa.Column('menstrual_rhythm', sa.String(30), nullable=True))
    op.add_column('patients', sa.Column('ivsa_age', sa.Integer(), nullable=True))
    op.add_column('patients', sa.Column('birth_control', sa.String(50), nullable=True))
    op.add_column('patients', sa.Column('last_menstrual_period', sa.Date(), nullable=True))
    op.add_column('patients', sa.Column('expected_delivery_date', sa.Date(), nullable=True))
    op.add_column('patients', sa.Column('gestas', sa.Integer(), nullable=True))
    op.add_column('patients', sa.Column('paras', sa.Integer(), nullable=True))
    op.add_column('patients', sa.Column('cesareas', sa.Integer(), nullable=True))
    op.add_column('patients', sa.Column('abortos', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('patients', 'abortos')
    op.drop_column('patients', 'cesareas')
    op.drop_column('patients', 'paras')
    op.drop_column('patients', 'gestas')
    op.drop_column('patients', 'expected_delivery_date')
    op.drop_column('patients', 'last_menstrual_period')
    op.drop_column('patients', 'birth_control')
    op.drop_column('patients', 'ivsa_age')
    op.drop_column('patients', 'menstrual_rhythm')
    op.drop_column('patients', 'menarca_age')
    op.drop_column('patients', 'patient_type')
    op.drop_column('patients', 'religion')
    op.drop_column('patients', 'cell_phone')
    op.drop_column('patients', 'blood_type')
