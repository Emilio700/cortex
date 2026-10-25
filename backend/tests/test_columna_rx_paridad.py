"""Paridad de las mediciones de radiografía entre el servidor y la pantalla.

``paridadRx.json`` lo genera el cálculo de TypeScript
(``frontend/src/modules/neuro3d/dominio/generarParidadRx.ts``) y lo prueban las
dos suites. Si esta prueba falla después de cambiar una fórmula en la pantalla,
el servidor guardaría un ángulo distinto al que vio el médico: corrige
``services/columna_rx.py``, no el archivo.
"""
import json
from pathlib import Path

import pytest

from app.services import columna_rx

PARIDAD = (
    Path(__file__).resolve().parents[2]
    / "frontend" / "src" / "modules" / "neuro3d" / "dominio" / "paridadRx.json"
)

if not PARIDAD.exists():  # pragma: no cover - solo sin el frontend al lado
    pytest.fail(f"No se encontró {PARIDAD}: la paridad con la pantalla no se puede comprobar.")

DATOS = json.loads(PARIDAD.read_text(encoding="utf-8"))


def test_el_archivo_es_de_la_version_del_servidor():
    assert DATOS["version"] == columna_rx.VERSION_CALCULO_RX


@pytest.mark.parametrize("caso", DATOS["casos"], ids=lambda c: c["nota"])
def test_el_servidor_calcula_lo_mismo_que_la_pantalla(caso):
    assert columna_rx.calcular(caso["marcas"], caso["calibraciones"], caso["opciones"]) == caso["esperado"]


@pytest.mark.parametrize("caso", DATOS["casos"], ids=lambda c: c["nota"])
def test_las_marcas_de_la_pantalla_pasan_la_validacion(caso):
    if caso["nota"] == "sin marcas":
        assert columna_rx.validar_marcas(caso["marcas"]) == [
            "No hay puntos marcados. Marca al menos una vértebra antes de guardar."
        ]
    else:
        assert columna_rx.validar_marcas(caso["marcas"]) == []
    assert columna_rx.validar_calibracion(caso["calibraciones"]["lateral"], "lateral") == []
    assert columna_rx.validar_calibracion(caso["calibraciones"]["ap"], "AP") == []


def test_redondea_la_mitad_hacia_arriba_como_la_pantalla():
    assert columna_rx.redondear(0.25) == 0.3
    assert columna_rx.redondear(-0.25) == -0.3
    assert columna_rx.redondear(0.425, 2) == 0.43
    assert str(columna_rx.redondear(-0.01)) == "0.0"


@pytest.mark.parametrize("pct,grado", [(0, None), (10, 1), (25, 1), (30, 2), (60, 3), (80, 4), (110, 5), (-10, None)])
def test_grados_de_meyerding(pct, grado):
    assert columna_rx.grado_de_meyerding(pct) == grado
