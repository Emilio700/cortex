"""Cierre de la incidencia crítica de un resultado (plan 26, D-8).

La incidencia crítica se queda abierta en el dashboard de la doctora hasta que
se cierra de una de dos maneras: se le comunica el resultado a la paciente (con
su medio: en mano, llamada, WhatsApp o correo) o la doctora lo revisa dentro de
una consulta de la paciente. Revisarlo desde la bandeja no la cierra.

Columnas nuevas en ``diagnostic_results``, todas nulas:

* ``communication_channel`` — en_mano | llamada | whatsapp | correo.
* ``reviewed_in_appointment_id`` — la cita en la que se revisó con la paciente.
* ``incidencia_cerrada_at``, ``incidencia_cerrada_por`` (comunicacion |
  consulta) e ``incidencia_cerrada_by_user_id`` — cuándo, cómo y quién la cerró.

Relleno: los resultados críticos que ya se le habían comunicado a la paciente
(``communicated_at`` con valor) quedan cerrados «por comunicación» en esa
fecha, que es lo que la regla nueva diría de ellos. Los críticos que nunca se
comunicaron quedan ABIERTOS: según D-8 siguen pendientes, aunque la doctora los
haya revisado desde la bandeja.

Reversible: ``downgrade`` quita las columnas (y sus llaves foráneas). Se pierde
el medio de comunicación y quién cerró cada incidencia; la bitácora conserva
cada revisión.

Revision ID: 2026_10_03_0033
Revises: 2026_10_03_0032
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_10_03_0033"
down_revision = "2026_10_03_0032"
branch_labels = None
depends_on = None

FK_CITA = "fk_diagnostic_results_reviewed_in_appointment_id"
FK_CERRO = "fk_diagnostic_results_incidencia_cerrada_by_user_id"


def upgrade():
    with op.batch_alter_table("diagnostic_results") as batch:
        batch.add_column(sa.Column("communication_channel", sa.String(length=20), nullable=True))
        batch.add_column(sa.Column("reviewed_in_appointment_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("incidencia_cerrada_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("incidencia_cerrada_por", sa.String(length=20), nullable=True))
        batch.add_column(sa.Column("incidencia_cerrada_by_user_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(FK_CITA, "appointments", ["reviewed_in_appointment_id"], ["id"])
        batch.create_foreign_key(FK_CERRO, "users", ["incidencia_cerrada_by_user_id"], ["id"])
    op.execute(sa.text(
        "UPDATE diagnostic_results SET incidencia_cerrada_at = communicated_at, "
        "incidencia_cerrada_por = 'comunicacion', incidencia_cerrada_by_user_id = communicated_by_user_id "
        "WHERE is_critical = true AND communicated_at IS NOT NULL"
    ))


def downgrade():
    with op.batch_alter_table("diagnostic_results") as batch:
        batch.drop_constraint(FK_CERRO, type_="foreignkey")
        batch.drop_constraint(FK_CITA, type_="foreignkey")
        batch.drop_column("incidencia_cerrada_by_user_id")
        batch.drop_column("incidencia_cerrada_por")
        batch.drop_column("incidencia_cerrada_at")
        batch.drop_column("reviewed_in_appointment_id")
        batch.drop_column("communication_channel")
