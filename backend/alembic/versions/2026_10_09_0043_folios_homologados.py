"""Folios homologados por clínica y tipo (plan 32).

- ``tenants.codigo_folio``: código corto de la sucursal (``GYG``, ``SIG``),
  único y opcional; lo configura Master en Sucursales.
- ``folios_emitidos``: el consecutivo de cada serie (clínica, tipo, año) y la
  bitácora con la que la administración verifica un folio.

Solo aditiva. No toca ningún folio ya emitido: recetas, certificados y
órdenes viejas conservan el número que traen impreso. ``downgrade`` quita la
tabla y la columna; lo emitido desde la 1.2.0 conserva su folio en cada
documento, pero se pierde la bitácora, así que pide respaldo antes.

Revision ID: 2026_10_09_0043
Revises: 2026_10_09_0042
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_10_09_0043"
down_revision = "2026_10_09_0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("tenants") as tabla:
        tabla.add_column(sa.Column("codigo_folio", sa.String(length=5), nullable=True))
        tabla.create_unique_constraint("uq_tenants_codigo_folio", ["codigo_folio"])
    op.create_table(
        "folios_emitidos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("folio", sa.String(length=40), nullable=False, unique=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("tipo", sa.String(length=3), nullable=False),
        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("consecutivo", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=True),
        sa.Column("entity_type", sa.String(length=50), nullable=True),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("clave_origen", sa.String(length=1000), nullable=True),
        sa.Column("emitted_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("emitted_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", "tipo", "anio", "consecutivo", name="uq_folios_emitidos_serie"),
    )
    op.create_index("ix_folios_emitidos_paciente", "folios_emitidos", ["patient_id"])
    op.create_index("ix_folios_emitidos_origen", "folios_emitidos", ["tenant_id", "tipo", "clave_origen"])


def downgrade() -> None:
    op.drop_index("ix_folios_emitidos_origen", table_name="folios_emitidos")
    op.drop_index("ix_folios_emitidos_paciente", table_name="folios_emitidos")
    op.drop_table("folios_emitidos")
    with op.batch_alter_table("tenants") as tabla:
        tabla.drop_constraint("uq_tenants_codigo_folio", type_="unique")
        tabla.drop_column("codigo_folio")
