"""Paridad del cálculo de escalas entre el servidor y la pantalla.

``paridad.json`` lo genera el motor de TypeScript
(``frontend/src/modules/escalas/dominio/generarParidad.ts``) y lo prueban las
dos suites. Aquí se comprueba que ``services/escalas.py`` tenga exactamente los
mismos ítems, códigos, puntos y rangos, y que con las mismas respuestas
calcule el mismo puntaje, la misma interpretación y los mismos errores.

Si esta prueba falla después de cambiar una escala en la pantalla, el
servidor guardaría un puntaje distinto al que vio el médico: corrige
``services/escalas.py``, no el archivo.
"""
import json
from pathlib import Path

import pytest

from app.services import escalas

PARIDAD = (
    Path(__file__).resolve().parents[2]
    / "frontend" / "src" / "modules" / "escalas" / "dominio" / "paridad.json"
)

if not PARIDAD.exists():  # pragma: no cover - solo sin el frontend al lado
    pytest.fail(f"No se encontró {PARIDAD}: la paridad con la pantalla no se puede comprobar.")

DATOS = json.loads(PARIDAD.read_text(encoding="utf-8"))


def test_la_estructura_de_cada_escala_es_la_de_la_pantalla():
    assert [escalas.estructura(e) for e in escalas.ESCALAS] == DATOS["estructura"]


@pytest.mark.parametrize("caso", DATOS["casos"], ids=lambda c: f"{c['escala']}: {c['nota']}")
def test_el_servidor_calcula_lo_mismo_que_la_pantalla(caso):
    r = escalas.calcular(escalas.escala_por_id(caso["escala"]), caso["respuestas"])
    assert {
        "puntaje": r.puntaje,
        "interpretacion": r.interpretacion,
        "tono": r.tono,
        "detalle": r.detalle,
        "avisos": r.avisos,
    } == caso["esperado"]


@pytest.mark.parametrize("caso", DATOS["invalidos"], ids=lambda c: f"{c['escala']}: {c['nota']}")
def test_el_servidor_rechaza_con_los_mismos_mensajes(caso):
    assert escalas.validar(escalas.escala_por_id(caso["escala"]), caso["respuestas"]) == caso["errores"]


def test_redondea_la_mitad_hacia_arriba_como_la_pantalla():
    # ``round(0.25, 1)`` de Python da 0.2; la pantalla muestra 0.3.
    assert escalas.redondear(0.25) == 0.3
    assert escalas.redondear(16 / 45 * 100) == 35.6
