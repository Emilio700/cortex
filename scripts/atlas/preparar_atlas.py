#!/usr/bin/env python3
"""
Prepara el atlas detallado de Neuro 3D desde BodyParts3D 4.0 (DBCLS).

BodyParts3D, © The Database Center for Life Science licensed under CC
Attribution 4.0 International. https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html

Qué hace, de principio a fin:

1. Descarga de la página oficial el zip de mallas (árbol IS-A) y la tabla que
   dice qué archivos forman cada concepto FMA. Verifica tamaño y SHA-256: si el
   archivo cambió, se detiene en vez de convertir algo que nadie revisó.
2. Elige las estructuras por **id FMA** (tabla `ESTRUCTURAS`), sin extraer el
   zip a disco: lee cada OBJ desde el zip.
3. Convierte cada estructura a malla: une sus archivos, suaviza un poco
   (Taubin, no encoge) y simplifica si pasa de su presupuesto de triángulos.
4. Escribe en `frontend/public/atlas/bodyparts3d/`:
   - `cabeza.glb` y `columna.glb`: un nodo por estructura, nombrado con su
     clave; milímetros y el sistema propio de BodyParts3D, que es LPS
     (+x izquierda, +y atrás, +z arriba, el origen a la altura de los pies);
   - `manifiesto.json`: clave → id del catálogo de Neuro 3D, nombre en
     español, capa, tejido, ids FMA y archivos de origen;
   - `CREDITOS.json`: fuente, versión, licencia, texto de crédito exacto, URL y
     fecha de preparación.

Los modelos generados NO se guardan en git (`frontend/public/atlas/` está en
`.gitignore`): cada servidor corre este script. Dependencias ligeras, todas
MIT: `trimesh`, `numpy`, `scipy` (la usa el suavizado de trimesh) y
`fast-simplification`. Ver `scripts/atlas/README.md`.

Las funciones de la primera mitad son puras (sin trimesh) y tienen prueba en
`test_preparar_atlas.py`.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import io
import json
import math
import sys
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

# ── Fuente ──────────────────────────────────────────────────────────────────

URL_BASE = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/"
URL_DESCARGAS = "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html"
URL_LICENCIA = "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html"

ZIP_MALLAS = "isa_BP3D_4.0_obj_99.zip"
TABLA_PARTES = "isa_element_parts.txt"

# Tamaño en bytes y SHA-256 de lo que se revisó el 2026-10-25. Si DBCLS publica
# otra cosa con el mismo nombre, el script se detiene.
ARCHIVOS_ESPERADOS: dict[str, tuple[int, str]] = {
    ZIP_MALLAS: (142_903_898, "40665852c49f218326590e204db91064a1ecfc3c6f8cbd7bbbcaac62c7cd409e"),
    TABLA_PARTES: (1_142_159, "a3de74423f943b0d724ae8f59b3a817f87c423a544f8db98113b1980817cbeaf"),
}

# Texto de crédito exacto de la página de licencia (actualizada 2025-02-27).
TEXTO_CREDITO = (
    "BodyParts3D, © The Database Center for Life Science licensed under "
    "CC Attribution 4.0 International"
)

CREDITOS = {
    "id": "bodyparts3d",
    "titulo": "BodyParts3D",
    "autor": "The Database Center for Life Science (DBCLS)",
    "version": "4.0 (mallas «obj_99», árbol IS-A)",
    "licencia": "CC BY 4.0",
    "urlLicencia": "https://creativecommons.org/licenses/by/4.0/",
    "texto": TEXTO_CREDITO,
    "url": URL_LICENCIA,
    "cambios": (
        "Cortex eligió las estructuras de cabeza y columna, unió los archivos de "
        "cada una, las suavizó, las simplificó y las convirtió a glTF (GLB)."
    ),
    "nota": (
        "Los OBJ de 2013 conservan en su encabezado la licencia anterior "
        "(CC BY-SA 2.1 JP); la página de licencia vigente de DBCLS declara "
        "CC BY 4.0 para toda la base."
    ),
}

# ── Estructuras ─────────────────────────────────────────────────────────────

LADOS = ("izq", "der")


@dataclass(frozen=True)
class Entrada:
    """
    Una estructura del atlas.

    `clave` es el nombre del nodo en el GLB (único). Con `{lado}`, los archivos
    del concepto se reparten en izquierdo y derecho por la x de su centro (en
    BodyParts3D +x es la izquierda del cuerpo).
    """

    clave: str
    fma: tuple[str, ...]
    nombre: str
    capa: str
    tejido: str
    region: str
    # Id del catálogo de Neuro 3D; `None` = misma que la clave.
    estructura: str | None = None
    # La estructura del catálogo que la contiene (giro → lóbulo, hueso → cráneo).
    parte_de: str | None = None
    # Presupuesto de triángulos de esta pieza (cada lado, si se reparte).
    caras: int = 8000


def _e(clave, fma, nombre, capa, tejido, region, **kw) -> Entrada:
    if isinstance(fma, str):
        fma = (fma,)
    return Entrada(clave=clave, fma=tuple(fma), nombre=nombre, capa=capa, tejido=tejido, region=region, **kw)


def _par(base, fma_izq, fma_der, nombre_izq, nombre_der, capa, tejido, region, **kw) -> list[Entrada]:
    return [
        _e(f"{base}-izq", fma_izq, nombre_izq, capa, tejido, region, **kw),
        _e(f"{base}-der", fma_der, nombre_der, capa, tejido, region, **kw),
    ]


def _hueso(clave, fma, nombre, caras=12000):
    # Tejido «craneo»: hueso que se ve translúcido, como la bóveda del modelo
    # simplificado, para que el encéfalo se vea a través.
    return _e(clave, fma, nombre, "craneo", "craneo", "cabeza", parte_de="craneo", caras=caras)


def _giro(base, fma_izq, fma_der, nombres, lobulo):
    """Un giro de cada lado, como parte de su lóbulo (o suelto, si `lobulo` es None)."""
    izq, der = nombres
    return [
        _e(f"{base}-izq", fma_izq, izq, "encefalo", "corteza", "cabeza", parte_de=f"{lobulo}-izq" if lobulo else None, caras=7000),
        _e(f"{base}-der", fma_der, der, "encefalo", "corteza", "cabeza", parte_de=f"{lobulo}-der" if lobulo else None, caras=7000),
    ]


def _ambos(nombre_masculino: str) -> tuple[str, str]:
    return (f"{nombre_masculino} izquierdo", f"{nombre_masculino} derecho")


VERTEBRAS: list[tuple[str, str, str]] = [
    ("C1", "FMA12519", "Atlas (C1)"),
    ("C2", "FMA12520", "Axis (C2)"),
    ("C3", "FMA12521", "Vértebra C3"),
    ("C4", "FMA12522", "Vértebra C4"),
    ("C5", "FMA12523", "Vértebra C5"),
    ("C6", "FMA12524", "Vértebra C6"),
    ("C7", "FMA12525", "Vértebra C7"),
    ("T1", "FMA9165", "Vértebra T1"),
    ("T2", "FMA9187", "Vértebra T2"),
    ("T3", "FMA9209", "Vértebra T3"),
    ("T4", "FMA9248", "Vértebra T4"),
    ("T5", "FMA9922", "Vértebra T5"),
    ("T6", "FMA9945", "Vértebra T6"),
    ("T7", "FMA9968", "Vértebra T7"),
    ("T8", "FMA9991", "Vértebra T8"),
    ("T9", "FMA10014", "Vértebra T9"),
    ("T10", "FMA10037", "Vértebra T10"),
    ("T11", "FMA10059", "Vértebra T11"),
    ("T12", "FMA10081", "Vértebra T12"),
    ("L1", "FMA13072", "Vértebra L1"),
    ("L2", "FMA13073", "Vértebra L2"),
    ("L3", "FMA13074", "Vértebra L3"),
    ("L4", "FMA13075", "Vértebra L4"),
    ("L5", "FMA13076", "Vértebra L5"),
]

# «Disco intervertebral de la vértebra X» en FMA es el de ABAJO de X (el del
# axis es C2-C3). BodyParts3D no trae el de T12 (T12-L1): ese lo sigue
# poniendo el modelo esquemático.
DISCOS: list[tuple[str, str]] = [
    ("C2-C3", "FMA25058"),
    ("C3-C4", "FMA13896"),
    ("C4-C5", "FMA13897"),
    ("C5-C6", "FMA13898"),
    ("C6-C7", "FMA13899"),
    ("C7-T1", "FMA13900"),
    ("T1-T2", "FMA10458"),
    ("T2-T3", "FMA13495"),
    ("T3-T4", "FMA13500"),
    ("T4-T5", "FMA13501"),
    ("T5-T6", "FMA13502"),
    ("T6-T7", "FMA13503"),
    ("T7-T8", "FMA13504"),
    ("T8-T9", "FMA13505"),
    ("T9-T10", "FMA13506"),
    ("T10-T11", "FMA13507"),
    ("T11-T12", "FMA13508"),
    ("L1-L2", "FMA16033"),
    ("L2-L3", "FMA16034"),
    ("L3-L4", "FMA16035"),
    ("L4-L5", "FMA16036"),
    ("L5-S1", "FMA16037"),
]

# El orden importa: un archivo pertenece a la PRIMERA entrada que lo pide
# (el acueducto va antes que el mesencéfalo, que también lo incluye en FMA).
ESTRUCTURAS: list[Entrada] = [
    # Cráneo, hueso por hueso.
    _hueso("hueso-frontal", "FMA52734", "Hueso frontal", caras=16000),
    _hueso("hueso-occipital", "FMA52735", "Hueso occipital", caras=16000),
    _hueso("hueso-esfenoides", "FMA52736", "Hueso esfenoides", caras=16000),
    _hueso("hueso-etmoides", "FMA52740", "Hueso etmoides"),
    _hueso("hueso-temporal-izq", "FMA52739", "Hueso temporal izquierdo"),
    _hueso("hueso-temporal-der", "FMA52738", "Hueso temporal derecho"),
    _hueso("hueso-parietal-izq", "FMA52789", "Hueso parietal izquierdo"),
    _hueso("hueso-parietal-der", "FMA52788", "Hueso parietal derecho"),
    _hueso("hueso-cigomatico-izq", "FMA52893", "Hueso cigomático izquierdo", caras=6000),
    _hueso("hueso-cigomatico-der", "FMA52892", "Hueso cigomático derecho", caras=6000),
    _hueso("maxilar-izq", "FMA53650", "Maxilar izquierdo"),
    _hueso("maxilar-der", "FMA53649", "Maxilar derecho"),
    _hueso("mandibula", "FMA52748", "Mandíbula", caras=12000),
    # Huesos pequeños de la cara: se ven, pero al tocarlos se elige «Cráneo».
    _e("huesos-nasales", ("FMA53647", "FMA53648"), "Huesos nasales", "craneo", "craneo", "cabeza", estructura="craneo", caras=3000),
    _e("huesos-lagrimales", ("FMA53645", "FMA53646"), "Huesos lagrimales", "craneo", "craneo", "cabeza", estructura="craneo", caras=2000),
    _e("huesos-palatinos", ("FMA53655", "FMA53656"), "Huesos palatinos", "craneo", "craneo", "cabeza", estructura="craneo", caras=4000),
    _e("vomer", "FMA9710", "Vómer", "craneo", "craneo", "cabeza", estructura="craneo", caras=2000),
    _e("conchas-nasales-inferiores", ("FMA54737", "FMA54738"), "Conchas nasales inferiores", "craneo", "craneo", "cabeza", estructura="craneo", caras=3000),
    # Ventrículos (antes que el mesencéfalo: el acueducto también es suyo).
    _e("ventriculo-lateral-izq", "FMA78450", "Ventrículo lateral izquierdo", "ventriculos", "liquido", "cabeza", caras=6000),
    _e("ventriculo-lateral-der", "FMA78449", "Ventrículo lateral derecho", "ventriculos", "liquido", "cabeza", caras=6000),
    _e("tercer-ventriculo", "FMA78454", "Tercer ventrículo", "ventriculos", "liquido", "cabeza", caras=3000),
    _e("acueducto", "FMA78467", "Acueducto de Silvio", "ventriculos", "liquido", "cabeza", caras=2000),
    _e("cuarto-ventriculo", "FMA78469", "Cuarto ventrículo", "ventriculos", "liquido", "cabeza", caras=3000),
    # Lóbulo frontal, por giros.
    *_giro("giro-frontal-superior", "FMA72654", "FMA72653", _ambos("Giro frontal superior"), "lobulo-frontal"),
    *_giro("giro-frontal-medio", "FMA72656", "FMA72655", _ambos("Giro frontal medio"), "lobulo-frontal"),
    *_giro("giro-frontal-inferior", "FMA72658", "FMA72657", _ambos("Giro frontal inferior"), "lobulo-frontal"),
    *_giro("giro-precentral", "FMA72662", "FMA72661", _ambos("Giro precentral"), "lobulo-frontal"),
    _e("giros-orbitarios-{lado}", "FMA256194", "Giros orbitarios", "encefalo", "corteza", "cabeza", parte_de="lobulo-frontal-{lado}", caras=5000),
    # Lóbulo parietal.
    *_giro("giro-poscentral", "FMA72666", "FMA72665", _ambos("Giro poscentral"), "lobulo-parietal"),
    *_giro("giro-supramarginal", "FMA72668", "FMA72667", _ambos("Giro supramarginal"), "lobulo-parietal"),
    *_giro("giro-angular", "FMA72670", "FMA72669", _ambos("Giro angular"), "lobulo-parietal"),
    *_giro("lobulillo-parietal-superior", "FMA72672", "FMA72671", _ambos("Lobulillo parietal superior"), "lobulo-parietal"),
    # Lóbulo temporal (el superior viene en dos partes; se unen).
    *_giro("giro-temporal-superior", ("FMA72801", "FMA72805"), ("FMA72800", "FMA72804"), _ambos("Giro temporal superior"), "lobulo-temporal"),
    *_giro("giro-temporal-medio", "FMA72686", "FMA72685", _ambos("Giro temporal medio"), "lobulo-temporal"),
    *_giro("giro-temporal-inferior", "FMA72688", "FMA72687", _ambos("Giro temporal inferior"), "lobulo-temporal"),
    *_giro("giro-fusiforme", "FMA72690", "FMA72689", _ambos("Giro fusiforme"), "lobulo-temporal"),
    *_giro("giro-parahipocampico", "FMA72706", "FMA72705", _ambos("Giro parahipocampal"), "lobulo-temporal"),
    *_giro("hipocampo", "FMA72714", "FMA72713", _ambos("Hipocampo"), "lobulo-temporal"),
    # Lóbulo occipital e ínsula: BodyParts3D los trae enteros, con el id del catálogo.
    *_par("lobulo-occipital", "FMA72976", "FMA72975", "Lóbulo occipital izquierdo", "Lóbulo occipital derecho", "encefalo", "corteza", "cabeza", caras=12000),
    *_par("insula", "FMA72978", "FMA72977", "Ínsula izquierda", "Ínsula derecha", "encefalo", "corteza", "cabeza", caras=5000),
    # Sistema límbico y profundos.
    *_giro("giro-cingulado", "FMA72718", "FMA72717", _ambos("Giro cingulado"), None),
    *_par("talamo", "FMA258716", "FMA258714", "Tálamo izquierdo", "Tálamo derecho", "encefalo", "corteza", "cabeza", caras=4000),
    _e("cuerpo-calloso", "FMA86464", "Cuerpo calloso", "encefalo", "sustancia-blanca", "cabeza", caras=8000),
    # Cerebelo y tronco.
    _e("cerebelo", "FMA67944", "Cerebelo", "encefalo", "corteza", "cabeza", caras=16000),
    _e("mesencefalo", ("FMA61993", "FMA62394"), "Mesencéfalo", "encefalo", "sustancia-blanca", "cabeza", caras=6000),
    _e("protuberancia", "FMA67943", "Protuberancia", "encefalo", "sustancia-blanca", "cabeza", caras=6000),
    _e("bulbo", "FMA62004", "Bulbo raquídeo", "encefalo", "sustancia-blanca", "cabeza", caras=5000),
    # Pares craneales que trae BodyParts3D (sólo el II y el IV vienen completos).
    _e("nervio-optico-{lado}", "FMA50863", "Nervio óptico", "encefalo", "nervio", "cabeza", caras=2500),
    _e("quiasma-optico", "FMA62045", "Quiasma óptico", "encefalo", "nervio", "cabeza", caras=2000),
    _e("nervio-troclear-{lado}", "FMA50865", "Nervio troclear", "encefalo", "nervio", "cabeza", caras=1500),
    # Arterias: carótidas, vertebrales y polígono de Willis.
    _e("carotida-interna-{lado}", "FMA3947", "Arteria carótida interna", "vasos", "arteria", "cabeza", caras=4000),
    _e("vertebral-{lado}", "FMA3956", "Arteria vertebral", "vasos", "arteria", "cabeza", caras=4000),
    _e("basilar", "FMA50542", "Arteria basilar", "vasos", "arteria", "cabeza", caras=2500),
    _e("cerebral-anterior-izq", "FMA50030", "Arteria cerebral anterior izquierda", "vasos", "arteria", "cabeza", caras=3000),
    _e("cerebral-anterior-der", "FMA50029", "Arteria cerebral anterior derecha", "vasos", "arteria", "cabeza", caras=3000),
    _e("cerebral-media-{lado}", ("FMA50365", "FMA50368"), "Arteria cerebral media", "vasos", "arteria", "cabeza", caras=3000),
    _e("cerebral-posterior-{lado}", ("FMA50590", "FMA50591"), "Arteria cerebral posterior", "vasos", "arteria", "cabeza", caras=3000),
    _e("comunicante-anterior", "FMA50169", "Arteria comunicante anterior", "vasos", "arteria", "cabeza", caras=800),
    _e("comunicante-posterior-{lado}", "FMA50084", "Arteria comunicante posterior", "vasos", "arteria", "cabeza", caras=1200),
    # Sin yugulares internas: BodyParts3D sólo trae un tramo de unos 4 cm en el
    # cuello (FMA4724); las del modelo esquemático las dibujan completas. Lo
    # mismo los senos venosos, que no vienen.
    # Columna.
    *[
        _e(f"vertebra-{n}", fma, nombre, "columna", "hueso", "columna", caras=8000 if n.startswith(("C1", "C2")) else 6000)
        for n, fma, nombre in VERTEBRAS
    ],
    _e("sacro", "FMA16202", "Sacro", "columna", "hueso", "columna", caras=12000),
    *[_e(f"disco-{d}", fma, f"Disco {d}", "columna", "disco", "columna", caras=2500) for d, fma in DISCOS],
]

# Concordancia del nombre al repartir por lado: «Arteria … izquierda», «Nervio … izquierdo».
_FEMENINOS = ("Arteria", "Vena")


def nombre_con_lado(nombre: str, lado: str) -> str:
    femenino = nombre.startswith(_FEMENINOS)
    plural = nombre.startswith("Giros")
    if lado == "izq":
        palabra = "izquierdos" if plural else ("izquierda" if femenino else "izquierdo")
    else:
        palabra = "derechos" if plural else ("derecha" if femenino else "derecho")
    return f"{nombre} {palabra}"


# ── Funciones puras ─────────────────────────────────────────────────────────


def leer_partes(texto: str) -> dict[str, list[str]]:
    """`isa_element_parts.txt` → {id FMA: [archivos FJ…]} (sin repetir, en orden)."""
    partes: dict[str, list[str]] = {}
    for i, linea in enumerate(texto.splitlines()):
        if i == 0 or not linea.strip():
            continue  # encabezado
        columnas = linea.split("\t")
        if len(columnas) < 3:
            continue
        fma, _nombre, archivo = columnas[0].strip(), columnas[1], columnas[2].strip()
        lista = partes.setdefault(fma, [])
        if archivo not in lista:
            lista.append(archivo)
    return partes


@dataclass
class Seleccion:
    entrada: Entrada
    archivos: list[str] = field(default_factory=list)


def resolver_seleccion(entradas: list[Entrada], partes: dict[str, list[str]]) -> list[Seleccion]:
    """
    Qué archivos lleva cada entrada. Un archivo es de la primera entrada que lo
    pide: así una estructura más específica le gana a la que la contiene.
    Falla si una entrada pide un FMA que no existe o se queda sin archivos.
    """
    tomados: set[str] = set()
    salida: list[Seleccion] = []
    for e in entradas:
        archivos: list[str] = []
        for fma in e.fma:
            if fma not in partes:
                raise ValueError(f"{e.clave}: el concepto {fma} no está en la tabla de BodyParts3D")
            for a in partes[fma]:
                if a not in tomados and a not in archivos:
                    archivos.append(a)
        if not archivos:
            raise ValueError(f"{e.clave}: sus archivos ya los tomó otra estructura")
        tomados.update(archivos)
        salida.append(Seleccion(e, archivos))
    return salida


def lado_por_x(x: float) -> str:
    """En BodyParts3D (LPS) +x es la izquierda del cuerpo."""
    return "izq" if x > 0 else "der"


def repartir_presupuesto(caras: dict[str, int], maximos: dict[str, int], total: int) -> dict[str, int]:
    """
    Triángulos que conserva cada pieza: nunca más de los que tiene ni de su
    máximo; si la suma pasa del total, todas se recortan en la misma proporción
    (con un mínimo para que una pieza pequeña no desaparezca).
    """
    objetivo = {k: min(n, maximos.get(k, n)) for k, n in caras.items()}
    suma = sum(objetivo.values())
    if suma <= total or suma == 0:
        return objetivo
    factor = total / suma
    return {k: max(min(n, 200), int(math.floor(n * factor))) for k, n in objetivo.items()}


def mapeo_esperado(entradas: list[Entrada]) -> list[dict]:
    """
    Lo que el manifiesto dirá de cada pieza (sin la geometría): clave, id del
    catálogo, a qué estructura pertenece, capa y tejido. Se guarda en el
    frontend (`dominio/atlasMapeo.json`) para que una prueba compruebe que cada
    id existe en el catálogo de Neuro 3D sin tener que correr este script.
    """
    salida: list[dict] = []
    for e in entradas:
        lados = LADOS if "{lado}" in e.clave else ("",)
        for lado in lados:
            clave = e.clave.replace("{lado}", lado)
            salida.append(
                {
                    "clave": clave,
                    "estructura": e.estructura if e.estructura is not None else clave,
                    "parteDe": e.parte_de.replace("{lado}", lado) if e.parte_de else None,
                    "capa": e.capa,
                    "tejido": e.tejido,
                    "region": e.region,
                    "fma": list(e.fma),
                }
            )
    return salida


def sha256_de(ruta: Path) -> str:
    h = hashlib.sha256()
    with ruta.open("rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def verificar(ruta: Path, nombre: str) -> None:
    tam, sha = ARCHIVOS_ESPERADOS[nombre]
    real = ruta.stat().st_size
    if real != tam:
        raise SystemExit(f"{nombre}: mide {real} bytes y se esperaban {tam}. ¿Cambió la fuente? No se convierte.")
    calculado = sha256_de(ruta)
    if calculado != sha:
        raise SystemExit(f"{nombre}: el SHA-256 no coincide ({calculado}). ¿Cambió la fuente? No se convierte.")


def manifiesto_de(piezas: list[dict], archivos: list[dict], fecha: str) -> dict:
    return {
        "version": 1,
        "fuente": "BodyParts3D",
        "versionFuente": "4.0",
        "unidades": "mm",
        "sistema": "LPS",
        "preparado": fecha,
        "archivos": archivos,
        "estructuras": piezas,
    }


# ── Descarga ────────────────────────────────────────────────────────────────


def descargar(nombre: str, cache: Path) -> Path:
    destino = cache / nombre
    if destino.exists():
        try:
            verificar(destino, nombre)
            print(f"· {nombre}: ya estaba descargado y verificado")
            return destino
        except SystemExit:
            destino.unlink()
    url = URL_BASE + nombre
    print(f"· Descargando {url}")
    temporal = destino.with_suffix(destino.suffix + ".parcial")
    with urllib.request.urlopen(url, timeout=60) as r, temporal.open("wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        leidos = 0
        while True:
            bloque = r.read(1 << 20)
            if not bloque:
                break
            f.write(bloque)
            leidos += len(bloque)
            if total:
                print(f"\r  {leidos * 100 // total:3d} %", end="", flush=True)
    print()
    temporal.replace(destino)
    verificar(destino, nombre)
    return destino


# ── Conversión (trimesh) ────────────────────────────────────────────────────


def _cargar_obj(zipf: zipfile.ZipFile, archivo: str):
    import trimesh

    datos = zipf.read(f"isa_BP3D_4.0_obj_99/{archivo}.obj")
    malla = trimesh.load(io.BytesIO(datos), file_type="obj", force="mesh", process=True)
    malla.merge_vertices()
    return malla


def _pulir(malla, caras_objetivo: int, iteraciones_taubin: int):
    import fast_simplification
    import trimesh
    from trimesh import smoothing

    malla.remove_unreferenced_vertices()
    if iteraciones_taubin > 0 and len(malla.faces) > 50:
        smoothing.filter_taubin(malla, lamb=0.5, nu=0.53, iterations=iteraciones_taubin)
    n = len(malla.faces)
    if caras_objetivo < n:
        puntos, caras = fast_simplification.simplify(malla.vertices, malla.faces, target_reduction=1 - caras_objetivo / n)
        malla = trimesh.Trimesh(vertices=puntos, faces=caras, process=True)
    malla.fix_normals()
    return malla


def _glb(mallas: dict, extras: dict) -> bytes:
    import trimesh
    from trimesh.exchange.gltf import export_glb

    escena = trimesh.Scene()
    for clave, malla in mallas.items():
        escena.add_geometry(malla, node_name=clave, geom_name=clave)

    def poner_extras(arbol: dict) -> None:
        arbol.setdefault("asset", {})
        arbol["asset"]["copyright"] = TEXTO_CREDITO
        arbol["asset"]["extras"] = {"cortex": extras}

    return export_glb(escena, include_normals=True, tree_postprocessor=poner_extras)


def preparar(salida: Path, cache: Path, total_caras: int, iteraciones_taubin: int) -> None:
    import numpy as np

    cache.mkdir(parents=True, exist_ok=True)
    zip_ruta = descargar(ZIP_MALLAS, cache)
    tabla = descargar(TABLA_PARTES, cache)
    partes = leer_partes(tabla.read_text(encoding="utf-8"))
    seleccion = resolver_seleccion(ESTRUCTURAS, partes)

    zipf = zipfile.ZipFile(zip_ruta)
    # 1) Cargar y repartir por lado.
    crudas: dict[str, dict] = {}
    for s in seleccion:
        e = s.entrada
        grupos: dict[str, list] = {}
        for archivo in s.archivos:
            malla = _cargar_obj(zipf, archivo)
            lado = lado_por_x(float(malla.bounds.mean(axis=0)[0])) if "{lado}" in e.clave else ""
            grupos.setdefault(lado, []).append((archivo, malla))
        for lado, lista in grupos.items():
            clave = e.clave.replace("{lado}", lado)
            if clave in crudas:
                raise ValueError(f"clave repetida: {clave}")
            import trimesh

            crudas[clave] = {
                "entrada": e,
                "lado": lado,
                "archivos": [a for a, _ in lista],
                "malla": trimesh.util.concatenate([m for _, m in lista]),
            }
    # 2) Presupuesto.
    caras = {k: len(v["malla"].faces) for k, v in crudas.items()}
    maximos = {k: v["entrada"].caras for k, v in crudas.items()}
    objetivo = repartir_presupuesto(caras, maximos, total_caras)

    # 3) Pulir y armar el manifiesto.
    por_region: dict[str, dict] = {"cabeza": {}, "columna": {}}
    piezas: list[dict] = []
    for clave, v in crudas.items():
        e: Entrada = v["entrada"]
        malla = _pulir(v["malla"], objetivo[clave], iteraciones_taubin)
        por_region[e.region][clave] = malla
        lado = v["lado"]
        estructura = e.estructura if e.estructura is not None else clave
        parte_de = e.parte_de.replace("{lado}", lado) if e.parte_de else None
        nombre = nombre_con_lado(e.nombre, lado) if lado else e.nombre
        centro = np.asarray(malla.bounds.mean(axis=0)).round(1).tolist()
        piezas.append(
            {
                "clave": clave,
                "estructura": estructura,
                "parteDe": parte_de,
                "nombre": nombre,
                "capa": e.capa,
                "tejido": e.tejido,
                "region": e.region,
                "fma": list(e.fma),
                "archivos": v["archivos"],
                "caras": int(len(malla.faces)),
                "carasOriginales": caras[clave],
                "centroMm": centro,
            }
        )
        print(f"  {clave:34s} {caras[clave]:6d} → {len(malla.faces):6d} caras")
    _revisar_columna(piezas)

    # 4) Escribir.
    salida.mkdir(parents=True, exist_ok=True)
    fecha = _dt.date.today().isoformat()
    extras = {"unidades": "mm", "sistema": "LPS", "fuente": "BodyParts3D 4.0", "licencia": "CC BY 4.0"}
    archivos = []
    for region, mallas in por_region.items():
        datos = _glb(mallas, {**extras, "region": region})
        ruta = salida / f"{region}.glb"
        ruta.write_bytes(datos)
        archivos.append({"region": region, "ruta": ruta.name, "bytes": len(datos), "sha256": hashlib.sha256(datos).hexdigest()})
        print(f"· {ruta.name}: {len(datos) / 1e6:.1f} MB")
    (salida / "manifiesto.json").write_text(json.dumps(manifiesto_de(piezas, archivos, fecha), ensure_ascii=False, indent=1), encoding="utf-8")
    (salida / "CREDITOS.json").write_text(
        json.dumps({**CREDITOS, "fecha": fecha, "descarga": URL_DESCARGAS}, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    total = sum(a["bytes"] for a in archivos)
    print(f"· Listo: {len(piezas)} estructuras, {total / 1e6:.1f} MB en {salida}")


def _revisar_columna(piezas: list[dict]) -> None:
    """Cada disco tiene que quedar entre sus dos vértebras (comprueba la regla «de abajo de X»)."""
    z = {p["clave"]: p["centroMm"][2] for p in piezas}
    for d, _ in DISCOS:
        arriba, abajo = d.split("-")
        za = z.get(f"vertebra-{arriba}")
        zb = z.get("sacro" if abajo == "S1" else f"vertebra-{abajo}")
        zd = z.get(f"disco-{d}")
        if None in (za, zb, zd) or not (zb < zd < za):
            raise ValueError(f"El disco {d} no quedó entre sus vértebras: {za} / {zd} / {zb}")


def main(argv: list[str] | None = None) -> None:
    # La consola de Windows no siempre es UTF-8; los nombres llevan acentos.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    raiz = Path(__file__).resolve().parents[2]
    p = argparse.ArgumentParser(description="Prepara el atlas detallado de Neuro 3D desde BodyParts3D 4.0.")
    p.add_argument("--salida", type=Path, default=raiz / "frontend" / "public" / "atlas" / "bodyparts3d")
    p.add_argument("--cache", type=Path, help="Carpeta para el zip descargado (≈140 MB). Obligatoria para preparar.")
    p.add_argument("--escribir-mapeo", type=Path, help="Sólo escribe el mapeo esperado (JSON) y termina; no descarga nada.")
    p.add_argument("--borrar-cache", action="store_true", help="Borra el zip y la tabla al terminar.")
    p.add_argument("--total-caras", type=int, default=900_000, help="Tope de triángulos de todo el atlas (≈25 MB).")
    p.add_argument("--taubin", type=int, default=4, help="Iteraciones de suavizado Taubin (0 = sin suavizar).")
    a = p.parse_args(argv)
    if a.escribir_mapeo:
        a.escribir_mapeo.write_text(json.dumps(mapeo_esperado(ESTRUCTURAS), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"· Mapeo escrito en {a.escribir_mapeo}")
        return
    if a.cache is None:
        p.error("falta --cache")
    try:
        preparar(a.salida, a.cache, a.total_caras, a.taubin)
    finally:
        if a.borrar_cache:
            for nombre in ARCHIVOS_ESPERADOS:
                for ruta in (a.cache / nombre, a.cache / (nombre + ".parcial")):
                    if ruta.exists():
                        ruta.unlink()


if __name__ == "__main__":
    sys.exit(main())
