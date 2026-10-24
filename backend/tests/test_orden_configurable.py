"""Configuración de la orden de estudio en el perfil del médico (plan 26, D-7).

El membrete se comparte con la receta; lo propio de la orden (modo de
impresión, qué datos salen y la leyenda del pie) vive en
``doctor_profiles.order_settings``, validado estricto al guardar y leído con
desconfianza al imprimir.
"""
from datetime import datetime

import pytest

from app.models.appointment import Appointment
from app.models.doctor_profile import DoctorProfile
from app.utils.orden_config import AJUSTES_ORDEN_POR_DEFECTO

from test_receta_configurable import (  # noqa: F401 (fixtures)
    PREFIX,
    _pdf_sin_comprimir,

    client,
    db_session,
    doctora,
)
from test_orden_estudio_pdf import (  # noqa: F401
    _auth_headers,
    _orden,
    _texto_del_pdf,
    escenario,
)

PERFIL = f"{PREFIX}/doctor-profile/me"
VISTA_PREVIA = f"{PREFIX}/doctor-profile/me/order-preview"


def _paginas(datos: bytes) -> int:
    return datos.count(b"/Type /Page\n") + datos.count(b"/Type /Page ")


def test_sin_configurar_el_perfil_devuelve_los_valores_de_fabrica(client, doctora):
    datos = client.get(PERFIL, headers=doctora["headers"]).json()

    assert datos["order_settings"] == AJUSTES_ORDEN_POR_DEFECTO
    assert datos["order_settings"]["modo_impresion"] == "separado"


def test_guardar_la_configuracion_de_la_orden_la_guarda_completa(client, doctora, db_session):
    respuesta = client.put(PERFIL, headers=doctora["headers"], json={
        "order_settings": {"modo_impresion": "una_hoja", "mostrar_prioridad": False, "leyenda_pie": "  Gracias  "},
    })

    assert respuesta.status_code == 200, respuesta.text
    ajustes = respuesta.json()["order_settings"]
    assert ajustes["modo_impresion"] == "una_hoja"
    assert ajustes["mostrar_prioridad"] is False
    assert ajustes["mostrar_firma"] is True
    assert ajustes["leyenda_pie"] == "Gracias"
    guardado = db_session.get(DoctorProfile, doctora["perfil"].id)
    db_session.refresh(guardado)
    assert guardado.order_settings == {**AJUSTES_ORDEN_POR_DEFECTO, "modo_impresion": "una_hoja",
                                       "mostrar_prioridad": False, "leyenda_pie": "Gracias"}
    # La receta no se tocó.
    assert guardado.prescription_settings is None


@pytest.mark.parametrize("ajustes", [
    {"mostrar_firma": 1},
    {"mostrar_firma": "true"},
    {"modo_impresion": "doble"},
    {"color": "#000000"},
    {"leyenda_pie": "x" * 151},
])
def test_la_validacion_es_estricta(client, doctora, ajustes):
    respuesta = client.put(PERFIL, headers=doctora["headers"], json={"order_settings": ajustes})

    assert respuesta.status_code == 422


def test_un_json_con_basura_guardado_no_tumba_el_perfil_ni_la_orden(client, doctora, db_session):
    perfil = db_session.get(DoctorProfile, doctora["perfil"].id)
    perfil.order_settings = {"mostrar_firma": "si", "modo_impresion": 3, "otra": True, "mostrar_prioridad": False}
    db_session.commit()

    datos = client.get(PERFIL, headers=doctora["headers"]).json()

    assert datos["order_settings"] == {**AJUSTES_ORDEN_POR_DEFECTO, "mostrar_prioridad": False}
    respuesta = client.post(VISTA_PREVIA, headers=doctora["headers"], json={})
    assert respuesta.status_code == 200


