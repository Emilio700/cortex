"""Cómo se nombra a una doctora o un doctor: "Dra. Cintia Castro", "Dr. Adolfo…".

Antes el código armaba ``f"Dr. {nombre}"`` en cada sitio, así que a todas las
doctoras les llegaba "Dr." en el recibo, en los avisos y en la receta. Ahora
cada usuaria trae su ``tratamiento`` ("Dr.", "Dra." o nada), y este módulo es
el único lugar que lo antepone.

Sin tratamiento capturado se usa **sólo el nombre**: un "Dr." equivocado a una
doctora es peor que no poner nada (decisión de Emilio, plan 23, ajustes del
2026-09-28). Tampoco se adivina por el nombre: "Guadalupe" o "Trinidad" no
dicen nada.
"""
from typing import Optional

# El orden importa sólo para la pantalla; los dos valores son los únicos que se
# aceptan para que no aparezcan "dra", "DRA." y "Doctora" mezclados.
TRATAMIENTOS_VALIDOS = ("Dr.", "Dra.")


def normalizar_tratamiento(valor: Optional[str]) -> Optional[str]:
    """``"dra"`` → ``"Dra."``; vacío → ``None``; otro valor → ``ValueError``."""
    if valor is None:
        return None
    limpio = valor.strip()
    if not limpio:
        return None
    por_clave = {t.lower().rstrip("."): t for t in TRATAMIENTOS_VALIDOS}
    clave = limpio.lower().rstrip(".")
    if clave not in por_clave:
        raise ValueError('El tratamiento debe ser "Dr.", "Dra." o quedar vacío.')
    return por_clave[clave]


def nombre_con_tratamiento(usuario) -> str:
    """"Dra. Cintia Castro" si tiene tratamiento; si no, "Cintia Castro"."""
    if usuario is None:
        return ""
    nombre = (getattr(usuario, "full_name", None) or "").strip()
    tratamiento = (getattr(usuario, "tratamiento", None) or "").strip()
    if not nombre:
        return ""
    return f"{tratamiento} {nombre}" if tratamiento else nombre
