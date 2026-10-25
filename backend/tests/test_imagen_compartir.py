"""Cortes clave, hoja en PDF y enlaces temporales de los estudios de imagen.

Lo que no puede fallar en silencio:

- que un enlace compartido **no lleve la identidad del paciente** en el archivo,
- que un enlace venza, se pueda revocar y no revele por qué falló,
- que no se cree un enlace sin confirmar el consentimiento,
- que el original guardado no se modifique al compartirlo,
- que marcar dos veces el mismo corte no lo duplique.

Los estudios son sintéticos (pydicom en memoria): ni un dato real.
"""
import re
from datetime import timedelta
from io import BytesIO

import pydicom
import pytest
from test_estudios_imagen import _dicom, _subir
from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    client,
    db_session,
    escenario,
)

from app.core.storage import LocalStorageBackend
from app.db.session import utcnow
from app.models.audit_log import AuditLog
from app.models.imaging import ImagingShareLink
from app.routers import imaging as imaging_router
from app.routers import imaging_compartir
from app.services.imagen_medica.desidentificar import declara_texto_grabado, desidentificar

PNG_VALIDO = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def _texto_del_pdf(contenido: bytes) -> str:
    """El texto del PDF sin comprimir, con los acentos ya resueltos.

    ReportLab escribe los caracteres fuera de ASCII como secuencias octales
    (p. ej. ``\\355`` para la «í»), no como bytes literales.
    """
    return re.sub(
        r"\\([0-7]{3})", lambda m: chr(int(m.group(1), 8)), contenido.decode("latin-1")
    )


@pytest.fixture(autouse=True)
def almacen_temporal(tmp_path, monkeypatch):
    """Un solo almacén temporal para la ingesta y para lo que se comparte."""
    almacen = LocalStorageBackend(root_dir=tmp_path)
    monkeypatch.setattr(imaging_router, "default_storage", almacen)
    monkeypatch.setattr(imaging_compartir, "default_storage", almacen)
    return almacen


@pytest.fixture
def estudio(client, db_session, escenario):
    """Un estudio con una serie de 3 cortes, ya subido."""
    cabeceras = _auth_headers(db_session, escenario["doctora"])
    cortes = [
        (f"c{n}.dcm", _dicom(f"1.2.3.{n}", instance_number=n, position=(0, 0, n)))
        for n in (1, 2, 3)
    ]
    assert _subir(client, cabeceras, escenario["paciente"].id, cortes).status_code == 201
    estudios = client.get(
        f"{PREFIX}/patients/{escenario['paciente'].id}/imaging/studies", headers=cabeceras
    ).json()
    detalle = client.get(f"{PREFIX}/imaging/studies/{estudios[0]['id']}", headers=cabeceras).json()
    return {"id": detalle["id"], "serie_id": detalle["series"][0]["id"], "cabeceras": cabeceras}


def _marcar(client, estudio, indice=1, **extra):
    datos = {"series_id": estudio["serie_id"], "instance_index": indice, **extra}
    archivos = {"imagen": ("c.png", PNG_VALIDO, "image/png")} if extra.pop("con_imagen", False) else None
    return client.post(
        f"{PREFIX}/imaging/studies/{estudio['id']}/key-images",
        headers=estudio["cabeceras"],
        data={k: str(v) for k, v in datos.items()},
        files=archivos,
    )


# ── Cortes clave ────────────────────────────────────────────────────────────


def test_marcar_dos_veces_el_mismo_corte_no_lo_duplica(client, estudio):
    primera = _marcar(client, estudio, 1, label="Lesión frontal")
    assert primera.status_code == 201, primera.text
    segunda = _marcar(client, estudio, 1, label="Lesión frontal derecha", notes="Crece")
    assert segunda.status_code == 200
    assert segunda.json()["id"] == primera.json()["id"]
    assert segunda.json()["label"] == "Lesión frontal derecha"
    lista = client.get(
        f"{PREFIX}/imaging/studies/{estudio['id']}/key-images", headers=estudio["cabeceras"]
    ).json()
    assert len(lista) == 1


