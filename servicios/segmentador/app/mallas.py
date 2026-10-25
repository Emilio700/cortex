"""De máscaras por estructura a mallas en milímetros y en LPS.

Entrada: un dict ``id → máscara booleana`` (todas del mismo tamaño) y la matriz
afín vóxel → RAS en mm, la de NIfTI (nibabel). Salida: una ``Malla`` por
estructura, ya en el sistema del paciente **LPS**, que es el de DICOM: así una
coordenada de la malla se compara directo con la posición de un corte en el
visor.

Dos acabados (``SEGMENTADOR_MALLA``):

- ``refinada`` (por omisión): *marching cubes* a resolución completa sobre la
  máscara con un desenfoque mínimo, suavizado **Taubin** (trimesh) y decimación
  cuádrica (fast-simplification) hasta el tope de triángulos. Taubin alterna un
  paso que encoge y otro que infla: quita los escalones del vóxel sin adelgazar
  la vértebra, cosa que una gaussiana fuerte o un Laplaciano sí hacen. La
  decimación cuádrica quita triángulos donde la superficie es plana y los deja en
  los bordes, en vez de muestrear parejo como un paso de *marching cubes* mayor.
- ``clasica``: la de la primera versión (gaussiana de 0.8 mm y subir el paso de
  *marching cubes* hasta caber en el tope). Queda para comparar y por si las
  bibliotecas de malla faltan.

El tope de triángulos existe porque el navegador del consultorio no es una
estación de trabajo.
"""
from __future__ import annotations

import os

import numpy as np
from scipy import ndimage
from skimage import measure

from .etiquetas import DISCO_SIN_NIVEL, MAX_TRIANGULOS, NIVELES, POR_ID, estructura_de_disco, ids_oseos
from .glb import Malla

SIGMA_SUAVIZADO_MM = 0.8
# Refinada: el desenfoque sólo redondea el borde binario (medio vóxel); el resto
# del suavizado lo hace Taubin sobre la malla, que no encoge.
SIGMA_REFINADA_VOXEL = 0.5
TAUBIN_ITERACIONES = 20
TAUBIN_LAMBDA = 0.5
TAUBIN_NU = 0.53
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


def acabado() -> str:
    return "clasica" if os.environ.get("SEGMENTADOR_MALLA", "refinada") == "clasica" else "refinada"


def _a_lps(verts: np.ndarray, inicio: np.ndarray, afin: np.ndarray) -> np.ndarray:
    """Índices del recorte (con su relleno de 1) → índices del volumen → RAS (mm) → LPS (mm)."""
    verts = verts - 1 + inicio
    ras = verts @ afin[:3, :3].T + afin[:3, 3]
    return ras @ RAS_A_LPS.T


def _clasica(recorte: np.ndarray, espaciado: np.ndarray, tope: int):
    sigma = SIGMA_SUAVIZADO_MM / np.maximum(espaciado, 1e-3)
    suave = ndimage.gaussian_filter(recorte, sigma=sigma)
    paso = 1
    while True:
        verts, caras, _, _ = measure.marching_cubes(suave, level=0.5, step_size=paso, allow_degenerate=False)
        if len(caras) <= tope or paso >= 6:
            return verts, caras, {"paso_marching_cubes": paso}
        paso += 1


def _refinada(recorte: np.ndarray, inicio: np.ndarray, afin: np.ndarray, tope: int):
    import fast_simplification
    import trimesh

    suave = ndimage.gaussian_filter(recorte, sigma=SIGMA_REFINADA_VOXEL)
    # Paso 1 salvo en estructuras enormes (un cráneo de angio-TC submilimétrica):
    # ahí el paso 2 ya da más triángulos de los que quedarán tras decimar.
    paso = 1 if recorte.size <= 40_000_000 else 2
    verts, caras, _, _ = measure.marching_cubes(suave, level=0.5, step_size=paso, allow_degenerate=False)
    crudos = len(caras)
    # Taubin en milímetros, no en índices: con vóxeles anisótropos (0.7 × 0.7 × 3
    # mm) el suavizado en índices aplanaría más en un eje que en otro.
    malla = trimesh.Trimesh(_a_lps(verts, inicio, afin), caras, process=False)
    trimesh.smoothing.filter_taubin(malla, lamb=TAUBIN_LAMBDA, nu=TAUBIN_NU, iterations=TAUBIN_ITERACIONES)
    lps = np.asarray(malla.vertices, dtype=np.float64)
    caras = np.asarray(malla.faces, dtype=np.int64)
    if len(caras) > tope:
        reduccion = 1.0 - (tope * 0.97) / len(caras)
        lps, caras = fast_simplification.simplify(lps.astype(np.float32), caras.astype(np.int32), target_reduction=reduccion)
    return lps, caras, {"paso_marching_cubes": paso, "triangulos_crudos": int(crudos)}


