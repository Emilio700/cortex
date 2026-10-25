"""Modelo 3D del paciente desde su TC (Cortex, feat/modelo-3d-desde-tc).

El segmentador se simula: estas pruebas cuidan lo que Cortex promete, no la
calidad de la segmentación.

- El estado se dice tal cual: «listo» sólo con el archivo guardado; si falla,
  ``fallo`` con un motivo en español; un trabajo colgado se vence solo.
- Con el módulo apagado, todo responde 404.
- Ver pide ``clinical_images.read``; generar y revisar, ``neuro3d.generar_modelo``.
- Un médico sólo toca modelos de su expediente.
"""
import http.server
import json
import threading
from datetime import timedelta

import pytest
from test_estudios_imagen import _dicom
from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    client,
    db_session,
    escenario,
)

from app.core.config import settings
from app.core.storage import LocalStorageBackend
from app.db.session import utcnow
from app.models.audit_log import AuditLog
from app.models.imaging_modelo_3d import ImagingModelo3D
from app.models.tenant_modulo import TenantModulo
from app.routers import imaging as imaging_router
from app.routers import modelo_3d as modelo_router
from app.services.modelo_3d import cliente, trabajo

GLB_FALSO = b"glTF" + b"\x02\x00\x00\x00" + b"\x00" * 64
ESTUDIO_TC = "1.2.840.113619.2.55.3.2026.10.27"
SERIE_TC = "1.2.840.113619.2.55.3.2026.10.27.1"


@pytest.fixture
def almacen(tmp_path, monkeypatch):
    almacen = LocalStorageBackend(root_dir=tmp_path)
    monkeypatch.setattr(imaging_router, "default_storage", almacen)
    monkeypatch.setattr(modelo_router, "default_storage", almacen)
    return almacen


class Segmentador:
    """Lo que el segmentador hará en la prueba: devolver un GLB o fallar."""

    def __init__(self):
        self.llamadas: list[dict] = []
        self.error: Exception | None = None

    def __call__(self, datos: bytes, *, region: str, modalidad: str) -> cliente.ResultadoSegmentacion:
        self.llamadas.append({"bytes": len(datos), "region": region, "modalidad": modalidad})
        if self.error:
            raise self.error
        return cliente.ResultadoSegmentacion(
            glb=GLB_FALSO, motor="TotalSegmentator", motor_version="2.18.0", estructuras=27, sintetico=False
        )


@pytest.fixture
def segmentador(db_session, almacen, monkeypatch):
    """El trabajo corre en el acto, sin hilo, con la sesión de la prueba."""
    falso = Segmentador()
    monkeypatch.setattr(
        trabajo, "encolar", lambda modelo_id: trabajo.procesar(db_session, modelo_id, storage=almacen, segmentar=falso)
    )
    return falso


@pytest.fixture
def modulo_encendido(db_session, escenario, monkeypatch):
    monkeypatch.setattr(settings, "SEGMENTADOR_URL", "http://segmentador.prueba:8000")
    db_session.add(TenantModulo(tenant_id=escenario["tenant"].id, modulo="neuro3d_paciente", activo=True))
    db_session.commit()


def _subir_tc(client, db_session, escenario, *, cortes=12, modality="CT"):
    cabeceras = _auth_headers(db_session, escenario["doctora"])
    archivos = [
        (f"c{i}.dcm", _dicom(f"{SERIE_TC}.{i}", study_uid=ESTUDIO_TC, series_uid=SERIE_TC,
                             instance_number=i, position=(0, 0, 2.0 * i), modality=modality,
                             description="columna axial"))
        for i in range(1, cortes + 1)
    ]
    r = client.post(
        f"{PREFIX}/patients/{escenario['paciente'].id}/imaging/upload",
        headers=cabeceras,
        files=[("archivos", (n, d, "application/dicom")) for n, d in archivos],
    )
    assert r.status_code == 201, r.text
    estudio_id = r.json()["creados"][0]["id"]
    detalle = client.get(f"{PREFIX}/imaging/studies/{estudio_id}", headers=cabeceras).json()
    return estudio_id, detalle["series"][0]["id"]


def _ruta(estudio_id, serie_id):
    return f"{PREFIX}/imaging/studies/{estudio_id}/series/{serie_id}/modelo-3d"


# ── Módulo apagado ──────────────────────────────────────────────────────────


def test_con_el_modulo_apagado_todo_responde_404(client, db_session, escenario, almacen, segmentador):
    estudio, serie = _subir_tc(client, db_session, escenario)
    medico = _auth_headers(db_session, escenario["doctora"])
    assert client.post(_ruta(estudio, serie), headers=medico).status_code == 404
    assert client.get(_ruta(estudio, serie), headers=medico).status_code == 404
    assert client.get(f"{PREFIX}/patients/{escenario['paciente'].id}/modelos-3d", headers=medico).status_code == 404
    assert client.get(f"{PREFIX}/imaging/modelos-3d/1/mallas", headers=medico).status_code == 404
    assert segmentador.llamadas == []
    assert db_session.query(ImagingModelo3D).count() == 0


