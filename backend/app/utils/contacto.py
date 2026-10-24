"""Datos de contacto que el médico imprime en la receta y la orden (plan 26, ronda 3).

Son aparte de ``users.email`` (con el que entra al sistema) y del teléfono del
consultorio: el correo y el celular/WhatsApp que ella quiere dar a sus
pacientes. Se validan al guardar porque se imprimen tal cual: un número con
letras o un correo sin dominio en el papel es un contacto que no sirve.
"""
import re

LIMITE_CORREO = 255
LIMITE_CELULAR = 30

_CORREO_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Lo que la gente escribe en un número: dígitos, espacios, +, -, puntos y
# paréntesis. Lo que cuenta es cuántos dígitos hay.
_CELULAR_RE = re.compile(r"^[0-9+\-().\s]+$")
DIGITOS_MIN, DIGITOS_MAX = 10, 15


def limpiar_correo(valor):
    """El correo sin espacios alrededor; vacío es «sin correo». Error si no es un correo."""
    if valor is None:
        return None
    limpio = str(valor).strip()
    if not limpio:
        return None
    if len(limpio) > LIMITE_CORREO or not _CORREO_RE.match(limpio):
        raise ValueError("El correo de contacto no tiene un formato válido (ejemplo: consulta@clinica.com)")
    return limpio


def limpiar_celular(valor):
    """El celular con los espacios normalizados; vacío es «sin celular». Error si no es un número."""
    if valor is None:
        return None
    limpio = " ".join(str(valor).split())
    if not limpio:
        return None
    digitos = sum(ch.isdigit() for ch in limpio)
    if len(limpio) > LIMITE_CELULAR or not _CELULAR_RE.match(limpio) or not DIGITOS_MIN <= digitos <= DIGITOS_MAX:
        raise ValueError("El celular debe tener de 10 a 15 dígitos (ejemplo: 669 123 4567)")
    return limpio
