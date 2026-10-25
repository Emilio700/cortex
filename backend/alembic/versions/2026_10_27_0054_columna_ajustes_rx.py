"""Columna desde radiografías (Cortex).

Una tabla nueva, ``columna_ajustes_rx``: los puntos que el médico marcó sobre la
radiografía AP y la lateral del paciente, de qué imagen salió cada vista, la
escala usada, las mediciones que calculó el servidor con su versión, y la
anulación lógica (``anulado_*``), igual que las escalas aplicadas.

Los permisos nuevos (``spine_rx.read`` y ``spine_rx.write``) viven en código;
como en la 0052, se sube ``users.permissions_version`` para que una sesión
abierta recargue sus permisos sin cerrar sesión.

Encadenamiento: se escribió en paralelo con la 0053 del modelo 3D desde TC
(``feat/modelo-3d-desde-tc``) y al principio también salía de la 0052. TC se
integró primero; al integrar esta rama se reencadenó detrás de la 0053 para
que haya una sola cabeza. Las dos son independientes (tablas distintas).

Revision ID: 2026_10_27_0054
Revises: 2026_10_27_0053
"""
import sqlalchemy as sa

from alembic import op

revision = "2026_10_27_0054"
down_revision = "2026_10_27_0053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "columna_ajustes_rx",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("doctor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("lateral_origen", sa.String(20), nullable=True),
        sa.Column("lateral_origen_id", sa.Integer(), nullable=True),
        sa.Column("ap_origen", sa.String(20), nullable=True),
        sa.Column("ap_origen_id", sa.Integer(), nullable=True),
        sa.Column("puntos", sa.JSON(), nullable=False),
        sa.Column("calibracion", sa.JSON(), nullable=False),
        sa.Column("opciones", sa.JSON(), nullable=False),
        sa.Column("mediciones", sa.JSON(), nullable=False),
        sa.Column("version_calculo", sa.String(20), nullable=False),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("anulado_at", sa.DateTime(), nullable=True),
        sa.Column("anulado_por_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("anulado_motivo", sa.String(500), nullable=True),
    )
    for columna in ("id", "tenant_id", "patient_id", "doctor_id", "created_at", "anulado_at"):
        op.create_index(f"ix_columna_ajustes_rx_{columna}", "columna_ajustes_rx", [columna])

    op.get_bind().execute(sa.text(
        "UPDATE users SET permissions_version = COALESCE(permissions_version, 1) + 1 WHERE is_active = :activo"
    ), {"activo": True})


def downgrade() -> None:
    op.get_bind().execute(sa.text(
        "UPDATE users SET permissions_version = CASE WHEN permissions_version > 1 "
        "THEN permissions_version - 1 ELSE 1 END WHERE is_active = :activo"
    ), {"activo": True})
    op.drop_table("columna_ajustes_rx")
