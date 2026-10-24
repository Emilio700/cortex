"""Ajustes de cobros: doctoras que apoya cada secretaria, cita express y tratamiento.

Plan: docs/plans/23_cobros_por_doctora.md, sección "Ajustes 2026-09-28".

Que agrega:

- ``secretaria_doctoras``: asignacion explicita secretaria -> doctora. Acota
  el corte de caja de la secretaria a las doctoras que apoya (la lista de
  pagos sigue siendo de toda la sucursal).
- ``appointments.origen`` (``agenda``/``express``): la consulta rapida que no
  se agendo y se registro al cobrarla. Todas las citas existentes quedan
  ``agenda`` por el valor por defecto del servidor: es lo que fueron.
- ``users.tratamiento`` ("Dr.", "Dra." o nada). Queda NULL para todas: no se
  deduce del nombre, lo llena administracion. Mientras este vacio el sistema
  pone solo el nombre, sin prefijo.

No toca datos existentes fuera de esos valores por defecto y no supone nada
del volumen de produccion.

Reversible: ``downgrade`` quita exactamente lo que ``upgrade`` agrega. Se
pierden las asignaciones, el origen express de las citas (que siguen
existiendo, como citas normales) y los tratamientos capturados.

Revision ID: 2026_09_28_0025
Revises: 2026_09_28_0024
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_28_0025"
down_revision = "2026_09_28_0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "secretaria_doctoras",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("secretaria_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("doctor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.UniqueConstraint("secretaria_id", "doctor_id", name="uq_secretaria_doctoras_pareja"),
    )
    op.create_index("ix_secretaria_doctoras_id", "secretaria_doctoras", ["id"])
    op.create_index("ix_secretaria_doctoras_tenant_id", "secretaria_doctoras", ["tenant_id"])
    op.create_index("ix_secretaria_doctoras_secretaria_id", "secretaria_doctoras", ["secretaria_id"])
    op.create_index("ix_secretaria_doctoras_doctor_id", "secretaria_doctoras", ["doctor_id"])

    # VARCHAR con valor por defecto del servidor: las citas que ya existen
    # quedan "agenda" sin un UPDATE aparte, y bajar no deja un tipo huerfano.
    op.add_column(
        "appointments",
        sa.Column("origen", sa.String(length=20), nullable=False, server_default="agenda"),
    )
    op.add_column("users", sa.Column("tratamiento", sa.String(length=10), nullable=True))


def downgrade() -> None:
    # batch_alter_table: en PostgreSQL es un ALTER normal; en SQLite recrea la
    # tabla, que es la unica forma segura de quitar una columna ahi.
    with op.batch_alter_table("users") as batch:
        batch.drop_column("tratamiento")
    with op.batch_alter_table("appointments") as batch:
        batch.drop_column("origen")

    op.drop_index("ix_secretaria_doctoras_doctor_id", table_name="secretaria_doctoras")
    op.drop_index("ix_secretaria_doctoras_secretaria_id", table_name="secretaria_doctoras")
    op.drop_index("ix_secretaria_doctoras_tenant_id", table_name="secretaria_doctoras")
    op.drop_index("ix_secretaria_doctoras_id", table_name="secretaria_doctoras")
    op.drop_table("secretaria_doctoras")
