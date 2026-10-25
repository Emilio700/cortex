"""De máscaras por estructura a mallas en milímetros y en LPS.

Entrada: un dict ``id → máscara booleana`` (todas del mismo tamaño) y la matriz
afín vóxel → RAS en mm, la de NIfTI (nibabel). Salida: una ``Malla`` por
estructura, ya en el sistema del paciente **LPS**, que es el de DICOM: así una
coordenada de la malla se compara directo con la posición de un corte en el
visor.

Cada malla se suaviza (gaussiana ligera sobre la máscara, para que no se vean
los escalones del vóxel) y se simplifica subiendo el paso de *marching cubes*
hasta quedar bajo un tope de triángulos: el navegador del consultorio no es una
estación de trabajo.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage
from skimage import measure

from .etiquetas import POR_ID, ids_oseos
from .glb import Malla

# Tope por estructura. Una vértebra se lee bien con unos miles de triángulos.
MAX_TRIANGULOS = 12_000
SIGMA_SUAVIZADO_MM = 0.8
# Menos vóxeles que esto es ruido, no una estructura.
MIN_VOXELES = 30

RAS_A_LPS = np.diag([-1.0, -1.0, 1.0])


def _eje_superior(afin: np.ndarray) -> int:
    """El eje de vóxel que más se parece a superior (z de RAS)."""
    return int(np.argmax(np.abs(afin[2, :3])))


def derivar_conducto(mascaras: dict[str, np.ndarray], afin: np.ndarray) -> np.ndarray | None:
    """Conducto vertebral aproximado: el hueco que encierran las vértebras.

    TotalSegmentator no tiene una clase abierta para el conducto. Se toma, corte
    a corte en el eje superior, el hueco más grande que rodea el hueso (el agujero
    vertebral) y se cierra entre niveles, donde el arco no rodea del todo. Es una
    aproximación y la malla se llama así.
    """
    oseos = [mascaras[i] for i in ids_oseos() if i in mascaras]
    if not oseos:
        return None
    hueso = np.logical_or.reduce(oseos)
    eje = _eje_superior(afin)
    hueso = np.moveaxis(hueso, eje, 0)
    conducto = np.zeros_like(hueso)
    for k in range(hueso.shape[0]):
        corte = hueso[k]
        if not corte.any():
            continue
        hueco = ndimage.binary_fill_holes(corte) & ~corte
        etiquetas, n = ndimage.label(hueco)
        if n == 0:
            continue
        tamanos = ndimage.sum(hueco, etiquetas, range(1, n + 1))
        mayor = int(np.argmax(tamanos)) + 1
        if tamanos[mayor - 1] >= 4:
            conducto[k] = etiquetas == mayor
    if not conducto.any():
        return None
    # Une los niveles: el disco y el ligamento amarillo no son hueso.
    espaciado = float(np.linalg.norm(afin[:3, eje]))
    largo = max(1, int(round(12.0 / max(espaciado, 0.1))))
    estructura = np.zeros((2 * largo + 1, 1, 1), dtype=bool)
    estructura[:, 0, 0] = True
    conducto = ndimage.binary_closing(conducto, structure=estructura)
    conducto &= ~hueso
    return np.moveaxis(conducto, 0, eje)


def _volumen_con_signo(vertices: np.ndarray, caras: np.ndarray) -> float:
    a, b, c = (vertices[caras[:, i]].astype(float) for i in range(3))
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)


def _normales(vertices: np.ndarray, caras: np.ndarray) -> np.ndarray:
    normales = np.zeros_like(vertices)
    a, b, c = (vertices[caras[:, i]] for i in range(3))
    cara = np.cross(b - a, c - a)
    for i in range(3):
        np.add.at(normales, caras[:, i], cara)
    largo = np.linalg.norm(normales, axis=1, keepdims=True)
    largo[largo == 0] = 1
    return (normales / largo).astype(np.float32)


def malla_de_mascara(id_: str, mascara: np.ndarray, afin: np.ndarray) -> Malla | None:
    voxeles = int(mascara.sum())
    if voxeles < MIN_VOXELES:
        return None
    # Recorta a la caja de la estructura (con margen): marching cubes sobre el
    # volumen entero sería cien veces más lento.
    indices = np.argwhere(mascara)
    inicio = np.maximum(indices.min(axis=0) - 2, 0)
    fin = np.minimum(indices.max(axis=0) + 3, mascara.shape)
    recorte = mascara[inicio[0]:fin[0], inicio[1]:fin[1], inicio[2]:fin[2]]
    recorte = np.pad(recorte, 1).astype(np.float32)
    espaciado = np.linalg.norm(afin[:3, :3], axis=0)
    sigma = SIGMA_SUAVIZADO_MM / np.maximum(espaciado, 1e-3)
    suave = ndimage.gaussian_filter(recorte, sigma=sigma)

    paso = 1
    while True:
        try:
            verts, caras, _, _ = measure.marching_cubes(suave, level=0.5, step_size=paso, allow_degenerate=False)
        except (ValueError, RuntimeError):
            return None
        if len(caras) <= MAX_TRIANGULOS or paso >= 6:
            break
        paso += 1
    if len(caras) == 0:
        return None

    # Índices del recorte → índices del volumen → RAS (mm) → LPS (mm).
    verts = verts - 1 + inicio
    ras = verts @ afin[:3, :3].T + afin[:3, 3]
    lps = ras @ RAS_A_LPS.T
    caras = caras.astype(np.uint32)
    # El sentido de los triángulos depende de la afín (una con espejo lo
    # invierte) y de la convención de scikit-image. En vez de razonarlo caso por
    # caso, se mide: con las normales hacia fuera, el volumen con signo es
    # positivo.
    if _volumen_con_signo(lps, caras) < 0:
        caras = caras[:, ::-1].copy()

    estructura = POR_ID.get(id_)
    volumen = voxeles * float(abs(np.linalg.det(afin[:3, :3])))
    return Malla(
        id=id_,
        nombre=estructura.nombre if estructura else id_,
        vertices=lps.astype(np.float32),
        caras=caras,
        normales=_normales(lps.astype(np.float32), caras),
        extras={
            "capa": estructura.capa if estructura else None,
            "acabado": estructura.acabado if estructura else None,
            "voxeles": voxeles,
            "volumen_mm3": round(volumen, 1),
            "paso_marching_cubes": paso,
        },
    )


def mallas_de_mascaras(mascaras: dict[str, np.ndarray], afin: np.ndarray, *, con_conducto: bool = True) -> list[Malla]:
    afin = np.asarray(afin, dtype=float)
    todas = dict(mascaras)
    if con_conducto and "conducto-vertebral" not in todas:
        conducto = derivar_conducto(todas, afin)
        if conducto is not None:
            todas["conducto-vertebral"] = conducto
    salida: list[Malla] = []
    # Orden del catálogo: de C1 hacia abajo, luego médula y conducto.
    orden = list(POR_ID) + sorted(set(todas) - set(POR_ID))
    for id_ in orden:
        if id_ not in todas:
            continue
        malla = malla_de_mascara(id_, todas[id_], afin)
        if malla is not None:
            salida.append(malla)
    return salida
