"""Lo que pasa cuando falta GPU, VRAM o RAM, y las regiones extra, sin el motor real.

El motor se sustituye por uno que escribe la columna sintética como si fueran las
clases de TotalSegmentator (o que falla como fallaría el real). Todo lo demás
—lectura de máscaras, respaldo, mallas, GLB, errores— es el código de verdad.
"""
import gzip
import struct

import nibabel as nib
import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy import ndimage

from app import main, motor
from app.etiquetas import DISCOS, ESTRUCTURAS_COLUMNA, NIVELES, MAX_TRIANGULOS
from app.glb import leer_glb
from app.mallas import malla_de_mascara, separar_discos
from app.motor import FaltaRecurso, clasificar_salida
from app.sintetico import columna_sintetica


def _nifti_gz() -> bytes:
    cabecera = bytearray(352)
    struct.pack_into("<i", cabecera, 0, 348)
    cabecera[344:348] = b"n+1\x00"
    return gzip.compress(bytes(cabecera))


def _discos_sinteticos(mascaras):
    """Un disco entre cada par de vértebras sintéticas vecinas (salvo C1-C2, que no tiene)."""
    ids = [f"vertebra-{n}" for n in NIVELES] + ["sacro"]
    discos = np.zeros_like(next(iter(mascaras.values())))
    for arriba, abajo in zip(ids[1:], ids[2:]):
        za = np.where(mascaras[arriba].any(axis=(0, 1)))[0]
        zb = np.where(mascaras[abajo].any(axis=(0, 1)))[0]
        cx, cy = ndimage.center_of_mass(mascaras[arriba][:, :, za.min()])
        i, j = np.ogrid[: discos.shape[0], : discos.shape[1]]
        circulo = (i - cx) ** 2 + (j - cy) ** 2 <= 9
        for k in range(zb.max() + 1, za.min()):
            discos[:, :, k] |= circulo
    return discos


def _motor_falso(fallos=None, vacio=False, llamadas=None, quitar=()):
    """Un ``correr_paso`` que escribe la columna sintética como clases de TotalSegmentator.

    ``fallos``: función (paso, rapido, dispositivo) → clave de FaltaRecurso o None.
    """
    mascaras, afin = columna_sintetica()

    def correr(nifti, salida, paso, *, rapido, dispositivo):
        if llamadas is not None:
            llamadas.append((paso.tarea, rapido, dispositivo))
        clave = fallos(paso, rapido, dispositivo) if fallos else None
        if clave:
            raise FaltaRecurso(clave, motor.MENSAJES[clave])
        salida.mkdir(parents=True, exist_ok=True)

        def escribir(clase, datos):
            nib.save(nib.Nifti1Image(datos.astype(np.uint8), afin), str(salida / f"{clase}.nii.gz"))

        if paso.tarea == "vertebrae_body":
            escribir("vertebrae_body", np.zeros_like(mascaras["sacro"]))
            escribir("intervertebral_discs", _discos_sinteticos(mascaras) & (not vacio))
            return {"ok": True, "vram_pico_mb": 1234 if dispositivo == "gpu" else None}
        if paso.tarea == "cerebral_bleed":
            escribir("intracerebral_hemorrhage", np.zeros_like(mascaras["sacro"]))
            return {"ok": True}
        for estructura in ESTRUCTURAS_COLUMNA:
            if not estructura.clases or (paso.tarea == "vertebrae_mr" and estructura.id == "medula-espinal"):
                continue
            datos = mascaras[estructura.id]
            if vacio or estructura.id in quitar:
                datos = np.zeros_like(datos)
            escribir(estructura.clases[-1], datos)
        return {"ok": True, "vram_pico_mb": 2048 if dispositivo == "gpu" else None}

    return correr


@pytest.fixture
def real(monkeypatch):
    """Modo real con el motor sustituido. Por omisión: GPU, modelo normal, sin respaldo."""
    monkeypatch.setenv("SEGMENTADOR_FALSO", "0")
    monkeypatch.setenv("SEGMENTADOR_DISPOSITIVO", "gpu")
    monkeypatch.setenv("SEGMENTADOR_RAPIDO", "0")
    monkeypatch.setenv("SEGMENTADOR_RESPALDO", "ninguno")
    monkeypatch.setattr(motor, "correr_paso", _motor_falso())
    return TestClient(main.app)


