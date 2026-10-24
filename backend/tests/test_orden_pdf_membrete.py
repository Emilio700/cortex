"""El papel de la orden con el membrete de la receta (plan 26, fase 1).

Antes el recuadro medía fijo 108 pt y las credenciales se apilaban sin medir:
con un perfil completo, tres quedaban fuera, encimadas con el folio (P-1). La
prueba principal envuelve ``drawString`` y registra la ``y`` de cada texto del
membrete, para exigir que todo quede dentro del recuadro.
"""
from datetime import date
from types import SimpleNamespace

import pytest
import reportlab.rl_config
from PIL import Image
from reportlab.pdfgen import canvas as rl_canvas

import app.utils.pdf as pdf
from test_orden_estudio_pdf import _texto_del_pdf


@pytest.fixture(autouse=True)
def _pdf_sin_comprimir():
    anterior = reportlab.rl_config.pageCompression
    reportlab.rl_config.pageCompression = 0
    yield
    reportlab.rl_config.pageCompression = anterior


@pytest.fixture
def imagenes(tmp_path):
    logo = tmp_path / "logo.png"
    firma = tmp_path / "firma.png"
    Image.new("RGB", (300, 300), (139, 46, 131)).save(logo)
    Image.new("RGB", (400, 120), (20, 20, 20)).save(firma)
    return str(logo), str(firma)


def _perfil(imagenes=None, **cambios):
    logo, firma = imagenes or (None, None)
    datos = dict(
        user=SimpleNamespace(full_name="Yara Montserrat Gutiérrez Romero", tratamiento="Dra."),
        specialty=SimpleNamespace(name="Ginecología y Obstetricia"),
        professional_id="12345678",
        university="Universidad Autónoma de Sinaloa, Facultad de Medicina, Especialidad en Ginecología",
        clinic_address=(
            "Av. Camarón Sábalo 1504, Consultorio 305, Torre Médica del Pacífico, "
            "Zona Dorada, Mazatlán, Sinaloa, C.P. 82110"
        ),
        phone="669 123 4567",
        logo_url=logo,
        signature_url=firma,
        general_registry="RGP-998877",
        specialty_license="ESP-445566",
        health_registry="SSA-112233",
        council_cert="CMGO-2020-12345 Consejo Mexicano de Ginecología",
        prescription_display_name=None,
        # Todas las credenciales encendidas: el peor caso para la altura.
        prescription_settings={
            "mostrar_cedula_profesional": True,
            "mostrar_registro_general": True,
            "mostrar_cedula_especialidad": True,
            "mostrar_registro_ssa": True,
            "mostrar_consejo": True,
        },
        prescription_accent_color=None,
        order_settings=None,
    )
    datos.update(cambios)
    return SimpleNamespace(**datos)


def _paciente():
    return SimpleNamespace(first_name="María", last_name="López Pérez", date_of_birth=date(1990, 5, 20))


def _orden(**cambios):
    datos = dict(
        id=4321, category="laboratory", study_name="Biometría hemática completa",
        clinical_indication="Control prenatal", priority="routine", requested_on=date(2026, 9, 30),
        desired_on=None, preparation_instructions="Ayuno de 8 horas", specimen_or_body_site=None,
        destination="Laboratorio Central",
    )
    datos.update(cambios)
    return SimpleNamespace(**datos)


def _registrar_dibujos(monkeypatch):
    """Envuelve el canvas: anota cada texto con su ``y`` y cada recuadro."""
    textos: list[tuple[str, float]] = []
    recuadros: list[tuple[float, float, float, float]] = []
    imagenes: list[float] = []
    originales = {
        nombre: getattr(rl_canvas.Canvas, nombre)
        for nombre in ("drawString", "drawRightString", "drawCentredString", "roundRect", "drawImage")
    }

    def envolver_texto(nombre):
        def dibujar(self, x, y, texto, *args, **kwargs):
            textos.append((texto, y))
            return originales[nombre](self, x, y, texto, *args, **kwargs)
        return dibujar

    def round_rect(self, x, y, w, h, *args, **kwargs):
        recuadros.append((x, y, w, h))
        return originales["roundRect"](self, x, y, w, h, *args, **kwargs)

    def draw_image(self, imagen, x, y, *args, **kwargs):
        imagenes.append(y)
        return originales["drawImage"](self, imagen, x, y, *args, **kwargs)

    for nombre in ("drawString", "drawRightString", "drawCentredString"):
        monkeypatch.setattr(rl_canvas.Canvas, nombre, envolver_texto(nombre))
    monkeypatch.setattr(rl_canvas.Canvas, "roundRect", round_rect)
    monkeypatch.setattr(rl_canvas.Canvas, "drawImage", draw_image)
    return textos, recuadros, imagenes