# ── Estados ─────────────────────────────────────────────────────────────────


def test_generar_deja_el_modelo_listo_con_su_motor_y_se_descarga(client, db_session, escenario, segmentador, modulo_encendido):
    estudio, serie = _subir_tc(client, db_session, escenario)
    medico = _auth_headers(db_session, escenario["doctora"])

    r = client.post(_ruta(estudio, serie), headers=medico)

    assert r.status_code == 202, r.text
    cuerpo = r.json()
    assert cuerpo["estado"] == "listo"
    assert cuerpo["motor"] == "TotalSegmentator"
    assert cuerpo["motor_version"] == "2.18.0"
    assert cuerpo["estructuras"] == 27
    assert cuerpo["sintetico"] is False
    assert cuerpo["confirmado_en"] is None
    assert cuerpo["modalidad"] == "CT"
    # Se mandó la serie completa, como TC de columna.
    assert segmentador.llamadas == [{"bytes": segmentador.llamadas[0]["bytes"], "region": "columna", "modalidad": "CT"}]
    assert segmentador.llamadas[0]["bytes"] > 0

    estado = client.get(_ruta(estudio, serie), headers=medico).json()
    assert estado["estado"] == "listo"
    mallas = client.get(f"{PREFIX}/imaging/modelos-3d/{cuerpo['id']}/mallas", headers=medico)
    assert mallas.status_code == 200
    assert mallas.content == GLB_FALSO
    assert mallas.headers["content-type"] == "model/gltf-binary"
    assert "no-store" in mallas.headers["cache-control"]

    lista = client.get(f"{PREFIX}/patients/{escenario['paciente'].id}/modelos-3d", headers=medico).json()
    assert [m["id"] for m in lista] == [cuerpo["id"]]

    acciones = [a.action for a in db_session.query(AuditLog).order_by(AuditLog.id).all()]
    assert "modelo3d_solicitar" in acciones and "modelo3d_listo" in acciones


def test_si_el_segmentador_falla_queda_en_fallo_con_su_motivo(client, db_session, escenario, segmentador, modulo_encendido):
    segmentador.error = cliente.ErrorDelSegmentador("No se encontró columna en el estudio.")
    estudio, serie = _subir_tc(client, db_session, escenario)
    medico = _auth_headers(db_session, escenario["doctora"])

    cuerpo = client.post(_ruta(estudio, serie), headers=medico).json()

    assert cuerpo["estado"] == "fallo"
    assert cuerpo["motivo_fallo"] == "No se encontró columna en el estudio."
    descarga = client.get(f"{PREFIX}/imaging/modelos-3d/{cuerpo['id']}/mallas", headers=medico)
    assert descarga.status_code == 409
    assert db_session.query(AuditLog).filter(AuditLog.action == "modelo3d_fallo").count() == 1


def test_un_error_inesperado_no_se_cuela_como_traza(client, db_session, escenario, segmentador, modulo_encendido):
    segmentador.error = KeyError("instances")
    estudio, serie = _subir_tc(client, db_session, escenario)
    cuerpo = client.post(_ruta(estudio, serie), headers=_auth_headers(db_session, escenario["doctora"])).json()
    assert cuerpo["estado"] == "fallo"
    assert cuerpo["motivo_fallo"] == trabajo.MOTIVO_INESPERADO


def test_pedirlo_dos_veces_mientras_se_procesa_no_duplica(client, db_session, escenario, almacen, modulo_encendido, monkeypatch):
    monkeypatch.setattr(trabajo, "encolar", lambda modelo_id: None)  # se queda «pendiente»
    estudio, serie = _subir_tc(client, db_session, escenario)
    medico = _auth_headers(db_session, escenario["doctora"])
    primero = client.post(_ruta(estudio, serie), headers=medico).json()
    segundo = client.post(_ruta(estudio, serie), headers=medico).json()
    assert primero["estado"] == "pendiente"
    assert segundo["id"] == primero["id"]
    assert db_session.query(ImagingModelo3D).count() == 1


