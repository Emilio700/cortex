"""Motivo extra de la cita: una nota opcional para el doctor.

El consultorio pidio poder anotar "Control", "Primera vez" o "Ultrasonido"
en una cita. NO son tipos de cita: los tipos del sistema siguen siendo tres
(consulta, cirugia, procedimiento) y crear mas habria cambiado el color, los
filtros y los reportes de una agenda que el consultorio lleva meses leyendo.

Se guarda como texto libre corto (120 caracteres) y **nullable**: las citas
que ya existen se quedan sin motivo, que es justo lo que significa "no se
anoto ninguno". Nada obligatorio, nada que bloquee el guardado.

Texto y no booleano ni entero: ver ``tests/test_tipos_modelo_vs_schema.py``.

Revision ID: 2026_09_20_0018
Revises: 2026_09_20_0017
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_20_0018"
down_revision = "2026_09_20_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "appointments",
        sa.Column("motivo_extra", sa.String(length=120), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("appointments", "motivo_extra")
