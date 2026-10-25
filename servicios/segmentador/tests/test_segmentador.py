"""Segmentador en modo falso: forma de la salida, unidades, etiquetas y errores.

El modo falso arma una columna sintética y la pasa por el mismo mallado que el
motor real, así que estas pruebas cubren ``mallas.py`` y ``glb.py`` completos;
lo único que no tocan es TotalSegmentator.
"""
import gzip
import io
import struct
import zipfile

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import main
from app.etiquetas import NIVELES
from app.glb import leer_glb
from app.mallas import mallas_de_mascaras


@pytest.fixture
def cliente(monkeypatch):
    monkeypatch.setenv("SEGMENTADOR_FALSO", "1")
    return TestClient(main.app)


def _zip_dicom(n=3) -> bytes:
    """Un ZIP con «cortes» que tienen el preámbulo DICM; en modo falso basta."""
    salida = io.BytesIO()
    with zipfile.ZipFile(salida, "w") as z:
        for i in range(n):
            z.writestr(f"IMG{i:04d}", b"\x00" * 128 + b"DICM" + b"\x00" * 64)
    return salida.getvalue()


def _nifti_gz() -> bytes:
    cabecera = bytearray(352)
    struct.pack_into("<i", cabecera, 0, 348)
    cabecera[344:348] = b"n+1\x00"
    return gzip.compress(bytes(cabecera))


def _segmentar(cliente, datos, **params):
    return cliente.post("/segmentar", params=params, content=datos, headers={"Content-Type": "application/octet-stream"})


def test_health_dice_el_modo(cliente):
    r = cliente.get("/health")
    assert r.status_code == 200
    assert r.json()["modo"] == "falso"
    assert r.json()["motor"] == "sintetico"
    # En modo falso no hay dispositivo que reportar, y se dice.
    assert r.json()["dispositivo"] == "ninguno"
    assert [x["region"] for x in r.json()["regiones"]] == ["columna", "columna"]


def test_devuelve_un_glb_con_las_estructuras_etiquetadas(cliente):
    r = _segmentar(cliente, _zip_dicom())
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "model/gltf-binary"
    assert r.headers["X-Cortex-Sintetico"] == "1"
    documento, mallas = leer_glb(r.content)
    ids = [m.id for m in mallas]
    assert ids[:24] == [f"vertebra-{n}" for n in NIVELES]
    assert {"sacro", "medula-espinal", "conducto-vertebral"} <= set(ids)
    assert int(r.headers["X-Cortex-Estructuras"]) == len(mallas)
    extras = documento["asset"]["extras"]["cortex"]
    assert extras["unidades"] == "mm"
    assert extras["sistema"] == "LPS"
    assert extras["sintetico"] is True
    nombres = {m.id: m.nombre for m in mallas}
    assert nombres["vertebra-L5"] == "Vértebra L5"
    assert nombres["conducto-vertebral"].endswith("(aproximado)")


def test_las_medidas_estan_en_milimetros_y_en_lps(cliente):
    _, mallas = leer_glb(_segmentar(cliente, _zip_dicom()).content)
    por_id = {m.id: m for m in mallas}
    # Una vértebra lumbar mide unos 3 cm de alto y más de 4 cm de ancho: en
    # metros o en centímetros estos números serían otros.
    l3 = por_id["vertebra-L3"].vertices
    alto = l3[:, 2].max() - l3[:, 2].min()
    ancho = l3[:, 0].max() - l3[:, 0].min()
    assert 20 < alto < 40
    assert 40 < ancho < 90
    # LPS: +z es superior (C1 arriba de L5) y +y posterior (el cuerpo vertebral,
    # adelante, tiene y menor que la apófisis espinosa).
    assert por_id["vertebra-C1"].vertices[:, 2].mean() > por_id["vertebra-L5"].vertices[:, 2].mean()
    assert l3[:, 1].min() < -20 and l3[:, 1].max() > 15
    # La columna entera, de C1 al sacro, ronda los 70 cm.
    todo = np.concatenate([m.vertices for m in mallas])
    assert 550 < todo[:, 2].max() - todo[:, 2].min() < 800


def test_las_normales_apuntan_hacia_fuera(cliente):
    _, mallas = leer_glb(_segmentar(cliente, _zip_dicom()).content)
    for m in mallas:
        v = m.vertices.astype(float)
        a, b, c = (v[m.caras[:, i]] for i in range(3))
        volumen = np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6
        assert volumen > 0, m.id
        assert m.normales is not None and m.normales.shape == m.vertices.shape


def test_es_determinista(cliente):
    assert _segmentar(cliente, _zip_dicom()).content == _segmentar(cliente, _zip_dicom(5)).content


def test_acepta_nifti(cliente):
    assert _segmentar(cliente, _nifti_gz()).status_code == 200


def test_las_mallas_respetan_el_tope_de_triangulos(cliente):
    from app.mallas import MAX_TRIANGULOS

    _, mallas = leer_glb(_segmentar(cliente, _zip_dicom()).content)
    assert all(len(m.caras) <= MAX_TRIANGULOS for m in mallas)


@pytest.mark.parametrize(
    "datos, motivo",
    [
        (b"", "vacía"),
        (b"hola, esto no es una serie", "no es un ZIP"),
        (b"PK\x03\x04roto", "dañado"),
    ],
)
def test_entradas_invalidas_dicen_por_que_en_espanol(cliente, datos, motivo):
    r = _segmentar(cliente, datos)
    assert r.status_code == 422
    assert motivo in r.json()["detail"]


def test_zip_sin_dicom_se_rechaza(cliente):
    salida = io.BytesIO()
    with zipfile.ZipFile(salida, "w") as z:
        z.writestr("leeme.txt", "no soy un corte")
    r = _segmentar(cliente, salida.getvalue())
    assert r.status_code == 422
    assert "DICOM" in r.json()["detail"]


def test_encefalo_aun_no_esta_disponible(cliente):
    r = _segmentar(cliente, _zip_dicom(), region="encefalo")
    assert r.status_code == 422
    assert "encéfalo" in r.json()["detail"]


def test_una_region_con_otra_modalidad_se_rechaza_con_motivo(monkeypatch):
    monkeypatch.setenv("SEGMENTADOR_FALSO", "0")
    r = _segmentar(TestClient(main.app), _zip_dicom(), region="craneo", modalidad="MR")
    assert r.status_code == 422
    assert "tomografía" in r.json()["detail"]


def test_un_espejo_en_la_afin_no_voltea_las_normales():
    mascara = np.zeros((20, 20, 20), dtype=bool)
    mascara[5:15, 5:15, 5:15] = True
    for afin in (np.diag([1.0, 1, 1, 1]), np.diag([-1.0, 1, 1, 1]), np.diag([-2.0, -2, 3, 1])):
        (malla,) = mallas_de_mascaras({"vertebra-L1": mascara}, afin, con_conducto=False)
        v = malla.vertices.astype(float)
        a, b, c = (v[malla.caras[:, i]] for i in range(3))
        assert np.einsum("ij,ij->i", a, np.cross(b, c)).sum() > 0
