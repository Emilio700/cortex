"""Salas de consulta por sucursal y sala de la cita.

El consultorio G & G tiene dos salas fisicas y cuatro doctores. Hasta ahora
la deteccion de empalmes era solo por doctor, asi que se podian agendar tres
doctores a la misma hora con solo dos salas disponibles.

Se crea ``consultation_rooms`` (configurable por sucursal: abrir una tercera
sala no exige tocar codigo) y ``appointments.room_id``, **nullable**: las
25 658 citas historicas se quedan sin sala, no se inventa en cual fueron.

Siembra idempotente de las salas reales, por id de sucursal segun la
convencion del repo (2 = G & G, 3 = San Ignacio, la misma que usan
``scripts/importar_legacy.py`` y ``scripts/create_doctors_r2.py``). Si la
sucursal no existe en esta base (entornos de desarrollo), no se siembra nada
y la migracion sigue adelante.

Revision ID: 2026_09_20_0017
Revises: 2026_09_19_0016
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_20_0017"
down_revision = "2026_09_19_0016"
branch_labels = None
depends_on = None


# (tenant_id, nombre, orden). San Ignacio tiene una sola sala y se llama
# "Consultorio": nombrarla "Sala 1" daria a entender que existe una "Sala 2".
SALAS_INICIALES = [
    (2, "Sala 1", 1),
    (2, "Sala 2", 2),
    (3, "Consultorio", 1),
]


def upgrade() -> None:
    op.create_table(
        "consultation_rooms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        # Boolean de verdad, no INTEGER: PostgreSQL rechaza el INSERT si no
        # coincide con el tipo del schema (incidente is_multiple_gestation).
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_consultation_room_tenant_name"),
    )
    op.create_index("ix_consultation_rooms_id", "consultation_rooms", ["id"])
    op.create_index("ix_consultation_rooms_tenant_id", "consultation_rooms", ["tenant_id"])

    op.add_column("appointments", sa.Column("room_id", sa.Integer(), nullable=True))
    op.create_index("ix_appointments_room_id", "appointments", ["room_id"])
    op.create_foreign_key(
        "fk_appointments_room_id_consultation_rooms",
        "appointments",
        "consultation_rooms",
        ["room_id"],
        ["id"],
    )

    _sembrar_salas()


def _sembrar_salas() -> None:
    """Inserta las salas reales. Idempotente: se puede repetir sin duplicar."""
    if op.get_context().as_sql:
        # Modo offline (``alembic upgrade --sql``): no hay base que consultar,
        # solo se genera el DDL para revisarlo. La siembra corre en la
        # ejecucion real contra la base.
        return
    conexion = op.get_bind()
    for tenant_id, nombre, orden in SALAS_INICIALES:
        existe_sucursal = conexion.execute(
            sa.text("SELECT 1 FROM tenants WHERE id = :tid"), {"tid": tenant_id}
        ).first()
        if not existe_sucursal:
            continue
        ya_sembrada = conexion.execute(
            sa.text(
                "SELECT 1 FROM consultation_rooms WHERE tenant_id = :tid AND name = :nombre"
            ),
            {"tid": tenant_id, "nombre": nombre},
        ).first()
        if ya_sembrada:
            continue
        conexion.execute(
            sa.text(
                "INSERT INTO consultation_rooms (tenant_id, name, is_active, display_order) "
                "VALUES (:tid, :nombre, true, :orden)"
            ),
            {"tid": tenant_id, "nombre": nombre, "orden": orden},
        )


def downgrade() -> None:
    op.drop_constraint(
        "fk_appointments_room_id_consultation_rooms", "appointments", type_="foreignkey"
    )
    op.drop_index("ix_appointments_room_id", table_name="appointments")
    op.drop_column("appointments", "room_id")
    op.drop_index("ix_consultation_rooms_tenant_id", table_name="consultation_rooms")
    op.drop_index("ix_consultation_rooms_id", table_name="consultation_rooms")
    op.drop_table("consultation_rooms")