def test_la_vista_previa_es_el_pdf_real_y_no_guarda_nada(client, doctora, db_session):
    respuesta = client.post(VISTA_PREVIA, headers=doctora["headers"], json={
        "order_settings": {"mostrar_preparacion": False, "leyenda_pie": "Leyenda de prueba"},
        "modo": "una_hoja",
    })

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.headers["content-type"].startswith("application/pdf")
    assert "inline" in respuesta.headers["content-disposition"]
    assert _paginas(respuesta.content) == 1
    texto = _texto_del_pdf(respuesta.content)
    for fragmento in ("ORDEN DE ESTUDIOS", "MARIA EJEMPLO GONZALEZ", "Leyenda de prueba", "Orden n.º 1001",
                      "G & G de prueba"):
        assert fragmento in texto, fragmento
    assert "Ayuno de 8 horas" not in texto
    guardado = db_session.get(DoctorProfile, doctora["perfil"].id)
    db_session.refresh(guardado)
    assert guardado.order_settings is None


def test_la_vista_previa_sin_modo_usa_el_de_los_ajustes(client, doctora):
    separado = client.post(VISTA_PREVIA, headers=doctora["headers"], json={})
    una_hoja = client.post(VISTA_PREVIA, headers=doctora["headers"],
                           json={"order_settings": {"modo_impresion": "una_hoja"}})

    assert _paginas(separado.content) == 3
    assert _paginas(una_hoja.content) == 1


def test_la_vista_previa_rechaza_claves_desconocidas(client, doctora):
    respuesta = client.post(VISTA_PREVIA, headers=doctora["headers"], json={"modo": "una_hoja", "extra": 1})

    assert respuesta.status_code == 422


def test_el_papel_de_la_consulta_usa_el_modo_del_perfil(client, db_session, escenario):
    """Sin ``modo`` en la llamada, manda lo que el médico dejó en su perfil."""
    from app.models.audit_log import AuditLog

    t, p, d = escenario["tenant"], escenario["paciente"], escenario["doctora"]
    cita = Appointment(tenant_id=t.id, patient_id=p.id, doctor_id=d.id, scheduled_at=datetime(2026, 9, 30, 10, 0))
    db_session.add(cita)
    db_session.commit()
    _orden(db_session, t, p, d, appointment_id=cita.id, study_name="VDRL")
    _orden(db_session, t, p, d, appointment_id=cita.id, study_name="USG", category="obstetric")
    perfil = db_session.query(DoctorProfile).filter(DoctorProfile.user_id == d.id).one()
    perfil.order_settings = {"modo_impresion": "una_hoja"}
    db_session.commit()

    respuesta = client.get(f"{PREFIX}/clinical-tracking/appointments/{cita.id}/orders/pdf",
                           headers=_auth_headers(db_session, escenario["secretaria"]))

    assert _paginas(respuesta.content) == 1
    registro = db_session.query(AuditLog).filter(AuditLog.action == "diagnostic_order.batch_pdf_generated").one()
    assert registro.details["modo"] == "una_hoja"


# ---------------------------------------------------------------------------
# Membrete propio de la orden (D-11)
# ---------------------------------------------------------------------------

def test_el_membrete_de_la_orden_se_guarda_aparte_de_la_receta(client, doctora, db_session):
    respuesta = client.put(PERFIL, headers=doctora["headers"], json={"order_settings": {
        "nombre_impreso": "Dra. Yara G.", "mostrar_especialidad": False, "color_acento": "#1a5c3a",
        "estilo_firma": {"fuente": "cursiva", "tamano": 18, "negritas": False, "cursiva": True,
                         "color": "#123456", "linea_firma": True},
    }})

    assert respuesta.status_code == 200, respuesta.text
    datos = respuesta.json()
    assert datos["order_settings"]["nombre_impreso"] == "Dra. Yara G."
    assert datos["order_settings"]["color_acento"] == "#1A5C3A"
    assert datos["order_settings"]["estilo_firma"]["fuente"] == "cursiva"
    # La receta no cambia.
    assert datos["prescription_display_name"] is None
    assert datos["prescription_accent_color"] == "#8B2E83"


@pytest.mark.parametrize("ajustes", [
    {"color_acento": "verde"},
    {"estilo_firma": {"fuente": "comic"}},
    {"estilo_firma": {"tamano": 400}},
    {"mostrar_cedula_profesional": False},  # la cédula no se apaga: la clave no existe
    {"nombre_impreso": "x" * 151},
])
def test_el_membrete_se_valida_estricto(client, doctora, ajustes):
    respuesta = client.put(PERFIL, headers=doctora["headers"], json={"order_settings": ajustes})

    assert respuesta.status_code == 422


