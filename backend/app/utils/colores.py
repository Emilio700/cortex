"""Colores de la receta.

La doctora elige **un** color y de ahí salen los tres tonos que el PDF
necesita: el acento (títulos y marcos), la línea (separadores) y el campo
(subrayados de los datos de la paciente). Pedirle tres colores a mano sería
pedirle que acierte con tres combinaciones distintas cada vez.

El color de fábrica devuelve **exactamente** los tonos que ya estaban escritos
en ``pdf.py``. No es una casualidad: quien nunca abra esta pantalla tiene que
seguir imprimiendo la receta de ayer, y una derivación aritmética no reproduce
un color elegido a ojo. Por eso el valor de fábrica se devuelve tal cual en vez
de calcularlo.

Un color claro no puede usarse tal cual para el texto: el nombre de la paciente
se imprimiría casi blanco sobre blanco. Acento y línea se oscurecen hasta que
se lean; el campo —que es una raya fina bajo el valor, no texto— sí puede ir
claro.
"""

import re
from typing import Optional

# Valores de fábrica. Son los que estaban dentro de ``generate_prescription_pdf``
# antes de que el color fuera configurable.
COLOR_ACENTO_POR_DEFECTO = "#8B2E83"
COLOR_LINEA_POR_DEFECTO = "#B85A98"
COLOR_CAMPO_POR_DEFECTO = "#D9C4D5"

# Más claro que esto el texto pierde legibilidad sobre el papel blanco.
_LUZ_MAXIMA_TEXTO = 0.45
# Un tono de línea más claro que esto desaparece al imprimir en blanco y negro.
_LUZ_MINIMA_LINEA = 0.28

_HEX_RE = re.compile(r"^#?([0-9a-fA-F]{6})$")


def normalizar_hex(valor) -> Optional[str]:
    """``"#8b2e83"``, ``"8B2E83"`` → ``"#8B2E83"``. Lo demás → ``None``.

    Se acepta el ``#`` opcional para no rechazar lo que el navegador manda
    según el navegador que sea, pero lo que sale de aquí siempre va con ``#``
    y en mayúsculas, que es como se guarda.
    """
    if not isinstance(valor, str):
        return None
    coincidencia = _HEX_RE.match(valor.strip())
    if not coincidencia:
        return None
    return f"#{coincidencia.group(1).upper()}"


def es_hex_valido(valor) -> bool:
    """¿Se puede usar como color de acento?"""
    return normalizar_hex(valor) is not None


def _a_rgb(color: str) -> tuple[int, int, int]:
    return tuple(int(color[i : i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]


def _canal(p: float, q: float, t: float) -> float:
    if t < 0:
        t += 1
    if t > 1:
        t -= 1
    if t < 1 / 6:
        return p + (q - p) * 6 * t
    if t < 1 / 2:
        return q
    if t < 2 / 3:
        return p + (q - p) * (2 / 3 - t) * 6
    return p


def _a_hsl(r: int, g: int, b: int) -> tuple[float, float, float]:
    """RGB 0-255 → HSL con los tres valores entre 0 y 1."""
    r, g, b = r / 255.0, g / 255.0, b / 255.0
    maximo, minimo = max(r, g, b), min(r, g, b)
    luz = (maximo + minimo) / 2.0
    if maximo == minimo:
        return 0.0, 0.0, luz
    delta = maximo - minimo
    saturacion = delta / (2.0 - maximo - minimo) if luz > 0.5 else delta / (maximo + minimo)
    if maximo == r:
        matiz = (g - b) / delta + (6.0 if g < b else 0.0)
    elif maximo == g:
        matiz = (b - r) / delta + 2.0
    else:
        matiz = (r - g) / delta + 4.0
    return matiz / 6.0, saturacion, luz


def _de_hsl(matiz: float, saturacion: float, luz: float) -> str:
    luz = min(max(luz, 0.0), 1.0)
    saturacion = min(max(saturacion, 0.0), 1.0)
    if saturacion == 0:
        r = g = b = luz
    else:
        q = luz * (1 + saturacion) if luz < 0.5 else luz + saturacion - luz * saturacion
        p = 2 * luz - q
        r = _canal(p, q, matiz + 1 / 3)
        g = _canal(p, q, matiz)
        b = _canal(p, q, matiz - 1 / 3)
    return f"#{round(r * 255):02X}{round(g * 255):02X}{round(b * 255):02X}"


def tonos(color) -> tuple[str, str, str]:
    """``(acento, línea, campo)`` para un color elegido.

    Un color inválido o vacío cae al de fábrica: la receta nunca deja de
    imprimirse porque el color guardado no se entienda.
    """
    elegido = normalizar_hex(color)
    if elegido is None or elegido == COLOR_ACENTO_POR_DEFECTO:
        # Tal cual, sin derivar: es lo que se imprimía antes de que esto fuera
        # configurable y hay que reproducirlo al píxel.
        return COLOR_ACENTO_POR_DEFECTO, COLOR_LINEA_POR_DEFECTO, COLOR_CAMPO_POR_DEFECTO

    matiz, saturacion, luz = _a_hsl(*_a_rgb(elegido))

    # El acento se usa para texto y marcos: si el color elegido es un amarillo
    # o un rosa pálido, tal cual no se leería.
    luz_acento = min(luz, _LUZ_MAXIMA_TEXTO)
    saturacion_acento = min(saturacion, 0.85)

    # La línea respira un poco más que el acento, pero nunca tanto como para
    # perderse al imprimir sin color.
    luz_linea = max(luz_acento + 0.18, _LUZ_MINIMA_LINEA)
    linea = _de_hsl(matiz, saturacion_acento * 0.72, min(luz_linea, 0.62))

    # El campo es una raya fina bajo el valor, no texto: puede ir muy claro.
    campo = _de_hsl(matiz, min(saturacion, 0.5) * 0.6, 0.86)

    return _de_hsl(matiz, saturacion_acento, luz_acento), linea, campo
