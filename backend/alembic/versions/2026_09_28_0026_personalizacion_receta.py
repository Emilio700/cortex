"""Estilo propio de la receta y motivo a peticion.

Tres cosas que la doctora pidio poder decidir y que hasta ahora estaban
escritas dentro de ``pdf.py`` o simplemente no existian:

* ``doctor_profiles.prescription_footer_text`` — la leyenda del pie. Estaba
  fija en el codigo; el unico control era prenderla o apagarla entera.
* ``doctor_profiles.prescription_accent_color`` — el color del membrete. Se
  guarda UN color y el PDF deriva de el la linea y los subrayados, para no
  pedirle a la doctora que acierte con tres combinaciones.
* ``doctor_profiles.prescription_signature_style`` — tipografia del bloque de
  la firma (fuente, tamano, negritas, cursiva, color y si lleva linea para
  firmar a mano).

Y una que si es clinica:

* ``prescriptions.diagnosis`` — el motivo de consulta impreso en la receta.
  ``pdf.py`` lo dejaba fuera a proposito porque la receta viaja a la farmacia;
  se conserva ese defecto (NULL = no se imprime) y la doctora lo enciende
  receta por receta, para la paciente que si lo quiere llevarlo por escrito.
  Se guarda el TEXTO en la receta y no una llave a la nota de consulta: la
  reimpresion tiene que decir lo mismo que el papel que ya tiene la paciente.

Las cuatro columnas son **nullable y sin relleno de datos**. Un perfil que
nunca toque esto lee NULL, ``app/utils/receta_config.py`` le aplica los valores
de fabrica y su receta se imprime exactamente como la de ayer; y una receta sin
motivo no imprime el renglon. La migracion no puede cambiar la receta de nadie.

El estilo va en su propia columna y no dentro de ``prescription_settings``
porque aquel es un diccionario de booleanos con esquema ``StrictBool``: un
texto o un color ahi romperian la unica garantia que evita el INTEGER que
PostgreSQL rechazo una vez en produccion.

Revision ID: 2026_09_28_0026
Revises: 2026_09_28_0025
"""
import sqlalchemy as sa
from alembic import op

revision = "2026_09_28_0026"
down_revision = "2026_09_28_0025"
branch_labels = None
depends_on = None


def _columnas_existentes(nombre_tabla: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    return {columna["name"] for columna in inspector.get_columns(nombre_tabla)}


def upgrade() -> None:
    del_perfil = _columnas_existentes("doctor_profiles")

    if "prescription_footer_text" not in del_perfil:
        op.add_column(
            "doctor_profiles",
            sa.Column("prescription_footer_text", sa.String(length=150), nullable=True),
        )
    if "prescription_accent_color" not in del_perfil:
        op.add_column(
            "doctor_profiles",
            sa.Column("prescription_accent_color", sa.String(length=7), nullable=True),
        )
    if "prescription_signature_style" not in del_perfil:
        op.add_column(
            "doctor_profiles",
            sa.Column("prescription_signature_style", sa.JSON(), nullable=True),
        )

    de_recetas = _columnas_existentes("prescriptions")
    if "diagnosis" not in de_recetas:
        op.add_column(
            "prescriptions", sa.Column("diagnosis", sa.Text(), nullable=True)
        )


def downgrade() -> None:
    de_recetas = _columnas_existentes("prescriptions")
    if "diagnosis" in de_recetas:
        op.drop_column("prescriptions", "diagnosis")

    del_perfil = _columnas_existentes("doctor_profiles")
    if "prescription_signature_style" in del_perfil:
        op.drop_column("doctor_profiles", "prescription_signature_style")
    if "prescription_accent_color" in del_perfil:
        op.drop_column("doctor_profiles", "prescription_accent_color")
    if "prescription_footer_text" in del_perfil:
        op.drop_column("doctor_profiles", "prescription_footer_text")