def test_copiar_de_mi_receta_no_guarda_nada(client, doctora, db_session):
    perfil = db_session.get(DoctorProfile, doctora["perfil"].id)
    perfil.prescription_display_name = "Dra. Yara Gutiérrez"
    perfil.prescription_settings = {"mostrar_registro_ssa": False, "mostrar_logo": False}
    perfil.prescription_accent_color = "#00AA00"
    perfil.prescription_footer_text = "Tu salud primero"
    perfil.order_settings = {"modo_impresion": "una_hoja", "mostrar_preparacion": False}
    db_session.commit()

    respuesta = client.get(f"{PERFIL}/order-settings/from-prescription", headers=doctora["headers"])

    assert respuesta.status_code == 200, respuesta.text
    copia = respuesta.json()
    assert copia["nombre_impreso"] == "Dra. Yara Gutiérrez"
    assert copia["mostrar_registro_ssa"] is False
    assert copia["mostrar_logo"] is False
    # La receta apaga la especialidad de fábrica: eso no se copia (ronda 3).
    assert copia["mostrar_especialidad"] is True
    assert copia["color_acento"] == "#00AA00"
    assert copia["leyenda_pie"] == "Tu salud primero"
    # Lo propio de la orden se queda.
    assert copia["modo_impresion"] == "una_hoja"
    assert copia["mostrar_preparacion"] is False
    db_session.refresh(perfil)
    assert perfil.order_settings == {"modo_impresion": "una_hoja", "mostrar_preparacion": False}


def test_copiar_no_trae_la_leyenda_de_fabrica_de_la_receta(client, doctora):
    copia = client.get(f"{PERFIL}/order-settings/from-prescription", headers=doctora["headers"]).json()

    assert copia["leyenda_pie"] is None


def test_la_vista_previa_usa_el_membrete_de_la_orden(client, doctora):
    respuesta = client.post(VISTA_PREVIA, headers=doctora["headers"], json={
        "order_settings": {"nombre_impreso": "Dra. Vista Previa", "mostrar_universidad": False}, "modo": "una_hoja",
    })

    texto = _texto_del_pdf(respuesta.content)
    assert "Dra. Vista Previa" in texto
    assert "UNIVERSIDAD DE COLIMA" not in texto
    assert "Céd. Prof. 7654321" in texto


# ---------------------------------------------------------------------------
# Contacto impreso (ronda 3)
# ---------------------------------------------------------------------------

def test_el_perfil_guarda_y_valida_el_contacto(client, doctora, db_session):
    respuesta = client.put(PERFIL, headers=doctora["headers"],
                           json={"contact_email": " consulta@clinica.mx ", "mobile_phone": "669  123 4567"})

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["contact_email"] == "consulta@clinica.mx"
    assert respuesta.json()["mobile_phone"] == "669 123 4567"
    borrado = client.put(PERFIL, headers=doctora["headers"], json={"contact_email": "", "mobile_phone": None})
    assert borrado.json()["contact_email"] is None and borrado.json()["mobile_phone"] is None


@pytest.mark.parametrize("cambio", [
    {"contact_email": "sin-arroba"}, {"contact_email": "a@b"}, {"mobile_phone": "12345"},
    {"mobile_phone": "669-ABC-4567"}, {"mobile_phone": "1" * 16},
])
def test_un_contacto_mal_escrito_es_422(client, doctora, cambio):
    assert client.put(PERFIL, headers=doctora["headers"], json=cambio).status_code == 422


