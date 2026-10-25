"""Etiquetas de TotalSegmentator → ids del catálogo de Neuro 3D, y qué tarea corre cada región.

El id de cada malla es el mismo que usa el atlas (`vertebra-L5`, `sacro`,
`medula-espinal`, `disco-L4-L5`, `carotida-interna-izq`): así, en Cortex, tocar
la raíz L5 enciende la vértebra L5 *del paciente* sin que nadie traduzca nada en
el navegador. Lo que el atlas no tiene (mandíbula, senos, yugulares, hemorragia)
lleva un id con la misma forma: español, minúsculas, guiones, `-izq`/`-der`.

Sólo se usan tareas de licencia abierta (Apache-2.0, código y pesos), revisadas
en el README de TotalSegmentator 2.18.0 y con ``totalseg_info --list-tasks``:
``total``, ``vertebrae_mr``, ``vertebrae_body``, ``craniofacial_structures``,
``headneck_bones_vessels`` y ``cerebral_bleed``. **No** se usan
``brain_structures`` (pide licencia) ni ``brain_aneurysm`` (CC BY-NC).
"""
from __future__ import annotations

from dataclasses import dataclass, field

CERVICALES = [f"C{i}" for i in range(1, 8)]
TORACICAS = [f"T{i}" for i in range(1, 13)]
LUMBARES = [f"L{i}" for i in range(1, 6)]
NIVELES = CERVICALES + TORACICAS + LUMBARES

# Medido con una TC real: con 8000 la malla refinada pesa lo mismo que la clásica
# con 12 000 (4.9 MB la columna completa) y conserva más forma.
MAX_TRIANGULOS = 8_000


@dataclass(frozen=True)
class Estructura:
    id: str
    nombre: str
    # Clases de TotalSegmentator que se unen en esta malla. Vacío: se deriva.
    clases: tuple[str, ...]
    # Pistas para el visor: capa del atlas y acabado.
    capa: str
    acabado: str
    # Una vértebra se lee bien con unos miles de triángulos; el cráneo no.
    max_triangulos: int = MAX_TRIANGULOS


def _vertebra(nivel: str) -> Estructura:
    return Estructura(f"vertebra-{nivel}", f"Vértebra {nivel}", (f"vertebrae_{nivel}",), "columna", "hueso")


VERTEBRAS: tuple[Estructura, ...] = (
    *(_vertebra(n) for n in NIVELES),
    # El atlas tiene un solo «sacro»; TotalSegmentator separa S1 del resto.
    Estructura("sacro", "Sacro", ("vertebrae_S1", "sacrum"), "columna", "hueso"),
)
MEDULA = Estructura("medula-espinal", "Médula espinal", ("spinal_cord",), "medula", "nervio")
# TotalSegmentator no tiene una clase abierta para el conducto: se deriva del
# agujero de las vértebras (ver ``mallas.derivar_conducto``) y se dice que es
# aproximado.
CONDUCTO = Estructura("conducto-vertebral", "Conducto vertebral (aproximado)", (), "medula", "liquido")

ESTRUCTURAS_COLUMNA: tuple[Estructura, ...] = (*VERTEBRAS, MEDULA, CONDUCTO)

# Los discos llegan de ``vertebrae_body`` como una sola clase; se separan y se
# nombran por las vértebras que tienen arriba y abajo (``mallas.separar_discos``).
DISCOS = tuple(
    f"{a}-{'S1' if b == 'sacro' else b}"
    for a, b in zip(NIVELES[1:], [*NIVELES[2:], "sacro"])
)
CLASE_DISCOS = "intervertebral_discs"


def estructura_de_disco(disco: str) -> Estructura:
    return Estructura(f"disco-{disco}", f"Disco {disco}", (), "columna", "disco")


DISCO_SIN_NIVEL = Estructura("disco-sin-nivel", "Disco intervertebral (sin nivel identificado)", (), "columna", "disco")

CRANEO: tuple[Estructura, ...] = (
    Estructura("craneo", "Cráneo", ("skull",), "craneo", "hueso", 60_000),
    Estructura("mandibula", "Mandíbula", ("mandible",), "craneo", "hueso", 20_000),
    Estructura("dientes", "Dientes", ("teeth_upper", "teeth_lower"), "craneo", "hueso", 20_000),
    Estructura("seno-maxilar", "Senos maxilares", ("sinus_maxillary",), "craneo", "aire"),
    Estructura("seno-frontal", "Seno frontal", ("sinus_frontal",), "craneo", "aire"),
)

VASOS_CUELLO: tuple[Estructura, ...] = (
    Estructura("carotida-interna-izq", "Arteria carótida interna izquierda", ("internal_carotid_artery_left",), "vasos", "arteria"),
    Estructura("carotida-interna-der", "Arteria carótida interna derecha", ("internal_carotid_artery_right",), "vasos", "arteria"),
    Estructura("yugular-interna-izq", "Vena yugular interna izquierda", ("internal_jugular_vein_left",), "vasos", "vena"),
    Estructura("yugular-interna-der", "Vena yugular interna derecha", ("internal_jugular_vein_right",), "vasos", "vena"),
)

