"""Add FPP history, clinical tracking, immunizations and diagnostic orders.

Revision ID: 2026_08_08_0005
Revises: 2026_08_07_0004
Create Date: 2026-08-08
"""

import sqlalchemy as sa
from alembic import op


revision = "2026_08_08_0005"
down_revision = "2026_08_07_0004"
branch_labels = None
depends_on = None


def _index(table: str, *columns: str) -> None:
    for column in columns:
        op.create_index(f"ix_{table}_{column}", table, [column])


def upgrade():
    with op.batch_alter_table("pregnancies") as batch:
        batch.add_column(sa.Column("dating_method", sa.String(length=40), nullable=True))
        batch.add_column(sa.Column("dating_status", sa.String(length=40), nullable=False, server_default="pending"))
        batch.add_column(sa.Column("estimated_delivery_date_source", sa.String(length=80), nullable=True))
        batch.add_column(sa.Column("estimated_delivery_date_confirmed_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("confirmed_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
        batch.add_column(sa.Column("dating_notes", sa.Text(), nullable=True))
        batch.add_column(sa.Column("is_multiple_gestation", sa.Integer(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("fetus_count", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("conception_method", sa.String(length=40), nullable=True))
        batch.add_column(sa.Column("high_risk_status", sa.String(length=40), nullable=False, server_default="not_recorded"))
        batch.add_column(sa.Column("outcome", sa.String(length=40), nullable=False, server_default="ongoing"))
        batch.add_column(sa.Column("outcome_date", sa.Date(), nullable=True))
        batch.add_column(sa.Column("actual_delivery_date", sa.Date(), nullable=True))
        batch.add_column(sa.Column("actual_gestational_age_weeks", sa.Numeric(4, 1), nullable=True))
        batch.add_column(sa.Column("outcome_notes", sa.Text(), nullable=True))
    _index("pregnancies", "dating_status")

    op.create_table("pregnancy_dating_events",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("pregnancy_id", sa.Integer(), sa.ForeignKey("pregnancies.id"), nullable=False), sa.Column("recorded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("method", sa.String(length=40), nullable=False), sa.Column("status", sa.String(length=30), nullable=False, server_default="proposed"),
        sa.Column("last_menstrual_period", sa.Date(), nullable=True), sa.Column("ultrasound_date", sa.Date(), nullable=True), sa.Column("gestational_age_weeks", sa.Numeric(4, 1), nullable=True),
        sa.Column("measurement", sa.String(length=80), nullable=True), sa.Column("proposed_delivery_date", sa.Date(), nullable=True), sa.Column("accepted_delivery_date", sa.Date(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True), sa.Column("source_document_id", sa.Integer(), sa.ForeignKey("patient_documents.id"), nullable=True), sa.Column("recorded_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")))
    _index("pregnancy_dating_events", "tenant_id", "pregnancy_id")

    op.create_table("fetal_records",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False), sa.Column("pregnancy_id", sa.Integer(), sa.ForeignKey("pregnancies.id"), nullable=False),
        sa.Column("sequence_number", sa.Integer(), nullable=False), sa.Column("clinical_identifier", sa.String(length=100), nullable=True), sa.Column("chorionicity", sa.String(length=60), nullable=True), sa.Column("amnionicity", sa.String(length=60), nullable=True), sa.Column("reported_sex", sa.String(length=30), nullable=True), sa.Column("notes", sa.Text(), nullable=True), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")), sa.UniqueConstraint("pregnancy_id", "sequence_number", name="uq_fetal_records_pregnancy_sequence"))
    _index("fetal_records", "tenant_id", "pregnancy_id")

    op.create_table("prenatal_milestones",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False), sa.Column("pregnancy_id", sa.Integer(), sa.ForeignKey("pregnancies.id"), nullable=False), sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False), sa.Column("status", sa.String(length=30), nullable=False, server_default="suggested"), sa.Column("due_on", sa.Date(), nullable=True), sa.Column("notes", sa.Text(), nullable=True), sa.Column("completed_at", sa.DateTime(), nullable=True), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")))
    _index("prenatal_milestones", "tenant_id", "pregnancy_id", "status", "due_on")

    op.create_table("fetal_assessments",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False), sa.Column("fetal_record_id", sa.Integer(), sa.ForeignKey("fetal_records.id"), nullable=False), sa.Column("appointment_id", sa.Integer(), sa.ForeignKey("appointments.id"), nullable=True), sa.Column("source_document_id", sa.Integer(), sa.ForeignKey("patient_documents.id"), nullable=True), sa.Column("recorded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("assessed_on", sa.Date(), nullable=False), sa.Column("gestational_age_weeks", sa.Numeric(4, 1), nullable=True), sa.Column("fetal_heart_rate_bpm", sa.Integer(), nullable=True), sa.Column("presentation", sa.String(length=30), nullable=True), sa.Column("estimated_weight_g", sa.Integer(), nullable=True), sa.Column("reported_percentile", sa.String(length=40), nullable=True), sa.Column("findings", sa.Text(), nullable=True), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")))
    _index("fetal_assessments", "tenant_id", "fetal_record_id", "assessed_on")

    op.create_table("patient_immunizations",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False), sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False), sa.Column("pregnancy_id", sa.Integer(), sa.ForeignKey("pregnancies.id"), nullable=True), sa.Column("appointment_id", sa.Integer(), sa.ForeignKey("appointments.id"), nullable=True), sa.Column("recorded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("vaccine_name", sa.String(length=180), nullable=False), sa.Column("product_name", sa.String(length=180), nullable=True), sa.Column("manufacturer", sa.String(length=180), nullable=True), sa.Column("lot_number", sa.String(length=100), nullable=True), sa.Column("dose", sa.String(length=100), nullable=True), sa.Column("route", sa.String(length=80), nullable=True), sa.Column("site", sa.String(length=100), nullable=True), sa.Column("administered_on", sa.Date(), nullable=True), sa.Column("source", sa.String(length=80), nullable=False, server_default="clinic"), sa.Column("status", sa.String(length=40), nullable=False, server_default="not_evaluated"), sa.Column("reason", sa.Text(), nullable=True), sa.Column("adverse_event", sa.Text(), nullable=True), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")))
    _index("patient_immunizations", "tenant_id", "patient_id", "pregnancy_id", "appointment_id", "status")

    op.create_table("pregnancy_medication_exposures",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False), sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False), sa.Column("pregnancy_id", sa.Integer(), sa.ForeignKey("pregnancies.id"), nullable=True), sa.Column("appointment_id", sa.Integer(), sa.ForeignKey("appointments.id"), nullable=True), sa.Column("prescription_id", sa.Integer(), sa.ForeignKey("prescriptions.id"), nullable=True), sa.Column("recorded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("medication_name", sa.String(length=255), nullable=False), sa.Column("active_ingredient", sa.String(length=255), nullable=True), sa.Column("dose", sa.String(length=120), nullable=True), sa.Column("frequency", sa.String(length=120), nullable=True), sa.Column("route", sa.String(length=80), nullable=True), sa.Column("started_on", sa.Date(), nullable=True), sa.Column("ended_on", sa.Date(), nullable=True), sa.Column("source", sa.String(length=80), nullable=False, server_default="patient_report"), sa.Column("indication", sa.Text(), nullable=True), sa.Column("review_status", sa.String(length=60), nullable=False, server_default="pending"), sa.Column("next_review_on", sa.Date(), nullable=True), sa.Column("review_notes", sa.Text(), nullable=True), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")))
    _index("pregnancy_medication_exposures", "tenant_id", "patient_id", "pregnancy_id", "appointment_id", "review_status", "next_review_on")

    op.create_table("medication_monitoring_plans",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False), sa.Column("exposure_id", sa.Integer(), sa.ForeignKey("pregnancy_medication_exposures.id"), nullable=False), sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("parameter_name", sa.String(length=180), nullable=False), sa.Column("due_on", sa.Date(), nullable=True), sa.Column("status", sa.String(length=40), nullable=False, server_default="pending"), sa.Column("notes", sa.Text(), nullable=True), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")))
    _index("medication_monitoring_plans", "tenant_id", "exposure_id", "due_on", "status")

    op.create_table("diagnostic_orders",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False), sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False), sa.Column("pregnancy_id", sa.Integer(), sa.ForeignKey("pregnancies.id"), nullable=True), sa.Column("fetal_record_id", sa.Integer(), sa.ForeignKey("fetal_records.id"), nullable=True), sa.Column("appointment_id", sa.Integer(), sa.ForeignKey("appointments.id"), nullable=True), sa.Column("clinical_episode_id", sa.Integer(), sa.ForeignKey("clinical_episodes.id"), nullable=True), sa.Column("consent_id", sa.Integer(), sa.ForeignKey("clinical_consents.id"), nullable=True), sa.Column("doctor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("category", sa.String(length=60), nullable=False), sa.Column("study_name", sa.String(length=255), nullable=False), sa.Column("catalog_code", sa.String(length=100), nullable=True), sa.Column("clinical_indication", sa.Text(), nullable=False), sa.Column("priority", sa.String(length=30), nullable=False, server_default="routine"), sa.Column("requested_on", sa.Date(), nullable=False), sa.Column("desired_on", sa.Date(), nullable=True), sa.Column("preparation_instructions", sa.Text(), nullable=True), sa.Column("specimen_or_body_site", sa.String(length=180), nullable=True), sa.Column("destination", sa.String(length=255), nullable=True), sa.Column("status", sa.String(length=40), nullable=False, server_default="ordered"), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")))
    _index("diagnostic_orders", "tenant_id", "patient_id", "pregnancy_id", "appointment_id", "doctor_id", "category", "requested_on", "status")

    op.create_table("diagnostic_results",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False), sa.Column("diagnostic_order_id", sa.Integer(), sa.ForeignKey("diagnostic_orders.id"), nullable=False), sa.Column("recorded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("patient_document_id", sa.Integer(), sa.ForeignKey("patient_documents.id"), nullable=True), sa.Column("collected_on", sa.Date(), nullable=True), sa.Column("resulted_on", sa.Date(), nullable=True), sa.Column("reporting_provider", sa.String(length=255), nullable=True), sa.Column("report_text", sa.Text(), nullable=True), sa.Column("structured_values", sa.JSON(), nullable=True), sa.Column("review_status", sa.String(length=40), nullable=False, server_default="received"), sa.Column("clinician_interpretation", sa.Text(), nullable=True), sa.Column("reviewed_at", sa.DateTime(), nullable=True), sa.Column("communicated_at", sa.DateTime(), nullable=True), sa.Column("next_action", sa.Text(), nullable=True), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")))
    _index("diagnostic_results", "tenant_id", "diagnostic_order_id", "review_status")


def downgrade():
    for table in ("diagnostic_results", "diagnostic_orders", "medication_monitoring_plans", "pregnancy_medication_exposures", "patient_immunizations", "fetal_assessments", "prenatal_milestones", "fetal_records", "pregnancy_dating_events"):
        op.drop_table(table)
    with op.batch_alter_table("pregnancies") as batch:
        for column in ("outcome_notes", "actual_gestational_age_weeks", "actual_delivery_date", "outcome_date", "outcome", "high_risk_status", "conception_method", "fetus_count", "is_multiple_gestation", "dating_notes", "confirmed_by_user_id", "estimated_delivery_date_confirmed_at", "estimated_delivery_date_source", "dating_status", "dating_method"):
            batch.drop_column(column)