def test_la_receta_no_imprime_el_contacto_hasta_que_se_enciende(client, doctora, db_session):
    perfil = db_session.get(DoctorProfile, doctora["perfil"].id)
    perfil.contact_email, perfil.mobile_phone = "consulta@clinica.mx", "669 123 4567"
    db_session.commit()
    vista = f"{PERFIL}/prescription-preview"

    de_fabrica = _texto_del_pdf(client.post(vista, headers=doctora["headers"], json={}).content)
    encendido = _texto_del_pdf(client.post(vista, headers=doctora["headers"], json={
        "prescription_settings": {"mostrar_correo": True, "mostrar_celular": True},
    }).content)

    assert "consulta@clinica.mx" not in de_fabrica and "669 123 4567" not in de_fabrica
    assert "consulta@clinica.mx" in encendido
    assert "Cel./WhatsApp 669 123 4567" in encendido


def test_la_orden_imprime_el_contacto_si_hay_dato(client, doctora, db_session):
    sin_dato = _texto_del_pdf(client.post(VISTA_PREVIA, headers=doctora["headers"], json={}).content)
    assert "Cel./WhatsApp" not in sin_dato

    perfil = db_session.get(DoctorProfile, doctora["perfil"].id)
    perfil.contact_email, perfil.mobile_phone = "consulta@clinica.mx", "669 123 4567"
    db_session.commit()
    con_dato = _texto_del_pdf(client.post(VISTA_PREVIA, headers=doctora["headers"], json={}).content)
    apagado = _texto_del_pdf(client.post(VISTA_PREVIA, headers=doctora["headers"],
                                         json={"order_settings": {"mostrar_correo": False, "mostrar_celular": False}}).content)

    assert "consulta@clinica.mx" in con_dato and "Cel./WhatsApp 669 123 4567" in con_dato
    assert "consulta@clinica.mx" not in apagado and "Cel./WhatsApp" not in apagado


def test_copiar_de_la_receta_solo_trae_lo_que_se_cambio_de_fabrica(client, doctora, db_session):
    de_fabrica = client.get(f"{PERFIL}/order-settings/from-prescription", headers=doctora["headers"]).json()
    assert de_fabrica["mostrar_correo"] is True and de_fabrica["mostrar_celular"] is True

    perfil = db_session.get(DoctorProfile, doctora["perfil"].id)
    perfil.order_settings = {"mostrar_consejo": False}
    # Guardada completa, como la guarda el PUT: los de fábrica no se copian.
    perfil.prescription_settings = {"mostrar_correo": False, "mostrar_celular": True, "mostrar_consejo": True,
                                    "mostrar_especialidad": False}
    db_session.commit()
    copia = client.get(f"{PERFIL}/order-settings/from-prescription", headers=doctora["headers"]).json()
    assert copia["mostrar_correo"] is True
    assert copia["mostrar_celular"] is True
    assert copia["mostrar_especialidad"] is True
    assert copia["mostrar_consejo"] is False


def test_una_doctora_con_receta_de_fabrica_conserva_la_especialidad_en_la_orden(client, doctora, db_session):
    """Copiar (o la 0034) con la receta guardada tal como viene de fábrica no quita nada."""
    from app.utils.receta_config import AJUSTES_RECETA_POR_DEFECTO

    perfil = db_session.get(DoctorProfile, doctora["perfil"].id)
    perfil.prescription_settings = dict(AJUSTES_RECETA_POR_DEFECTO)
    db_session.commit()

    copia = client.get(f"{PERFIL}/order-settings/from-prescription", headers=doctora["headers"]).json()
    texto = _texto_del_pdf(client.post(VISTA_PREVIA, headers=doctora["headers"],
                                       json={"order_settings": copia}).content)

    assert copia["mostrar_especialidad"] is True
    assert "Ginecologia" in texto


def test_la_advertencia_de_seguridad_sale_siempre_aunque_haya_leyenda_propia(client, doctora):
    """Es una advertencia, no decoración: la leyenda propia va además, no en su lugar."""
    sin = _texto_del_pdf(client.post(VISTA_PREVIA, headers=doctora["headers"], json={}).content)
    con = _texto_del_pdf(client.post(VISTA_PREVIA, headers=doctora["headers"],
                                      json={"order_settings": {"leyenda_pie": "Cuidamos tu salud"}}).content)

    advertencia = "Es una solicitud: no es un resultado ni un diagnóstico"
    assert advertencia in sin
    assert advertencia in con and "Cuidamos tu salud" in con
