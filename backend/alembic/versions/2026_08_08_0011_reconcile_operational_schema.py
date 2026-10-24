"""Reconcile columns used by users, appointments and medication cache.

Revision ID: 2026_08_08_0011
Revises: 2026_08_08_0010
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "2026_08_08_0011"
down_revision = "2026_08_08_0010"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade():
    user_columns = _columns("users")
    if "personal_email" not in user_columns:
        op.add_column("users", sa.Column("personal_email", sa.String(length=100), nullable=True))

    appointment_type = postgresql.ENUM(
        "consulta", "cirugia", "procedimiento", name="appointmenttype"
    )
    appointment_type.create(op.get_bind(), checkfirst=True)
    appointment_columns = _columns("appointments")
    if "appointment_type" not in appointment_columns:
        op.add_column(
            "appointments",
            sa.Column(
                "appointment_type",
                appointment_type,
                nullable=False,
                server_default="consulta",
            ),
        )
        op.create_index(
            "ix_appointments_appointment_type",
            "appointments",
            ["appointment_type"],
        )
        op.alter_column("appointments", "appointment_type", server_default=None)

    optional_columns = {
        "cirugia_type": sa.String(length=100),
        "hospital": sa.String(length=200),
        "anestesiologo": sa.String(length=200),
        "preop_notes": sa.Text(),
        "postop_notes": sa.Text(),
        "duration_hours": sa.Float(),
    }
    for name, column_type in optional_columns.items():
        if name not in appointment_columns:
            op.add_column("appointments", sa.Column(name, column_type, nullable=True))

    medication_columns = _columns("medication_cache")
    for name in ("brand_name", "generic_name", "active_ingredient"):
        if name in medication_columns:
            op.alter_column(
                "medication_cache",
                name,
                existing_type=sa.String(length=300),
                type_=sa.String(length=500),
                existing_nullable=name != "brand_name",
            )


def downgrade():
    for name in ("brand_name", "generic_name", "active_ingredient"):
        op.alter_column(
            "medication_cache",
            name,
            existing_type=sa.String(length=500),
            type_=sa.String(length=300),
            existing_nullable=name != "brand_name",
        )
    for name in (
        "duration_hours",
        "postop_notes",
        "preop_notes",
        "anestesiologo",
        "hospital",
        "cirugia_type",
    ):
        op.drop_column("appointments", name)
    op.drop_index("ix_appointments_appointment_type", table_name="appointments")
    op.drop_column("appointments", "appointment_type")
    postgresql.ENUM(name="appointmenttype").drop(op.get_bind(), checkfirst=True)
    op.drop_column("users", "personal_email")
