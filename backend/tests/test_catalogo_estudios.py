"""Catalogo de estudios de imagen.

Sale del formato en papel del laboratorio con el que trabaja la clinica. Si
se corrompe, el doctor vuelve a teclear los nombres a mano y el laboratorio
recibe variantes del mismo estudio.
"""
from app.routers.catalogo_estudios import cargar_catalogo


def test_el_catalogo_tiene_los_grupos_del_formato():
    grupos = {g["clave"] for g in cargar_catalogo()["grupos"]}
    assert "tomografia" in grupos
    assert "resonancia" in grupos
    assert "imagen_mujer" in grupos
    assert "us_embarazo" in grupos
    assert "extremidades" in grupos


def test_los_grupos_de_la_mujer_estan_destacados():
    """Es una clinica de ginecologia: estos dos son los del dia a dia."""
    destacados = {
        g["clave"] for g in cargar_catalogo()["grupos"] if g.get("destacado")
    }
    assert destacados == {"imagen_mujer", "us_embarazo"}


def test_extremidades_pide_lateralidad():
    """En el formato de papel cada extremidad se marca DER o IZQ."""
    grupo = next(
        g for g in cargar_catalogo()["grupos"] if g["clave"] == "extremidades"
    )
    assert grupo["requiere_lateralidad"] is True
    assert "Rodilla" in grupo["estudios"]


def test_los_ultrasonidos_piden_region():
    grupo = next(
        g for g in cargar_catalogo()["grupos"] if g["clave"] == "ultrasonidos"
    )
    assert grupo["requiere_region"] is True


def test_todos_los_grupos_estan_completos():
    for grupo in cargar_catalogo()["grupos"]:
        assert grupo["clave"]
        assert grupo["nombre"]
        assert grupo["modalidad"]
        assert grupo["estudios"], f"{grupo['clave']} no tiene estudios"
