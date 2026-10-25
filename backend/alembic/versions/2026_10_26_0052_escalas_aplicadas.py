"""Escalas neurológicas aplicadas (Cortex).

Una tabla nueva, ``escalas_aplicadas``: la escala, su versión, las respuestas
ítem por ítem, el puntaje y la interpretación que calculó el servidor, y la
anulación lógica (``anulado_*``), igual que los resultados de estudio.

Los permisos nuevos (``clinical_scales.read`` y ``clinical_scales.write``) viven
en código; como en la 0047, se sube ``users.permissions_version`` para que una
sesión abierta recargue sus permisos y vea la sección sin cerrar sesión.

Encadenamiento: nace de la 0050 en paralelo con la 0051 de módulos opcionales
(``chore/base-modulos-extra``). Si se integra después de ella, su
``down_revision`` pasa a la 0051 (acordado en COORDINACION.md); la prueba
``test_alembic_una_cabeza.py`` lo exige.

Revision ID: 2026_10_26_0052
Revises: 2026_10_25_0050
"""
import sqlalchemy as sa

from alembic import op

revision = "2026_10_26_0052"
down_revision = "2026_10_25_0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "escalas_aplicadas",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("appointment_id", sa.Integer(), sa.ForeignKey("appointments.id"), nullable=True),
        sa.Column("doctor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("escala", sa.String(40), nullable=False),
        sa.Column("version_escala", sa.String(20), nullable=False),
        sa.Column("respuestas", sa.JSON(), nullable=False),
        sa.Column("puntaje", sa.Float(), nullable=True),
        sa.Column("interpretacion", sa.String(255), nullable=True),
        sa.Column("detalle", sa.String(255), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("aplicada_en", sa.DateTime(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("anulado_at", sa.DateTime(), nullable=True),
        sa.Column("anulado_por_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("anulado_motivo", sa.String(500), nullable=True),
    )
    for columna in ("id", "tenant_id", "patient_id", "appointment_id", "doctor_id", "escala", "aplicada_en", "anulado_at"):
        op.create_index(f"ix_escalas_aplicadas_{columna}", "escalas_aplicadas", [columna])

    op.get_bind().execute(sa.text(
        "UPDATE users SET permissions_version = COALESCE(permissions_version, 1) + 1 WHERE is_active = :activo"
    ), {"activo": True})


def downgrade() -> None:
    op.get_bind().execute(sa.text(
        "UPDATE users SET permissions_version = CASE WHEN permissions_version > 1 "
        "THEN permissions_version - 1 ELSE 1 END WHERE is_active = :activo"
    ), {"activo": True})
    op.drop_table("escalas_aplicadas")