def test_la_captura_se_guarda_y_se_puede_ver(client, estudio):
    marcada = _marcar(client, estudio, 0, con_imagen=True)
    assert marcada.status_code == 201, marcada.text
    assert marcada.json()["has_image"] is True
    imagen = client.get(
        f"{PREFIX}/imaging/key-images/{marcada.json()['id']}/image", headers=estudio["cabeceras"]
    )
    assert imagen.status_code == 200
    assert imagen.headers["content-type"] == "image/png"
    assert imagen.content == PNG_VALIDO
    assert "no-store" in imagen.headers["cache-control"]


def test_solo_se_acepta_png_en_la_captura(client, estudio):
    respuesta = client.post(
        f"{PREFIX}/imaging/studies/{estudio['id']}/key-images",
        headers=estudio["cabeceras"],
        data={"series_id": str(estudio["serie_id"]), "instance_index": "0"},
        files={"imagen": ("c.jpg", b"\xff\xd8\xff\xe0" + b"0" * 32, "image/jpeg")},
    )
    assert respuesta.status_code == 400
    assert "PNG" in respuesta.json()["detail"]


def test_un_corte_que_no_existe_no_se_marca(client, estudio):
    assert _marcar(client, estudio, 99).status_code == 400


def test_borrar_un_corte_clave_quita_tambien_su_captura(client, estudio, almacen_temporal):
    marcada = _marcar(client, estudio, 2, con_imagen=True).json()
    ruta = f"tenants/{1}/"  # sólo para que falle claro si el prefijo cambia
    borrado = client.delete(
        f"{PREFIX}/imaging/key-images/{marcada['id']}", headers=estudio["cabeceras"]
    )
    assert borrado.status_code == 204, ruta
    assert (
        client.get(
            f"{PREFIX}/imaging/key-images/{marcada['id']}/image", headers=estudio["cabeceras"]
        ).status_code
        == 404
    )


def test_recepcion_no_marca_cortes_clave(client, db_session, escenario, estudio):
    cabeceras = _auth_headers(db_session, escenario["secretaria"])
    respuesta = client.post(
        f"{PREFIX}/imaging/studies/{estudio['id']}/key-images",
        headers=cabeceras,
        data={"series_id": str(estudio["serie_id"]), "instance_index": "0"},
    )
    assert respuesta.status_code == 403


# ── Hoja en PDF ─────────────────────────────────────────────────────────────


def test_la_hoja_en_pdf_pide_antes_un_corte_con_captura(client, estudio):
    _marcar(client, estudio, 0)  # sin captura
    respuesta = client.post(
        f"{PREFIX}/imaging/studies/{estudio['id']}/export-pdf",
        headers=estudio["cabeceras"],
        json={},
    )
    assert respuesta.status_code == 400
    assert "captura" in respuesta.json()["detail"].lower()


def test_la_hoja_en_pdf_lleva_la_leyenda_y_respeta_el_modo_anonimo(client, db_session, escenario, estudio):
    from reportlab.lib.utils import ImageReader  # noqa: F401  (reportlab disponible)

    from PIL import Image

    buffer = BytesIO()
    Image.new("RGB", (40, 40), (10, 20, 30)).save(buffer, format="PNG")
    marcada = client.post(
        f"{PREFIX}/imaging/studies/{estudio['id']}/key-images",
        headers=estudio["cabeceras"],
        data={"series_id": str(estudio["serie_id"]), "instance_index": "1", "label": "Lesión"},
        files={"imagen": ("c.png", buffer.getvalue(), "image/png")},
    )
    assert marcada.status_code == 201, marcada.text

    nombre = escenario["paciente"].first_name
    con_nombre = client.post(
        f"{PREFIX}/imaging/studies/{estudio['id']}/export-pdf", headers=estudio["cabeceras"], json={}
    )
    assert con_nombre.status_code == 200, con_nombre.text
    assert con_nombre.content.startswith(b"%PDF")
    texto = _texto_del_pdf(con_nombre.content)
    assert "No es un informe" in texto
    assert nombre in texto

    anonimo = client.post(
        f"{PREFIX}/imaging/studies/{estudio['id']}/export-pdf",
        headers=estudio["cabeceras"],
        json={"anonimo": True},
    )
    assert anonimo.status_code == 200
    texto_anonimo = _texto_del_pdf(anonimo.content)
    assert nombre not in texto_anonimo
    assert "Paciente anónimo" in texto_anonimo


