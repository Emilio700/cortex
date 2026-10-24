"""Configuración de la orden de estudio, por doctora (plan 26, D-7 y D-11).

Desde D-11 la orden tiene su PROPIO membrete, igual de editable que la receta
del plan 24 pero guardado aparte, en ``doctor_profiles.order_settings`` (JSON):
qué datos salen, el nombre impreso, el color, la letra de la firma y la
leyenda. La orden ya no lee nada de la configuración de la receta; para no
capturar dos veces, ``ajustes_desde_receta`` arma unos ajustes de orden a
partir de la receta (el botón «Copiar de mi receta»), sin guardarlos.

Excepción deliberada: la **cédula profesional se imprime siempre** que tenga
valor. El laboratorio la exige para recibir la orden, así que no hay
interruptor que la apague.

Igual que con la receta, lo guardado se lee con desconfianza: una clave
desconocida o un valor que no es del tipo esperado se ignora y manda el de
fábrica. Una orden nunca puede dejar de imprimirse porque alguien metiera
basura en el JSON; la validación estricta ocurre al guardar (``AjustesOrden``).
"""

from app.utils.colores import normalizar_hex
from app.utils.receta_config import (
    AJUSTES_RECETA_POR_DEFECTO,
    LEYENDA_POR_DEFECTO as LEYENDA_RECETA_POR_DEFECTO,
    anteponer_tratamiento,
    normalizar_estilo_firma,
)

# «separado»: una hoja por destino físico (laboratorio, imagen, otros), porque
# el paciente entrega cada hoja en un lugar distinto. «una_hoja»: todo junto.
MODOS_DE_IMPRESION = ("separado", "una_hoja")
MODO_POR_DEFECTO = "separado"

# La leyenda que ya traía el papel de la orden: dice lo que el papel es y lo
# que no es, para que nadie lo lea como un resultado.
LEYENDA_ORDEN_POR_DEFECTO = (
    "G.E.M.S — Orden de estudio. Es una solicitud: no es un resultado ni un diagnóstico."
)
# Cabe en una línea del pie a 6.5 pt; más larga se recortaría sin avisar.
LIMITE_LEYENDA_ORDEN = 150

LIMITE_NOMBRE_IMPRESO = 150

# Valores de fábrica: todo visible, que es como salía la orden.
AJUSTES_ORDEN_POR_DEFECTO: dict = {
    "modo_impresion": MODO_POR_DEFECTO,
    # Contenido
    "mostrar_indicacion": True,
    "mostrar_preparacion": True,
    "mostrar_prioridad": True,
    "mostrar_fecha_limite": True,
    # Membrete (D-11). La cédula profesional no tiene interruptor: siempre sale.
    "mostrar_logo": True,
    "mostrar_nombre": True,
    "mostrar_especialidad": True,
    "mostrar_consultorio": True,
    "mostrar_universidad": True,
    "mostrar_direccion": True,
    "mostrar_telefono": True,
    # Encendidos de fábrica, pero sólo se imprimen si el médico capturó el dato.
    "mostrar_correo": True,
    "mostrar_celular": True,
    "mostrar_registro_general": True,
    "mostrar_cedula_especialidad": True,
    "mostrar_registro_ssa": True,
    "mostrar_consejo": True,
    # Paciente
    "mostrar_fecha_nacimiento": True,
    "mostrar_edad": True,
    # Sólo la IMAGEN de la firma. La raya con el nombre siempre sale: es
    # donde firma a mano el médico que no subió su firma o no la quiere ahí.
    "mostrar_firma": True,
    # ``None`` = el nombre de la usuaria con su tratamiento.
    "nombre_impreso": None,
    # ``None`` = el morado de fábrica de la receta.
    "color_acento": None,
    # ``None`` = Helvetica-Bold de 10 bajo la raya, como siempre.
    "estilo_firma": None,
    # ``None`` = la leyenda de fábrica.
    "leyenda_pie": None,
}

_INTERRUPTORES = tuple(
    clave for clave, valor in AJUSTES_ORDEN_POR_DEFECTO.items() if isinstance(valor, bool)
)

# Interruptores que la receta (plan 24) tiene con el mismo significado. Lo
# demás de la orden no tiene equivalente y se queda como está al copiar.
_EQUIVALENTES_EN_RECETA = (
    "mostrar_logo", "mostrar_firma", "mostrar_nombre", "mostrar_especialidad", "mostrar_direccion",
    "mostrar_telefono", "mostrar_registro_general", "mostrar_cedula_especialidad", "mostrar_registro_ssa",
    "mostrar_consejo", "mostrar_fecha_nacimiento", "mostrar_edad", "mostrar_correo", "mostrar_celular",
)


def _limpiar_texto(valor, limite: int) -> str | None:
    if not isinstance(valor, str):
        return None
    limpia = " ".join("".join(" " if ord(ch) < 32 else ch for ch in valor).split()).strip()
    return limpia[:limite] or None


