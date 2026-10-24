"""Corregir el tipo de pregnancies.is_multiple_gestation.

La columna se creo como INTEGER pero los schemas siempre la declararon
``bool``, asi que PostgreSQL rechazaba el INSERT con DatatypeMismatch:
**registrar un embarazo nunca funciono en produccion**. Las pruebas no lo
detectaron porque corren en SQLite, que acepta un booleano en una columna
entera; solo PostgreSQL es estricto.

La tabla esta vacia (0 filas en produccion), asi que el cambio de tipo no
puede perder datos. El USING deja preparado el caso de que existieran.

Revision ID: 2026_09_19_0016
Revises: 2026_09_19_0015
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_19_0016"
down_revision = "2026_09_19_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Hay que soltar el DEFAULT antes de cambiar el tipo: PostgreSQL no sabe
    # convertir el default entero (0) a booleano y aborta el ALTER.
    op.execute("ALTER TABLE pregnancies ALTER COLUMN is_multiple_gestation DROP DEFAULT")
    op.execute(
        "ALTER TABLE pregnancies ALTER COLUMN is_multiple_gestation "
        "TYPE BOOLEAN USING is_multiple_gestation::integer::boolean"
    )
    op.execute(
        "ALTER TABLE pregnancies ALTER COLUMN is_multiple_gestation SET DEFAULT false"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE pregnancies ALTER COLUMN is_multiple_gestation DROP DEFAULT")
    op.execute(
        "ALTER TABLE pregnancies ALTER COLUMN is_multiple_gestation "
        "TYPE INTEGER USING is_multiple_gestation::integer"
    )
    op.execute("ALTER TABLE pregnancies ALTER COLUMN is_multiple_gestation SET DEFAULT 0")
