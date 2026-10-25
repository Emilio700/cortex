"""Cálculo de las escalas neurológicas en el servidor.

La pantalla sugiere el puntaje mientras se llena
(``frontend/src/modules/escalas/dominio/motor.ts``), pero **el que se guarda es
este**: el navegador puede traer una versión vieja o un error de suma, y un
puntaje equivocado en el expediente se arrastra a la gráfica de evolución y a
la siguiente decisión.

Aquí solo vive lo que hace falta para calcular y validar: ítems, códigos de
opción con sus puntos, forma de cálculo y rangos. Los textos de las opciones
se quedan en la pantalla. Las dos definiciones se comparan contra el mismo
archivo (``paridad.json``) en ``tests/test_escalas_paridad.py`` y en vitest:
si una escala cambia en un lado y no en el otro, falla una de las suites.

El contenido clínico (fuentes, lo que queda «(verificar)») está documentado en
``openspec/changes/escalas-neuro/proposal.md``.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

TONOS = ("ok", "aviso", "alerta", "neutral")


@dataclass(frozen=True)
class Item:
    id: str
    titulo: str
    opciones: tuple[tuple[str, Optional[int]], ...]
    abreviatura: Optional[str] = None
    opcional: bool = False

    def puntos_de(self, codigo: str) -> tuple[bool, Optional[int]]:
        for clave, puntos in self.opciones:
            if clave == codigo:
                return True, puntos
        return False, None

    @property
    def maximo(self) -> int:
        return max((p or 0) for _, p in self.opciones)


@dataclass(frozen=True)
class Escala:
    id: str
    version: str
    nombre: str
    calculo: str  # suma | porcentaje | prorrateo
    min: int
    max: int
    items: tuple[Item, ...]
    bandas: tuple[tuple[float, str, str], ...]
    no_valorable: str = "anula"  # anula | cero
    avisar_omitidas_desde: Optional[int] = None


@dataclass
class Resultado:
    completo: bool
    faltantes: list[str] = field(default_factory=list)
    puntaje: Optional[float] = None
    interpretacion: Optional[str] = None
    tono: str = "neutral"
    detalle: Optional[str] = None
    avisos: list[str] = field(default_factory=list)


# --- Ayudas para escribir el catálogo -------------------------------------


def _num(*puntos: int) -> tuple[tuple[str, Optional[int]], ...]:
    """Opciones cuyo código es su propio puntaje."""
    return tuple((str(p), p) for p in puntos)


def _item(id_, titulo, opciones, abreviatura=None, opcional=False) -> Item:
    return Item(id=id_, titulo=titulo, opciones=tuple(opciones), abreviatura=abreviatura, opcional=opcional)


def _seccion(id_, titulo) -> Item:
    return _item(id_, titulo, _num(0, 1, 2, 3, 4, 5), opcional=True)


_UN = ("UN", None)

# --- Catálogo (mismo orden y contenido que catalogo.ts) --------------------

GLASGOW = Escala(
    id="glasgow", version="1", nombre="Glasgow", calculo="suma", min=3, max=15,
    items=(
        _item("ocular", "Apertura ocular (O)", _num(4, 3, 2, 1) + (("C", None),), abreviatura="O"),
        _item("verbal", "Respuesta verbal (V)", _num(5, 4, 3, 2, 1) + (("T", None), ("NT", None)), abreviatura="V"),
        _item("motora", "Respuesta motora (M)", _num(6, 5, 4, 3, 2, 1) + (("NT", None),), abreviatura="M"),
    ),
    bandas=((8, "Grave (3–8)", "alerta"), (12, "Moderado (9–12)", "aviso"), (15, "Leve (13–15)", "ok")),
    no_valorable="anula",
)

NIHSS = Escala(
    id="nihss", version="1", nombre="NIHSS", calculo="suma", min=0, max=42,
    items=(
        _item("1a", "1a. Nivel de conciencia", _num(0, 1, 2, 3)),
        _item("1b", "1b. Preguntas: mes y edad", _num(0, 1, 2)),
        _item("1c", "1c. Órdenes: abrir y cerrar los ojos, apretar y soltar la mano", _num(0, 1, 2)),
        _item("2", "2. Mirada", _num(0, 1, 2)),
        _item("3", "3. Campos visuales", _num(0, 1, 2, 3)),
        _item("4", "4. Parálisis facial", _num(0, 1, 2, 3)),
        _item("5a", "5a. Motor del brazo izquierdo", _num(0, 1, 2, 3, 4) + (_UN,)),
        _item("5b", "5b. Motor del brazo derecho", _num(0, 1, 2, 3, 4) + (_UN,)),
        _item("6a", "6a. Motor de la pierna izquierda", _num(0, 1, 2, 3, 4) + (_UN,)),
        _item("6b", "6b. Motor de la pierna derecha", _num(0, 1, 2, 3, 4) + (_UN,)),
        _item("7", "7. Ataxia de las extremidades", _num(0, 1, 2) + (_UN,)),
        _item("8", "8. Sensibilidad", _num(0, 1, 2)),
        _item("9", "9. Lenguaje", _num(0, 1, 2, 3)),
        _item("10", "10. Disartria", _num(0, 1, 2) + (_UN,)),
        _item("11", "11. Extinción e inatención", _num(0, 1, 2)),
    ),
    bandas=(
        (0, "Sin déficit medible", "ok"),
        (4, "Déficit menor (1–4)", "ok"),
        (15, "Déficit moderado (5–15)", "aviso"),
        (20, "Déficit moderado a grave (16–20)", "alerta"),
        (42, "Déficit grave (21–42)", "alerta"),
    ),
    no_valorable="cero",
)

_ROMANOS = (("I", 1), ("II", 2), ("III", 3), ("IV", 4), ("V", 5))
_GRADOS_ROMANOS = (
    (1, "Grado I", "ok"), (2, "Grado II", "ok"), (3, "Grado III", "aviso"),
    (4, "Grado IV", "alerta"), (5, "Grado V", "alerta"),
)

HUNT_HESS = Escala(
    id="hunt_hess", version="1", nombre="Hunt y Hess", calculo="suma", min=1, max=5,
    items=(_item("grado", "Cuadro clínico", _ROMANOS),),
    bandas=_GRADOS_ROMANOS,
)

WFNS = Escala(
    id="wfns", version="1", nombre="WFNS", calculo="suma", min=1, max=5,
    items=(_item("grado", "Glasgow y déficit motor", _ROMANOS),),
    bandas=_GRADOS_ROMANOS,
)

FISHER_MODIFICADA = Escala(
    id="fisher_modificada", version="1", nombre="Fisher modificada", calculo="suma", min=0, max=4,
    items=(_item("grado", "Hallazgo en la tomografía", _num(0, 1, 2, 3, 4)),),
    bandas=(
        (0, "Grado 0", "ok"), (1, "Grado 1", "aviso"), (2, "Grado 2", "aviso"),
        (3, "Grado 3", "alerta"), (4, "Grado 4", "alerta"),
    ),
)

SPETZLER_MARTIN = Escala(
    id="spetzler_martin", version="1", nombre="Spetzler-Martin", calculo="suma", min=1, max=5,
    items=(
        _item("tamano", "Tamaño del nido", _num(1, 2, 3)),
        _item("elocuencia", "Elocuencia del cerebro adyacente", _num(0, 1)),
        _item("drenaje", "Drenaje venoso", _num(0, 1)),
    ),
    bandas=(
        (1, "Grado I · clase A", "ok"), (2, "Grado II · clase A", "ok"), (3, "Grado III · clase B", "aviso"),
        (4, "Grado IV · clase C", "alerta"), (5, "Grado V · clase C", "alerta"),
    ),
)

RANKIN = Escala(
    id="rankin", version="1", nombre="Rankin modificada", calculo="suma", min=0, max=6,
    items=(_item("grado", "Situación del paciente", _num(0, 1, 2, 3, 4, 5, 6)),),
    bandas=(
        (0, "Sin síntomas", "ok"),
        (1, "Sin discapacidad significativa", "ok"),
        (2, "Discapacidad leve", "aviso"),
        (3, "Discapacidad moderada", "aviso"),
        (4, "Discapacidad moderadamente grave", "alerta"),
        (5, "Discapacidad grave", "alerta"),
        (6, "Muerte", "alerta"),
    ),
)

ASIA = Escala(
    id="asia", version="1", nombre="ASIA (AIS)", calculo="suma", min=1, max=5,
    items=(_item("grado", "Grado AIS", (("A", 1), ("B", 2), ("C", 3), ("D", 4), ("E", 5))),),
    bandas=(
        (1, "AIS A: lesión completa", "alerta"),
        (2, "AIS B: sensitiva incompleta", "alerta"),
        (3, "AIS C: motora incompleta", "aviso"),
        (4, "AIS D: motora incompleta", "aviso"),
        (5, "AIS E: normal", "ok"),
    ),
)

KARNOFSKY = Escala(
    id="karnofsky", version="1", nombre="Karnofsky", calculo="suma", min=0, max=100,
    items=(_item("kps", "Capacidad funcional", _num(100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0)),),
    bandas=(
        (40, "Incapaz de cuidarse; necesita cuidados institucionales o equivalentes (0–40)", "alerta"),
        (70, "Incapaz de trabajar; vive en casa con ayuda variable (50–70)", "aviso"),
        (100, "Actividad normal y trabajo sin cuidados especiales (80–100)", "ok"),
    ),
)

MJOA = Escala(
    id="mjoa", version="1", nombre="mJOA", calculo="suma", min=0, max=18,
    items=(
        _item("motor_superior", "Función motora de las extremidades superiores", _num(0, 1, 2, 3, 4, 5)),
        _item("motor_inferior", "Función motora de las extremidades inferiores", _num(0, 1, 2, 3, 4, 5, 6, 7)),
        _item("sensibilidad", "Sensibilidad de las extremidades superiores", _num(0, 1, 2, 3)),
        _item("esfinter", "Función vesical", _num(0, 1, 2, 3)),
    ),
    bandas=(
        (11, "Mielopatía grave (0–11)", "alerta"),
        (14, "Mielopatía moderada (12–14)", "aviso"),
        (17, "Mielopatía leve (15–17)", "aviso"),
        (18, "Sin alteración (18)", "ok"),
    ),
)

OSWESTRY = Escala(
    id="oswestry", version="1", nombre="Oswestry (ODI)", calculo="porcentaje", min=0, max=100,
    items=(
        _seccion("dolor", "1. Intensidad del dolor"),
        _seccion("cuidado", "2. Cuidados personales (lavarse, vestirse)"),
        _seccion("levantar", "3. Levantar peso"),
        _seccion("caminar", "4. Caminar"),
        _seccion("sentado", "5. Estar sentado"),
        _seccion("de_pie", "6. Estar de pie"),
        _seccion("dormir", "7. Dormir"),
        _seccion("sexual", "8. Vida sexual"),
        _seccion("social", "9. Vida social"),
        _seccion("viajar", "10. Viajar"),
    ),
    bandas=(
        (20, "Discapacidad mínima (0–20 %)", "ok"),
        (40, "Discapacidad moderada (21–40 %)", "aviso"),
        (60, "Discapacidad grave (41–60 %)", "alerta"),
        (80, "Discapacidad incapacitante (61–80 %)", "alerta"),
        (100, "Postrado en cama o magnifica sus síntomas (81–100 %)", "alerta"),
    ),
    avisar_omitidas_desde=3,
)

NDI = Escala(
    id="ndi", version="1", nombre="NDI", calculo="prorrateo", min=0, max=50,
    items=(
        _seccion("dolor", "1. Intensidad del dolor de cuello"),
        _seccion("cuidado", "2. Cuidados personales (lavarse, vestirse)"),
        _seccion("levantar", "3. Levantar peso"),
        _seccion("lectura", "4. Lectura"),
        _seccion("cefalea", "5. Dolor de cabeza"),
        _seccion("concentracion", "6. Concentración"),
        _seccion("trabajo", "7. Trabajo"),
        _seccion("conducir", "8. Manejar"),
        _seccion("dormir", "9. Dormir"),
        _seccion("recreacion", "10. Recreación"),
    ),
    bandas=(
        (4, "Sin discapacidad (0–4)", "ok"),
        (14, "Discapacidad leve (5–14)", "ok"),
        (24, "Discapacidad moderada (15–24)", "aviso"),
        (34, "Discapacidad grave (25–34)", "alerta"),
        (50, "Discapacidad completa (35–50)", "alerta"),
    ),
    avisar_omitidas_desde=3,
)

ENA_DOLOR = Escala(
    id="ena_dolor", version="1", nombre="ENA de dolor", calculo="suma", min=0, max=10,
    items=(_item("dolor", "Intensidad del dolor", _num(*range(11))),),
    bandas=(
        (0, "Sin dolor", "ok"),
        (3, "Dolor leve (1–3)", "ok"),
        (6, "Dolor moderado (4–6)", "aviso"),
        (10, "Dolor intenso (7–10)", "alerta"),
    ),
)

BARTHEL = Escala(
    id="barthel", version="1", nombre="Barthel", calculo="suma", min=0, max=100,
    items=(
        _item("comer", "Comer", _num(10, 5, 0)),
        _item("banarse", "Bañarse", _num(5, 0)),
        _item("arreglo", "Arreglarse (lavarse la cara, peinarse, afeitarse, dientes)", _num(5, 0)),
        _item("vestir", "Vestirse", _num(10, 5, 0)),
        _item("heces", "Deposiciones", _num(10, 5, 0)),
        _item("orina", "Micción", _num(10, 5, 0)),
        _item("retrete", "Uso del retrete", _num(10, 5, 0)),
        _item("traslado", "Trasladarse (cama a sillón)", _num(15, 10, 5, 0)),
        _item("deamb", "Deambulación", _num(15, 10, 5, 0)),
        _item("escal", "Subir y bajar escaleras", _num(10, 5, 0)),
    ),
    bandas=(
        (20, "Dependencia total (0–20)", "alerta"),
        (60, "Dependencia grave (21–60)", "alerta"),
        (90, "Dependencia moderada (61–90)", "aviso"),
        (99, "Dependencia escasa (91–99)", "ok"),
        (100, "Independiente (100)", "ok"),
    ),
)

ESCALAS: tuple[Escala, ...] = (
    GLASGOW, NIHSS, HUNT_HESS, WFNS, FISHER_MODIFICADA, SPETZLER_MARTIN,
    RANKIN, ASIA, KARNOFSKY, MJOA, OSWESTRY, NDI, ENA_DOLOR, BARTHEL,
)
_POR_ID = {e.id: e for e in ESCALAS}


def escala_por_id(escala_id: str) -> Optional[Escala]:
    return _POR_ID.get(escala_id)


# --- Cálculo (mismo algoritmo que motor.ts) --------------------------------

SIN_TOTAL = "Sin total: hay un componente no valorable. Se registra por componentes."


def redondear(x: float) -> float:
    """Un decimal, la mitad hacia arriba. ``round`` de Python redondea al par."""
    return math.floor(x * 10 + 0.5) / 10


def _como_numero(x: float) -> float | int:
    """Entero cuando no tiene decimales, para que «32» no salga como «32.0»."""
    return int(x) if float(x).is_integer() else x


def banda_de(escala: Escala, puntaje: float) -> tuple[str, str]:
    for hasta, texto, tono in escala.bandas:
        if puntaje <= hasta:
            return texto, tono
    _, texto, tono = escala.bandas[-1]
    return texto, tono


def _secciones(n: int) -> str:
    return "1 sección sin responder" if n == 1 else f"{n} secciones sin responder"


def calcular(escala: Escala, respuestas: dict[str, str]) -> Resultado:
    faltantes: list[str] = []
    elegidas: list[tuple[Item, str, Optional[int]]] = []
    for item in escala.items:
        codigo = respuestas.get(item.id)
        existe, puntos = item.puntos_de(codigo) if codigo else (False, None)
        if existe:
            elegidas.append((item, codigo, puntos))
        elif not item.opcional:
            faltantes.append(item.id)
    if faltantes or not elegidas:
        return Resultado(completo=False, faltantes=faltantes)

    por_componentes = all(i.abreviatura for i in escala.items)
    detalle = " ".join(f"{i.abreviatura}{c}" for i, c, _ in elegidas) if por_componentes else None
    no_valorables = [i for i, _, p in elegidas if p is None]

    if no_valorables and escala.no_valorable == "anula":
        return Resultado(completo=True, interpretacion=SIN_TOTAL, detalle=detalle)

    avisos: list[str] = []
    if no_valorables:
        avisos.append("No valorable (cuenta 0): " + "; ".join(i.titulo for i in no_valorables) + ".")
        if detalle is None:
            detalle = "No valorable: " + ", ".join(i.id for i in no_valorables)

    suma = sum(p or 0 for _, _, p in elegidas)
    puntaje: float = suma
    if escala.calculo == "porcentaje":
        posible = sum(i.maximo for i, _, _ in elegidas)
        puntaje = redondear(suma / posible * 100)
    elif escala.calculo == "prorrateo":
        puntaje = redondear(suma / len(elegidas) * len(escala.items))

    omitidas = len(escala.items) - len(elegidas)
    if omitidas > 0:
        if detalle is None:
            detalle = _secciones(omitidas)
        if escala.avisar_omitidas_desde is not None and omitidas >= escala.avisar_omitidas_desde:
            avisos.append(f"Con {_secciones(omitidas)} el resultado puede no ser válido (verificar).")

    texto, tono = banda_de(escala, puntaje)
    return Resultado(
        completo=True,
        puntaje=_como_numero(puntaje),
        interpretacion=texto,
        tono=tono,
        detalle=detalle,
        avisos=avisos,
    )


def validar(escala: Escala, respuestas: dict) -> list[str]:
    """Errores que impiden guardar, con el nombre del ítem como se ve en pantalla."""
    errores: list[str] = []
    ids = {i.id for i in escala.items}
    for clave in respuestas:
        if clave not in ids:
            errores.append(f"La respuesta «{clave}» no pertenece a {escala.nombre}.")
    respondidas = 0
    for item in escala.items:
        codigo = respuestas.get(item.id)
        if codigo is None or codigo == "":
            if not item.opcional:
                errores.append(f"Falta responder «{item.titulo}».")
            continue
        if not isinstance(codigo, str) or not item.puntos_de(codigo)[0]:
            errores.append(f"La respuesta de «{item.titulo}» no es una opción de {escala.nombre}.")
            continue
        respondidas += 1
    if not errores and respondidas == 0:
        errores.append("Responde al menos una sección.")
    return errores


def estructura(escala: Escala) -> dict:
    """La misma forma que ``estructura()`` de motor.ts, para la prueba de paridad."""
    return {
        "id": escala.id,
        "version": escala.version,
        "nombre": escala.nombre,
        "calculo": escala.calculo,
        "no_valorable": escala.no_valorable,
        "avisar_omitidas_desde": escala.avisar_omitidas_desde,
        "min": escala.min,
        "max": escala.max,
        "items": [
            {
                "id": i.id,
                "titulo": i.titulo,
                "abreviatura": i.abreviatura,
                "opcional": i.opcional,
                "opciones": [[c, p] for c, p in i.opciones],
            }
            for i in escala.items
        ],
        "bandas": [[h, t, tono] for h, t, tono in escala.bandas],
    }
