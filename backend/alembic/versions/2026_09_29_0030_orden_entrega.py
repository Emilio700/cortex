"""Entrega del papel de la orden de estudio a la paciente (recepción).

Acción O-09 del backlog de auditoría (``docs/auditoria/10_acciones_de_mejora.md``,
hueco ``05`` G6): recepción maneja el papel del día y necesita marcar cuáles
órdenes ya entregó a la paciente. Es contabilidad del mostrador, aparte del
``status`` clínico: una orden puede estar entregada y seguir "solicitada" en el
laboratorio.

Sólo agrega dos columnas **nulas** a ``diagnostic_orders``: ``delivered_at`` y
``delivered_by_user_id``. No toca ``status`` ni ninguna otra columna. Las
órdenes existentes quedan con las dos en nulo («todavía por entregar»), que es
la verdad: nadie ha registrado su entrega.

Columnas nulas sin valor por omisión: en PostgreSQL no reescriben la tabla, así
que es segura con los datos de producción (no rompe filas ni el PDF de
O-01/O-02, que no leen estas columnas).

Reversible: ``downgrade`` quita las dos columnas (y la llave foránea). Se pierde
el registro de quién y cuándo entregó; el evento sigue en la bitácora
(``diagnostic_order.delivered``).

Revision ID: 2026_09_29_0030
Revises: 2026_09_29_0029
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_29_0030"
down_revision = "2026_09_29_0029"
branch_labels = None
depends_on = None

FK_ENTREGA = "fk_diagnostic_orders_delivered_by_user_id"


def upgrade():
    with op.batch_alter_table("diagnostic_orders") as batch:
        batch.add_column(sa.Column("delivered_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("delivered_by_user_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(FK_ENTREGA, "users", ["delivered_by_user_id"], ["id"])


def downgrade():
    with op.batch_alter_table("diagnostic_orders") as batch:
        batch.drop_constraint(FK_ENTREGA, type_="foreignkey")
        batch.drop_column("delivered_by_user_id")
        batch.drop_column("delivered_at")
