"""Add Specialty catalog, migrate DoctorProfile.specialty to FK (Fase 6.1)

Revision ID: 3d8f2a91c6e5
Revises: 9b1e6c3a7d24
Create Date: 2026-07-10 00:01:00

"""
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import table, column
from sqlalchemy.sql import select


# revision identifiers, used by Alembic.
revision: str = '3d8f2a91c6e5'
down_revision: Union[str, None] = '9b1e6c3a7d24'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'specialties',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('slug', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
        sa.UniqueConstraint('slug'),
    )
    op.create_index(op.f('ix_specialties_id'), 'specialties', ['id'], unique=False)
    op.create_index(op.f('ix_specialties_slug'), 'specialties', ['slug'], unique=True)

    specialties_table = table(
        'specialties',
        column('id', sa.Integer),
        column('name', sa.String),
        column('slug', sa.String),
        column('is_active', sa.Boolean),
        column('created_at', sa.DateTime),
    )
    connection = op.get_bind()
    now = datetime.utcnow()
    connection.execute(
        specialties_table.insert(),
        [
            {'name': 'Ginecología y Obstetricia', 'slug': 'ginecologia-y-obstetricia', 'is_active': True, 'created_at': now},
            {'name': 'Medicina General', 'slug': 'medicina-general', 'is_active': True, 'created_at': now},
        ],
    )

    # doctor_profiles: add nullable specialty_id, backfill from the old
    # string column, then enforce NOT NULL and drop the string column.
    op.add_column('doctor_profiles', sa.Column('specialty_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_doctor_profiles_specialty_id', 'doctor_profiles', 'specialties', ['specialty_id'], ['id']
    )

    doctor_profiles_table = table(
        'doctor_profiles',
        column('id', sa.Integer),
        column('specialty', sa.String),
        column('specialty_id', sa.Integer),
    )
    result = connection.execute(select(specialties_table.c.id, specialties_table.c.name))
    specialty_id_by_name = {row.name: row.id for row in result}
    default_specialty_id = specialty_id_by_name['Medicina General']

    profiles = connection.execute(select(doctor_profiles_table.c.id, doctor_profiles_table.c.specialty))
    for profile in profiles:
        old_value = (profile.specialty or '').strip()
        matched_id = specialty_id_by_name.get(old_value, default_specialty_id)
        connection.execute(
            doctor_profiles_table.update()
            .where(doctor_profiles_table.c.id == profile.id)
            .values(specialty_id=matched_id)
        )

    op.alter_column('doctor_profiles', 'specialty_id', nullable=False)
    op.drop_column('doctor_profiles', 'specialty')

    # services: nullable specialty_id ("servicio general" when null)
    op.add_column('services', sa.Column('specialty_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_services_specialty_id', 'services', 'specialties', ['specialty_id'], ['id']
    )


def downgrade() -> None:
    op.drop_constraint('fk_services_specialty_id', 'services', type_='foreignkey')
    op.drop_column('services', 'specialty_id')

    op.add_column('doctor_profiles', sa.Column('specialty', sa.String(255), nullable=True))
    connection = op.get_bind()
    doctor_profiles_table = table(
        'doctor_profiles',
        column('id', sa.Integer),
        column('specialty', sa.String),
        column('specialty_id', sa.Integer),
    )
    specialties_table = table('specialties', column('id', sa.Integer), column('name', sa.String))
    result = connection.execute(select(specialties_table.c.id, specialties_table.c.name))
    name_by_id = {row.id: row.name for row in result}
    profiles = connection.execute(select(doctor_profiles_table.c.id, doctor_profiles_table.c.specialty_id))
    for profile in profiles:
        connection.execute(
            doctor_profiles_table.update()
            .where(doctor_profiles_table.c.id == profile.id)
            .values(specialty=name_by_id.get(profile.specialty_id, 'Medicina General'))
        )
    op.alter_column('doctor_profiles', 'specialty', nullable=False)
    op.drop_constraint('fk_doctor_profiles_specialty_id', 'doctor_profiles', type_='foreignkey')
    op.drop_column('doctor_profiles', 'specialty_id')

    op.drop_index(op.f('ix_specialties_slug'), table_name='specialties')
    op.drop_index(op.f('ix_specialties_id'), table_name='specialties')
    op.drop_table('specialties')