# ── Enlaces temporales ──────────────────────────────────────────────────────


def _crear_enlace(client, estudio, **cuerpo):
    return client.post(
        f"{PREFIX}/imaging/studies/{estudio['id']}/share-links",
        headers=estudio["cabeceras"],
        json={"hours": 24, "consent_confirmed": True, **cuerpo},
    )


def test_sin_consentimiento_no_se_crea_el_enlace(client, estudio):
    respuesta = _crear_enlace(client, estudio, consent_confirmed=False)
    assert respuesta.status_code == 400
    assert "consentimiento" in respuesta.json()["detail"]


def test_un_enlace_no_dura_mas_de_una_semana(client, estudio):
    assert _crear_enlace(client, estudio, hours=169).status_code == 422
    assert _crear_enlace(client, estudio, hours=0).status_code == 422


def test_el_enlace_se_abre_sin_sesion_y_no_trae_identidad(client, db_session, escenario, estudio):
    creado = _crear_enlace(client, estudio, note="Dr. Ramírez, interconsulta")
    assert creado.status_code == 201, creado.text
    token = creado.json()["token"]
    assert len(token) >= 40
    # En la base queda el hash, no el token.
    guardado = db_session.query(ImagingShareLink).one()
    assert guardado.token_hash != token and token not in guardado.token_hash

    resumen = client.get(f"{PREFIX}/public/imaging/shared/{token}")  # sin cabeceras
    assert resumen.status_code == 200, resumen.text
    cuerpo = resumen.json()
    assert cuerpo["series"][0]["instance_count"] == 3
    texto = resumen.text
    assert escenario["paciente"].first_name not in texto
    assert escenario["paciente"].last_name not in texto
    assert "Hospital de prueba" not in texto
    assert "no es un informe" in cuerpo["aviso"].lower()
    assert "no-store" in resumen.headers["cache-control"]
    assert "noindex" in resumen.headers["x-robots-tag"]

    db_session.refresh(guardado)
    assert guardado.access_count == 1 and guardado.last_access_at is not None


def test_el_manifiesto_publico_no_filtra_la_ruta_interna(client, estudio):
    token = _crear_enlace(client, estudio).json()["token"]
    manifiesto = client.get(
        f"{PREFIX}/public/imaging/shared/{token}/series/{estudio['serie_id']}/manifest"
    )
    assert manifiesto.status_code == 200
    cortes = manifiesto.json()["instances"]
    assert len(cortes) == 3
    assert all("path" not in c for c in cortes)
    assert "patients/" not in manifiesto.text and "tenants/" not in manifiesto.text
    assert all(c["url"].startswith(f"/public/imaging/shared/{token}/") for c in cortes)


def test_el_corte_compartido_sale_sin_identidad_y_el_original_no_se_toca(
    client, almacen_temporal, estudio
):
    token = _crear_enlace(client, estudio).json()["token"]
    compartido = client.get(
        f"{PREFIX}/public/imaging/shared/{token}/series/{estudio['serie_id']}/instances/1.2.3.1"
    )
    assert compartido.status_code == 200
    assert compartido.headers["content-type"] == "application/dicom"
    ds = pydicom.dcmread(BytesIO(compartido.content))
    assert str(ds.PatientName) == "ANONIMO"
    assert str(ds.PatientID) == "ANONIMO"
    assert str(ds.InstitutionName) == ""
    assert ds.PatientIdentityRemoved == "YES"
    # Lo útil se conserva: la geometría, el espaciado y los píxeles.
    assert [float(v) for v in ds.PixelSpacing] == [0.5, 0.5]
    assert ds.PixelData == b"\0" * 32
    assert str(ds.StudyDate) == "20260914"

    # El archivo guardado en el consultorio sigue con sus datos originales.
    rutas = [r for r in almacen_temporal.root_dir.rglob("*.dcm")]
    originales = [pydicom.dcmread(r) for r in rutas if "1.2.3.1" in r.name]
    assert originales and str(originales[0].PatientName) == "PRUEBA^SINTETICA"