def test_con_perfil_completo_nada_del_membrete_sale_del_recuadro(monkeypatch, imagenes):
    textos, recuadros, _ = _registrar_dibujos(monkeypatch)

    pdf.generate_diagnostic_order_pdf(_orden(), _perfil(imagenes), _paciente(), tenant_name="G & G GINECÓLOGOS")

    x, y_abajo, _, alto = recuadros[0]
    y_arriba = y_abajo + alto
    # Todo lo que se dibuja antes del folio es el membrete.
    indice_folio = next(i for i, (texto, _) in enumerate(textos) if texto.startswith("FOLIO:"))
    membrete = textos[:indice_folio]
    for texto in ("R.G.P. RGP-998877", "Céd. Esp. ESP-445566", "SSA SSA-112233", "Céd. Prof. 12345678",
                  "G & G GINECÓLOGOS", "Tel. 669 123 4567"):
        assert any(t == texto for t, _ in membrete), texto
    assert any(t.startswith("Consejo ") for t, _ in membrete)
    for texto, y in membrete:
        # La línea base más el cuerpo de la letra tienen que caber en la caja.
        assert y_abajo + 2 <= y <= y_arriba - 7, (texto, y, y_abajo, y_arriba)
    # Y el folio queda por debajo del recuadro, sin encimarse.
    assert textos[indice_folio][1] < y_abajo


def test_el_consultorio_va_dentro_del_membrete_y_no_suelto_en_el_cuerpo(monkeypatch):
    textos, recuadros, _ = _registrar_dibujos(monkeypatch)

    pdf.generate_diagnostic_order_pdf(_orden(), _perfil(), _paciente(), tenant_name="G & G GINECÓLOGOS")

    _, y_abajo, _, _ = recuadros[0]
    apariciones = [y for texto, y in textos if texto == "G & G GINECÓLOGOS"]
    assert len(apariciones) == 1
    assert apariciones[0] > y_abajo


def test_el_membrete_de_la_orden_ya_no_lee_la_receta():
    """D-11: la orden tiene su propio membrete; lo de la receta no la toca."""
    perfil = _perfil(
        prescription_display_name="Dra. Yara de la receta",
        prescription_settings={"mostrar_registro_ssa": False, "mostrar_logo": False},
        prescription_accent_color="#00AA00",
    )

    texto = _texto_del_pdf(pdf.generate_diagnostic_order_pdf(_orden(), perfil, _paciente()).read())

    assert "Dra. Yara Montserrat Gutiérrez Romero" in texto
    assert "de la receta" not in texto
    assert "SSA SSA-112233" in texto


def test_el_membrete_respeta_sus_propios_interruptores():
    """El revisor vio que se ignoraban mostrar_nombre y mostrar_especialidad."""
    perfil = _perfil(order_settings={
        "nombre_impreso": "Dra. Yara Gutiérrez", "mostrar_especialidad": False, "mostrar_universidad": False,
        "mostrar_direccion": False, "mostrar_telefono": False, "mostrar_registro_ssa": False,
        "mostrar_fecha_nacimiento": False,
    }, general_registry="   \t ")

    texto = _texto_del_pdf(pdf.generate_diagnostic_order_pdf(_orden(), perfil, _paciente()).read())

    assert "Dra. Yara Gutiérrez" in texto
    assert "Montserrat" not in texto
    for ausente in ("Ginecología y Obstetricia", "Universidad", "Camarón", "669 123", "SSA-112233", "20/05/1990", "R.G.P."):
        assert ausente not in texto, ausente
    # Sin fecha de nacimiento, la edad sigue saliendo sola.
    assert "| Edad |" in texto


def test_sin_nombre_en_el_membrete_la_firma_sigue_diciendo_quien_firma(monkeypatch):
    textos, recuadros, _ = _registrar_dibujos(monkeypatch)

    pdf.generate_diagnostic_order_pdf(_orden(), _perfil(order_settings={"mostrar_nombre": False}), _paciente())

    _, y_abajo, _, _ = recuadros[0]
    posiciones = [y for texto, y in textos if texto == "Dra. Yara Montserrat Gutiérrez Romero"]
    assert posiciones and all(y < y_abajo for y in posiciones)


