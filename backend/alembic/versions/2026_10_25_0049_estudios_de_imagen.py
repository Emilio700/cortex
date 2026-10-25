"""Estudios de imagen DICOM (Cortex).

Tres tablas nuevas, ninguna toca lo existente:

- ``imaging_studies``: el estudio como objeto clínico (fecha, modalidad,
  procedencia, estado de la ingesta).
- ``imaging_series``: una fila por serie, no por corte. Una angio-TC tiene
  cientos de cortes y guardarlos uno por fila volvería la tabla inmanejable
  para lo único que se consulta: qué series tiene el estudio y en qué orden.
- ``imaging_annotations``: lo que el médico midió, con autor y fecha.

``is_derived``, ``has_geometry`` y ``status`` son datos de verdad, no banderas
de conveniencia: de ellos depende que el visor pueda reconstruir planos y que
la interfaz pueda decir que un estudio llegó incompleto.

Revision ID: 2026_10_25_0049
Revises: 2026_10_24_0048
"""
import sqlalchemy as sa

from alembic import op

revision = "2026_10_25_0049"
down_revision = "2026_10_24_0048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "imaging_studies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column(
            "clinical_episode_id",
            sa.Integer(),
            sa.ForeignKey("clinical_episodes.id"),
            nullable=True,
        ),
        sa.Column(
            "uploaded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False
        ),
        sa.Column("study_instance_uid", sa.String(64), nullable=False),
        sa.Column("accession_number", sa.String(64), nullable=True),
        sa.Column("modality", sa.String(16), nullable=False),
        sa.Column("study_date", sa.DateTime(), nullable=False),
        sa.Column("study_description", sa.String(255), nullable=True),
        sa.Column("body_part", sa.String(64), nullable=True),
        sa.Column("institution_name", sa.String(255), nullable=True),
        sa.Column("source", sa.String(32), nullable=False, server_default="upload_files"),
        sa.Column("status", sa.String(24), nullable=False, server_default="received"),
        sa.Column("status_detail", sa.Text(), nullable=True),
        sa.Column("storage_prefix", sa.String(500), nullable=False),
        sa.Column("series_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("instance_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("has_contrast", sa.Boolean(), nullable=True),
        sa.Column("deidentified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "tenant_id", "study_instance_uid", name="uq_imaging_studies_tenant_uid"
        ),
    )
    for columna in (
        "tenant_id",
        "patient_id",
        "clinical_episode_id",
        "study_instance_uid",
        "modality",
        "study_date",
        "status",
    ):
        op.create_index(f"ix_imaging_studies_{columna}", "imaging_studies", [columna])

    op.create_table(
        "imaging_series",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "study_id",
            sa.Integer(),
            sa.ForeignKey("imaging_studies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("series_instance_uid", sa.String(64), nullable=False),
        sa.Column("series_number", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("modality", sa.String(16), nullable=False),
        sa.Column("series_description", sa.String(255), nullable=True),
        sa.Column("sequence_label", sa.String(32), nullable=True),
        sa.Column("sequence_detected_by", sa.String(16), nullable=True),
        sa.Column("instance_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rows", sa.Integer(), nullable=True),
        sa.Column("columns", sa.Integer(), nullable=True),
        sa.Column("pixel_spacing_x", sa.Float(), nullable=True),
        sa.Column("pixel_spacing_y", sa.Float(), nullable=True),
        sa.Column("slice_thickness", sa.Float(), nullable=True),
        sa.Column("has_geometry", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_derived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("manifest_path", sa.String(500), nullable=True),
        sa.Column("thumbnail_path", sa.String(500), nullable=True),
        sa.Column("total_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("study_id", "series_instance_uid", name="uq_imaging_series_study_uid"),
    )
    op.create_index("ix_imaging_series_tenant_id", "imaging_series", ["tenant_id"])
    op.create_index("ix_imaging_series_study_id", "imaging_series", ["study_id"])

    op.create_table(
        "imaging_annotations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "study_id",
            sa.Integer(),
            sa.ForeignKey("imaging_studies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "series_id",
            sa.Integer(),
            sa.ForeignKey("imaging_series.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("geometry", sa.JSON(), nullable=False),
        sa.Column("value", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(16), nullable=True),
        sa.Column("label", sa.String(120), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_confirmed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_imaging_annotations_tenant_id", "imaging_annotations", ["tenant_id"])
    op.create_index("ix_imaging_annotations_study_id", "imaging_annotations", ["study_id"])
    op.create_index("ix_imaging_annotations_series_id", "imaging_annotations", ["series_id"])


def downgrade() -> None:
    op.drop_table("imaging_annotations")
    op.drop_table("imaging_series")
    op.drop_table("imaging_studies")
