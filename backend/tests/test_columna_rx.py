"""Columna desde radiografías (Cortex): lo que no puede fallar en silencio.

- Las mediciones que se guardan las calcula el servidor, no el navegador.
- Con una serie DICOM, el espaciado del píxel lo lee el servidor de la serie.
- La imagen de origen tiene que ser de este paciente y una radiografía.
- Solo el médico dueño del expediente ve y guarda; recepción y administración no.
- Anular no borra: el ajuste sigue ahí con quién, cuándo y por qué.
- Guardar y anular quedan en la bitácora sin los puntos; leer, en la de accesos.
"""
import copy
import json
from pathlib import Path

from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    client,
    db_session,
    escenario,
)

from app.db.session import utcnow
from app.models.acceso_clinico import AccesoClinico
from app.models.audit_log import AuditLog
from app.models.clinical_image import ClinicalImage
from app.models.columna_ajuste_rx import ColumnaAjusteRx
from app.models.imaging import ImagingSeries, ImagingStudy
from app.models.patient import Patient
from app.services import columna_rx

PARIDAD = json.loads(
    (Path(__file__).resolve().parents[2] / "frontend" / "src" / "modules" / "neuro3d" / "dominio" / "paridadRx.json")
    .read_text(encoding="utf-8")
)
CASO = next(c for c in PARIDAD["casos"] if c["nota"] == "lateral completa con lordosis 50 y pelvis")
SIN_ESCALA = {"lateral": {"tipo": "ninguna"}, "ap": {"tipo": "ninguna"}}
OPCIONES = {"derechaDelPaciente": "izquierda", "cobbCoronal": None}


def _ruta(escenario, sufijo=""):
    return f"{PREFIX}/patients/{escenario['paciente'].id}/columna-rx{sufijo}"


def _foto(db_session, escenario, paciente=None):
    paciente = paciente or escenario["paciente"]
    imagen = ClinicalImage(
        tenant_id=paciente.tenant_id, patient_id=paciente.id,
        uploaded_by_user_id=escenario["doctora"].id, category="reference",
        file_path="x/placa.jpg", file_name="placa.jpg", file_size=10, mime_type="image/jpeg",
    )
    db_session.add(imagen)
    db_session.commit()
    return imagen


def _serie(db_session, escenario, modalidad="DX", espaciado=(0.2, 0.1)):
    estudio = ImagingStudy(
        tenant_id=escenario["tenant"].id, patient_id=escenario["paciente"].id,
        uploaded_by_user_id=escenario["doctora"].id, study_instance_uid=f"1.2.3.{modalidad}",
        modality=modalidad, study_date=utcnow(), storage_prefix="estudios/1",
    )
    db_session.add(estudio)
    db_session.commit()
    serie = ImagingSeries(
        tenant_id=escenario["tenant"].id, study_id=estudio.id, series_instance_uid="1.2.3.4",
        modality=modalidad,
        # Como la ingesta: PixelSpacing[0] (filas) en _x y [1] (columnas) en _y.
        pixel_spacing_x=espaciado[0] if espaciado else None,
        pixel_spacing_y=espaciado[1] if espaciado else None,
    )
    db_session.add(serie)
    db_session.commit()
    return serie


def _guardar(client, cabeceras, escenario, lateral=None, ap=None, puntos=None, calibracion=None, opciones=None, **extra):
    cuerpo = {
        "lateral": lateral,
        "ap": ap,
        "puntos": puntos if puntos is not None else CASO["marcas"],
        "calibracion": calibracion or SIN_ESCALA,
        "opciones": opciones or OPCIONES,
        **extra,
    }
    return client.post(_ruta(escenario), headers=cabeceras, json=cuerpo)


def _doctora(db_session, escenario):
    return _auth_headers(db_session, escenario["doctora"])


# ── El servidor calcula ────────────────────────────────────────────────────


