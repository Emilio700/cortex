"""Modelo 3D del paciente desde su TC (Cortex, feat/modelo-3d-desde-tc).

Una tabla nueva, ``imaging_modelos_3d``: qué serie se mandó a segmentar, en qué
va (``pendiente | procesando | listo | fallo`` con su motivo), dónde quedó el GLB
de mallas, qué motor y versión lo hicieron, quién lo pidió y quién lo revisó.

El permiso nuevo (``neuro3d.generar_modelo``) vive en código; como en la 0052, se
sube ``users.permissions_version`` para que una sesión abierta lo vea sin cerrar
sesión.

Encadenamiento: después de la 0052 (escalas). La 0054 del tramo RX también
cuelga de la 0052 y se reencadena a ésta al integrar.

Revision ID: 2026_10_27_0053
Revises: 2026_10_26_0052
"""
import sqlalchemy as sa

from alembic import op

revision = "2026_10_27_0053"
down_revision = "2026_10_26_0052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "imaging_modelos_3d",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("study_id", sa.Integer(), sa.ForeignKey("imaging_studies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("series_id", sa.Integer(), sa.ForeignKey("imaging_series.id", ondelete="CASCADE"), nullable=False),
        sa.Column("region", sa.String(24), nullable=False, server_default="columna"),
        sa.Column("estado", sa.String(16), nullable=False, server_default="pendiente"),
        sa.Column("motivo_fallo", sa.Text(), nullable=True),
        sa.Column("archivo_path", sa.String(500), nullable=True),
        sa.Column("archivo_bytes", sa.Integer(), nullable=True),
        sa.Column("estructuras", sa.Integer(), nullable=True),
        sa.Column("motor", sa.String(64), nullable=True),
        sa.Column("motor_version", sa.String(32), nullable=True),
        sa.Column("sintetico", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("solicitado_por_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("solicitado_en", sa.DateTime(), nullable=False),
        sa.Column("iniciado_en", sa.DateTime(), nullable=True),
        sa.Column("terminado_en", sa.DateTime(), nullable=True),
        sa.Column("confirmado_por_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("confirmado_en", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    for columna in ("id", "tenant_id", "patient_id", "study_id", "series_id", "estado"):
        op.create_index(f"ix_imaging_modelos_3d_{columna}", "imaging_modelos_3d", [columna])

    op.get_bind().execute(sa.text(
        "UPDATE users SET permissions_version = COALESCE(permissions_version, 1) + 1 WHERE is_active = :activo"
    ), {"activo": True})


def downgrade() -> None:
    op.get_bind().execute(sa.text(
        "UPDATE users SET permissions_version = CASE WHEN permissions_version > 1 "
        "THEN permissions_version - 1 ELSE 1 END WHERE is_active = :activo"
    ), {"activo": True})
    op.drop_table("imaging_modelos_3d")
