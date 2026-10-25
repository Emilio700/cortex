"""
Pruebas de las funciones puras de `preparar_atlas.py`: no descargan nada ni
necesitan trimesh. Se corren con el pytest del backend:

    backend/.venv/Scripts/python -m pytest scripts/atlas
"""
import json
from pathlib import Path

import pytest

import preparar_atlas as pa

MAPEO_FRONTEND = Path(__file__).resolve().parents[2] / "frontend" / "src" / "modules" / "neuro3d" / "dominio" / "atlasMapeo.json"

TABLA = "concept id\tname\telement file id\n" + "\n".join(
    [
        "FMA1\tcosa grande\tFJ1",
        "FMA1\tcosa grande\tFJ2",
        "FMA1\tcosa grande\tFJ3",
        "FMA2\tparte\tFJ2",
        "FMA3\tpar\tFJ4",
        "FMA3\tpar\tFJ4M",
        "FMA3\tpar\tFJ4",
    ]
)


def entrada(clave, fma, **kw):
    return pa._e(clave, fma, clave, "encefalo", "corteza", "cabeza", **kw)


def test_leer_partes_agrupa_por_fma_sin_repetir():
    partes = pa.leer_partes(TABLA)
    assert partes["FMA1"] == ["FJ1", "FJ2", "FJ3"]
    assert partes["FMA3"] == ["FJ4", "FJ4M"]


def test_el_archivo_es_de_la_primera_entrada_que_lo_pide():
    partes = pa.leer_partes(TABLA)
    sel = pa.resolver_seleccion([entrada("parte", "FMA2"), entrada("grande", "FMA1")], partes)
    assert sel[0].archivos == ["FJ2"]
    # La grande se queda con lo que no tomó la parte.
    assert sel[1].archivos == ["FJ1", "FJ3"]


def test_una_entrada_sin_archivos_o_con_fma_inexistente_falla():
    partes = pa.leer_partes(TABLA)
    with pytest.raises(ValueError, match="no está en la tabla"):
        pa.resolver_seleccion([entrada("x", "FMA999")], partes)
    with pytest.raises(ValueError, match="ya los tomó"):
        pa.resolver_seleccion([entrada("a", "FMA1"), entrada("b", "FMA2")], partes)


def test_lado_por_x_sigue_lps():
    # En BodyParts3D +x es la izquierda del cuerpo (el hueso temporal izquierdo tiene x > 0).
    assert pa.lado_por_x(48.2) == "izq"
    assert pa.lado_por_x(-49.8) == "der"


def test_presupuesto_respeta_maximos_y_tope_total():
    caras = {"a": 10_000, "b": 2_000, "c": 100}
    sin_tope = pa.repartir_presupuesto(caras, {"a": 6_000, "b": 8_000}, total=1_000_000)
    assert sin_tope == {"a": 6_000, "b": 2_000, "c": 100}
    con_tope = pa.repartir_presupuesto(caras, {"a": 6_000}, total=4_050)
    assert con_tope["a"] == 3_000 and con_tope["b"] == 1_000
    # Una pieza pequeña conserva sus caras (hasta 200) para no desaparecer.
    assert con_tope["c"] == 100


def test_nombre_con_lado_concuerda():
    assert pa.nombre_con_lado("Arteria cerebral media", "izq") == "Arteria cerebral media izquierda"
    assert pa.nombre_con_lado("Nervio óptico", "der") == "Nervio óptico derecho"
    assert pa.nombre_con_lado("Giros orbitarios", "izq") == "Giros orbitarios izquierdos"


def test_tabla_de_estructuras_sin_claves_repetidas_y_con_regiones_validas():
    claves = [m["clave"] for m in pa.mapeo_esperado(pa.ESTRUCTURAS)]
    assert len(claves) == len(set(claves))
    assert {e.region for e in pa.ESTRUCTURAS} == {"cabeza", "columna"}
    # Tejidos que entiende la biblioteca de materiales de Neuro 3D.
    assert {e.tejido for e in pa.ESTRUCTURAS} <= {"hueso", "craneo", "corteza", "sustancia-blanca", "nervio", "arteria", "vena", "disco", "liquido"}


def test_columna_completa_salvo_lo_que_bodyparts3d_no_trae():
    claves = {m["clave"] for m in pa.mapeo_esperado(pa.ESTRUCTURAS)}
    for n, _, _ in pa.VERTEBRAS:
        assert f"vertebra-{n}" in claves
    assert "sacro" in claves
    # T12-L1 no existe en BodyParts3D: lo sigue poniendo el esquemático.
    assert "disco-T12-L1" not in claves
    assert len([c for c in claves if c.startswith("disco-")]) == 22


def test_el_mapeo_del_frontend_esta_al_dia():
    """Si falla: `python scripts/atlas/preparar_atlas.py --escribir-mapeo <ruta de atlasMapeo.json>`."""
    guardado = json.loads(MAPEO_FRONTEND.read_text(encoding="utf-8"))
    assert guardado == pa.mapeo_esperado(pa.ESTRUCTURAS)


def test_creditos_con_el_texto_exacto_de_la_licencia():
    assert pa.TEXTO_CREDITO == (
        "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International"
    )
    assert pa.CREDITOS["licencia"] == "CC BY 4.0"