def test_las_mediciones_las_calcula_el_servidor(client, db_session, escenario):
    foto = _foto(db_session, escenario)
    respuesta = _guardar(
        client, _doctora(db_session, escenario), escenario,
        lateral={"tipo": "imagen_clinica", "id": foto.id},
        mediciones={"lordosisLumbar": {"grados": 99}},
    )
    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["mediciones"] == CASO["esperado"]
    assert cuerpo["mediciones"]["lordosisLumbar"]["grados"] == 50
    assert cuerpo["version_calculo"] == columna_rx.VERSION_CALCULO_RX
    fila = db_session.query(ColumnaAjusteRx).one()
    assert fila.lateral_origen == "imagen_clinica" and fila.lateral_origen_id == foto.id
    assert fila.ap_origen is None
    assert fila.doctor_id == escenario["doctora"].id
    assert fila.puntos == CASO["marcas"]


def test_con_dicom_el_espaciado_lo_pone_el_servidor(client, db_session, escenario):
    serie = _serie(db_session, escenario, espaciado=(0.2, 0.1))
    respuesta = _guardar(
        client, _doctora(db_session, escenario), escenario,
        lateral={"tipo": "serie_dicom", "id": serie.id},
        calibracion={"lateral": {"tipo": "dicom", "mmPorPxX": 4, "mmPorPxY": 4}, "ap": {"tipo": "ninguna"}},
    )
    assert respuesta.status_code == 201, respuesta.text
    # Columnas (x) 0.1 mm, filas (y) 0.2 mm: lo que dice la serie, no el navegador.
    assert respuesta.json()["calibracion"]["lateral"] == {"tipo": "dicom", "mmPorPxX": 0.1, "mmPorPxY": 0.2}


def test_una_foto_no_puede_decir_que_trae_escala_de_dicom(client, db_session, escenario):
    foto = _foto(db_session, escenario)
    respuesta = _guardar(
        client, _doctora(db_session, escenario), escenario,
        lateral={"tipo": "imagen_clinica", "id": foto.id},
        calibracion={"lateral": {"tipo": "dicom", "mmPorPxX": 0.1, "mmPorPxY": 0.1}, "ap": {"tipo": "ninguna"}},
    )
    assert respuesta.status_code == 400
    assert "es una foto" in respuesta.json()["detail"]


def test_una_serie_sin_espaciado_no_inventa_milimetros(client, db_session, escenario):
    serie = _serie(db_session, escenario, espaciado=None)
    respuesta = _guardar(
        client, _doctora(db_session, escenario), escenario,
        lateral={"tipo": "serie_dicom", "id": serie.id},
        calibracion={"lateral": {"tipo": "dicom", "mmPorPxX": 0.1, "mmPorPxY": 0.1}, "ap": {"tipo": "ninguna"}},
    )
    assert respuesta.status_code == 400
    assert "no trae espaciado" in respuesta.json()["detail"]


def test_una_tomografia_no_es_una_radiografia(client, db_session, escenario):
    serie = _serie(db_session, escenario, modalidad="CT")
    respuesta = _guardar(
        client, _doctora(db_session, escenario), escenario, lateral={"tipo": "serie_dicom", "id": serie.id},
    )
    assert respuesta.status_code == 400
    assert "no una radiografía (CR o DX)" in respuesta.json()["detail"]


def test_la_imagen_tiene_que_ser_de_este_paciente(client, db_session, escenario):
    otro = Patient(
        tenant_id=escenario["tenant"].id, first_name="Otro", last_name="Paciente",
        owner_doctor_id=escenario["doctora"].id,
    )
    db_session.add(otro)
    db_session.commit()
    ajena = _foto(db_session, escenario, paciente=otro)
    respuesta = _guardar(
        client, _doctora(db_session, escenario), escenario, lateral={"tipo": "imagen_clinica", "id": ajena.id},
    )
    assert respuesta.status_code == 400
    assert "no es de este paciente" in respuesta.json()["detail"]
    assert db_session.query(ColumnaAjusteRx).count() == 0


def test_sin_radiografia_no_se_guarda(client, db_session, escenario):
    respuesta = _guardar(client, _doctora(db_session, escenario), escenario)
    assert respuesta.status_code == 400
    assert "al menos una radiografía" in respuesta.json()["detail"]


