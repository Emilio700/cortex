"""Cortes clave y enlaces temporales de los estudios de imagen (Cortex).

Dos tablas nuevas; ninguna toca las del visor:

- ``imaging_key_images``: el corte que el médico marca para volver a verlo o
  enseñarlo, con su nota, cómo se veía (ventana, zoom, giro) y, si se pidió, su
  captura PNG. Una marca por corte: la restricción única evita duplicados al
  marcar dos veces el mismo.
- ``imaging_share_links``: enlace temporal para una interconsulta. Del token sólo
  se guarda su hash; el enlace completo se muestra una vez, al crearlo.
  ``consent_confirmed_at`` es obligatorio: no existe un enlace sin que quien lo
  creó haya confirmado el consentimiento del paciente.

Revision ID: 2026_10_25_0050
Revises: 2026_10_25_0049
"""
import sqlalchemy as sa

from alembic import op

revision = "2026_10_25_0050"
down_revision = "2026_10_25_0049"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "imaging_key_images",
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
            nullable=False,
        ),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("instance_index", sa.Integer(), nullable=False),
        sa.Column("sop_instance_uid", sa.String(64), nullable=True),
        sa.Column("label", sa.String(120), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("view_state", sa.JSON(), nullable=False),
        sa.Column("image_path", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "series_id", "instance_index", name="uq_imaging_key_images_series_instance"
        ),
    )
    op.create_index("ix_imaging_key_images_tenant_id", "imaging_key_images", ["tenant_id"])
    op.create_index("ix_imaging_key_images_study_id", "imaging_key_images", ["study_id"])
    op.create_index("ix_imaging_key_images_series_id", "imaging_key_images", ["series_id"])

    op.create_table(
        "imaging_share_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column(
            "study_id",
            sa.Integer(),
            sa.ForeignKey("imaging_studies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("recipient_note", sa.String(160), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("consent_confirmed_at", sa.DateTime(), nullable=False),
        sa.Column("access_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_access_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_imaging_share_links_tenant_id", "imaging_share_links", ["tenant_id"])
    op.create_index("ix_imaging_share_links_study_id", "imaging_share_links", ["study_id"])
    op.create_index(
        "ix_imaging_share_links_token_hash", "imaging_share_links", ["token_hash"], unique=True
    )


def downgrade() -> None:
    op.drop_table("imaging_share_links")
    op.drop_table("imaging_key_images")
