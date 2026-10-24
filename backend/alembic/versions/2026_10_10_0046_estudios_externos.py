"""Estudios de otro lugar: el origen de una orden (plan 32, punto 6).

Columna nueva y nula ``diagnostic_orders.origen``. ``NULL`` es una orden
pedida en GEMS (todas las que existen); ``externo`` es un estudio que la
paciente trajo de otro médico o laboratorio, sin orden de GEMS. Así deja de
ser un PDF suelto en Documentos: va a Estudios, se valora y se revisa igual
que uno propio, y cuenta en la gráfica y en la línea de tiempo.

Aditiva: no cambia ningún dato. Reversible: el downgrade quita la columna
(las órdenes externas quedarían como si las hubiera pedido GEMS).

Revision ID: 2026_10_10_0046
Revises: 2026_10_10_0045
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_10_10_0046"
down_revision = "2026_10_10_0045"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("diagnostic_orders") as tabla:
        tabla.add_column(sa.Column("origen", sa.String(length=20), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("diagnostic_orders") as tabla:
        tabla.drop_column("origen")
