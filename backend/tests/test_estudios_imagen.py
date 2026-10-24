"""Estudios de imagen: ingesta, manifiesto, mediciones y comparabilidad.

Los estudios de prueba se generan con pydicom en memoria: ni un solo dato real.
Lo que se comprueba aquí es lo que puede fallar en silencio en una consulta:

- que un archivo que no es DICOM no entre como estudio,
- que los cortes se ordenen por geometría y no por nombre de archivo,
- que subir dos veces el mismo estudio no lo duplique,
- que el estudio parcial se declare parcial,
- que una medición no confirmada se pueda borrar y una confirmada no.
"""
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian
from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    client,
    db_session,
    escenario,
)

from app.core.storage import LocalStorageBackend
from app.routers import imaging as imaging_router
from app.services.imagen_medica.ingesta import (
    Instancia,
    agrupar,
    comparabilidad,
    detectar_secuencia,
    ordenar_instancias,
    parece_dicom,
)

ESTUDIO = "1.2.840.113619.2.55.3.2026.10.1"
SERIE_T1 = "1.2.840.113619.2.55.3.2026.10.1.1"
SERIE_T2 = "1.2.840.113619.2.55.3.2026.10.1.2"


@pytest.fixture(autouse=True)
def almacen_temporal(tmp_path, monkeypatch):
    """Los estudios de prueba se guardan en un directorio temporal.

    Sin esto, subir un estudio en una prueba escribe carpetas ``tenants/`` dentro
    del repositorio: basura que alguien acaba confundiendo con datos reales.
    """
    monkeypatch.setattr(imaging_router, "default_storage", LocalStorageBackend(root_dir=tmp_path))