def test_un_trabajo_colgado_se_vence_y_lo_dice(client, db_session, escenario, almacen, modulo_encendido, monkeypatch):
    monkeypatch.setattr(trabajo, "encolar", lambda modelo_id: None)
    estudio, serie = _subir_tc(client, db_session, escenario)
    medico = _auth_headers(db_session, escenario["doctora"])
    modelo_id = client.post(_ruta(estudio, serie), headers=medico).json()["id"]
    modelo = db_session.get(ImagingModelo3D, modelo_id)
    modelo.estado = "procesando"
    modelo.iniciado_en = utcnow() - timedelta(seconds=settings.SEGMENTADOR_TIEMPO_LIMITE_SEGUNDOS + 301)
    db_session.commit()

    estado = client.get(_ruta(estudio, serie), headers=medico).json()

    assert estado["estado"] == "fallo"
    assert estado["motivo_fallo"] == trabajo.MOTIVO_INTERRUMPIDO
    # Y se puede volver a pedir.
    otro = client.post(_ruta(estudio, serie), headers=medico).json()
    assert otro["id"] != modelo_id


def test_marcar_revisado_deja_quien_y_cuando(client, db_session, escenario, segmentador, modulo_encendido):
    estudio, serie = _subir_tc(client, db_session, escenario)
    medico = _auth_headers(db_session, escenario["doctora"])
    modelo_id = client.post(_ruta(estudio, serie), headers=medico).json()["id"]

    r = client.post(f"{PREFIX}/imaging/modelos-3d/{modelo_id}/revisado", headers=medico)

    assert r.status_code == 200
    assert r.json()["confirmado_por"] == "Yara Gutiérrez"
    assert r.json()["confirmado_en"] is not None
    assert db_session.query(AuditLog).filter(AuditLog.action == "modelo3d_revisado").count() == 1


def test_no_se_revisa_un_modelo_que_no_esta_listo(client, db_session, escenario, segmentador, modulo_encendido):
    segmentador.error = cliente.ErrorDelSegmentador("falló")
    estudio, serie = _subir_tc(client, db_session, escenario)
    medico = _auth_headers(db_session, escenario["doctora"])
    modelo_id = client.post(_ruta(estudio, serie), headers=medico).json()["id"]
    assert client.post(f"{PREFIX}/imaging/modelos-3d/{modelo_id}/revisado", headers=medico).status_code == 409


# ── Validaciones de la serie ────────────────────────────────────────────────


def test_pocos_cortes_se_rechazan_con_motivo(client, db_session, escenario, segmentador, modulo_encendido):
    estudio, serie = _subir_tc(client, db_session, escenario, cortes=3)
    r = client.post(_ruta(estudio, serie), headers=_auth_headers(db_session, escenario["doctora"]))
    assert r.status_code == 422
    assert "pocos cortes" in r.json()["detail"]
    assert segmentador.llamadas == []


def test_una_modalidad_que_no_es_tc_ni_rm_se_rechaza(client, db_session, escenario, segmentador, modulo_encendido):
    estudio, serie = _subir_tc(client, db_session, escenario, modality="US")
    r = client.post(_ruta(estudio, serie), headers=_auth_headers(db_session, escenario["doctora"]))
    assert r.status_code == 422
    assert "tomografía o una resonancia" in r.json()["detail"]


def test_la_serie_de_otro_estudio_no_se_acepta(client, db_session, escenario, segmentador, modulo_encendido):
    estudio, serie = _subir_tc(client, db_session, escenario)
    r = client.post(_ruta(estudio + 999, serie), headers=_auth_headers(db_session, escenario["doctora"]))
    assert r.status_code == 404


# ── Permisos y alcance ──────────────────────────────────────────────────────


def test_recepcion_no_ve_ni_genera(client, db_session, escenario, segmentador, modulo_encendido):
    estudio, serie = _subir_tc(client, db_session, escenario)
    recepcion = _auth_headers(db_session, escenario["secretaria"])
    assert client.post(_ruta(estudio, serie), headers=recepcion).status_code == 403
    assert client.get(_ruta(estudio, serie), headers=recepcion).status_code == 403


def test_administracion_ve_pero_no_genera(client, db_session, escenario, segmentador, modulo_encendido):
    estudio, serie = _subir_tc(client, db_session, escenario)
    client.post(_ruta(estudio, serie), headers=_auth_headers(db_session, escenario["doctora"]))
    admin = _auth_headers(db_session, escenario["admin"])
    assert client.post(_ruta(estudio, serie), headers=admin).status_code == 403
    assert client.get(_ruta(estudio, serie), headers=admin).status_code == 200


def test_el_medico_ajeno_no_ve_ni_genera_el_modelo_de_otro_paciente(client, db_session, escenario, segmentador, modulo_encendido):
    estudio, serie = _subir_tc(client, db_session, escenario)
    modelo_id = client.post(_ruta(estudio, serie), headers=_auth_headers(db_session, escenario["doctora"])).json()["id"]
    colega = _auth_headers(db_session, escenario["colega"])
    assert client.post(_ruta(estudio, serie), headers=colega).status_code in (403, 404)
    assert client.get(_ruta(estudio, serie), headers=colega).status_code in (403, 404)
    assert client.get(f"{PREFIX}/imaging/modelos-3d/{modelo_id}/mallas", headers=colega).status_code in (403, 404)
    assert client.get(f"{PREFIX}/patients/{escenario['paciente'].id}/modelos-3d", headers=colega).status_code in (403, 404)
    assert client.post(f"{PREFIX}/imaging/modelos-3d/{modelo_id}/revisado", headers=colega).status_code in (403, 404)