def malla_de_mascara(id_: str, mascara: np.ndarray, afin: np.ndarray) -> Malla | None:
    voxeles = int(mascara.sum())
    if voxeles < MIN_VOXELES:
        return None
    estructura = POR_ID.get(id_)
    tope = estructura.max_triangulos if estructura else MAX_TRIANGULOS
    # Recorta a la caja de la estructura (con margen): marching cubes sobre el
    # volumen entero sería cien veces más lento.
    indices = np.argwhere(mascara)
    inicio = np.maximum(indices.min(axis=0) - 2, 0)
    fin = np.minimum(indices.max(axis=0) + 3, mascara.shape)
    recorte = mascara[inicio[0]:fin[0], inicio[1]:fin[1], inicio[2]:fin[2]]
    recorte = np.pad(recorte, 1).astype(np.float32)
    espaciado = np.linalg.norm(afin[:3, :3], axis=0)

    modo = acabado()
    try:
        if modo == "refinada":
            lps, caras, detalle = _refinada(recorte, inicio, afin, tope)
        else:
            verts, caras, detalle = _clasica(recorte, espaciado, tope)
            lps = _a_lps(verts, inicio, afin)
    except (ValueError, RuntimeError):
        return None
    if len(caras) == 0:
        return None

    lps = np.asarray(lps, dtype=np.float32)
    caras = np.asarray(caras).astype(np.uint32)
    # El sentido de los triángulos depende de la afín (una con espejo lo
    # invierte) y de la convención de scikit-image. En vez de razonarlo caso por
    # caso, se mide: con las normales hacia fuera, el volumen con signo es
    # positivo.
    if _volumen_con_signo(lps, caras) < 0:
        caras = caras[:, ::-1].copy()

    volumen = voxeles * float(abs(np.linalg.det(afin[:3, :3])))
    return Malla(
        id=id_,
        nombre=estructura.nombre if estructura else id_,
        vertices=lps,
        caras=caras,
        normales=_normales(lps, caras),
        extras={
            "capa": estructura.capa if estructura else None,
            "acabado": estructura.acabado if estructura else None,
            "voxeles": voxeles,
            "volumen_mm3": round(volumen, 1),
            "malla": modo,
            **detalle,
        },
    )


def separar_discos(discos: np.ndarray, mascaras: dict[str, np.ndarray], afin: np.ndarray) -> dict[str, np.ndarray]:
    """La clase única de discos → un disco por nivel (``disco-L4-L5``).

    Cada pedazo conexo se nombra por las dos vértebras más cercanas a su centro.
    Si no son vecinas (falta una vértebra, o el pedazo es ruido entre dos
    niveles), va a «disco sin nivel»: mejor sin nombre que con uno equivocado.
    """
    etiquetas, n = ndimage.label(discos)
    if n == 0:
        return {}
    espaciado = np.linalg.norm(afin[:3, :3], axis=0)
    orden = {f"vertebra-{nivel}": i for i, nivel in enumerate(NIVELES)} | {"sacro": len(NIVELES)}
    centros = {
        id_: np.array(ndimage.center_of_mass(m)) * espaciado
        for id_, m in mascaras.items() if id_ in orden and m.any()
    }
    indices = list(range(1, n + 1))
    tamanos = ndimage.sum(discos, etiquetas, indices)
    salida: dict[str, np.ndarray] = {}
    for k, tamano, centro in zip(indices, tamanos, ndimage.center_of_mass(discos, etiquetas, indices)):
        if tamano < MIN_VOXELES:
            continue
        nombre = DISCO_SIN_NIVEL.id
        if len(centros) >= 2:
            c = np.array(centro) * espaciado
            cercanas = sorted(centros, key=lambda i: float(np.linalg.norm(centros[i] - c)))[:2]
            a, b = sorted(cercanas, key=orden.get)
            if orden[b] - orden[a] == 1 and a != "vertebra-C1":
                arriba = a.removeprefix("vertebra-")
                abajo = "S1" if b == "sacro" else b.removeprefix("vertebra-")
                nombre = estructura_de_disco(f"{arriba}-{abajo}").id
        pedazo = etiquetas == k
        salida[nombre] = pedazo if nombre not in salida else (salida[nombre] | pedazo)
    return salida


def mallas_de_mascaras(mascaras: dict[str, np.ndarray], afin: np.ndarray, *, con_conducto: bool = True) -> list[Malla]:
    afin = np.asarray(afin, dtype=float)
    todas = dict(mascaras)
    if con_conducto and "conducto-vertebral" not in todas:
        conducto = derivar_conducto(todas, afin)
        if conducto is not None:
            todas["conducto-vertebral"] = conducto
    salida: list[Malla] = []
    # Orden del catálogo: de C1 hacia abajo, luego médula, conducto y lo demás.
    orden = list(POR_ID) + sorted(set(todas) - set(POR_ID))
    for id_ in orden:
        if id_ not in todas:
            continue
        malla = malla_de_mascara(id_, todas[id_], afin)
        if malla is not None:
            salida.append(malla)
    return salida
