"""Antecedentes neurológicos en la ficha del paciente (Cortex).

GEMS guardaba la historia gineco-obstétrica en la ficha; Cortex necesita lo que
un neurocirujano revisa antes de operar o de pedir una resonancia:

- ``dominant_hand``: lateralidad (diestro, zurdo, ambidiestro). Orienta la
  dominancia del lenguaje al planear una cirugía cerebral.
- ``neurological_history``: antecedentes neurológicos y neuroquirúrgicos.
- ``implanted_devices``: válvulas, marcapasos, neuroestimuladores, material de
  osteosíntesis. Decide si una resonancia es segura.
- ``anticoagulants``: anticoagulantes y antiagregantes. Hay que suspenderlos
  antes de casi cualquier procedimiento.

Columnas nuevas y nulas: no tocan las existentes (las de ginecología se quedan
para no perder datos ni romper la cadena de migraciones).

Revision ID: 2026_10_24_0048
Revises: 2026_10_10_0047
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_10_24_0048"
down_revision = "2026_10_10_0047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("dominant_hand", sa.String(20), nullable=True))
    op.add_column("patients", sa.Column("neurological_history", sa.Text(), nullable=True))
    op.add_column("patients", sa.Column("implanted_devices", sa.Text(), nullable=True))
    op.add_column("patients", sa.Column("anticoagulants", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("patients", "anticoagulants")
    op.drop_column("patients", "implanted_devices")
    op.drop_column("patients", "neurological_history")
    op.drop_column("patients", "dominant_hand")