def _segmentar(cliente, **params):
    return cliente.post("/segmentar", params=params, content=_nifti_gz(),
                        headers={"Content-Type": "application/octet-stream"})


# ── Dispositivo ─────────────────────────────────────────────────────────────


def test_health_reporta_la_gpu_que_ve_torch(real, monkeypatch):
    monkeypatch.setattr(motor, "info_dispositivo_conocida", lambda: {
        "dispositivo_pedido": "gpu", "dispositivo": "cuda", "gpu": "NVIDIA GeForce RTX 4060 Laptop GPU",
        "vram_total_mb": 8188, "torch": "2.7.1+cu126", "cuda": "12.6"})
    datos = real.get("/health").json()
    assert datos["modo"] == "real"
    assert datos["dispositivo"] == "cuda"
    assert "RTX 4060" in datos["gpu"]
    assert {(r["region"], r["modalidad"]) for r in datos["regiones"]} >= {
        ("columna", "CT"), ("columna", "MR"), ("discos", "CT"), ("craneo", "CT"),
        ("vasos-cuello", "CT"), ("hemorragia", "CT")}


def test_health_no_inventa_el_dispositivo_mientras_lo_consulta(real, monkeypatch):
    monkeypatch.setattr(motor, "info_dispositivo_conocida", lambda: None)
    assert real.get("/health").json()["dispositivo"] == "consultando"


def test_con_gpu_el_modelo_dice_en_que_salio(real):
    r = _segmentar(real)
    assert r.status_code == 200, r.text
    assert r.headers["X-Cortex-Dispositivo"] == "cuda"
    assert r.headers["X-Cortex-Resolucion"] == "normal"
    assert r.headers["X-Cortex-VRAM-Pico-MB"] == "2048"
    assert "segmentacion=" in r.headers["X-Cortex-Tiempos"] and "mallas=" in r.headers["X-Cortex-Tiempos"]
    documento, mallas = leer_glb(r.content)
    extras = documento["asset"]["extras"]["cortex"]
    assert extras["sintetico"] is False
    assert extras["dispositivo"] == "cuda" and extras["resolucion"] == "normal (1.5 mm)"
    assert {"vertebra-C1", "vertebra-L5", "sacro", "medula-espinal", "conducto-vertebral"} <= {m.id for m in mallas}


# ── Falta un recurso ────────────────────────────────────────────────────────


def test_sin_gpu_y_sin_respaldo_responde_503_claro(real, monkeypatch):
    monkeypatch.setattr(motor, "correr_paso", _motor_falso(fallos=lambda p, r, d: "sin_gpu" if d == "gpu" else None))
    r = _segmentar(real)
    assert r.status_code == 503
    assert "GPU" in r.json()["detail"]
    assert r.headers["X-Cortex-Falta"] == "sin_gpu"


def test_sin_gpu_con_respaldo_cpu_lo_hace_en_cpu_y_lo_dice(real, monkeypatch):
    monkeypatch.setenv("SEGMENTADOR_RESPALDO", "cpu")
    llamadas = []
    monkeypatch.setattr(motor, "correr_paso", _motor_falso(
        fallos=lambda p, r, d: "sin_gpu" if d == "gpu" else None, llamadas=llamadas))
    r = _segmentar(real)
    assert r.status_code == 200, r.text
    assert r.headers["X-Cortex-Dispositivo"] == "cpu"
    # En CPU va con el modelo rápido: el normal tardaría demasiado.
    assert r.headers["X-Cortex-Intentos"] == "cuda-normal:sin_gpu,cpu-rapido:ok"
    assert llamadas == [("total", False, "gpu"), ("total", True, "cpu")]
    extras = leer_glb(r.content)[0]["asset"]["extras"]["cortex"]
    assert extras["dispositivo"] == "cpu" and extras["resolucion"] == "rapida (3 mm)"