def test_otro_consultorio_no_llega_ni_con_el_modulo_encendido(client, db_session, escenario, segmentador, modulo_encendido):
    estudio, serie = _subir_tc(client, db_session, escenario)
    modelo_id = client.post(_ruta(estudio, serie), headers=_auth_headers(db_session, escenario["doctora"])).json()["id"]
    ajena = escenario["doctora_ajena"]
    db_session.add(TenantModulo(tenant_id=ajena.tenant_id, modulo="neuro3d_paciente", activo=True))
    db_session.commit()
    cabeceras = _auth_headers(db_session, ajena)
    assert client.get(_ruta(estudio, serie), headers=cabeceras).status_code == 404
    assert client.get(f"{PREFIX}/imaging/modelos-3d/{modelo_id}/mallas", headers=cabeceras).status_code == 404


# ── Cliente HTTP ────────────────────────────────────────────────────────────


class _Servidor(http.server.BaseHTTPRequestHandler):
    respuesta: tuple[int, dict, bytes] = (200, {}, b"")
    recibido: dict = {}

    def do_POST(self):  # noqa: N802 — nombre de http.server
        largo = int(self.headers.get("Content-Length", 0))
        _Servidor.recibido = {"ruta": self.path, "bytes": len(self.rfile.read(largo)), "tipo": self.headers.get("Content-Type")}
        codigo, cabeceras, cuerpo = _Servidor.respuesta
        self.send_response(codigo)
        for k, v in cabeceras.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def log_message(self, *args):
        pass


@pytest.fixture
def servidor(monkeypatch):
    s = http.server.HTTPServer(("127.0.0.1", 0), _Servidor)
    hilo = threading.Thread(target=s.serve_forever, daemon=True)
    hilo.start()
    monkeypatch.setattr(settings, "SEGMENTADOR_URL", f"http://127.0.0.1:{s.server_port}/")
    yield _Servidor
    s.shutdown()


def test_cliente_entrega_el_glb_con_su_motor(servidor):
    servidor.respuesta = (200, {
        "Content-Type": "model/gltf-binary", "X-Cortex-Motor": "sintetico", "X-Cortex-Motor-Version": "0.1.0",
        "X-Cortex-Estructuras": "27", "X-Cortex-Sintetico": "1",
    }, GLB_FALSO)
    r = cliente.segmentar(b"PK\x03\x04zip", region="columna", modalidad="CT")
    assert r.glb == GLB_FALSO and r.motor == "sintetico" and r.estructuras == 27 and r.sintetico is True
    assert servidor.recibido["ruta"] == "/segmentar?region=columna&modalidad=CT"
    assert servidor.recibido["tipo"] == "application/zip"


def test_cliente_pasa_el_motivo_del_segmentador(servidor):
    servidor.respuesta = (422, {"Content-Type": "application/json"},
                          json.dumps({"detail": "No se encontró columna en el estudio."}).encode())
    with pytest.raises(cliente.ErrorDelSegmentador, match="No se encontró columna"):
        cliente.segmentar(b"x", region="columna", modalidad="CT")


def test_cliente_traduce_un_error_sin_detalle(servidor):
    servidor.respuesta = (502, {"Content-Type": "text/html"}, b"<h1>Bad gateway</h1>")
    with pytest.raises(cliente.ErrorDelSegmentador, match=r"respondió con un error \(502\)"):
        cliente.segmentar(b"x", region="columna", modalidad="CT")


def test_cliente_rechaza_lo_que_no_es_un_glb(servidor):
    servidor.respuesta = (200, {}, b"hola")
    with pytest.raises(cliente.ErrorDelSegmentador, match="no es un modelo 3D"):
        cliente.segmentar(b"x", region="columna", modalidad="CT")


def test_cliente_sin_conexion_lo_dice_en_espanol(monkeypatch):
    monkeypatch.setattr(settings, "SEGMENTADOR_URL", "http://127.0.0.1:9")
    with pytest.raises(cliente.ErrorDelSegmentador, match="No se pudo conectar"):
        cliente.segmentar(b"x", region="columna", modalidad="CT")


def test_cliente_sin_configurar_lo_dice(monkeypatch):
    monkeypatch.setattr(settings, "SEGMENTADOR_URL", "")
    with pytest.raises(cliente.ErrorDelSegmentador, match="no está configurado"):
        cliente.segmentar(b"x", region="columna", modalidad="CT")
