"""El estudio de demostración pasa por la misma ingesta que un estudio real.

Sirve para dos cosas: comprobar que el generador produce DICOM válido y que la
detección de secuencias acierta con las descripciones que usa (t1_ax,
t1_ax_post, t2_tse_ax, flair_ax). Si esto se rompe, la demostración que se le
enseña al cliente deja de parecerse a lo que verá en su consultorio.
"""
from app.services.imagen_medica.almacen import extraer_zip
from app.services.imagen_medica.ingesta import agrupar, leer_instancia
from scripts.generar_estudio_demo import SERIES, generar


def test_el_estudio_demo_entra_por_la_ingesta_real(tmp_path):
    ruta = generar(tmp_path / "demo.zip", cortes=4, lado=32)

    pares = extraer_zip(ruta.read_bytes())
    instancias = [instancia for _, datos in pares if (instancia := leer_instancia(datos))]

    assert len(instancias) == len(SERIES) * 4

    estudios = agrupar(instancias)
    assert len(estudios) == 1
    assert [s.sequence_label for s in estudios[0].series] == ["T1", "T1+C", "T2", "FLAIR"]
    assert estudios[0].tiene_contraste is True
    assert estudios[0].series[0].instancias[0].tiene_geometria is True


def test_el_estudio_demo_se_ordena_por_geometria(tmp_path):
    ruta = generar(tmp_path / "demo.zip", cortes=6, lado=32)
    pares = extraer_zip(ruta.read_bytes())
    instancias = [instancia for _, datos in pares if (instancia := leer_instancia(datos))]

    serie = agrupar(instancias)[0].series[0]
    posiciones = [corte.image_position[2] for corte in serie.instancias]

    assert serie.ordenadas_por == "posicion"
    assert posiciones == sorted(posiciones)
