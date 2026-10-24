"""Configuración de la orden de estudio en el perfil de la doctora (plan 26, D-7).

Agrega ``doctor_profiles.order_settings`` (JSON, nula): lo propio del papel de
la orden —modo de impresión por omisión («separado» por destino o «una_hoja»),
qué datos se muestran (indicación, preparación, prioridad, fecha límite,
imagen de firma, consultorio) y una leyenda propia para el pie.

El membrete NO va aquí: la orden usa el de la receta (nombre impreso,
credenciales, logo, firma y color, plan 24), para que el laboratorio reconozca
a la doctora igual en los dos papeles.

Columna nula y sin relleno de datos: un perfil que nunca la toque lee NULL,
``app/utils/orden_config.py`` le aplica los valores de fábrica (todo visible,
separado por destino, la leyenda de siempre) y su orden sale como hoy. En
PostgreSQL agregar una columna nula sin valor por omisión no reescribe la
tabla.

Va en su propia columna y no dentro de ``prescription_settings`` porque aquel
es un diccionario de ``StrictBool`` de la receta y aquí hay un texto (la
leyenda) y un valor de lista (el modo).

Reversible: ``downgrade`` quita la columna y se pierde la configuración de la
orden; el papel vuelve a los valores de fábrica.

Revision ID: 2026_10_03_0031
Revises: 2026_09_29_0030
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_10_03_0031"
down_revision = "2026_09_29_0030"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("doctor_profiles") as batch:
        batch.add_column(sa.Column("order_settings", sa.JSON(), nullable=True))


def downgrade():
    with op.batch_alter_table("doctor_profiles") as batch:
        batch.drop_column("order_settings")
