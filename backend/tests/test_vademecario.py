"""Vademecario del consultorio.

Sale de las 24 750 recetas del sistema anterior: son los medicamentos que el
doctor receta de verdad, no un catalogo generico en ingles.
"""
from app.routers.medications import _cargar_vademecario


def test_el_vademecario_tiene_contenido():
    vade = _cargar_vademecario()
    assert len(vade) >= 300


def test_viene_ordenado_por_lo_mas_recetado():
    vade = _cargar_vademecario()
    veces = [m["veces_recetado"] for m in vade]
    assert veces == sorted(veces, reverse=True)


def test_los_primeros_son_los_del_consultorio():
    """Si esto falla, el archivo se regenero mal o se perdio el orden."""
    nombres = [m["nombre"] for m in _cargar_vademecario()[:6]]
    assert "ASPIRINA PROTEC" in nombres
    assert "ELEVIT" in nombres


def test_cada_entrada_trae_lo_que_la_interfaz_necesita():
    for medicamento in _cargar_vademecario():
        assert medicamento["nombre"]
        assert medicamento["presentacion"]
        assert isinstance(medicamento["veces_recetado"], int)
        assert "detalle" in medicamento