def test_sin_vram_reintenta_con_el_modelo_rapido(real, monkeypatch):
    monkeypatch.setenv("SEGMENTADOR_RESPALDO", "rapido")
    monkeypatch.setattr(motor, "correr_paso", _motor_falso(fallos=lambda p, r, d: None if r else "sin_vram"))
    r = _segmentar(real)
    assert r.status_code == 200, r.text
    assert r.headers["X-Cortex-Resolucion"] == "rapida"
    assert r.headers["X-Cortex-Intentos"] == "cuda-normal:sin_vram,cuda-rapido:ok"


def test_sin_vram_ni_en_rapido_y_sin_cpu_responde_503(real, monkeypatch):
    monkeypatch.setenv("SEGMENTADOR_RESPALDO", "rapido")
    monkeypatch.setattr(motor, "correr_paso", _motor_falso(fallos=lambda p, r, d: "sin_vram"))
    r = _segmentar(real)
    assert r.status_code == 503
    assert "memoria" in r.json()["detail"] and "video" in r.json()["detail"]


def test_sin_ram_no_se_reintenta_en_cpu(real, monkeypatch):
    # La CPU usa la misma RAM: repetir ahí sólo gastaría minutos para fallar igual.
    monkeypatch.setenv("SEGMENTADOR_RAPIDO", "1")
    monkeypatch.setenv("SEGMENTADOR_RESPALDO", "rapido,cpu")
    llamadas = []
    monkeypatch.setattr(motor, "correr_paso", _motor_falso(fallos=lambda p, r, d: "sin_ram", llamadas=llamadas))
    r = _segmentar(real)
    assert r.status_code == 503
    assert "RAM" in r.json()["detail"]
    assert llamadas == [("total", True, "gpu")]


def test_el_motor_sin_estructuras_no_es_un_exito(real, monkeypatch):
    monkeypatch.setattr(motor, "correr_paso", _motor_falso(vacio=True))
    r = _segmentar(real)
    assert r.status_code == 422
    assert "No se encontró columna" in r.json()["detail"]


@pytest.mark.parametrize(
    "codigo, salida, clave",
    [
        (-9, "", "sin_ram"),
        (137, "", "sin_ram"),
        (1, "torch.OutOfMemoryError: CUDA out of memory. Tried to allocate 2.00 GiB", "sin_vram"),
        (3, 'CORTEX_RESULTADO {"error": "sin_vram"}', "sin_vram"),
        (5, 'CORTEX_RESULTADO {"error": "sin_gpu"}', "sin_gpu"),
        (1, "numpy.core._exceptions._ArrayMemoryError: MemoryError", "sin_ram"),
        (1, "ValueError: algo raro", "fallo"),
    ],
)
def test_se_reconoce_que_falto(codigo, salida, clave):
    assert clasificar_salida(codigo, salida)["error"] == clave


def test_una_salida_buena_trae_la_vram():
    r = clasificar_salida(0, 'ruido\nCORTEX_RESULTADO {"ok": true, "vram_pico_mb": 3100}')
    assert r == {"ok": True, "vram_pico_mb": 3100}


# ── Regiones extra ──────────────────────────────────────────────────────────


def test_la_resonancia_de_columna_usa_vertebrae_mr(real, monkeypatch):
    llamadas = []
    monkeypatch.setattr(motor, "correr_paso", _motor_falso(llamadas=llamadas))
    r = _segmentar(real, region="columna", modalidad="MR")
    assert r.status_code == 200, r.text
    assert [t for t, *_ in llamadas] == ["vertebrae_mr"]
    ids = {m.id for m in leer_glb(r.content)[1]}
    assert {"vertebra-C1", "vertebra-L5", "sacro", "conducto-vertebral"} <= ids
    assert "medula-espinal" not in ids


def test_los_discos_salen_uno_por_nivel(real, monkeypatch):
    llamadas = []
    monkeypatch.setattr(motor, "correr_paso", _motor_falso(llamadas=llamadas))
    r = _segmentar(real, region="discos", modalidad="CT")
    assert r.status_code == 200, r.text
    assert [t for t, *_ in llamadas] == ["total", "vertebrae_body"]
    ids = {m.id for m in leer_glb(r.content)[1]}
    assert {f"disco-{d}" for d in DISCOS} <= ids
    assert "disco-sin-nivel" not in ids
    assert "disco-L5-S1" in ids and "disco-C2-C3" in ids