def test_puntos_en_una_vista_sin_imagen_se_rechazan(client, db_session, escenario):
    foto = _foto(db_session, escenario)
    puntos = copy.deepcopy(CASO["marcas"])
    puntos["ap"]["vertebras"]["L1"] = {"si": {"x": 1, "y": 1}, "sd": {"x": 9, "y": 1}}
    respuesta = _guardar(
        client, _doctora(db_session, escenario), escenario,
        lateral={"tipo": "imagen_clinica", "id": foto.id}, puntos=puntos,
    )
    assert respuesta.status_code == 400
    assert "en la AP sin una radiografía" in respuesta.json()["detail"]


def test_puntos_raros_se_rechazan_en_espanol_nombrando_la_vertebra(client, db_session, escenario):
    foto = _foto(db_session, escenario)
    puntos = copy.deepcopy(CASO["marcas"])
    puntos["lateral"]["vertebras"]["L9"] = {"sa": {"x": 1, "y": 1}}
    puntos["lateral"]["vertebras"]["L3"]["zz"] = {"x": 1, "y": 1}
    puntos["lateral"]["vertebras"]["L4"]["sa"] = {"x": 1e9, "y": 1}
    respuesta = _guardar(
        client, _doctora(db_session, escenario), escenario,
        lateral={"tipo": "imagen_clinica", "id": foto.id}, puntos=puntos,
    )
    assert respuesta.status_code == 400
    detalle = respuesta.json()["detail"]
    assert "«L9» no es una vértebra" in detalle
    assert "L3 (lateral) trae un punto que no corresponde" in detalle
    assert "Un punto de L4 (lateral) está fuera de la imagen" in detalle


def test_una_forma_equivocada_da_un_error_de_validacion_en_espanol(client, db_session, escenario):
    respuesta = client.post(
        _ruta(escenario), headers=_doctora(db_session, escenario),
        json={"lateral": {"tipo": "otra", "id": 1}, "puntos": [], "calibracion": SIN_ESCALA, "opciones": OPCIONES},
    )
    assert respuesta.status_code == 422
    texto = str(respuesta.json())
    assert "Puntos marcados" in texto
    assert "Input should" not in texto


# ── Permisos y alcance ─────────────────────────────────────────────────────


def test_recepcion_y_administracion_no_ven_ni_guardan(client, db_session, escenario):
    foto = _foto(db_session, escenario)
    for quien in ("secretaria", "admin"):
        cabeceras = _auth_headers(db_session, escenario[quien])
        assert client.get(_ruta(escenario), headers=cabeceras).status_code == 403, quien
        assert _guardar(
            client, cabeceras, escenario, lateral={"tipo": "imagen_clinica", "id": foto.id},
        ).status_code == 403, quien


def test_un_medico_que_no_es_dueno_del_expediente_recibe_403(client, db_session, escenario):
    foto = _foto(db_session, escenario)
    cabeceras = _auth_headers(db_session, escenario["colega"])
    assert client.get(_ruta(escenario), headers=cabeceras).status_code == 403
    assert _guardar(client, cabeceras, escenario, lateral={"tipo": "imagen_clinica", "id": foto.id}).status_code == 403


def test_otra_sucursal_no_sabe_que_el_paciente_existe(client, db_session, escenario):
    cabeceras = _auth_headers(db_session, escenario["doctora_ajena"])
    assert client.get(_ruta(escenario), headers=cabeceras).status_code == 404


# ── Anulación lógica ───────────────────────────────────────────────────────


def test_anular_no_borra_y_deja_quien_cuando_y_por_que(client, db_session, escenario):
    cabeceras = _doctora(db_session, escenario)
    foto = _foto(db_session, escenario)
    creado = _guardar(client, cabeceras, escenario, lateral={"tipo": "imagen_clinica", "id": foto.id}).json()
    respuesta = client.post(
        _ruta(escenario, f"/{creado['id']}/anular"), headers=cabeceras,
        json={"motivo": "Marqué la placa de otro estudio"},
    )
    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["anulado_motivo"] == "Marqué la placa de otro estudio"

    fila = db_session.query(ColumnaAjusteRx).one()
    assert fila.anulado_at is not None
    assert fila.anulado_por_user_id == escenario["doctora"].id
    assert fila.mediciones == CASO["esperado"]  # lo medido no se toca

    assert [a["id"] for a in client.get(_ruta(escenario), headers=cabeceras).json()] == [creado["id"]]
    assert client.get(_ruta(escenario, "?incluir_anulados=false"), headers=cabeceras).json() == []


