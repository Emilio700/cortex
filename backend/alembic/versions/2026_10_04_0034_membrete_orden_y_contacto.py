"""Membrete de la orden copiado de la receta, y contacto impreso (plan 26, ronda 3).

Dos decisiones de Emilio (2026-10-04):

1. **Al desplegar, el membrete de la orden se copia de la receta.** Desde D-11
   la orden tiene su propio membrete y ya no lee la receta; sin esto, la
   doctora que personalizó su receta (nombre impreso, color, credenciales)
   vería su orden con los valores de fábrica hasta pulsar «Copiar de mi
   receta». Para cada ``doctor_profiles`` con ``order_settings`` nulo o sin
   membrete, se arma lo mismo que ``GET /doctor-profile/me/order-settings/
   from-prescription``: SÓLO los interruptores equivalentes que la doctora
   cambió respecto a la receta de fábrica (la receta apaga de fábrica la
   especialidad, el correo y el celular, y copiar ese «apagado» se los quitaría
   a la orden de quien nunca tocó su receta), el nombre impreso, el color, la
   letra de la firma y la leyenda sólo si es propia. Las opciones propias de la
   orden (modo, indicación, preparación, prioridad, fecha límite, consultorio,
   universidad) se quedan como estaban o con su valor de fábrica. La cédula
   profesional no tiene interruptor: se sigue imprimiendo siempre.

   La regla se copia aquí congelada a propósito, sin importar código de la
   aplicación: una migración tiene que hacer lo mismo el día que se corra,
   aunque ``app/utils/orden_config.py`` cambie después.

2. **Contacto impreso.** Columnas nuevas, nulas, en ``doctor_profiles``:
   ``contact_email`` (VARCHAR 255) y ``mobile_phone`` (VARCHAR 30). Se
   imprimen sólo si la doctora las enciende (en la receta vienen apagadas de
   fábrica, para que ninguna receta cambie).

Reversible: el ``order_settings`` anterior de cada perfil tocado se respalda en
``order_settings_antes_0034`` y ``downgrade`` lo devuelve tal cual (nulo si era
nulo), borra el respaldo y quita las dos columnas. Si la doctora editó su orden
después de la migración, el downgrade pisa esa edición con lo anterior.

Revision ID: 2026_10_04_0034
Revises: 2026_10_03_0033
"""
import re

import sqlalchemy as sa
from alembic import op

revision = "2026_10_04_0034"
down_revision = "2026_10_03_0033"
branch_labels = None
depends_on = None

RESPALDO = "order_settings_antes_0034"

# --- Regla congelada al 2026-10-04 -------------------------------------------
# Valores de fábrica de la receta (app/utils/receta_config.py).
RECETA_POR_DEFECTO = {
    "mostrar_logo": True, "mostrar_firma": True, "mostrar_nombre": True, "mostrar_especialidad": False,
    "mostrar_cedula_profesional": False, "mostrar_registro_general": True, "mostrar_cedula_especialidad": True,
    "mostrar_registro_ssa": True, "mostrar_consejo": True, "mostrar_edad": True, "mostrar_fecha_nacimiento": True,
    "mostrar_alergias": True, "mostrar_signos_vitales": False, "mostrar_direccion": True, "mostrar_telefono": True,
    "mostrar_pie_legal": True, "mostrar_correo": False, "mostrar_celular": False,
}
LEYENDA_RECETA_POR_DEFECTO = "CUIDAMOS TU SALUD, ACOMPAÑAMOS TU VIDA."

# Valores de fábrica de la orden (app/utils/orden_config.py).
ORDEN_POR_DEFECTO = {
    "modo_impresion": "separado", "mostrar_indicacion": True, "mostrar_preparacion": True,
    "mostrar_prioridad": True, "mostrar_fecha_limite": True, "mostrar_logo": True, "mostrar_nombre": True,
    "mostrar_especialidad": True, "mostrar_consultorio": True, "mostrar_universidad": True,
    "mostrar_direccion": True, "mostrar_telefono": True, "mostrar_correo": True, "mostrar_celular": True,
    "mostrar_registro_general": True, "mostrar_cedula_especialidad": True, "mostrar_registro_ssa": True,
    "mostrar_consejo": True, "mostrar_fecha_nacimiento": True, "mostrar_edad": True, "mostrar_firma": True,
    "nombre_impreso": None, "color_acento": None, "estilo_firma": None, "leyenda_pie": None,
}
EQUIVALENTES_EN_RECETA = (
    "mostrar_logo", "mostrar_firma", "mostrar_nombre", "mostrar_especialidad", "mostrar_direccion",
    "mostrar_telefono", "mostrar_registro_general", "mostrar_cedula_especialidad", "mostrar_registro_ssa",
    "mostrar_consejo", "mostrar_fecha_nacimiento", "mostrar_edad", "mostrar_correo", "mostrar_celular",
)
# Claves que sólo existen desde D-11: si el JSON no trae ninguna, no tiene membrete.
CLAVES_DE_MEMBRETE = (
    "nombre_impreso", "color_acento", "estilo_firma", "mostrar_logo", "mostrar_nombre", "mostrar_especialidad",
    "mostrar_universidad", "mostrar_direccion", "mostrar_telefono", "mostrar_registro_general",
    "mostrar_cedula_especialidad", "mostrar_registro_ssa", "mostrar_consejo",
)
_HEX = re.compile(r"^#?([0-9a-fA-F]{6})$")


