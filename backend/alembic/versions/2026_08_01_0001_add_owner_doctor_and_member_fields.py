"""Add owner_doctor_id to patients and member fields to doctor_profiles

Revision ID: 2026_08_01_0001
Revises: 2a4efd99a154
Create Date: 2026-08-01
"""
from alembic import op
import sqlalchemy as sa

revision = "2026_08_01_0001"
down_revision = "2a4efd99a154"
branch_labels = None
depends_on = None


def upgrade():
    # ── patients: owner_doctor_id ──────────────────────────────────────
    op.add_column("patients", sa.Column("owner_doctor_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_patients_owner_doctor_id"), "patients", ["owner_doctor_id"])
    op.create_foreign_key(
        "fk_patients_owner_doctor",
        "patients", "users",
        ["owner_doctor_id"], ["id"],
    )

    # Backfill: assign all existing patients to Dr. Adolfo (id 3)
    op.execute("UPDATE patients SET owner_doctor_id = 3 WHERE owner_doctor_id IS NULL")

    # ── doctor_profiles: member fields ──────────────────────────────────
    op.add_column("doctor_profiles", sa.Column("general_registry", sa.String(50), nullable=True))
    op.add_column("doctor_profiles", sa.Column("specialty_license", sa.String(50), nullable=True))
    op.add_column("doctor_profiles", sa.Column("health_registry", sa.String(50), nullable=True))
    op.add_column("doctor_profiles", sa.Column("council_cert", sa.String(100), nullable=True))


def downgrade():
    op.drop_constraint("fk_patients_owner_doctor", "patients", type_="foreignkey")
    op.drop_index(op.f("ix_patients_owner_doctor_id"), "patients")
    op.drop_column("patients", "owner_doctor_id")

    op.drop_column("doctor_profiles", "council_cert")
    op.drop_column("doctor_profiles", "health_registry")
    op.drop_column("doctor_profiles", "specialty_license")
    op.drop_column("doctor_profiles", "general_registry")