def test_la_cedula_profesional_sale_siempre():
    """El laboratorio la exige: ni la receta ni la orden la pueden apagar aquí."""
    perfil = _perfil(prescription_settings={"mostrar_cedula_profesional": False},
                     order_settings={"mostrar_registro_general": False})

    texto = _texto_del_pdf(pdf.generate_diagnostic_order_pdf(_orden(), perfil, _paciente()).read())

    assert "Céd. Prof. 12345678" in texto
    assert "R.G.P." not in texto


def test_el_color_y_la_letra_de_la_firma_son_de_la_orden(monkeypatch):
    fuentes = []
    original = pdf.canvas.Canvas.setFont

    def anotar(self, fuente, tamano, *args, **kwargs):
        fuentes.append((fuente, tamano))
        return original(self, fuente, tamano, *args, **kwargs)

    monkeypatch.setattr(pdf.canvas.Canvas, "setFont", anotar)
    perfil = _perfil(order_settings={
        "color_acento": "#1A5C3A",
        "estilo_firma": {"fuente": "serif", "tamano": 22, "negritas": False, "cursiva": True,
                         "color": "#123456", "linea_firma": True},
    })

    datos = pdf.generate_diagnostic_order_pdf(_orden(), perfil, _paciente()).read()

    # La letra elegida, con el tamaño acotado para no pisar la raya.
    assert ("Times-Italic", 14) in fuentes
    assert b"0.101961 0.360784 0.227451" in datos or b".101961 .360784 .227451" in datos


def test_no_se_repiten_destino_ni_indicacion_iguales_al_estudio():
    orden = _orden(category="breast", study_name="USG MAMA", destination="usg mama", clinical_indication="USG Mama.")

    texto = _texto_del_pdf(pdf.generate_diagnostic_order_pdf(orden, _perfil(), _paciente()).read())

    assert "USG MAMA" in texto
    assert "Destino" not in texto
    assert "INDICACIÓN CLÍNICA" not in texto
    assert "Imagen de mama" in texto
    assert "Mama e imagen" not in texto


def test_la_firma_va_en_cada_pagina():
    larga = " ".join(f"renglón{n}" for n in range(900))
    orden = _orden(clinical_indication=larga)

    datos = pdf.generate_diagnostic_order_pdf(orden, _perfil(), _paciente()).read()

    paginas = datos.count(b"/Type /Page\n") + datos.count(b"/Type /Page ")
    assert paginas >= 2
    texto = _texto_del_pdf(datos)
    assert texto.count("| Firma |") == paginas
    assert f"Hoja {paginas}" in texto


def test_la_imagen_de_firma_depende_solo_de_la_orden(monkeypatch, imagenes):
    _, _, dibujadas = _registrar_dibujos(monkeypatch)

    pdf.generate_diagnostic_order_pdf(_orden(), _perfil(imagenes), _paciente())
    con_firma = len(dibujadas)
    dibujadas.clear()
    pdf.generate_diagnostic_order_pdf(_orden(), _perfil(imagenes, order_settings={"mostrar_firma": False}), _paciente())
    sin_firma_orden = len(dibujadas)
    dibujadas.clear()
    # Apagarla en la receta ya no la quita de la orden.
    perfil = _perfil(imagenes)
    perfil.prescription_settings = {**perfil.prescription_settings, "mostrar_firma": False}
    pdf.generate_diagnostic_order_pdf(_orden(), perfil, _paciente())

    assert con_firma == 2  # logo y firma
    assert sin_firma_orden == 1
    assert len(dibujadas) == 2


def test_los_ajustes_de_la_orden_ocultan_lo_que_la_doctora_apago():
    perfil = _perfil(order_settings={
        "mostrar_prioridad": False, "mostrar_preparacion": False, "mostrar_indicacion": False,
        "mostrar_fecha_limite": False, "mostrar_consultorio": False, "leyenda_pie": "Gracias por su confianza",
    })
    orden = _orden(priority="urgent", desired_on=date(2031, 3, 17))

    texto = _texto_del_pdf(pdf.generate_diagnostic_order_pdf(orden, perfil, _paciente(), tenant_name="G & G").read())

    for ausente in ("Urgente", "Ayuno de 8 horas", "Control prenatal", "17/03/2031", "G & G"):
        assert ausente not in texto, ausente
    assert "Gracias por su confianza" in texto
    # La advertencia de seguridad no se reemplaza: va además de la propia.
    assert "Es una solicitud: no es un resultado ni un diagnóstico" in texto
