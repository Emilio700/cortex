"""Cobros por doctora: a quien pertenece el ingreso, anulacion e idempotencia.

Plan: docs/plans/23_cobros_por_doctora.md.

Hasta ahora un pago era una fila suelta: no decia de que doctora era el
ingreso, no se podia anular sin borrarlo y nada impedia cobrar dos veces la
misma cita (doble clic, reintento por red, o doctora y secretaria a la vez).

Que agrega:

- ``payments.doctor_id``: de quien es el ingreso (quien atendio).
- ``payments.status`` (``vigente``/``anulado``) y la huella de la anulacion
  (quien, cuando, por que). Un pago nunca se borra ni se edita: se anula.
- ``payments.referencia``: folio de la terminal o ultimos digitos del voucher,
  para conciliar contra el estado de cuenta.
- ``payments.client_request_id`` con indice UNICO: repetir la misma peticion
  devuelve el mismo pago en vez de crear otro.
- ``appointments.attended_by_user_id`` y la exencion de cobro ("sin cargo")
  con motivo, quien y cuando.

Relleno: ``payments.doctor_id`` se toma de la titular de la cita cuando el pago
tiene cita de la MISMA sucursal. Lo demas queda NULL a proposito: no se sabe de
quien fue y no se inventa; la pantalla lo muestra como "Sin doctora asignada"
para que la suma por doctora + sin doctora siga siendo el total de la sucursal.

No se supone nada del volumen ni del contenido de produccion: las columnas son
anulables o traen valor por defecto del servidor, y el relleno es un solo
UPDATE con subconsulta correlacionada que funciona igual con cero o con un
millon de filas (y que no toca pagos sin cita ni pagos con cita inexistente).

Reversible: ``downgrade`` quita exactamente lo que ``upgrade`` agrega. Lo que se
haya capturado en las columnas nuevas (anulaciones, referencias) se pierde al
bajar; los pagos en si no se tocan.

Revision ID: 2026_09_28_0024
Revises: 2026_09_24_0023
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_28_0024"
down_revision = "2026_09_24_0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("doctor_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_payments_doctor_id_users", "payments", "users", ["doctor_id"], ["id"]
    )
    op.create_index("ix_payments_doctor_id", "payments", ["doctor_id"])

    # VARCHAR y no un ENUM nativo: bajar la migracion no tiene que acordarse de
    # borrar un tipo, y agregar un estado despues no exige ALTER TYPE.
    op.add_column(
        "payments",
        sa.Column(
            "status", sa.String(length=20), nullable=False, server_default="vigente"
        ),
    )
    op.create_index("ix_payments_status", "payments", ["status"])
    op.add_column("payments", sa.Column("voided_at", sa.DateTime(), nullable=True))
    op.add_column("payments", sa.Column("voided_by_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_payments_voided_by_user_id_users",
        "payments",
        "users",
        ["voided_by_user_id"],
        ["id"],
    )
    op.add_column("payments", sa.Column("void_reason", sa.Text(), nullable=True))
    op.add_column("payments", sa.Column("referencia", sa.String(length=60), nullable=True))
    op.add_column(
        "payments", sa.Column("client_request_id", sa.String(length=64), nullable=True)
    )
    # Unico con NULL permitido: los pagos historicos no traen identificador y
    # PostgreSQL no considera iguales dos NULL.
    op.create_index(
        "ix_payments_client_request_id",
        "payments",
        ["client_request_id"],
        unique=True,
    )

    op.add_column(
        "appointments", sa.Column("attended_by_user_id", sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        "fk_appointments_attended_by_user_id_users",
        "appointments",
        "users",
        ["attended_by_user_id"],
        ["id"],
    )
    op.add_column(
        "appointments", sa.Column("cobro_sin_cargo_motivo", sa.String(length=255), nullable=True)
    )
    op.add_column(
        "appointments",
        sa.Column("cobro_sin_cargo_por_user_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_appointments_cobro_sin_cargo_por_user_id_users",
        "appointments",
        "users",
        ["cobro_sin_cargo_por_user_id"],
        ["id"],
    )
    op.add_column(
        "appointments", sa.Column("cobro_sin_cargo_at", sa.DateTime(), nullable=True)
    )

    # Subconsulta correlacionada en vez de UPDATE ... FROM: es SQL estandar y la
    # condicion de sucursal evita heredar la doctora de una cita ajena si algun
    # dato historico quedo cruzado.
    op.execute(
        """
        UPDATE payments
           SET doctor_id = (
                SELECT a.doctor_id
                  FROM appointments a
                 WHERE a.id = payments.appointment_id
                   AND a.tenant_id = payments.tenant_id
           )
         WHERE appointment_id IS NOT NULL
           AND doctor_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("appointments", "cobro_sin_cargo_at")
    op.drop_constraint(
        "fk_appointments_cobro_sin_cargo_por_user_id_users",
        "appointments",
        type_="foreignkey",
    )
    op.drop_column("appointments", "cobro_sin_cargo_por_user_id")
    op.drop_column("appointments", "cobro_sin_cargo_motivo")
    op.drop_constraint(
        "fk_appointments_attended_by_user_id_users", "appointments", type_="foreignkey"
    )
    op.drop_column("appointments", "attended_by_user_id")

    op.drop_index("ix_payments_client_request_id", table_name="payments")
    op.drop_column("payments", "client_request_id")
    op.drop_column("payments", "referencia")
    op.drop_column("payments", "void_reason")
    op.drop_constraint(
        "fk_payments_voided_by_user_id_users", "payments", type_="foreignkey"
    )
    op.drop_column("payments", "voided_by_user_id")
    op.drop_column("payments", "voided_at")
    op.drop_index("ix_payments_status", table_name="payments")
    op.drop_column("payments", "status")
    op.drop_index("ix_payments_doctor_id", table_name="payments")
    op.drop_constraint("fk_payments_doctor_id_users", "payments", type_="foreignkey")
    op.drop_column("payments", "doctor_id")
