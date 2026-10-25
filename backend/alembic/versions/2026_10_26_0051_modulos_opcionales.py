"""Módulos opcionales por consultorio (Cortex, base-modulos-extra).

Una tabla nueva; no toca ninguna existente:

- ``tenant_modulos``: si un módulo opcional (inventario, tareas, Orthanc…) está
  encendido en un consultorio, quién lo cambió y cuándo. Sin fila manda el
  valor por defecto del catálogo. Apagar un módulo solo cambia ``activo``: sus
  datos se quedan. La restricción única evita dos estados para el mismo módulo.

Revision ID: 2026_10_26_0051
Revises: 2026_10_25_0050
"""
import sqlalchemy as sa

from alembic import op

revision = "2026_10_26_0051"
down_revision = "2026_10_25_0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant_modulos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("modulo", sa.String(60), nullable=False),
        sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("activado_por", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("activado_en", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", "modulo", name="uq_tenant_modulos_tenant_modulo"),
    )
    op.create_index("ix_tenant_modulos_tenant_id", "tenant_modulos", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("tenant_modulos")
