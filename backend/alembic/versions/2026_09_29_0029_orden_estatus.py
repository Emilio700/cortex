"""Motivo y autoría del último cambio de estado de una orden de estudio.

Acción O-05 del backlog de auditoría (``docs/auditoria/10_acciones_de_mejora.md``,
hueco ``05`` G5): el ciclo de la orden se gestiona a mano (aceptada, programada,
tomada, en proceso, cancelada o rechazada con motivo).

Sólo agrega tres columnas **nulas** a ``diagnostic_orders``: ``status_reason``,
``status_changed_at`` y ``status_changed_by_user_id``. No toca ``status`` ni
``priority``: el conjunto cerrado de valores se valida en el servidor al
escribir, no con un ``CHECK`` en la base, para que una fila existente con un
valor que no está en la lista se siga leyendo en vez de impedir la migración.
Las órdenes existentes quedan con las tres columnas en nulo («sin cambios
manuales»), que es la verdad.

Columnas nulas sin valor por omisión: en PostgreSQL no reescriben la tabla.

Reversible: ``downgrade`` quita las tres columnas (y la llave foránea). Se
pierde el motivo guardado en la fila; el historial sigue en la bitácora
(``diagnostic_order.status_changed``).

Revision ID: 2026_09_29_0029
Revises: 2026_09_29_0028
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_29_0029"
down_revision = "2026_09_29_0028"
branch_labels = None
depends_on = None

FK_AUTORA = "fk_diagnostic_orders_status_changed_by_user_id"


def upgrade():
    with op.batch_alter_table("diagnostic_orders") as batch:
        batch.add_column(sa.Column("status_reason", sa.Text(), nullable=True))
        batch.add_column(sa.Column("status_changed_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("status_changed_by_user_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(FK_AUTORA, "users", ["status_changed_by_user_id"], ["id"])


def downgrade():
    with op.batch_alter_table("diagnostic_orders") as batch:
        batch.drop_constraint(FK_AUTORA, type_="foreignkey")
        batch.drop_column("status_changed_by_user_id")
        batch.drop_column("status_changed_at")
        batch.drop_column("status_reason")
