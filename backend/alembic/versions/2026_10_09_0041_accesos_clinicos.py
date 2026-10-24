"""Bitácora de accesos a información clínica (plan 32, punto 7; NOM-024).

Tabla nueva ``accesos_clinicos``: quién abrió qué sección clínica del
expediente de quién y cuándo, una fila por sesión, paciente y sección (ver
``app.models.acceso_clinico``). Solo aditiva: no toca datos existentes.
``downgrade`` borra la tabla; lo registrado desde la 1.2.0 se pierde con ella,
así que bajar de aquí en producción pide un respaldo antes.

Revision ID: 2026_10_09_0041
Revises: 2026_10_09_0040
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_10_09_0041"
down_revision = "2026_10_09_0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "accesos_clinicos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("seccion", sa.String(length=30), nullable=False),
        sa.Column("primer_acceso", sa.DateTime(), nullable=False),
        sa.Column("ultimo_acceso", sa.DateTime(), nullable=False),
        sa.Column("veces", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("device_label", sa.String(length=120), nullable=True),
        sa.UniqueConstraint("session_id", "patient_id", "seccion", name="uq_accesos_clinicos_sesion_paciente_seccion"),
    )
    op.create_index("ix_accesos_clinicos_paciente_ultimo", "accesos_clinicos", ["patient_id", "ultimo_acceso"])
    op.create_index("ix_accesos_clinicos_usuario_ultimo", "accesos_clinicos", ["user_id", "ultimo_acceso"])
    op.create_index("ix_accesos_clinicos_tenant_ultimo", "accesos_clinicos", ["tenant_id", "ultimo_acceso"])


def downgrade() -> None:
    op.drop_index("ix_accesos_clinicos_tenant_ultimo", table_name="accesos_clinicos")
    op.drop_index("ix_accesos_clinicos_usuario_ultimo", table_name="accesos_clinicos")
    op.drop_index("ix_accesos_clinicos_paciente_ultimo", table_name="accesos_clinicos")
    op.drop_table("accesos_clinicos")
