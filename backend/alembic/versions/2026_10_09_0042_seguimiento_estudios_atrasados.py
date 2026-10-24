"""Seguimiento de estudios atrasados y plazos por doctora (plan 32, punto 3).

Aditiva:

- tabla nueva ``diagnostic_order_follow_ups``: motivo, nota, «volver a
  revisar el», quién y cuándo. Nunca se edita ni se borra; es el rastro.
- columna nula ``doctor_profiles.plazos_atrasado`` (JSON): los días para
  considerar atrasado un estudio por prioridad. NULL = los de fábrica
  (7/15/30), que es como quedan todas las doctoras existentes.

No cambia ni borra ningún dato existente.

Reversible: el downgrade quita la tabla y la columna. Ojo: se pierden los
seguimientos registrados y los plazos que hayan cambiado las doctoras.

Revision ID: 2026_10_09_0042
Revises: 2026_10_09_0041
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_10_09_0042"
down_revision = "2026_10_09_0041"
branch_labels = None
depends_on = None

TABLA = "diagnostic_order_follow_ups"


def upgrade() -> None:
    op.create_table(
        TABLA,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("diagnostic_order_id", sa.Integer(), sa.ForeignKey("diagnostic_orders.id"), nullable=False),
        sa.Column("motivo", sa.String(length=40), nullable=False),
        sa.Column("nota", sa.String(length=500), nullable=True),
        sa.Column("revisar_el", sa.Date(), nullable=False),
        sa.Column("registrado_por_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_diagnostic_order_follow_ups_id", TABLA, ["id"])
    op.create_index("ix_diagnostic_order_follow_ups_tenant_id", TABLA, ["tenant_id"])
    op.create_index("ix_diagnostic_order_follow_ups_diagnostic_order_id", TABLA, ["diagnostic_order_id"])
    op.create_index("ix_diagnostic_order_follow_ups_revisar_el", TABLA, ["revisar_el"])
    with op.batch_alter_table("doctor_profiles") as tabla:
        tabla.add_column(sa.Column("plazos_atrasado", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("doctor_profiles") as tabla:
        tabla.drop_column("plazos_atrasado")
    for indice in ("revisar_el", "diagnostic_order_id", "tenant_id", "id"):
        op.drop_index(f"ix_diagnostic_order_follow_ups_{indice}", table_name=TABLA)
    op.drop_table(TABLA)
