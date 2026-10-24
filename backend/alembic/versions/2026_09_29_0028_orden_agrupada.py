"""Orden agrupada: varios estudios bajo un mismo papel.

Acción O-02 del backlog de auditoría (``docs/auditoria/10_acciones_de_mejora.md``,
hueco ``05`` G2).

Cambio mínimo y compatible a propósito: no se reescribe ``diagnostic_orders``.
Se agrega una tabla ``diagnostic_order_groups`` que sólo agrupa, y una columna
``diagnostic_orders.order_group_id`` **nula**. Cada estudio sigue siendo una fila
de ``diagnostic_orders`` con su estado y sus resultados, así que:

* las órdenes que ya existen en producción quedan como órdenes sueltas
  (``order_group_id`` nulo) y se siguen leyendo, imprimiendo y resultando igual;
* la doctora puede seguir pidiendo estudios de uno en uno.

La columna nueva es nula y sin valor por omisión: en PostgreSQL agregarla no
reescribe la tabla, así que es instantánea con cualquier volumen.

Reversible: ``downgrade`` quita la columna (con su índice y su llave foránea) y
la tabla. Lo que se pierde al bajar es sólo la agrupación: cada estudio sigue
existiendo como orden suelta.

Revision ID: 2026_09_29_0028
Revises: 2026_09_29_0027
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_29_0028"
down_revision = "2026_09_29_0027"
branch_labels = None
depends_on = None

TABLA_GRUPOS = "diagnostic_order_groups"
FK_GRUPO = "fk_diagnostic_orders_order_group_id"
INDICE_GRUPO = "ix_diagnostic_orders_order_group_id"


def upgrade():
    op.create_table(
        TABLA_GRUPOS,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("doctor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("appointment_id", sa.Integer(), sa.ForeignKey("appointments.id"), nullable=True),
        sa.Column("clinical_indication", sa.Text(), nullable=False),
        sa.Column("requested_on", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    for columna in ("id", "tenant_id", "patient_id", "doctor_id", "appointment_id"):
        op.create_index(f"ix_{TABLA_GRUPOS}_{columna}", TABLA_GRUPOS, [columna])

    with op.batch_alter_table("diagnostic_orders") as batch:
        batch.add_column(sa.Column("order_group_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(FK_GRUPO, TABLA_GRUPOS, ["order_group_id"], ["id"])
        batch.create_index(INDICE_GRUPO, ["order_group_id"])


def downgrade():
    with op.batch_alter_table("diagnostic_orders") as batch:
        batch.drop_index(INDICE_GRUPO)
        batch.drop_constraint(FK_GRUPO, type_="foreignkey")
        batch.drop_column("order_group_id")

    for columna in ("appointment_id", "doctor_id", "patient_id", "tenant_id", "id"):
        op.drop_index(f"ix_{TABLA_GRUPOS}_{columna}", table_name=TABLA_GRUPOS)
    op.drop_table(TABLA_GRUPOS)