def normalizar_ajustes_orden(datos) -> dict:
    """Un juego completo y sin basura a partir de lo que haya guardado."""
    ajustes = dict(AJUSTES_ORDEN_POR_DEFECTO)
    if not isinstance(datos, dict):
        return ajustes
    if datos.get("modo_impresion") in MODOS_DE_IMPRESION:
        ajustes["modo_impresion"] = datos["modo_impresion"]
    for clave in _INTERRUPTORES:
        if isinstance(datos.get(clave), bool):
            ajustes[clave] = datos[clave]
    ajustes["leyenda_pie"] = _limpiar_texto(datos.get("leyenda_pie"), LIMITE_LEYENDA_ORDEN)
    ajustes["nombre_impreso"] = _limpiar_texto(datos.get("nombre_impreso"), LIMITE_NOMBRE_IMPRESO)
    ajustes["color_acento"] = normalizar_hex(datos.get("color_acento"))
    estilo = datos.get("estilo_firma")
    ajustes["estilo_firma"] = normalizar_estilo_firma(estilo) if isinstance(estilo, dict) else None
    return ajustes


def resolver_ajustes_orden(doctor_profile) -> dict:
    """Los ajustes efectivos de la orden de un perfil (o de fábrica si no hay)."""
    return normalizar_ajustes_orden(getattr(doctor_profile, "order_settings", None))


def resolver_leyenda_orden(ajustes: dict) -> str | None:
    """La leyenda PROPIA de la orden, si el médico escribió una.

    Es adicional: la advertencia ``LEYENDA_ORDEN_POR_DEFECTO`` («es una
    solicitud: no es un resultado ni un diagnóstico») se imprime siempre,
    porque es seguridad y no decoración (segunda revisión del plan 26).
    """
    propia = ajustes.get("leyenda_pie")
    return propia if propia and propia != LEYENDA_ORDEN_POR_DEFECTO else None


def resolver_modo(modo_pedido: str | None, doctor_profile) -> str:
    """El modo pedido en la llamada; si no viene, el que el médico dejó en su perfil."""
    if modo_pedido in MODOS_DE_IMPRESION:
        return modo_pedido
    return resolver_ajustes_orden(doctor_profile)["modo_impresion"]


def nombre_para_orden(doctor_profile, ajustes: dict) -> str:
    """El nombre impreso de la orden, con su tratamiento y sin duplicarlo."""
    usuario = getattr(doctor_profile, "user", None)
    nombre = ajustes.get("nombre_impreso") or getattr(usuario, "full_name", None) or ""
    return anteponer_tratamiento(nombre, usuario)


def lineas_credenciales_orden(doctor_profile, ajustes: dict) -> list[str]:
    """Credenciales del membrete de la orden, ya filtradas.

    La cédula profesional va primero y SIEMPRE que tenga valor (D-11): el
    laboratorio la exige. Las demás, según sus interruptores y sólo si tienen
    valor: una etiqueta «SSA» sin número no le dice nada a nadie.
    """
    candidatas = [
        (None, "Céd. Prof. ", getattr(doctor_profile, "professional_id", None)),
        ("mostrar_registro_general", "R.G.P. ", getattr(doctor_profile, "general_registry", None)),
        ("mostrar_cedula_especialidad", "Céd. Esp. ", getattr(doctor_profile, "specialty_license", None)),
        ("mostrar_registro_ssa", "SSA ", getattr(doctor_profile, "health_registry", None)),
        ("mostrar_consejo", "Consejo ", getattr(doctor_profile, "council_cert", None)),
    ]
    lineas = []
    for clave, etiqueta, valor in candidatas:
        if clave and not ajustes.get(clave):
            continue
        texto = _limpiar_texto(valor, 200)
        # «SIN-CEDULA» es el relleno de un perfil vacío, no una cédula.
        if texto and texto.upper() != "SIN-CEDULA":
            lineas.append(f"{etiqueta}{texto}")
    return lineas


def ajustes_desde_receta(doctor_profile) -> dict:
    """«Copiar de mi receta»: ajustes de la orden armados con los de la receta.

    No guarda nada; la pantalla los muestra y el médico decide. Se copia lo
    que el médico personalizó en su receta con el mismo sentido: nombre
    impreso, color, letra de la firma, la leyenda si escribió una propia, y
    SÓLO los interruptores que cambió respecto a la receta de fábrica. Un
    interruptor en su valor de fábrica no se copia: la receta apaga de fábrica
    la especialidad, el correo y el celular, y copiar ese «apagado» se los
    quitaría a la orden de quien nunca tocó su receta. Lo propio de la orden se
    queda con lo que ya tenía guardado.
    """
    ajustes = resolver_ajustes_orden(doctor_profile)
    guardados = getattr(doctor_profile, "prescription_settings", None)
    if isinstance(guardados, dict):
        for clave in _EQUIVALENTES_EN_RECETA:
            valor = guardados.get(clave)
            if isinstance(valor, bool) and valor != AJUSTES_RECETA_POR_DEFECTO[clave]:
                ajustes[clave] = valor
    ajustes["nombre_impreso"] = _limpiar_texto(
        getattr(doctor_profile, "prescription_display_name", None), LIMITE_NOMBRE_IMPRESO
    )
    ajustes["color_acento"] = normalizar_hex(getattr(doctor_profile, "prescription_accent_color", None))
    estilo = getattr(doctor_profile, "prescription_signature_style", None)
    ajustes["estilo_firma"] = normalizar_estilo_firma(estilo) if isinstance(estilo, dict) else None
    leyenda = _limpiar_texto(getattr(doctor_profile, "prescription_footer_text", None), LIMITE_LEYENDA_ORDEN)
    if leyenda and leyenda != LEYENDA_RECETA_POR_DEFECTO:
        ajustes["leyenda_pie"] = leyenda
    return ajustes
