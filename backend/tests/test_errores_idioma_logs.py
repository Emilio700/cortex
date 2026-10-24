"""Los routers no imprimen con print ni responden en inglés (B-09).

`print()` en producción se pierde (no queda en los logs con nivel ni contexto) y
un mensaje de error en inglés a media consulta se ve descuidado y no lo entiende
el personal. Estas pruebas escanean el código de los routers: si vuelve un
`print(` o uno de los mensajes que se tradujeron, fallan.
"""
import re
from pathlib import Path

import pytest

RUTA_ROUTERS = Path(__file__).resolve().parent.parent / "app" / "routers"

ARCHIVOS = sorted(p for p in RUTA_ROUTERS.glob("*.py") if p.name != "__init__.py")


@pytest.mark.parametrize("archivo", ARCHIVOS, ids=lambda p: p.name)
def test_ningun_router_usa_print(archivo):
    """En su lugar se usa ``logging`` (logger.exception / logger.error)."""
    codigo = archivo.read_text(encoding="utf-8")
    # ``print(`` como llamada; también atrapa ``traceback.print_exc`` no, ese es
    # ``print_exc``. Aquí interesa la función print suelta.
    llamadas = re.findall(r"(?<![\w.])print\s*\(", codigo)
    assert llamadas == [], f"{archivo.name} usa print(); usa logging en su lugar"


@pytest.mark.parametrize("archivo", ARCHIVOS, ids=lambda p: p.name)
def test_ningun_router_imprime_la_traza_directo(archivo):
    """``traceback.print_exc()`` va a stdout sin nivel; usa ``logger.exception``."""
    codigo = archivo.read_text(encoding="utf-8")
    assert "traceback.print_exc" not in codigo, (
        f"{archivo.name} usa traceback.print_exc(); usa logger.exception()"
    )


# Mensajes concretos que se tradujeron: si reaparecen en inglés, algo se revirtió.
MENSAJES_INGLES_PROHIBIDOS = [
    'detail="Profile not found"',
    'detail="File not found"',
    'detail="Invalid filename"',
    'detail="Error saving profile file"',
    '"message": "Sync complete"',
]


@pytest.mark.parametrize("archivo", ARCHIVOS, ids=lambda p: p.name)
def test_no_quedan_mensajes_de_respuesta_en_ingles(archivo):
    codigo = archivo.read_text(encoding="utf-8")
    presentes = [m for m in MENSAJES_INGLES_PROHIBIDOS if m in codigo]
    assert presentes == [], f"{archivo.name} responde en inglés: {presentes}"
