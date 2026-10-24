"""Avisos con prioridad, atendido aparte de leído, y preferencias (plan 27, Fase 1).

Columnas nuevas en ``notifications``, todas nulas o con valor por omisión, para
no reescribir el historial:

- ``priority`` (VARCHAR 20, ``'informativo'`` por omisión): qué tanto pide.
- ``resolved_at``, ``resolved_by_user_id``, ``resolution``: cuándo, quién y
  cómo dejó de pedir algo (``auto``, ``descartado``, ``migracion``).
- ``dedupe_key`` (VARCHAR 150): con un índice único parcial por persona entre
  los abiertos, para que un doble clic o un job repetido no dupliquen avisos.
- Índice ``(user_id, resolved_at, created_at)`` para «Por atender».

Datos:

1. Prioridad de lo que ya existe: ``patient_arrived``, ``prenatal_review_due``,
   ``diagnostic_result_received`` y el «Consulta finalizada — pendiente de
   cobro» quedan accionables. Los cierres «ya cobrada» y «sin cargo» sólo
   informaban; se quedan informativos.
2. Para no estrenar el centro de avisos con pendientes que ya no lo son, los
   accionables se cierran con ``resolution = 'migracion'`` si tienen más de 7
   días, o si el hecho ya pasó: la cita ya no está en sala, la orden ya no
   espera revisión, la consulta ya se cobró o fue sin cargo. Se marcan leídos.

Tabla nueva ``notification_preferences`` (una fila por persona): sonido,
notificación del navegador y recordatorio de una hora apagados por omisión,
y la lista de tipos informativos silenciados.

Reversible: ``downgrade`` borra la tabla, los índices y las columnas. Lo que se
cerró por migración no se reabre (las columnas desaparecen).

Revision ID: 2026_10_04_0036
Revises: 2026_10_04_0035
"""
import sqlalchemy as sa

from alembic import op

revision = "2026_10_04_0036"
down_revision = "2026_10_04_0035"
branch_labels = None
depends_on = None

FK_RESOLVIO = "fk_notifications_resolved_by_user_id"
IX_ABIERTOS = "ix_notifications_user_resolved_created"
UQ_DEDUPE = "uq_notifications_dedupe_abierto"
DONDE_ABIERTO = "dedupe_key IS NOT NULL AND resolved_at IS NULL"

ACCIONABLES = "('patient_arrived', 'prenatal_review_due', 'diagnostic_result_received')"


def upgrade():
    with op.batch_alter_table("notifications") as batch:
        batch.add_column(sa.Column("priority", sa.String(length=20), nullable=False, server_default="informativo"))
        batch.add_column(sa.Column("resolved_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("resolved_by_user_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("resolution", sa.String(length=20), nullable=True))
        batch.add_column(sa.Column("dedupe_key", sa.String(length=150), nullable=True))
        batch.create_foreign_key(FK_RESOLVIO, "users", ["resolved_by_user_id"], ["id"])

    op.create_index(IX_ABIERTOS, "notifications", ["user_id", "resolved_at", "created_at"])
    op.create_index(
        UQ_DEDUPE,
        "notifications",
        ["user_id", "dedupe_key"],
        unique=True,
        postgresql_where=sa.text(DONDE_ABIERTO),
        sqlite_where=sa.text(DONDE_ABIERTO),
    )

    # 1. Prioridad de lo existente.
    op.execute(sa.text(
        f"UPDATE notifications SET priority = 'accionable' WHERE type IN {ACCIONABLES} "
        "OR (type = 'consultation_completed' AND title LIKE '%pendiente de cobro%')"
    ))

    # 2. Accionables que ya no piden nada. created_at y resolved_at son UTC sin
    # zona: en PostgreSQL CURRENT_TIMESTAMP trae la zona de la sesión y sólo
    # coincidiría si la sesión estuviera en UTC; timezone('utc', now()) no
    # depende de eso. En SQLite CURRENT_TIMESTAMP ya es UTC.
    postgres = op.get_bind().dialect.name == "postgresql"
    ahora_utc = "timezone('utc', now())" if postgres else "CURRENT_TIMESTAMP"
    abiertos = "priority = 'accionable' AND resolved_at IS NULL"
    cerrar = (
        f"UPDATE notifications SET resolved_at = {ahora_utc}, resolution = 'migracion', is_read = true "
        f"WHERE {abiertos} AND "
    )
    op.execute(sa.text(cerrar + f"created_at < {ahora_utc} - INTERVAL '7 days'")
               if postgres
               else sa.text(cerrar + "created_at < datetime('now', '-7 days')"))
    op.execute(sa.text(
        cerrar + "type = 'patient_arrived' AND entity_type = 'appointment' AND NOT EXISTS ("
        "SELECT 1 FROM appointments a WHERE a.id = notifications.entity_id "
        "AND CAST(a.status AS VARCHAR(20)) = 'en_sala')"
    ))
    op.execute(sa.text(
        cerrar + "type = 'diagnostic_result_received' AND entity_type = 'diagnostic_order' AND NOT EXISTS ("
        "SELECT 1 FROM diagnostic_orders o WHERE o.id = notifications.entity_id "
        "AND o.status = 'result_received')"
    ))
    op.execute(sa.text(
        cerrar + "type = 'consultation_completed' AND entity_type = 'appointment' AND ("
        "EXISTS (SELECT 1 FROM payments p WHERE p.appointment_id = notifications.entity_id "
        "AND p.status = 'vigente') "
        "OR EXISTS (SELECT 1 FROM appointments a WHERE a.id = notifications.entity_id "
        "AND a.cobro_sin_cargo_motivo IS NOT NULL))"
    ))

    op.create_table(
        "notification_preferences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("sonido", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("navegador", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("recordatorio_una_hora", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("tipos_silenciados", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_notification_preferences_user_id", "notification_preferences", ["user_id"], unique=True
    )


def downgrade():
    op.drop_index("ix_notification_preferences_user_id", table_name="notification_preferences")
    op.drop_table("notification_preferences")
    op.drop_index(UQ_DEDUPE, table_name="notifications")
    op.drop_index(IX_ABIERTOS, table_name="notifications")
    with op.batch_alter_table("notifications") as batch:
        batch.drop_constraint(FK_RESOLVIO, type_="foreignkey")
        batch.drop_column("dedupe_key")
        batch.drop_column("resolution")
        batch.drop_column("resolved_by_user_id")
        batch.drop_column("resolved_at")
        batch.drop_column("priority")
