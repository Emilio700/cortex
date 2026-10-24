"""Add structured pregnancy and prenatal visit records.

Revision ID: 2026_08_06_0002
Revises: 2026_08_06_0001
Create Date: 2026-08-06
"""

import sqlalchemy as sa
from alembic import op


revision = "2026_08_06_0002"
down_revision = "2026_08_06_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "pregnancies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("doctor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("last_menstrual_period", sa.Date(), nullable=True),
        sa.Column("estimated_delivery_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_pregnancies_tenant_id", "pregnancies", ["tenant_id"])
    op.create_index("ix_pregnancies_patient_id", "pregnancies", ["patient_id"])
    op.create_index("ix_pregnancies_doctor_id", "pregnancies", ["doctor_id"])
    op.create_index("ix_pregnancies_status", "pregnancies", ["status"])
    op.create_table(
        "prenatal_visits",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("pregnancy_id", sa.Integer(), sa.ForeignKey("pregnancies.id"), nullable=False),
        sa.Column("appointment_id", sa.Integer(), sa.ForeignKey("appointments.id"), nullable=True, unique=True),
        sa.Column("doctor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("visit_date", sa.Date(), nullable=False),
        sa.Column("gestational_age_weeks", sa.Numeric(4, 1), nullable=True),
        sa.Column("maternal_weight_kg", sa.Numeric(5, 2), nullable=True),
        sa.Column("systolic_bp", sa.Integer(), nullable=True),
        sa.Column("diastolic_bp", sa.Integer(), nullable=True),
        sa.Column("fundal_height_cm", sa.Numeric(4, 1), nullable=True),
        sa.Column("fetal_heart_rate_bpm", sa.Integer(), nullable=True),
        sa.Column("fetal_movements", sa.String(length=20), nullable=True),
        sa.Column("fetal_presentation", sa.String(length=20), nullable=True),
        sa.Column("maternal_observations", sa.Text(), nullable=True),
        sa.Column("fetal_observations", sa.Text(), nullable=True),
        sa.Column("plan_notes", sa.Text(), nullable=True),
        sa.Column("next_visit_on", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("gestational_age_weeks IS NULL OR (gestational_age_weeks >= 0 AND gestational_age_weeks <= 45)", name="ck_prenatal_visits_gestational_age"),
        sa.CheckConstraint("maternal_weight_kg IS NULL OR (maternal_weight_kg >= 20 AND maternal_weight_kg <= 400)", name="ck_prenatal_visits_weight"),
        sa.CheckConstraint("systolic_bp IS NULL OR (systolic_bp >= 40 AND systolic_bp <= 300)", name="ck_prenatal_visits_systolic_bp"),
        sa.CheckConstraint("diastolic_bp IS NULL OR (diastolic_bp >= 20 AND diastolic_bp <= 200)", name="ck_prenatal_visits_diastolic_bp"),
        sa.CheckConstraint("fundal_height_cm IS NULL OR (fundal_height_cm >= 0 AND fundal_height_cm <= 80)", name="ck_prenatal_visits_fundal_height"),
        sa.CheckConstraint("fetal_heart_rate_bpm IS NULL OR (fetal_heart_rate_bpm >= 30 AND fetal_heart_rate_bpm <= 300)", name="ck_prenatal_visits_fetal_heart_rate"),
    )
    op.create_index("ix_prenatal_visits_tenant_id", "prenatal_visits", ["tenant_id"])
    op.create_index("ix_prenatal_visits_pregnancy_id", "prenatal_visits", ["pregnancy_id"])
    op.create_index("ix_prenatal_visits_doctor_id", "prenatal_visits", ["doctor_id"])
    op.create_index("ix_prenatal_visits_visit_date", "prenatal_visits", ["visit_date"])
    op.create_index("ix_prenatal_visits_next_visit_on", "prenatal_visits", ["next_visit_on"])


def downgrade():
    op.drop_table("prenatal_visits")
    op.drop_table("pregnancies")
