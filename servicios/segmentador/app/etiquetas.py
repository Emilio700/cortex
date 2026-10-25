"""Etiquetas de TotalSegmentator → ids del catálogo de Neuro 3D.

El id de cada malla es el mismo que usa el atlas (`vertebra-L5`, `sacro`,
`medula-espinal`): así, en Cortex, tocar la raíz L5 enciende la vértebra L5 *del
paciente* sin que nadie traduzca nada en el navegador.

Sólo se usan clases de la tarea ``total`` de TotalSegmentator, que es de licencia
abierta (Apache-2.0, código y pesos). No se piden tareas con licencia
(``vertebrae_body``, ``brain_structures``…).
"""
from __future__ import annotations

from dataclasses import dataclass

CERVICALES = [f"C{i}" for i in range(1, 8)]
TORACICAS = [f"T{i}" for i in range(1, 13)]
LUMBARES = [f"L{i}" for i in range(1, 6)]
NIVELES = CERVICALES + TORACICAS + LUMBARES


@dataclass(frozen=True)
class Estructura:
    id: str
    nombre: str
    # Clases de TotalSegmentator que se unen en esta malla. Vacío: se deriva.
    clases: tuple[str, ...]
    # Pistas para el visor: capa del atlas y acabado.
    capa: str
    acabado: str


def _vertebra(nivel: str) -> Estructura:
    return Estructura(f"vertebra-{nivel}", f"Vértebra {nivel}", (f"vertebrae_{nivel}",), "columna", "hueso")


ESTRUCTURAS_COLUMNA: tuple[Estructura, ...] = (
    *(_vertebra(n) for n in NIVELES),
    # El atlas tiene un solo «sacro»; TotalSegmentator separa S1 del resto.
    Estructura("sacro", "Sacro", ("vertebrae_S1", "sacrum"), "columna", "hueso"),
    Estructura("medula-espinal", "Médula espinal", ("spinal_cord",), "medula", "nervio"),
    # TotalSegmentator no tiene una clase abierta para el conducto: se deriva del
    # agujero de las vértebras (ver ``mallas.derivar_conducto``) y se dice que es
    # aproximado.
    Estructura("conducto-vertebral", "Conducto vertebral (aproximado)", (), "medula", "liquido"),
)

POR_ID = {e.id: e for e in ESTRUCTURAS_COLUMNA}


def clases_de_totalsegmentator() -> list[str]:
    """Las clases que se le piden al motor (``roi_subset``)."""
    return sorted({c for e in ESTRUCTURAS_COLUMNA for c in e.clases})


def ids_oseos() -> list[str]:
    return [e.id for e in ESTRUCTURAS_COLUMNA if e.acabado == "hueso"]
