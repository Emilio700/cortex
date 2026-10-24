"""Ningún esquema de alta debe aceptar campos que su tabla no tiene.

En producción no se guardó UNA SOLA nota de consulta entre el 1 de agosto y el
24 de septiembre de 2026. La migración ``2026_08_01_0003`` borró la columna
``soap_notes.diagnosis`` y el esquema de Pydantic se quedó con el campo; como
el router arma el modelo con ``SOAPNote(**soap_note_in.model_dump())``, cada
alta le pasaba un argumento que el modelo ya no conocía y reventaba. El
``except Exception`` lo volvía un 500 sin mensaje y el error real nunca llegó a
los registros: por eso duró casi dos meses.

``test_soap_guardar_regresion.py`` dejó el candado puesto para la nota de
consulta. Pero el mecanismo no tiene nada de particular: cualquier alta armada
con ``Modelo(**esquema.model_dump())`` se rompe igual, y hay veinte en el
proyecto. Este archivo generaliza el candado.

Lo importante es que la lista de pares **no se escribe a mano**: se descubre
leyendo los routers. Una prueba con una lista fija sólo protege lo que alguien
se acordó de anotar, y lo que se olvida es justamente lo que revienta. Aquí, el
alta que alguien agregue mañana entra sola a la comparación, y si el
descubrimiento deja de entender cómo se arma un alta, eso también falla
(``test_ningun_alta_se_le_escapa_al_descubrimiento``) en lugar de callarse.
"""
import ast
import importlib
import pkgutil
from dataclasses import dataclass, field
from pathlib import Path

import pytest
from pydantic import BaseModel

import app.routers

# Los dos nombres con los que Pydantic entrega un esquema como diccionario.
# ``dict()`` es la forma vieja; sigue viva en partes del proyecto.
VOLCADOS = ("model_dump", "dict")


@dataclass
class Alta:
    """Un sitio donde un esquema de entrada se vacía dentro de un modelo."""

    router: str
    linea: int
    funcion: str
    esquema: type[BaseModel]
    modelo: type
    # Campos que el propio sitio descarta con ``exclude=``: no llegan al modelo,
    # así que no pueden romperlo.
    excluidos: set[str] = field(default_factory=set)
    # Campos que el sitio pasa aparte (``tenant_id=...``): los pone el router,
    # no el paciente, y por eso el esquema no tiene por qué pedirlos.
    explicitos: set[str] = field(default_factory=set)

    def __str__(self) -> str:
        return f"{self.router}:{self.linea} {self.esquema.__name__}->{self.modelo.__name__}"


def _es_modelo(objeto) -> bool:
    """Un modelo de SQLAlchemy mapeado, no cualquier clase."""
    return isinstance(objeto, type) and hasattr(objeto, "__table__") and hasattr(objeto, "__mapper__")


def _es_esquema(objeto) -> bool:
    return isinstance(objeto, type) and issubclass(objeto, BaseModel)


def _nombre_anotado(nodo) -> str | None:
    """El nombre del tipo de un parámetro, atravesando ``Annotated``/``Optional``.

    Los routers anotan el cuerpo de la petición de varias formas; lo único que
    hace falta es quedarse con el identificador del esquema.
    """
    if isinstance(nodo, ast.Name):
        return nodo.id
    if isinstance(nodo, ast.Attribute):
        return nodo.attr
    if isinstance(nodo, ast.Subscript):
        return _nombre_anotado(nodo.value)
    if isinstance(nodo, ast.Constant) and isinstance(nodo.value, str):
        try:
            return _nombre_anotado(ast.parse(nodo.value, mode="eval").body)
        except SyntaxError:
            return None
    return None


def _es_volcado(nodo) -> bool:
    """¿El nodo es ``algo.model_dump(...)``?"""
    return (
        isinstance(nodo, ast.Call)
        and isinstance(nodo.func, ast.Attribute)
        and nodo.func.attr in VOLCADOS
        and isinstance(nodo.func.value, ast.Name)
    )


def _filtrados(volcado: ast.Call) -> tuple[set[str], set[str] | None]:
    """Los ``exclude``/``include`` literales del volcado.

    Si no se pueden leer (una variable, por ejemplo) se devuelve un conjunto
    vacío: es preferible que la prueba se ponga exigente de más a que deje
    pasar un campo huérfano creyendo que estaba excluido.
    """
    excluidos: set[str] = set()
    incluidos: set[str] | None = None
    for clave in volcado.keywords:
        if clave.arg not in ("exclude", "include"):
            continue
        try:
            literal = set(ast.literal_eval(clave.value))
        except (ValueError, SyntaxError):
            continue
        if clave.arg == "exclude":
            excluidos |= literal
        else:
            incluidos = literal
    return excluidos, incluidos


