"""Teléfonos de México: normalizar para comparar, enmascarar para mostrar.

En el expediente los teléfonos se guardan como se capturaron: «669 111 2233»,
«(669)111-22-33», «+52 1 669 111 2233». Comparar el texto tal cual no
encuentra a la mismo paciente capturada dos veces, que es justo lo que busca
la advertencia de duplicados (B-06 / S-06). Aquí se reducen a los 10 dígitos
del número nacional.
"""
import re

# Prefijos que la gente sigue escribiendo aunque desde 2019 la marcación en
# México es de 10 dígitos: +52 (país), +52 1 (el viejo prefijo de celular),
# 044/045 (celular local / foráneo) y 01 (larga distancia).
_PREFIJOS = (
    (13, "521"),
    (12, "52"),
    (13, "044"),
    (13, "045"),
    (12, "01"),
)


def normalizar_telefono_mx(valor: str | None) -> str | None:
    """Los 10 dígitos del número, o ``None`` si no hay un teléfono de México válido."""
    digitos = re.sub(r"\D", "", valor or "")
    for largo, prefijo in _PREFIJOS:
        if len(digitos) == largo and digitos.startswith(prefijo):
            digitos = digitos[len(prefijo):]
            break
    return digitos if len(digitos) == 10 else None


def enmascarar_telefono(valor: str | None) -> str | None:
    """Sólo los últimos cuatro dígitos: bastan para que el paciente diga «sí, ése es mío»."""
    digitos = normalizar_telefono_mx(valor) or re.sub(r"\D", "", valor or "")
    if len(digitos) < 4:
        return None
    return f"•••-•••-{digitos[-4:]}"