def _dicom(
    sop_uid: str,
    *,
    study_uid: str = ESTUDIO,
    series_uid: str = SERIE_T1,
    series_number: int = 1,
    instance_number: int = 1,
    description: str = "t1_ax_post",
    position: tuple[float, float, float] = (0.0, 0.0, 0.0),
    study_date: str = "20260914",
    modality: str = "MR",
) -> bytes:
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.4"
    meta.MediaStorageSOPInstanceUID = sop_uid
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = FileDataset(None, {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = meta.MediaStorageSOPClassUID
    ds.SOPInstanceUID = sop_uid
    ds.PatientName = "PRUEBA^SINTETICA"
    ds.PatientID = "SIN-DATOS-REALES"
    ds.StudyInstanceUID = study_uid
    ds.SeriesInstanceUID = series_uid
    ds.StudyDate = study_date
    ds.Modality = modality
    ds.SeriesNumber = series_number
    ds.InstanceNumber = instance_number
    ds.SeriesDescription = description
    ds.StudyDescription = "RM ENCEFALO"
    ds.InstitutionName = "Hospital de prueba"
    ds.BodyPartExamined = "HEAD"
    ds.Rows = 4
    ds.Columns = 4
    ds.PixelSpacing = [0.5, 0.5]
    ds.SliceThickness = 2.0
    ds.ImagePositionPatient = list(position)
    ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 0
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.PixelData = b"\0" * 32
    buffer = BytesIO()
    ds.save_as(buffer, write_like_original=False)
    return buffer.getvalue()


def _directorio_del_cd() -> bytes:
    """Un ``DICOMDIR``: DICOM de verdad, pero índice y sin cortes."""
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = "1.2.840.10008.1.3.10"
    meta.MediaStorageSOPInstanceUID = "1.2.11.1"
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = FileDataset(None, {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = meta.MediaStorageSOPClassUID
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    buffer = BytesIO()
    ds.save_as(buffer, write_like_original=False)
    return buffer.getvalue()


def _instancia(**kwargs) -> Instancia:
    return Instancia(
        sop_instance_uid=kwargs.get("sop", "1.2.3"),
        series_instance_uid=kwargs.get("serie", SERIE_T1),
        study_instance_uid=kwargs.get("estudio", ESTUDIO),
        series_number=kwargs.get("series_number", 1),
        instance_number=kwargs.get("instance_number", 1),
        modality="MR",
        series_description=kwargs.get("description", "t1_ax"),
        study_description=None,
        study_date=None,
        institution=None,
        accession=None,
        body_part=None,
        rows=512,
        columns=512,
        pixel_spacing=(0.5, 0.5),
        slice_thickness=2.0,
        image_position=kwargs.get("position"),
        image_orientation=(1, 0, 0, 0, 1, 0) if kwargs.get("position") else None,
        image_type=(),
    )


# ---------------------------------------------------------------------------
# Detección y orden
# ---------------------------------------------------------------------------


def test_solo_es_dicom_lo_que_trae_la_cabecera():
    assert parece_dicom(_dicom("1.2.3.4"))
    assert not parece_dicom(b"\xff\xd8\xff" + b"\0" * 200)
    assert not parece_dicom(b"corto")


def test_los_cortes_se_ordenan_por_geometria_aunque_el_numero_venga_al_reves():
    # Un equipo escribió InstanceNumber al revés; la posición manda.
    arriba = _instancia(sop="a", position=(0, 0, 40), instance_number=1)
    medio = _instancia(sop="b", position=(0, 0, 20), instance_number=3)
    abajo = _instancia(sop="c", position=(0, 0, 0), instance_number=2)

    ordenadas, criterio = ordenar_instancias([arriba, medio, abajo])

    assert criterio == "posicion"
    assert [i.sop_instance_uid for i in ordenadas] == ["c", "b", "a"]


def test_sin_geometria_se_usa_el_numero_y_se_dice():
    ordenadas, criterio = ordenar_instancias(
        [_instancia(sop="segundo", instance_number=2), _instancia(sop="primero", instance_number=1)]
    )

    assert criterio == "numero_de_instancia"
    assert [i.sop_instance_uid for i in ordenadas] == ["primero", "segundo"]


@pytest.mark.parametrize(
    "descripcion, esperado",
    [
        ("t1_ax_post", "T1+C"),
        ("T1 SAG", "T1"),
        ("t2_tse_sag", "T2"),
        ("FLAIR axial", "FLAIR"),
        ("dwi b1000", "DWI"),
        ("ADC map", "ADC"),
        ("TOF MRA", "TOF"),
        ("SWI", "SWI"),
        ("ser0001", None),
        ("", None),
    ],
)
def test_la_secuencia_se_detecta_sin_inventar(descripcion, esperado):
    etiqueta, _ = detectar_secuencia(descripcion)
    assert etiqueta == esperado


def test_agrupar_separa_series_del_mismo_estudio():
    estudios = agrupar(
        [
            _instancia(sop="a1", serie=SERIE_T1, position=(0, 0, 0)),
            _instancia(sop="a2", serie=SERIE_T1, position=(0, 0, 2)),
            _instancia(sop="b1", serie=SERIE_T2, series_number=2, description="t2_ax"),
        ]
    )

    assert len(estudios) == 1
    assert [s.series_number for s in estudios[0].series] == [1, 2]
    assert estudios[0].instancias == 3


def test_comparabilidad_avisa_lo_que_falta():
    actual = agrupar([_instancia(sop="a", serie=SERIE_T1, description="t1_ax")])[0]
    previo = agrupar(
        [
            _instancia(sop="b", serie=SERIE_T1, description="t1_ax_post"),
            _instancia(sop="c", serie=SERIE_T2, series_number=2, description="flair"),
        ]
    )[0]

    avisos = comparabilidad(actual, previo)

    assert any("FLAIR" in aviso for aviso in avisos)
    assert any("contraste" in aviso for aviso in avisos)


# ---------------------------------------------------------------------------
# Ingesta por HTTP
# ---------------------------------------------------------------------------


def _subir(client, cabeceras, paciente_id, archivos):
    return client.post(
        f"{PREFIX}/patients/{paciente_id}/imaging/upload",
        headers=cabeceras,
        files=[("archivos", (nombre, datos, "application/dicom")) for nombre, datos in archivos],
    )


def test_subir_un_estudio_lo_deja_visible_y_no_lo_duplica(client, db_session, escenario):
    cabeceras = _auth_headers(db_session, escenario["doctora"])
    paciente = escenario["paciente"]
    cortes = [
        ("corte2.dcm", _dicom("1.2.3.2", instance_number=2, position=(0, 0, 2))),
        ("corte1.dcm", _dicom("1.2.3.1", instance_number=1, position=(0, 0, 0))),
    ]

    respuesta = _subir(client, cabeceras, paciente.id, cortes)

    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert len(cuerpo["creados"]) == 1
    assert cuerpo["creados"][0]["series_count"] == 1
    assert cuerpo["creados"][0]["instance_count"] == 2
    assert cuerpo["creados"][0]["status"] == "ready"

    listado = client.get(
        f"{PREFIX}/patients/{paciente.id}/imaging/studies", headers=cabeceras
    )
    assert listado.status_code == 200
    assert len(listado.json()) == 1

    otra_vez = _subir(client, cabeceras, paciente.id, cortes)
    assert otra_vez.status_code == 201
    assert otra_vez.json()["creados"] == []
    assert len(otra_vez.json()["ya_existentes"]) == 1


def test_los_cortes_se_sirven_en_orden_y_sin_tocarlos(client, db_session, escenario):
    cabeceras = _auth_headers(db_session, escenario["doctora"])
    paciente = escenario["paciente"]
    primero = _dicom("1.2.9.1", instance_number=9, position=(0, 0, 0))
    segundo = _dicom("1.2.9.2", instance_number=1, position=(0, 0, 2))
    _subir(client, cabeceras, paciente.id, [("b.dcm", segundo), ("a.dcm", primero)])

    estudios = client.get(
        f"{PREFIX}/patients/{paciente.id}/imaging/studies", headers=cabeceras
    ).json()
    detalle = client.get(
        f"{PREFIX}/imaging/studies/{estudios[0]['id']}", headers=cabeceras
    ).json()
    assert detalle["series"][0]["has_geometry"] is True
    assert detalle["series"][0]["sequence_label"] == "T1+C"

    manifiesto = client.get(
        f"{PREFIX}/imaging/series/{detalle['series'][0]['id']}/manifest", headers=cabeceras
    ).json()
    assert manifiesto["ordered_by"] == "posicion"
    assert [i["sop_instance_uid"] for i in manifiesto["instances"]] == ["1.2.9.1", "1.2.9.2"]

    corte = client.get(manifiesto["instances"][0]["url"].replace("/imaging", f"{PREFIX}/imaging", 1), headers=cabeceras)
    assert corte.status_code == 200
    assert corte.headers["content-type"] == "application/dicom"
    assert corte.content == primero


def test_lo_que_no_es_dicom_no_entra_como_estudio(client, db_session, escenario):
    cabeceras = _auth_headers(db_session, escenario["doctora"])
    respuesta = _subir(
        client,
        cabeceras,
        escenario["paciente"].id,
        [("foto.jpg", b"\xff\xd8\xff" + b"\0" * 500)],
    )

    assert respuesta.status_code == 400
    assert "documento" in respuesta.json()["detail"]


def test_el_zip_con_el_estudio_entra_completo(client, db_session, escenario):
    cabeceras = _auth_headers(db_session, escenario["doctora"])
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as zip_file:
        zip_file.writestr("DICOM/IM_0001", _dicom("1.2.7.1", instance_number=1, position=(0, 0, 0)))
        zip_file.writestr("DICOM/IM_0002", _dicom("1.2.7.2", instance_number=2, position=(0, 0, 2)))

    respuesta = client.post(
        f"{PREFIX}/patients/{escenario['paciente'].id}/imaging/upload-archive",
        headers=cabeceras,
        files={"archivo": ("estudio.zip", buffer.getvalue(), "application/zip")},
    )

    assert respuesta.status_code == 201, respuesta.text
    assert respuesta.json()["creados"][0]["instance_count"] == 2


def test_el_indice_del_cd_no_vuelve_incompleto_el_estudio(client, db_session, escenario):
    """Un CD real trae DICOMDIR y a veces autorun: no son imágenes.

    Contarlos como fallo marcaba «llegó incompleto» cualquier estudio real. Se
    vio con un estudio de 90 cortes parejos a 2 mm y cero huecos.
    """
    cabeceras = _auth_headers(db_session, escenario["doctora"])
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as zip_file:
        zip_file.writestr("DICOM/IM_0001", _dicom("1.2.9.1", instance_number=1, position=(0, 0, 0)))
        zip_file.writestr("DICOM/IM_0002", _dicom("1.2.9.2", instance_number=2, position=(0, 0, 2)))
        zip_file.writestr("DICOMDIR", _directorio_del_cd())
        zip_file.writestr("AUTORUN.INF", b"[autorun]\r\nopen=visor.exe\r\n")

    respuesta = client.post(
        f"{PREFIX}/patients/{escenario['paciente'].id}/imaging/upload-archive",
        headers=cabeceras,
        files={"archivo": ("estudio.zip", buffer.getvalue(), "application/zip")},
    )

    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["creados"][0]["instance_count"] == 2
    assert cuerpo["creados"][0]["status"] == "ready"
    assert cuerpo["creados"][0]["status_detail"] is None
    assert cuerpo["archivos_ajenos"] == 2
    assert cuerpo["archivos_descartados"] == 0


def test_un_dicom_roto_si_deja_el_estudio_incompleto(client, db_session, escenario):
    """Callar esto sí sería mentir: puede faltar un corte."""
    cabeceras = _auth_headers(db_session, escenario["doctora"])
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as zip_file:
        zip_file.writestr("DICOM/IM_0001", _dicom("1.2.10.1", instance_number=1, position=(0, 0, 0)))
        zip_file.writestr("DICOM/IM_0002", _dicom("1.2.10.2", instance_number=2, position=(0, 0, 2)))
        zip_file.writestr("DICOM/IM_0003", b"\0" * 128 + b"DICM" + b"basura" * 40)

    respuesta = client.post(
        f"{PREFIX}/patients/{escenario['paciente'].id}/imaging/upload-archive",
        headers=cabeceras,
        files={"archivo": ("estudio.zip", buffer.getvalue(), "application/zip")},
    )

    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["creados"][0]["status"] == "partial"
    assert "no se pudieron leer" in cuerpo["creados"][0]["status_detail"]
    assert cuerpo["archivos_descartados"] == 1
    assert cuerpo["archivos_ajenos"] == 0


def test_una_medicion_se_guarda_y_solo_cuenta_al_confirmarla(client, db_session, escenario):
    cabeceras = _auth_headers(db_session, escenario["doctora"])
    paciente = escenario["paciente"]
    _subir(client, cabeceras, paciente.id, [("a.dcm", _dicom("1.2.8.1"))])
    estudio = client.get(
        f"{PREFIX}/patients/{paciente.id}/imaging/studies", headers=cabeceras
    ).json()[0]

    creada = client.post(
        f"{PREFIX}/imaging/studies/{estudio['id']}/annotations",
        headers=cabeceras,
        json={
            "kind": "length",
            "geometry": {"from": [10, 10], "to": [40, 10], "slice": 3},
            "value": 18.4,
            "unit": "mm",
            "label": "Lesión frontal izquierda",
        },
    )
    assert creada.status_code == 201, creada.text
    assert creada.json()["is_confirmed"] is False

    confirmada = client.post(
        f"{PREFIX}/imaging/annotations/{creada.json()['id']}/confirm", headers=cabeceras
    )
    assert confirmada.status_code == 200
    assert confirmada.json()["is_confirmed"] is True

    intento = client.delete(
        f"{PREFIX}/imaging/annotations/{creada.json()['id']}", headers=cabeceras
    )
    assert intento.status_code == 409


def test_los_candidatos_a_comparar_avisan_si_falta_una_secuencia(client, db_session, escenario):
    cabeceras = _auth_headers(db_session, escenario["doctora"])
    paciente = escenario["paciente"]

    _subir(
        client,
        cabeceras,
        paciente.id,
        [
            ("t1.dcm", _dicom("1.2.5.1", study_date="20260110")),
            ("flair.dcm", _dicom("1.2.5.2", study_date="20260110", series_uid=SERIE_T2, series_number=2, description="flair")),
        ],
    )
    _subir(
        client,
        cabeceras,
        paciente.id,
        [("t1b.dcm", _dicom("1.2.6.1", study_uid="1.2.840.113619.2.55.3.2026.10.2", study_date="20260914"))],
    )

    estudios = client.get(
        f"{PREFIX}/patients/{paciente.id}/imaging/studies", headers=cabeceras
    ).json()
    actual = next(e for e in estudios if e["study_date"].startswith("2026-09-14"))

    candidatos = client.get(
        f"{PREFIX}/imaging/studies/{actual['id']}/comparison-candidates", headers=cabeceras
    )

    assert candidatos.status_code == 200
    assert candidatos.json()
    assert any("FLAIR" in aviso for aviso in candidatos.json()[0]["avisos"])
