"""Estado de cita «en consulta» (plan 28, D-3).

Decisión de Emilio (2026-10-04): la cita pasa a «en consulta» cuando la
doctora abre la consulta y a «atendida» cuando la cierra; nadie lo marca a
mano. Hace falta un valor nuevo en el tipo ``appointmentstatus`` de
PostgreSQL.

- **Minúscula.** El modelo guarda los VALORES del enum (``values_callable``),
  así que la etiqueta es ``en_consulta``. Producción ya tiene las etiquetas en
  minúscula desde la corrección del 2026-07-22; una
  etiqueta en mayúscula aquí daría ``LookupError`` al leer cualquier cita.
- **Fuera de la transacción.** ``ALTER TYPE ... ADD VALUE`` no puede usarse en
  la misma transacción que lo agrega, y en PostgreSQL < 12 ni siquiera puede
  correr dentro de una. Va en ``autocommit_block``.
- **Idempotente.** ``IF NOT EXISTS``: correrla dos veces no falla.

Columna ``appointments.estado_antes_de_consulta`` (VARCHAR 20, nula): de dónde
entró la cita a consulta, para que salir sin cerrar la devuelva ahí y no
siempre a «en sala» (revisión de la coordinación del plan 28).

``downgrade`` es reversible sin perder citas: las que estén «en consulta»
vuelven al estado guardado o, si no hay, a «en sala» (lo más parecido: la paciente sigue en la clínica y la
consulta no se cerró), y el tipo se recrea sin la etiqueta conservando el
orden y la capitalización de las demás, sean cuales sean.

En SQLite (las pruebas) el enum es un VARCHAR con CHECK que crea el modelo:
no hay nada que migrar.

Revision ID: 2026_10_04_0035
Revises: 2026_10_04_0034
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_10_04_0035"
down_revision = "2026_10_04_0034"
branch_labels = None
depends_on = None

TIPO = "appointmentstatus"
NUEVO = "en_consulta"
TEMPORAL = "appointmentstatus_sin_en_consulta"


def _etiquetas(conexion) -> list[str]:
    return [
        fila[0]
        for fila in conexion.execute(
            sa.text(
                "SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid "
                "WHERE t.typname = :tipo ORDER BY e.enumsortorder"
            ),
            {"tipo": TIPO},
        )
    ]


def upgrade() -> None:
    op.add_column("appointments", sa.Column("estado_antes_de_consulta", sa.String(length=20), nullable=True))
    conexion = op.get_bind()
    if conexion.dialect.name != "postgresql":
        return
    # Junto a «en sala» solo por orden de lectura en psql; si la etiqueta no
    # existe con ese nombre, al final.
    despues = " AFTER 'en_sala'" if "en_sala" in _etiquetas(conexion) else ""
    with op.get_context().autocommit_block():
        op.execute(f"ALTER TYPE {TIPO} ADD VALUE IF NOT EXISTS '{NUEVO}'{despues}")


def downgrade() -> None:
    conexion = op.get_bind()
    if conexion.dialect.name != "postgresql":
        op.drop_column("appointments", "estado_antes_de_consulta")
        return
    etiquetas = _etiquetas(conexion)
    if NUEVO not in etiquetas:
        op.drop_column("appointments", "estado_antes_de_consulta")
        return
    restantes = [e for e in etiquetas if e != NUEVO]
    regreso = "en_sala" if "en_sala" in restantes else "EN_SALA"
    # A donde estaba antes de la consulta, si se sabe y la etiqueta existe.
    for previo in ("agendada", "confirmada", "en_sala"):
        if previo in restantes:
            op.execute(
                sa.text(
                    f"UPDATE appointments SET status = '{previo}' "
                    "WHERE status::text = :nuevo AND estado_antes_de_consulta = :previo"
                ).bindparams(nuevo=NUEVO, previo=previo)
            )
    op.execute(
        sa.text(f"UPDATE appointments SET status = '{regreso}' WHERE status::text = :nuevo").bindparams(
            nuevo=NUEVO
        )
    )
    op.drop_column("appointments", "estado_antes_de_consulta")
    lista = ", ".join(f"'{e}'" for e in restantes)
    op.execute(f"CREATE TYPE {TEMPORAL} AS ENUM ({lista})")
    op.execute(
        f"ALTER TABLE appointments ALTER COLUMN status TYPE {TEMPORAL} USING status::text::{TEMPORAL}"
    )
    op.execute(f"DROP TYPE {TIPO}")
    op.execute(f"ALTER TYPE {TEMPORAL} RENAME TO {TIPO}")