def _volcados_locales(funcion) -> dict[str, tuple[str, ast.Call]]:
    """Variables intermedias del tipo ``datos = esquema.model_dump()``.

    Varios routers guardan el volcado en una variable, la retocan y recién
    entonces la vacían en el modelo. Sin esto, esas altas — entre ellas la de
    citas y la de signos vitales — quedarían fuera de la revisión.
    """
    locales: dict[str, tuple[str, ast.Call]] = {}
    for nodo in ast.walk(funcion):
        if not (isinstance(nodo, ast.Assign) and len(nodo.targets) == 1):
            continue
        destino = nodo.targets[0]
        if isinstance(destino, ast.Name) and _es_volcado(nodo.value):
            locales[destino.id] = (nodo.value.func.value.id, nodo.value)
    return locales


def _esquemas_por_parametro(funcion, esquemas: dict[str, type]) -> dict[str, type]:
    """De qué esquema viene cada parámetro del endpoint."""
    argumentos = funcion.args
    todos = [*argumentos.posonlyargs, *argumentos.args, *argumentos.kwonlyargs]
    resueltos = {}
    for argumento in todos:
        if argumento.annotation is None:
            continue
        clase = esquemas.get(_nombre_anotado(argumento.annotation))
        if clase is not None:
            resueltos[argumento.arg] = clase
    return resueltos