def _texto(valor, limite):
    if not isinstance(valor, str):
        return None
    limpio = " ".join("".join(" " if ord(ch) < 32 else ch for ch in valor).split()).strip()
    return limpio[:limite] or None


def _hex(valor):
    coincidencia = _HEX.match(valor.strip()) if isinstance(valor, str) else None
    return f"#{coincidencia.group(1).upper()}" if coincidencia else None


def tiene_membrete(ajustes) -> bool:
    return isinstance(ajustes, dict) and any(clave in ajustes for clave in CLAVES_DE_MEMBRETE)


def membrete_desde_receta(ajustes_orden, receta, nombre, color, estilo, leyenda) -> dict:
    """La misma regla que «Copiar de mi receta», sobre lo guardado de la orden."""
    resultado = dict(ORDEN_POR_DEFECTO)
    if isinstance(ajustes_orden, dict):
        for clave, valor in ajustes_orden.items():
            if clave in resultado:
                resultado[clave] = valor
    # Sólo lo que la doctora cambió respecto a la receta de fábrica.
    if isinstance(receta, dict):
        for clave in EQUIVALENTES_EN_RECETA:
            valor = receta.get(clave)
            if isinstance(valor, bool) and valor != RECETA_POR_DEFECTO[clave]:
                resultado[clave] = valor
    resultado["nombre_impreso"] = _texto(nombre, 150)
    resultado["color_acento"] = _hex(color)
    resultado["estilo_firma"] = estilo if isinstance(estilo, dict) else None
    leyenda = _texto(leyenda, 150)
    if leyenda and leyenda != LEYENDA_RECETA_POR_DEFECTO:
        resultado["leyenda_pie"] = leyenda
    return resultado


def _tabla_perfiles():
    return sa.table(
        "doctor_profiles",
        sa.column("id", sa.Integer), sa.column("order_settings", sa.JSON(none_as_null=True)),
        sa.column("prescription_settings", sa.JSON), sa.column("prescription_display_name", sa.String),
        sa.column("prescription_accent_color", sa.String), sa.column("prescription_signature_style", sa.JSON),
        sa.column("prescription_footer_text", sa.String),
    )


def upgrade():
    with op.batch_alter_table("doctor_profiles") as batch:
        batch.add_column(sa.Column("contact_email", sa.String(length=255), nullable=True))
        batch.add_column(sa.Column("mobile_phone", sa.String(length=30), nullable=True))

    respaldo = op.create_table(
        RESPALDO,
        sa.Column("doctor_profile_id", sa.Integer(), primary_key=True),
        sa.Column("order_settings", sa.JSON(none_as_null=True), nullable=True),
    )
    perfiles = _tabla_perfiles()
    conexion = op.get_bind()
    for fila in conexion.execute(sa.select(perfiles)).mappings().all():
        anterior = fila["order_settings"]
        if tiene_membrete(anterior):
            continue
        conexion.execute(sa.insert(respaldo).values(doctor_profile_id=fila["id"], order_settings=anterior))
        nuevo = membrete_desde_receta(
            anterior, fila["prescription_settings"], fila["prescription_display_name"],
            fila["prescription_accent_color"], fila["prescription_signature_style"], fila["prescription_footer_text"],
        )
        conexion.execute(sa.update(perfiles).where(perfiles.c.id == fila["id"]).values(order_settings=nuevo))


def downgrade():
    perfiles = _tabla_perfiles()
    respaldo = sa.table(RESPALDO, sa.column("doctor_profile_id", sa.Integer), sa.column("order_settings", sa.JSON(none_as_null=True)))
    conexion = op.get_bind()
    for fila in conexion.execute(sa.select(respaldo)).mappings().all():
        conexion.execute(
            sa.update(perfiles).where(perfiles.c.id == fila["doctor_profile_id"]).values(order_settings=fila["order_settings"])
        )
    op.drop_table(RESPALDO)
    with op.batch_alter_table("doctor_profiles") as batch:
        batch.drop_column("mobile_phone")
        batch.drop_column("contact_email")