HEMORRAGIA: tuple[Estructura, ...] = (
    Estructura("hemorragia-intracerebral", "Hemorragia intracerebral", ("intracerebral_hemorrhage",), "encefalo", "sangre"),
)


@dataclass(frozen=True)
class Paso:
    """Una corrida de TotalSegmentator."""

    tarea: str
    # Clases que se piden (``roi_subset``, sólo en ``total``). None: todas.
    roi_subset: tuple[str, ...] | None = None
    # Tiene modelo de baja resolución (``--fast``).
    admite_rapido: bool = False


@dataclass(frozen=True)
class Tarea:
    region: str
    modalidad: str
    nombre: str
    pasos: tuple[Paso, ...]
    estructuras: tuple[Estructura, ...]
    derivar_conducto: bool = False
    separar_discos: bool = False
    # Qué decir si no sale nada: «no se encontró» no siempre es «no hay».
    sin_hallazgos: str = "No se encontró la región pedida en el estudio. ¿La serie la abarca?"
    # Aviso que viaja en el GLB (``asset.extras.cortex.aviso``) y en la cabecera.
    aviso: str | None = None
    licencia: str = "Apache-2.0"
    extras: dict = field(default_factory=dict)

    @property
    def admite_rapido(self) -> bool:
        return all(p.admite_rapido for p in self.pasos)


def _clases(estructuras) -> tuple[str, ...]:
    return tuple(sorted({c for e in estructuras for c in e.clases}))


TAREAS: dict[str, Tarea] = {
    t.region + "|" + t.modalidad: t
    for t in (
        Tarea(
            "columna", "CT", "Columna por niveles (TC)",
            pasos=(Paso("total", _clases(ESTRUCTURAS_COLUMNA), admite_rapido=True),),
            estructuras=ESTRUCTURAS_COLUMNA, derivar_conducto=True,
            sin_hallazgos="No se encontró columna en el estudio. ¿La serie abarca la columna?",
        ),
        Tarea(
            "columna", "MR", "Columna por niveles (RM)",
            pasos=(Paso("vertebrae_mr"),),
            estructuras=(*VERTEBRAS, CONDUCTO), derivar_conducto=True,
            sin_hallazgos="No se encontró columna en la resonancia. ¿La serie es sagital o axial de columna?",
        ),
        Tarea(
            "discos", "CT", "Discos intervertebrales (TC)",
            # Las vértebras de ``total`` sirven para ponerle nivel a cada disco.
            pasos=(
                Paso("total", _clases(VERTEBRAS), admite_rapido=True),
                Paso("vertebrae_body"),
            ),
            estructuras=VERTEBRAS, separar_discos=True,
            sin_hallazgos="No se encontraron discos intervertebrales en el estudio. ¿La serie abarca la columna?",
        ),
        Tarea(
            "craneo", "CT", "Cráneo y macizo facial (TC)",
            pasos=(Paso("craniofacial_structures"),),
            estructuras=CRANEO,
            sin_hallazgos="No se encontró el cráneo en el estudio. ¿La serie abarca la cabeza?",
        ),
        Tarea(
            "vasos-cuello", "CT", "Carótidas internas y yugulares (angio-TC)",
            pasos=(Paso("headneck_bones_vessels"),),
            estructuras=VASOS_CUELLO,
            sin_hallazgos="No se encontraron carótidas ni yugulares. ¿Es una angio-TC de cabeza y cuello?",
        ),
        Tarea(
            "hemorragia", "CT", "Hemorragia intracerebral (TC simple)",
            pasos=(Paso("cerebral_bleed"),),
            estructuras=HEMORRAGIA,
            sin_hallazgos=(
                "El modelo no encontró hemorragia intracerebral. Eso no la descarta: se entrenó "
                "con pocos casos y se revisa siempre en las imágenes."
            ),
            aviso=(
                "Modelo de hemorragia entrenado con pocos casos (menos robusto que la columna). "
                "Una hemorragia pequeña puede no salir y lo que sale se confirma en las imágenes."
            ),
        ),
    )
}


def tarea_de(region: str, modalidad: str) -> Tarea | None:
    return TAREAS.get(f"{region}|{modalidad}")


# Todo lo que puede salir en un GLB, por id (los discos se arman aparte).
POR_ID: dict[str, Estructura] = {}
for _t in TAREAS.values():
    for _e in _t.estructuras:
        POR_ID.setdefault(_e.id, _e)
for _d in DISCOS:
    POR_ID[f"disco-{_d}"] = estructura_de_disco(_d)
POR_ID[DISCO_SIN_NIVEL.id] = DISCO_SIN_NIVEL


def clases_de_totalsegmentator() -> list[str]:
    """Las clases de columna que se le piden al motor (``roi_subset`` de ``total``)."""
    return list(_clases(ESTRUCTURAS_COLUMNA))


def ids_oseos() -> list[str]:
    return [e.id for e in VERTEBRAS]