def test_no_se_anula_dos_veces(client, db_session, escenario):
    cabeceras = _doctora(db_session, escenario)
    foto = _foto(db_session, escenario)
    creado = _guardar(client, cabeceras, escenario, lateral={"tipo": "imagen_clinica", "id": foto.id}).json()
    ruta = _ruta(escenario, f"/{creado['id']}/anular")
    assert client.post(ruta, headers=cabeceras, json={"motivo": "Error de marcado"}).status_code == 200
    segunda = client.post(ruta, headers=cabeceras, json={"motivo": "Error de marcado"})
    assert segunda.status_code == 409
    assert segunda.json()["detail"] == "Este ajuste ya estaba anulado."


def test_anular_exige_un_motivo_de_verdad(client, db_session, escenario):
    cabeceras = _doctora(db_session, escenario)
    foto = _foto(db_session, escenario)
    creado = _guardar(client, cabeceras, escenario, lateral={"tipo": "imagen_clinica", "id": foto.id}).json()
    respuesta = client.post(_ruta(escenario, f"/{creado['id']}/anular"), headers=cabeceras, json={"motivo": "x"})
    assert respuesta.status_code == 422
    assert "Motivo" in str(respuesta.json())


def test_solo_quien_lo_guardo_lo_anula(client, db_session, escenario):
    ajeno = ColumnaAjusteRx(
        tenant_id=escenario["tenant"].id, patient_id=escenario["paciente"].id,
        doctor_id=escenario["colega"].id, puntos=CASO["marcas"], calibracion=SIN_ESCALA,
        opciones=OPCIONES, mediciones=CASO["esperado"], version_calculo="1",
        created_by_user_id=escenario["colega"].id,
    )
    db_session.add(ajeno)
    db_session.commit()
    respuesta = client.post(
        _ruta(escenario, f"/{ajeno.id}/anular"), headers=_doctora(db_session, escenario),
        json={"motivo": "No corresponde"},
    )
    assert respuesta.status_code == 403
    assert respuesta.json()["detail"] == "Solo quien guardó el ajuste puede anularlo."


# ── Bitácoras ──────────────────────────────────────────────────────────────


def test_guardar_y_anular_quedan_en_la_bitacora_sin_los_puntos(client, db_session, escenario):
    cabeceras = _doctora(db_session, escenario)
    foto = _foto(db_session, escenario)
    creado = _guardar(client, cabeceras, escenario, lateral={"tipo": "imagen_clinica", "id": foto.id}).json()
    client.post(_ruta(escenario, f"/{creado['id']}/anular"), headers=cabeceras, json={"motivo": "Error de marcado"})
    acciones = {a.action: a for a in db_session.query(AuditLog).filter(AuditLog.entity_type == "columna_ajuste_rx")}
    assert set(acciones) == {"spine_rx.saved", "spine_rx.voided"}
    guardado = acciones["spine_rx.saved"]
    assert guardado.patient_id == escenario["paciente"].id
    assert guardado.details["lateral"] == "imagen_clinica"
    assert "puntos" not in guardado.details and "mediciones" not in guardado.details
    assert acciones["spine_rx.voided"].reason == "Error de marcado"


def test_ver_los_ajustes_queda_en_la_bitacora_de_accesos(client, db_session, escenario):
    client.get(_ruta(escenario), headers=_doctora(db_session, escenario))
    acceso = db_session.query(AccesoClinico).filter(AccesoClinico.seccion == "columna_rx").one()
    assert acceso.patient_id == escenario["paciente"].id
    assert acceso.user_id == escenario["doctora"].id
