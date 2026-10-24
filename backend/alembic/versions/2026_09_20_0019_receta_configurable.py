"""Configuracion de la receta, por doctor.

Cada medico decide como sale su receta. Se anaden dos columnas a
``doctor_profiles``:

* ``prescription_display_name`` — el nombre tal cual debe imprimirse,
  independiente de ``users.full_name``. La Dra. Yara Montserrat Gutierrez
  Romero quiere firmar como "Dra. Yara Gutierrez" y es valido.
* ``prescription_settings`` — JSON con los interruptores de que se imprime
  (logo, firma, cedula, SSA, telefono, direccion, pie legal...).

Las dos son **nullable** y sin valor por defecto: un perfil que nunca toque la
configuracion lee NULL y ``app/utils/receta_config.py`` le aplica los valores
de fabrica, que reproducen la receta de hoy. No hay relleno de datos, asi que
la migracion no puede alterar la receta de ningun doctor.

Se usa JSON y no una columna por interruptor porque son preferencias de
presentacion (nunca se consultan ni se ordenan por ellas) y la lista crece
cada vez que el PDF gana un elemento: una columna por casilla seria una
migracion por casilla. Ademas en JSON el booleano se guarda como booleano y no
puede repetirse el caso del INTEGER que PostgreSQL rechazo en produccion.

Revision ID: 2026_09_20_0019
Revises: 2026_09_20_0018
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_20_0019"
down_revision = "2026_09_20_0018"
branch_labels = None
depends_on = None


def _columnas_existentes(nombre_tabla: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {columna["name"] for columna in inspector.get_columns(nombre_tabla)}


def upgrade() -> None:
    existentes = _columnas_existentes("doctor_profiles")

    if "prescription_display_name" not in existentes:
        op.add_column(
            "doctor_profiles",
            sa.Column("prescription_display_name", sa.String(length=150), nullable=True),
        )
    if "prescription_settings" not in existentes:
        op.add_column(
            "doctor_profiles",
            sa.Column("prescription_settings", sa.JSON(), nullable=True),
        )


def downgrade() -> None:
    existentes = _columnas_existentes("doctor_profiles")

    if "prescription_settings" in existentes:
        op.drop_column("doctor_profiles", "prescription_settings")
    if "prescription_display_name" in existentes:
        op.drop_column("doctor_profiles", "prescription_display_name")