def test_un_disco_sin_sus_dos_vertebras_no_se_nombra_al_azar():
    mascaras, afin = columna_sintetica()
    discos = _discos_sinteticos(mascaras)
    sin_l4 = {k: v for k, v in mascaras.items() if k != "vertebra-L4"}
    nombres = set(separar_discos(discos, sin_l4, afin))
    assert "disco-L3-L4" not in nombres and "disco-L4-L5" not in nombres
    assert "disco-sin-nivel" in nombres
    assert "disco-L2-L3" in nombres


def test_sin_discos_no_hay_modelo_de_discos(real, monkeypatch):
    monkeypatch.setattr(motor, "correr_paso", _motor_falso(vacio=True))
    r = _segmentar(real, region="discos", modalidad="CT")
    assert r.status_code == 422
    assert "discos" in r.json()["detail"]


def test_sin_hemorragia_se_dice_que_no_la_descarta(real):
    r = _segmentar(real, region="hemorragia", modalidad="CT")
    assert r.status_code == 422
    assert "no la descarta" in r.json()["detail"]


@pytest.mark.parametrize("region", ["brain_structures", "brain_aneurysm", "aneurisma"])
def test_las_tareas_con_licencia_no_se_ofrecen(real, region):
    assert _segmentar(real, region=region).status_code == 422


def test_en_modo_falso_solo_hay_columna(monkeypatch):
    monkeypatch.setenv("SEGMENTADOR_FALSO", "1")
    r = _segmentar(TestClient(main.app), region="craneo", modalidad="CT")
    assert r.status_code == 422
    assert "sólo hay columna" in r.json()["detail"]


# ── Calidad de malla ────────────────────────────────────────────────────────


def _esfera(radio_vox: int, lado: int) -> np.ndarray:
    c = (lado - 1) / 2
    i, j, k = np.ogrid[:lado, :lado, :lado]
    return (i - c) ** 2 + (j - c) ** 2 + (k - c) ** 2 <= radio_vox ** 2


def _volumen(m):
    v = m.vertices.astype(float)
    a, b, c = (v[m.caras[:, i]] for i in range(3))
    return np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6


def _error_radial(vertices_lps, centro, radio):
    r = np.linalg.norm(vertices_lps * np.array([-1, -1, 1]) - centro, axis=1)
    return float(r.mean() - radio), float(np.sqrt(((r - radio) ** 2).mean()))


def test_la_malla_refinada_quita_escalones_sin_encoger(monkeypatch):
    from skimage import measure

    mascara = _esfera(30, 70)
    centro = np.full(3, 34.5)
    # Referencia: marching cubes crudo, con los escalones del vóxel.
    crudo, _, _, _ = measure.marching_cubes(mascara.astype(np.float32), level=0.5)
    _, error_crudo = _error_radial(crudo * np.array([-1, -1, 1]), centro, 30)
    monkeypatch.setenv("SEGMENTADOR_MALLA", "refinada")
    refinada = malla_de_mascara("x", mascara, np.eye(4))
    sesgo, error = _error_radial(refinada.vertices, centro, 30)
    # Cabe en el tope de triángulos (la esfera cruda da ~45 000)…
    assert len(refinada.caras) <= MAX_TRIANGULOS < refinada.extras["triangulos_crudos"]
    # …no encoge (el radio medio queda a menos de 0.1 vóxel)…
    assert abs(sesgo) < 0.1
    # …y quedó más cerca de la esfera verdadera que la malla con escalones.
    assert error < 0.6 * error_crudo


def test_la_malla_refinada_es_determinista(monkeypatch):
    monkeypatch.setenv("SEGMENTADOR_MALLA", "refinada")
    mascara = _esfera(20, 50)
    a = malla_de_mascara("x", mascara, np.eye(4))
    b = malla_de_mascara("x", mascara, np.eye(4))
    assert np.array_equal(a.vertices, b.vertices) and np.array_equal(a.caras, b.caras)
