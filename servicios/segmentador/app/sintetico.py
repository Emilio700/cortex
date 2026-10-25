"""Columna sintética determinista para el modo ``SEGMENTADOR_FALSO=1``.

No es la anatomía de nadie: son elipses y anillos apilados con una curva suave,
con las medidas aproximadas de un adulto (en mm). Sirve para probar todo el
camino —máscaras → mallas → GLB → Cortex → Neuro 3D— en un equipo sin GPU y sin
los pesos del modelo, y para que las pruebas sean repetibles: la misma entrada
da los mismos bytes.

Se arma como máscaras y pasa por el mismo mallado que el motor real, así las
pruebas del modo falso también prueban ``mallas.py``.
"""
from __future__ import annotations

from functools import lru_cache

import numpy as np

from .etiquetas import CERVICALES, LUMBARES, TORACICAS

VOXEL_MM = 2.0
LADO = 64

# (nivel, altura del cuerpo, disco de abajo, semiejes del cuerpo x/y, radio del conducto) en mm.
_MEDIDAS = (
    [(n, 14.0, 5.0, 9.0, 7.5, 7.5) for n in CERVICALES]
    + [(n, 21.0, 5.5, 13.0 + i * 0.8, 10.0 + i * 0.5, 6.5) for i, n in enumerate(TORACICAS)]
    + [(n, 27.0, 10.0, 22.0, 15.0, 8.5) for n in LUMBARES]
)
ALTO_SACRO = 48.0


def afin_sintetica(cortes: int) -> np.ndarray:
    """Vóxel → RAS. Con el eje x en espejo, como suele salir de dcm2niix (LAS)."""
    s = VOXEL_MM
    medio = (LADO - 1) * s / 2
    return np.array([
        [-s, 0, 0, medio],
        [0, s, 0, -medio],
        [0, 0, s, -(cortes - 1) * s],
        [0, 0, 0, 1],
    ])


# Es la misma siempre: se arma una vez por proceso.
@lru_cache(maxsize=1)
def columna_sintetica() -> tuple[dict[str, np.ndarray], np.ndarray]:
    alto_total = sum(c + d for _, c, d, *_ in _MEDIDAS) + ALTO_SACRO + 10
    cortes = int(np.ceil(alto_total / VOXEL_MM))
    afin = afin_sintetica(cortes)

    i, j, k = np.meshgrid(np.arange(LADO), np.arange(LADO), np.arange(cortes), indexing="ij")
    ras = np.stack([i, j, k, np.ones_like(i)], axis=-1) @ afin.T
    # LPS: +x izquierda, +y posterior, +z superior.
    x, y, z = -ras[..., 0], -ras[..., 1], ras[..., 2]

    techo = 0.0 - 4.0  # C1 empieza 4 mm por debajo del borde superior.
    largo = alto_total
    # Curva sagital suave: lordosis cervical y lumbar, cifosis torácica.
    curva = lambda zz: 9.0 * np.sin(2 * np.pi * (-zz) / largo)  # noqa: E731
    yc = y - curva(z)

    mascaras: dict[str, np.ndarray] = {}
    arriba = techo
    for nivel, cuerpo, disco, ax, ay, conducto in _MEDIDAS:
        abajo = arriba - cuerpo
        en_altura = (z <= arriba) & (z > abajo)
        centro_cuerpo = -(conducto + ay + 1.5)
        cuerpo_v = ((x / ax) ** 2 + ((yc - centro_cuerpo) / ay) ** 2 <= 1) & en_altura
        radio = np.hypot(x, yc)
        anillo = (radio > conducto) & (radio <= conducto + 4.5) & en_altura
        espinosa = (np.abs(x) <= 3) & (yc > conducto) & (yc <= conducto + 4.5 + 16) & (z <= arriba - 2) & (z > abajo + 3)
        transversas = (np.abs(yc) <= 3.5) & (np.abs(x) > conducto) & (np.abs(x) <= conducto + 4.5 + ax * 0.9) & (z <= arriba - 3) & (z > abajo + 4)
        mascaras[f"vertebra-{nivel}"] = cuerpo_v | anillo | espinosa | transversas
        arriba = abajo - disco
    # El sacro: una cuña que se angosta hacia abajo, con su conducto.
    abajo = arriba - ALTO_SACRO
    fraccion = np.clip((arriba - z) / ALTO_SACRO, 0, 1)
    ancho = 45.0 * (1 - 0.6 * fraccion)
    en_sacro = (z <= arriba) & (z > abajo)
    radio = np.hypot(x, yc)
    mascaras["sacro"] = en_sacro & (np.abs(x) <= ancho) & (yc > -30) & (yc < 14) & (radio > 6.0)

    # Médula: de arriba de C1 hasta la mitad de L1 (el cono), dentro del conducto.
    arriba_l1 = techo - sum(c + d for n, c, d, *_ in _MEDIDAS if n not in LUMBARES)
    nivel_l1_medio = arriba_l1 - 13.0
    mascaras["medula-espinal"] = (np.hypot(x, yc) <= 4.0) & (z <= techo + 2) & (z > nivel_l1_medio)

    return mascaras, afin
