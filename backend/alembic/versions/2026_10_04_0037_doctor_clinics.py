"""Crea ``doctor_clinics`` si no existe (plan 29, T-8).

Ninguna migración creaba la tabla puente doctora–sucursal (modelo
``app/models/doctor_clinic.py``, de 8afce0f): producción la tiene porque se
creó por otra vía, pero una instalación nueva hecha sólo con Alembic no, y ahí
``/tenants`` y ``/doctor-clinics`` (el selector de sucursal) responden 500.

**Idempotente.** Se pregunta al inspector si la tabla ya está. Si está (como en
producción), no se toca nada: ni columnas, ni índices, ni datos. Si no está, se
crea igual que el modelo: ``id``, ``doctor_id`` → users, ``tenant_id`` →
tenants, ``is_active``, ``created_at``, los índices ``ix_doctor_clinics_id``,
``ix_doctor_clinics_doctor_id`` e ``ix_doctor_clinics_tenant_id`` y la
restricción única ``uq_doctor_tenant`` (doctor_id, tenant_id).

**Cómo decide el downgrade si la borra.** Sólo puede borrar lo que esta
migración creó. Al crearla deja una marca: la tabla
``migracion_0037_creo_doctor_clinics``, de una sola fila. El downgrade borra
``doctor_clinics`` sólo si encuentra la marca; si la tabla ya existía antes de
la 0037 (producción), no hay marca y el downgrade no hace nada. Una marca en una
tabla y no un comentario porque SQLite, donde corren las pruebas, no guarda
comentarios de tabla.

Revision ID: 2026_10_04_0037
Revises: 2026_10_04_0036
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_10_04_0037"
down_revision = "2026_10_04_0036"
branch_labels = None
depends_on = None

TABLA = "doctor_clinics"
MARCA = "migracion_0037_creo_doctor_clinics"


def _existe(nombre: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(nombre)


def upgrade():
    if _existe(TABLA):
        return
    op.create_table(
        TABLA,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("doctor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("doctor_id", "tenant_id", name="uq_doctor_tenant"),
    )
    op.create_index("ix_doctor_clinics_id", TABLA, ["id"])
    op.create_index("ix_doctor_clinics_doctor_id", TABLA, ["doctor_id"])
    op.create_index("ix_doctor_clinics_tenant_id", TABLA, ["tenant_id"])
    op.create_table(MARCA, sa.Column("creada", sa.Boolean(), primary_key=True))
    op.execute(sa.text(f"INSERT INTO {MARCA} (creada) VALUES (true)"))


def downgrade():
    if not _existe(MARCA):
        # La tabla ya existía antes de la 0037: no es de esta migración.
        return
    op.drop_index("ix_doctor_clinics_tenant_id", table_name=TABLA)
    op.drop_index("ix_doctor_clinics_doctor_id", table_name=TABLA)
    op.drop_index("ix_doctor_clinics_id", table_name=TABLA)
    op.drop_table(TABLA)
    op.drop_table(MARCA)