def _descubrir() -> tuple[list[Alta], list[str]]:
    """Recorre los routers y saca cada ``Modelo(**esquema.model_dump())``.

    Devuelve también los sitios que encontró pero no pudo interpretar: ésos son
    los que quedarían sin vigilancia, y la suite los reclama aparte.
    """
    altas: list[Alta] = []
    sin_resolver: list[str] = []

    for info in pkgutil.iter_modules(app.routers.__path__):
        nombre_modulo = f"app.routers.{info.name}"
        modulo = importlib.import_module(nombre_modulo)
        # Sólo lo que el router tiene a mano: el AST da nombres, no objetos.
        modelos = {n: o for n, o in vars(modulo).items() if _es_modelo(o)}
        esquemas = {n: o for n, o in vars(modulo).items() if _es_esquema(o)}
        arbol = ast.parse(Path(modulo.__file__).read_text(encoding="utf-8"))

        for funcion in ast.walk(arbol):
            if not isinstance(funcion, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            por_parametro = _esquemas_por_parametro(funcion, esquemas)
            locales = _volcados_locales(funcion)

            for llamada in ast.walk(funcion):
                if not (isinstance(llamada, ast.Call) and isinstance(llamada.func, ast.Name)):
                    continue
                modelo = modelos.get(llamada.func.id)
                if modelo is None:
                    continue

                explicitos = {c.arg for c in llamada.keywords if c.arg}
                for clave in llamada.keywords:
                    if clave.arg is not None:  # sólo interesa el ``**algo``
                        continue

                    valor = clave.value
                    if _es_volcado(valor):
                        origen, volcado = valor.func.value.id, valor
                    elif isinstance(valor, ast.Name) and valor.id in locales:
                        origen, volcado = locales[valor.id]
                    else:
                        # Un ``**{...}`` literal no arrastra la forma de ningún
                        # esquema: lo que se pasa está escrito ahí y se revisa
                        # leyendo. No es el fallo que perseguimos.
                        continue

                    esquema = por_parametro.get(origen)
                    ubicacion = f"{nombre_modulo}:{llamada.lineno} ({funcion.name}) {modelo.__name__}(**{origen})"
                    if esquema is None:
                        sin_resolver.append(ubicacion)
                        continue

                    excluidos, incluidos = _filtrados(volcado)
                    if incluidos is not None:
                        excluidos |= set(esquema.model_fields) - incluidos

                    altas.append(
                        Alta(
                            router=nombre_modulo,
                            linea=llamada.lineno,
                            funcion=funcion.name,
                            esquema=esquema,
                            modelo=modelo,
                            excluidos=excluidos,
                            explicitos=explicitos,
                        )
                    )

    return altas, sin_resolver


ALTAS, SIN_RESOLVER = _descubrir()


def _campos_que_llegan(alta: Alta) -> set[str]:
    return set(alta.esquema.model_fields) - alta.excluidos


def _donde_se_puede_escribir(modelo: type) -> set[str]:
    """Nombres que el modelo sabe guardar de verdad.

    Son las columnas, más los atributos mapeados que no son relaciones
    (sinónimos, propiedades híbridas): ésos también escriben en la tabla. Una
    relación queda fuera a propósito — un esquema de alta que trae el nombre de
    una relación está pasando un valor plano donde se espera otro objeto.
    """
    columnas = {columna.name for columna in modelo.__table__.columns}
    relaciones = {relacion.key for relacion in modelo.__mapper__.relationships}
    mapeados = set(modelo.__mapper__.all_orm_descriptors.keys()) - relaciones
    return columnas | mapeados


@pytest.mark.parametrize("alta", ALTAS, ids=str)
def test_el_esquema_de_alta_no_pide_campos_que_la_tabla_no_tiene(alta: Alta):
    """Un campo sin columna revienta el alta entera, no sólo ese dato.

    Es exactamente lo que pasó con ``soap_notes.diagnosis``: el modelo no
    reconoce el argumento, la construcción lanza y el médico recibe un 500 sin
    saber que lo que escribió no se guardó en ningún lado.
    """
    sobrantes = _campos_que_llegan(alta) - _donde_se_puede_escribir(alta.modelo)

    assert not sobrantes, (
        f"{alta.esquema.__name__} acepta campos que "
        f"{alta.modelo.__table__.name} no tiene: {sorted(sobrantes)}.\n"
        f"El alta de {alta.router}:{alta.linea} va a reventar SIEMPRE, con un 500 "
        "genérico y sin rastro en los registros.\n"
        "Quita el campo del esquema, o agrégale su columna con una migración."
    )


@pytest.mark.parametrize("alta", ALTAS, ids=str)
def test_el_alta_llena_todas_las_columnas_obligatorias(alta: Alta):
    """El caso contrario, que además es más callado.

    Si la tabla exige una columna que nadie llena, el alta no falla al
    construirse sino al guardar, con un error de integridad de la base. Al
    usuario le llega el mismo 500 vacío, pero el dato ya ni siquiera aparece en
    la petición: no hay nada que rescatar después.
    """
    trae_el_esquema = set(alta.esquema.model_fields)
    faltantes = sorted(
        columna.name
        for columna in alta.modelo.__table__.columns
        if not columna.nullable
        and not columna.primary_key
        and columna.default is None
        and columna.server_default is None
        and columna.name not in trae_el_esquema
        and columna.name not in alta.explicitos
    )

    assert not faltantes, (
        f"{alta.modelo.__table__.name} exige {faltantes}, y ni "
        f"{alta.esquema.__name__} los pide ni {alta.router}:{alta.linea} los pasa aparte.\n"
        "Cada alta va a morir al guardar, con un error de integridad."
    )


def test_ningun_alta_se_le_escapa_al_descubrimiento():
    """Que el candado no se afloje solo cuando cambie la forma de los routers.

    Las dos pruebas de arriba sólo valen para las altas que este archivo supo
    leer. Si mañana alguien arma un modelo con el volcado de un esquema de una
    manera que aquí no se entiende, esa alta quedaría fuera **sin que nadie se
    entere** — que es justo cómo se perdieron las notas. Entonces falla esto, y
    hay que enseñarle el patrón nuevo al descubrimiento.
    """
    assert not SIN_RESOLVER, (
        "Hay altas que vacían un esquema dentro de un modelo y quedaron sin "
        "revisar:\n  " + "\n  ".join(SIN_RESOLVER) + "\n"
        "Amplía _descubrir() para que las entienda; no las dejes sin candado."
    )


def test_el_descubrimiento_encuentra_las_altas_que_ya_sabemos_que_existen():
    """Que una parametrización vacía no se haga pasar por una suite en verde.

    Si un refactor rompiera el recorrido de los routers, pytest reportaría cero
    pruebas — o sea, todo bien — mientras la vigilancia deja de existir. La nota
    de consulta se nombra aparte porque es la que costó dos meses de trabajo
    clínico.
    """
    # Eran 20. El alta de pagos dejó de volcar el esquema en el modelo a
    # propósito (plan 23): ``PaymentCreate`` trae campos de control
    # (``cobro_adicional``) que no son columnas, y el pago se arma campo por
    # campo en ``cobro_service.crear_pago``. Una baja explicada, no un hueco
    # del descubrimiento.
    assert len(ALTAS) >= 19, f"Sólo se descubrieron {len(ALTAS)} altas; antes había 19"

    tablas = {alta.modelo.__table__.name for alta in ALTAS}
    assert "soap_notes" in tablas, "El alta de la nota de consulta salió del recorrido"