def test_un_enlace_revocado_deja_de_funcionar(client, estudio):
    creado = _crear_enlace(client, estudio).json()
    url = f"{PREFIX}/public/imaging/shared/{creado['token']}"
    assert client.get(url).status_code == 200

    revocado = client.post(
        f"{PREFIX}/imaging/share-links/{creado['id']}/revoke", headers=estudio["cabeceras"]
    )
    assert revocado.status_code == 200
    assert revocado.json()["estado"] == "revocado"
    assert client.get(url).status_code == 404
    assert client.get(f"{url}/series/{estudio['serie_id']}/manifest").status_code == 404


def test_un_enlace_vencido_no_funciona_y_no_dice_por_que(client, db_session, estudio):
    creado = _crear_enlace(client, estudio).json()
    enlace = db_session.query(ImagingShareLink).one()
    enlace.expires_at = utcnow() - timedelta(minutes=1)
    db_session.commit()

    vencido = client.get(f"{PREFIX}/public/imaging/shared/{creado['token']}")
    inexistente = client.get(f"{PREFIX}/public/imaging/shared/{'x' * 43}")
    assert vencido.status_code == inexistente.status_code == 404
    # Mismo mensaje: a quien no tiene el enlace no se le dan pistas.
    assert vencido.json()["detail"] == inexistente.json()["detail"]


def test_el_enlace_solo_abre_las_series_de_su_estudio(client, estudio):
    token = _crear_enlace(client, estudio).json()["token"]
    ajena = client.get(f"{PREFIX}/public/imaging/shared/{token}/series/999999/manifest")
    assert ajena.status_code == 404


def test_crear_y_abrir_un_enlace_queda_en_la_bitacora(client, db_session, estudio):
    token = _crear_enlace(client, estudio).json()["token"]
    client.get(f"{PREFIX}/public/imaging/shared/{token}")
    acciones = {a.action for a in db_session.query(AuditLog).all()}
    assert {"imaging_share_link_create", "imaging_share_link_open"} <= acciones


def test_recepcion_no_comparte_estudios(client, db_session, escenario, estudio):
    cabeceras = _auth_headers(db_session, escenario["secretaria"])
    respuesta = client.post(
        f"{PREFIX}/imaging/studies/{estudio['id']}/share-links",
        headers=cabeceras,
        json={"hours": 24, "consent_confirmed": True},
    )
    assert respuesta.status_code == 403


def test_la_lista_de_enlaces_dice_el_estado_de_cada_uno(client, db_session, estudio):
    _crear_enlace(client, estudio)
    creado = _crear_enlace(client, estudio).json()
    client.post(f"{PREFIX}/imaging/share-links/{creado['id']}/revoke", headers=estudio["cabeceras"])
    lista = client.get(
        f"{PREFIX}/imaging/studies/{estudio['id']}/share-links", headers=estudio["cabeceras"]
    ).json()
    assert sorted(e["estado"] for e in lista) == ["activo", "revocado"]
    assert all("token" not in e for e in lista)  # el token no se vuelve a mostrar


# ── Desidentificación ───────────────────────────────────────────────────────


def test_desidentificar_quita_datos_y_etiquetas_privadas():
    original = _dicom("1.2.9.1")
    ds = pydicom.dcmread(BytesIO(original))
    ds.PatientBirthDate = "19800101"
    ds.ReferringPhysicianName = "DR^REAL"
    ds.add_new(0x00090010, "LO", "FABRICANTE")
    ds.add_new(0x00091001, "LO", "dato privado")
    buffer = BytesIO()
    ds.save_as(buffer)

    limpio = pydicom.dcmread(BytesIO(desidentificar(buffer.getvalue())))
    assert str(limpio.PatientBirthDate) == ""
    assert str(limpio.ReferringPhysicianName) == ""
    assert 0x00091001 not in limpio


def test_desidentificar_no_sirve_algo_que_no_es_dicom():
    with pytest.raises(ValueError):
        desidentificar(b"esto no es un DICOM")


def test_se_detecta_el_texto_grabado_si_el_equipo_lo_declara():
    ds = pydicom.dcmread(BytesIO(_dicom("1.2.9.2")))
    assert declara_texto_grabado(_con_texto_grabado(ds, "YES")) is True
    assert declara_texto_grabado(_con_texto_grabado(ds, "NO")) is False


def _con_texto_grabado(ds, valor):
    ds.BurnedInAnnotation = valor
    buffer = BytesIO()
    ds.save_as(buffer)
    return buffer.getvalue()
