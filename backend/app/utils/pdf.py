"""
PDF generation utilities for G.E.M.S — prescriptions and medical certificates.

Professional two‑column layout with:
  - Header box: logo (left) + doctor info (right)
  - Patient data card
  - Two‑column medication listing with numbered bullets
  - Highlighted instructions box
  - Footer: signature image + signature line + folio + legal disclaimer

All layout constants are at the top for easy tuning.
"""

import io
import os
from datetime import datetime
from functools import lru_cache

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

from app.core.hora_local import ahora_local, utc_a_local
from app.utils.colores import tonos
from app.utils.orden_config import lineas_credenciales_orden, nombre_para_orden
from app.utils.receta_config import (
    COLOR_FIRMA_POR_DEFECTO,
    anteponer_tratamiento,
    lineas_credenciales,
    nombre_para_receta,
    resolver_ajustes,
    resolver_color_acento,
    resolver_estilo_firma,
    resolver_leyenda,
)

# ---------------------------------------------------------------------------
# Brand colours — medical‑grade blue palette for a clean, professional look.
# ---------------------------------------------------------------------------
MEDICAL_DARK = colors.HexColor("#1a3a5c")     # Deep navy — headers, lines
MEDICAL_PRIMARY = colors.HexColor("#2c5f8a")  # Mid blue — accents
MEDICAL_LIGHT = colors.HexColor("#e8f0f7")    # Very light blue — box fills
MEDICAL_ACCENT = colors.HexColor("#c0392b")   # Red — warnings / Rx symbol
MEDICAL_GRAY = colors.HexColor("#666666")     # Secondary text
MEDICAL_BORDER = colors.HexColor("#b0c4de")   # Light steel — subtle borders

# ---------------------------------------------------------------------------
# Layout constants (LETTER = 612 × 792 points)
# ---------------------------------------------------------------------------
PAGE_W, PAGE_H = A4
MARGIN = 0.6 * inch                     # Outer page margin
GUTTER = 0.35 * inch                    # Gap between two columns
COL_W = (PAGE_W - 2 * MARGIN - GUTTER) / 2.0  # Single column width
LINE_HEIGHT = 14                        # pt for body text

# Header box
HEADER_TOP = PAGE_H - 0.5 * inch
HEADER_H = 1.5 * inch
HEADER_Y0 = HEADER_TOP - HEADER_H        # Bottom of header box

# Footer
FOOTER_Y0 = 1.3 * inch                  # Bottom of signature area


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_file_url(file_url: str):
    """Resolve a file URL/path to a filesystem path for ReportLab.

    Handles absolute paths, the ``/doctor-profile/files/<name>`` and
    ``/patient-documents/...`` API URLs stored in the DB (which map to the
    ``uploads/`` directory, NOT to a path relative to the project root), and
    plain relative paths.
    """
    if not file_url:
        return None

    backend_root = os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )

    # Doctor logo/signature are served by GET /doctor-profile/files/{name}
    # but physically live in uploads/doctor_files/{name}. This must be checked
    # BEFORE the isabs() branch: the URL starts with "/" so os.path.isabs is
    # True, yet it is an API route, not a real filesystem path.
    if "/doctor-profile/files/" in file_url:
        from app.core.storage import default_storage
        relative_path = os.path.join("uploads", "doctor_files", os.path.basename(file_url))
        if not default_storage.exists(relative_path):
            return None
        return ImageReader(io.BytesIO(default_storage.read(relative_path)))

    if os.path.isabs(file_url):
        return file_url if os.path.exists(file_url) else None

    full_path = os.path.join(backend_root, file_url.lstrip("/"))
    return full_path if os.path.exists(full_path) else None


def _en_hora_local(momento):
    """Una marca de la base (UTC sin zona) vista como hora de Mazatlán (plan 26, D-12).

    ``created_at`` y ``paid_at`` se guardan en UTC: impresos tal cual, una
    receta de las 20:00 salía con la fecha de mañana. Las fechas sin hora
    (``date``) no se tocan: ya son del consultorio.
    """
    from datetime import datetime as _datetime

    if isinstance(momento, _datetime):
        if momento.tzinfo is not None:
            from datetime import timezone

            momento = momento.astimezone(timezone.utc).replace(tzinfo=None)
        return utc_a_local(momento)
    return momento


MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre")


def _fecha_larga(momento, con_hora: bool = False) -> str:
    """«3 de octubre de 2026». ``strftime('%B')`` depende del locale del
    contenedor, que es inglés: el certificado decía «03 de October de 2026»."""
    texto = f"{momento.day:02d} de {MESES[momento.month - 1]} de {momento.year}"
    return f"{texto}, {momento.strftime('%H:%M')}" if con_hora else texto


def _san(text) -> str:
    """Sanitize a string for single-line drawString rendering.

    Real patient/medication data imported from the previous system often
    carries embedded control characters (``\\r``, ``\\n``, tabs) mid-field.
    ReportLab's ``drawString`` has no concept of line breaks, so those bytes
    print as tofu boxes (■). Collapse any control char and repeated spaces
    into a single space so the line renders cleanly.
    """
    if text is None:
        return ""
    s = "".join(" " if ord(ch) < 32 else ch for ch in str(text))
    return " ".join(s.split()).strip()


def _nombre_con_tratamiento(usuario) -> str:
    """El nombre de la médica con su tratamiento ("Dra."), sin duplicarlo.

    ``users.full_name`` se guarda **sin** tratamiento justo para que el codigo
    pueda anteponerlo. El que se antepone es el capturado en la usuaria; si no
    hay, va el nombre solo (un "Dr." fijo le llegaba también a las doctoras).
    """
    limpio = _san(getattr(usuario, "full_name", None))
    return anteponer_tratamiento(limpio, usuario)


def _age_str(date_of_birth) -> str:
    """Human‑readable age from a date/datetime/string."""
    if not date_of_birth:
        return "N/A"
    if isinstance(date_of_birth, str):
        date_of_birth = datetime.strptime(date_of_birth, "%Y-%m-%d").date()
    if hasattr(date_of_birth, "date"):
        date_of_birth = date_of_birth.date()
    # Años cumplidos de verdad. ``días // 365`` se adelantaba con los años
    # bisiestos: un día antes del cumpleaños ya contaba el año nuevo. Y «hoy»
    # es el del consultorio: el contenedor corre en UTC y en la noche de
    # Mazatlán ya es mañana.
    hoy = ahora_local().date()
    age = hoy.year - date_of_birth.year - ((hoy.month, hoy.day) < (date_of_birth.month, date_of_birth.day))
    return f"{age} años"


def _text_width(c: canvas.Canvas, text: str, font: str = "Helvetica", size: int = 10) -> float:
    """Measure a string's width in points."""
    return c.stringWidth(text, font, size)


def _draw_rounded_box(
    c: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    h: float,
    radius: float = 6,
    fill_color=None,
    stroke_color=None,
    stroke_width: float = 1,
):
    """Draw a rectangle with rounded corners."""
    c.saveState()
    if fill_color:
        c.setFillColor(fill_color)
    if stroke_color:
        c.setStrokeColor(stroke_color)
    c.setLineWidth(stroke_width)
    c.roundRect(x, y, w, h, radius, fill=fill_color is not None, stroke=stroke_color is not None)
    c.restoreState()


def _wrap_text(c: canvas.Canvas, text: str, max_width: float, font: str = "Helvetica", size: int = 10) -> list[str]:
    """Break a long string into lines that fit within max_width points."""
    words = _san(text).split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if _text_width(c, candidate, font, size) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines if lines else [text]


# ---------------------------------------------------------------------------
# Tipografía del bloque de la firma
# ---------------------------------------------------------------------------

# Familias que el médico puede elegir. ReportLab trae estas tres variantes de
# cada una de fábrica; no hace falta subir ningún archivo para que funcionen.
_FAMILIAS_FIRMA = {
    "sans": ("Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"),
    "serif": ("Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"),
    # Sin fuente de firma instalada, la cursiva es Times-Italic: es lo más
    # parecido a una rúbrica que trae ReportLab de origen.
    "cursiva": ("Times-Italic", "Times-BoldItalic", "Times-Italic", "Times-BoldItalic"),
}

# Nombre con el que se busca una fuente de firma de verdad. Si alguien deja el
# archivo en ``app/assets/fonts/`` se registra y la receta la usa; si no, se
# cae a Times-Italic. No se sube ninguna al repositorio a propósito: no se
# puede verificar la licencia de un binario que uno no escribió.
ARCHIVO_FUENTE_FIRMA = "FirmaManuscrita.ttf"


@lru_cache(maxsize=1)
def _fuente_firma_instalada() -> str | None:
    """Registra la fuente de firma si existe en el servidor. ``None`` si no."""
    ruta = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "assets",
        "fonts",
        ARCHIVO_FUENTE_FIRMA,
    )
    if not os.path.exists(ruta):
        return None
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont

        pdfmetrics.registerFont(TTFont("FirmaManuscrita", ruta))
        return "FirmaManuscrita"
    except Exception:
        # Una fuente que no carga no puede tumbar una receta: se sigue con la
        # cursiva de fábrica.
        return None


def fuente_de_firma(estilo: dict) -> str:
    """El nombre de fuente de ReportLab para el estilo elegido."""
    familia = estilo.get("fuente", "sans")
    negritas = bool(estilo.get("negritas"))
    cursiva = bool(estilo.get("cursiva"))

    if familia == "cursiva":
        instalada = _fuente_firma_instalada()
        if instalada:
            return instalada

    opciones = _FAMILIAS_FIRMA.get(familia, _FAMILIAS_FIRMA["sans"])
    if negritas and cursiva:
        return opciones[3]
    if negritas:
        return opciones[1]
    if cursiva:
        return opciones[2]
    return opciones[0]


# ---------------------------------------------------------------------------
# Professional Header — logo (left) + doctor info (right) in a rounded box.
# ---------------------------------------------------------------------------

def draw_professional_header(
    c: canvas.Canvas,
    doctor_profile,
    doc_title: str,
    folio: str = "",
    date_str: str = "",
):
    """Renders the professional header box with two‑column layout."""
    # ── Outer border box ───────────────────────────────────────────────
    _draw_rounded_box(
        c,
        MARGIN,
        HEADER_Y0,
        PAGE_W - 2 * MARGIN,
        HEADER_H,
        radius=8,
        fill_color=MEDICAL_LIGHT,
        stroke_color=MEDICAL_BORDER,
        stroke_width=1.5,
    )

    # Left column — logo
    logo_x = MARGIN + 0.25 * inch
    logo_y = HEADER_Y0 + 0.25 * inch
    logo_size = HEADER_H - 0.5 * inch  # max 1.0 × 1.0"

    if doctor_profile.logo_url:
        logo_path = _resolve_file_url(doctor_profile.logo_url)
        if logo_path:
            try:
                c.drawImage(
                    logo_path,
                    logo_x,
                    logo_y,
                    width=logo_size,
                    height=logo_size,
                    preserveAspectRatio=True,
                    anchor="c",
                )
            except Exception:
                pass

    # Right column — doctor info
    info_x = logo_x + logo_size + 0.4 * inch
    info_y = HEADER_Y0 + HEADER_H - 0.25 * inch

    c.setFillColor(MEDICAL_DARK)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(info_x, info_y, _nombre_con_tratamiento(doctor_profile.user))
    info_y -= 18

    c.setFont("Helvetica", 10)
    c.setFillColor(MEDICAL_GRAY)
    c.drawString(info_x, info_y, f"{doctor_profile.specialty.name}")
    info_y -= 14

    c.setFillColor(MEDICAL_DARK)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(info_x, info_y, f"Céd. Prof. {doctor_profile.professional_id}")
    info_y -= 12

    if doctor_profile.university:
        c.setFont("Helvetica-Oblique", 8)
        c.setFillColor(MEDICAL_GRAY)
        c.drawString(info_x, info_y, doctor_profile.university)
        info_y -= 12

    if doctor_profile.clinic_address:
        c.setFont("Helvetica", 8)
        c.drawString(info_x, info_y, doctor_profile.clinic_address)
        info_y -= 12

    if doctor_profile.phone:
        c.setFont("Helvetica", 8)
        c.drawString(info_x, info_y, f"Tel: {doctor_profile.phone}")
        info_y -= 12

    # ── Member fields (R.G.P., Céd. Esp., SSA, Consejo) ────────────
    member_lines = []
    if getattr(doctor_profile, "general_registry", None):
        member_lines.append(f"R.G.P. {_san(doctor_profile.general_registry)}")
    if getattr(doctor_profile, "specialty_license", None):
        member_lines.append(f"Céd. Esp. {_san(doctor_profile.specialty_license)}")
    if getattr(doctor_profile, "health_registry", None):
        member_lines.append(f"SSA {_san(doctor_profile.health_registry)}")
    if getattr(doctor_profile, "council_cert", None):
        member_lines.append(f"Consejo {_san(doctor_profile.council_cert)}")
    if member_lines:
        info_y -= 6
        c.setFillColor(colors.HexColor("#555555"))
        c.setFont("Helvetica", 7.5)
        for ml in member_lines:
            c.drawString(info_x, info_y, ml[:65])
            info_y -= 11

    # ── Document title badge (top‑right corner of box) ─────────────────
    title_w = _text_width(c, doc_title, "Helvetica-Bold", 11) + 24
    title_x = PAGE_W - MARGIN - title_w - 0.05 * inch
    title_y = HEADER_TOP - 0.55 * inch
    _draw_rounded_box(c, title_x, title_y, title_w, 22, radius=4, fill_color=MEDICAL_DARK)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(title_x + title_w / 2, title_y + 5, doc_title)

    # ── Folio + date line (below box) ──────────────────────────────────
    y_meta = HEADER_Y0 - 0.3 * inch
    c.setFillColor(MEDICAL_GRAY)
    c.setFont("Helvetica", 8)
    if folio:
        c.drawString(MARGIN, y_meta, f"FOLIO: {folio}")
    if date_str:
        c.drawRightString(PAGE_W - MARGIN, y_meta, date_str)

    # Decorative line below
    c.setStrokeColor(MEDICAL_DARK)
    c.setLineWidth(2)
    c.line(MARGIN, y_meta - 8, PAGE_W - MARGIN, y_meta - 8)
    c.setStrokeColor(MEDICAL_PRIMARY)
    c.setLineWidth(0.5)
    c.line(MARGIN, y_meta - 12, PAGE_W - MARGIN, y_meta - 12)

    return y_meta - 20  # Return Y where content should start


# ---------------------------------------------------------------------------
# Professional Footer — signature + folio + legal disclaimer.
# ---------------------------------------------------------------------------

def draw_professional_footer(
    c: canvas.Canvas,
    doctor_profile,
    folio: str = "",
    tenant_id: int | None = None,
    leyenda: str | None = None,
):
    """Signature area + legal footer in a clean, professional style.

    ``leyenda`` existe porque el pie de siempre dice que el documento es una
    receta o un certificado: la orden de estudio no es ninguna de las dos y no
    puede decir que lo es.
    """
    center_x = PAGE_W / 2.0

    # ── Signature image ────────────────────────────────────────────────
    if doctor_profile.signature_url:
        sig_path = _resolve_file_url(doctor_profile.signature_url)
        if sig_path:
            try:
                c.drawImage(
                    sig_path,
                    center_x - 0.7 * inch,
                    FOOTER_Y0 + 0.15 * inch,
                    width=1.4 * inch,
                    height=0.55 * inch,
                    preserveAspectRatio=True,
                    anchor="s",
                )
            except Exception:
                pass

    # ── Signature line ─────────────────────────────────────────────────
    line_y = FOOTER_Y0 + 0.1 * inch
    c.setStrokeColor(MEDICAL_DARK)
    c.setLineWidth(1.2)
    c.line(center_x - 1.5 * inch, line_y, center_x + 1.5 * inch, line_y)

    c.setFillColor(MEDICAL_DARK)
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString(center_x, line_y - 14, _nombre_con_tratamiento(doctor_profile.user))

    # Decía «Firma y Sello Digital», pero el sistema no aplica ningún sello
    # digital: el papel afirmaba algo que no ocurrió (plan 26, P-6). Con o sin
    # imagen, lo que hay sobre la raya es una firma y nada más.
    c.setFont("Helvetica-Oblique", 8)
    c.setFillColor(MEDICAL_GRAY)
    c.drawCentredString(center_x, line_y - 26, "Firma")

    # ── Legal footer bar ───────────────────────────────────────────────
    bar_y = 0.55 * inch
    c.setStrokeColor(MEDICAL_LIGHT)
    c.setLineWidth(0.5)
    c.line(MARGIN, bar_y + 8, PAGE_W - MARGIN, bar_y + 8)

    c.setFont("Helvetica", 7)
    c.setFillColor(MEDICAL_GRAY)

    # Note: the internal tenant id is intentionally NOT printed here — it is an
    # implementation detail that must not leak onto a patient-facing document.
    left_text = f"Generado: {ahora_local().strftime('%d/%m/%Y %H:%M')}"
    c.drawString(MARGIN, bar_y, left_text)

    if folio:
        c.drawRightString(PAGE_W - MARGIN, bar_y, f"Folio: {folio}")

    c.setFont("Helvetica-Oblique", 6.5)
    c.drawCentredString(
        center_x,
        bar_y - 10,
        leyenda
        or "G.E.M.S — Gynecology & Expert Management System. Este documento es una receta/certificado médico oficial.",
    )


# ---------------------------------------------------------------------------
# Legacy wrappers — keep backward compatibility while we transition.
# These now delegate to the new professional layout functions.
# ---------------------------------------------------------------------------

def draw_header(c, doctor_profile, doc_title):
    """Deprecated — kept for backward compat. Calls new professional header."""
    # This is still called from generate_certificate_pdf (old path).
    # We just ignore the old simple header and let the certificate
    # generator use the new professional one directly.
    pass


def draw_footer(c, doctor_profile):
    """Deprecated — kept for backward compat. Calls new professional footer."""
    # Same as above; certificate generator now uses the professional footer.
    pass


# ---------------------------------------------------------------------------
# Prescription PDF — two‑column professional layout
# ---------------------------------------------------------------------------

def generate_prescription_pdf(prescription, doctor_profile, patient, triage=None, soap_note=None, watermark_text: str = ""):
    """Premium A4 prescription for G&G Ginecólogos.

    Per the clinic's design spec: a two-image header (institutional logo on
    the left, the doctor's signature block on the right) split by a thin
    divider; a patient-data block with underlined fields filled from the
    record; a large bordered 'TX' treatment area listing the medications with
    a subtle isotype watermark; and an institutional footer.

    El bloque de la derecha lo compone cada doctora: su nombre con la fuente,
    el tamano, las negritas, la cursiva y el color que elija, y debajo las
    credenciales. Si ademas subio una imagen de firma, la imagen va arriba y el
    nombre debajo: antes el nombre se callaba en cuanto habia imagen.

    Cada doctor configura su receta desde su perfil: con que nombre firma, que
    elementos se imprimen (``app/utils/receta_config.py``), la leyenda del pie
    y el color del membrete. El expediente clinico **no** se imprime: la receta
    viaja a la farmacia. La unica excepcion es el motivo de consulta, y solo si
    la doctora lo escribio en ESA receta (``prescription.diagnosis``).
    ``soap_note`` se sigue aceptando para no romper a quien llama a esta
    funcion, pero se ignora.
    """
    from reportlab.lib.pagesizes import A4
    buffer = io.BytesIO()
    PW, PH = A4
    c = canvas.Canvas(buffer, pagesize=A4)
    MM = 72.0 / 25.4

    # Cada doctor decide como sale SU receta (app/utils/receta_config.py).
    # Un perfil sin configurar devuelve los valores de fabrica, que son los de
    # siempre: la receta de los demas doctores no cambia.
    ajustes = resolver_ajustes(doctor_profile)
    estilo_firma = resolver_estilo_firma(doctor_profile)

    # Del color elegido salen los tres tonos del membrete. El de fabrica
    # devuelve exactamente los de antes, sin derivar nada.
    acento, tono_linea, tono_campo = tonos(resolver_color_acento(doctor_profile))
    PURPLE = colors.HexColor(acento)
    TXT = colors.HexColor("#404040")
    LINE = colors.HexColor(tono_linea)
    FIELD = colors.HexColor(tono_campo)
    SUBTLE = colors.HexColor("#6B6B6B")
    # El rojo de las alergias NO se configura: es aviso de seguridad, no
    # decoracion. Con cualquier paleta tiene que seguir leyendose como alarma.
    ALERTA = colors.HexColor("#B00020")

    M_TOP, M_BOT, M_L, M_R = 20 * MM, 18 * MM, 18 * MM, 18 * MM
    x0, x1 = M_L, PW - M_R
    cw = x1 - x0

    def fmt_date(d):
        if not d:
            return ""
        try:
            if isinstance(d, str):
                d = datetime.strptime(d[:10], "%Y-%m-%d")
            return d.strftime("%d/%m/%Y")
        except Exception:
            return _san(str(d))

    folio = getattr(prescription, "folio_number", None) or str(getattr(prescription, "id", ""))
    # ``created_at`` viene de la base, en UTC; sin él, el momento del consultorio.
    creada = getattr(prescription, "created_at", None)
    created = _en_hora_local(creada) if creada else ahora_local()
    patient_name = _san(f"{patient.first_name} {patient.last_name}")
    age = _age_str(getattr(patient, "date_of_birth", None))
    dob = fmt_date(getattr(patient, "date_of_birth", None))

    def draw_fit(path, bx, by, bw, bh):
        """Encaja la imagen en la caja sin deformarla. Devuelve la caja usada."""
        try:
            reader = path if isinstance(path, ImageReader) else ImageReader(path)
            iw, ih = reader.getSize()
            scale = min(bw / iw, bh / ih)
            w, h = iw * scale, ih * scale
            c.drawImage(reader, bx + (bw - w) / 2, by + (bh - h) / 2,
                        width=w, height=h, preserveAspectRatio=True, mask="auto")
            return (bx + (bw - w) / 2, by + (bh - h) / 2, w, h)
        except Exception:
            return None

    # ── Header: logo (left) | divider | signature block (right) ────────
    header_h = 46 * MM
    header_top = PH - M_TOP
    header_bot = header_top - header_h
    mid = PW / 2.0
    gap = 6 * MM

    logo_path = (
        _resolve_file_url(getattr(doctor_profile, "logo_url", None))
        if ajustes["mostrar_logo"]
        else None
    )
    sig_path = (
        _resolve_file_url(getattr(doctor_profile, "signature_url", None))
        if ajustes["mostrar_firma"]
        else None
    )

    if not (logo_path and draw_fit(logo_path, x0, header_bot, (mid - gap) - x0, header_h)):
        c.setFillColor(PURPLE); c.setFont("Helvetica-Bold", 22)
        c.drawCentredString((x0 + mid - gap) / 2, header_bot + header_h / 2 + 4, "G & G")
        c.setFont("Helvetica-Bold", 13)
        c.drawCentredString((x0 + mid - gap) / 2, header_bot + header_h / 2 - 16, "GINECÓLOGOS")

    # Credenciales: solo las que el doctor dejo encendidas y tienen valor.
    # Caben cuatro lineas antes de invadir el bloque de la paciente.
    member_lines = lineas_credenciales(doctor_profile, ajustes)[:4]
    # El nombre se imprime tal como el doctor lo configuro. Si ya trae "Dra."
    # no se le antepone otro tratamiento: ese fue el bug del "Dr. Dr.".
    nombre_doctor = _san(nombre_para_receta(doctor_profile))

    # ── Bloque de la firma: el logo se queda solo a la izquierda ──────────
    # El lado derecho es un bloque de texto que la doctora compone: su nombre
    # con la letra, el tamaño, las negritas, la cursiva y el color que elija.
    # Antes el nombre se callaba en cuanto había imagen de firma; ahora manda
    # el interruptor "Nombre del médico" y, si hay imagen, el nombre va debajo.
    cx_firma = (mid + gap + x1) / 2
    ancho_firma = x1 - (mid + gap)
    hay_nombre = bool(ajustes["mostrar_nombre"] and nombre_doctor)
    fuente_firma = fuente_de_firma(estilo_firma)
    color_nombre = colors.HexColor(estilo_firma.get("color") or COLOR_FIRMA_POR_DEFECTO)

    def dibujar_nombre(y_nombre: float, y_credenciales: float) -> float:
        """Dibuja el nombre y dice dónde empiezan las credenciales.

        Sin nombre que imprimir devuelve ``y_credenciales`` tal cual: apagar el
        nombre no corre las credenciales, que es como se dibujaba antes.
        """
        if not hay_nombre:
            return y_credenciales
        c.setFillColor(color_nombre)
        c.setFont(fuente_firma, estilo_firma["tamano"])
        c.drawCentredString(cx_firma, y_nombre, nombre_doctor[:48])
        if not estilo_firma["linea_firma"]:
            return y_credenciales
        # Raya para firmar a mano, del ancho del nombre y no del bloque: no es
        # un renglón de formulario, es el hueco donde va la rúbrica.
        ancho_raya = min(
            c.stringWidth(nombre_doctor[:48], fuente_firma, estilo_firma["tamano"]) + 14,
            ancho_firma,
        )
        c.setStrokeColor(LINE)
        c.setLineWidth(0.6)
        c.line(
            cx_firma - ancho_raya / 2,
            y_nombre - 2.5 * MM,
            cx_firma + ancho_raya / 2,
            y_nombre - 2.5 * MM,
        )
        return min(y_credenciales, y_nombre - 8 * MM)

    # Con nombre que imprimir, la imagen de firma deja sitio debajo; sin él,
    # ocupa el encabezado entero como siempre.
    alto_imagen = header_h * 0.55 if hay_nombre else header_h
    caja_firma = (
        draw_fit(sig_path, mid + gap, header_top - alto_imagen, ancho_firma, alto_imagen)
        if sig_path
        else None
    )

    if caja_firma:
        y_credenciales = dibujar_nombre(
            caja_firma[1] - 6 * MM, header_bot + 2 * MM
        )
    else:
        y_credenciales = dibujar_nombre(
            header_bot + header_h / 2 + 8, header_bot + header_h / 2 - 8
        )

    if member_lines:
        c.setFillColor(SUBTLE)
        c.setFont("Helvetica", 7)
        for ml in member_lines:
            c.drawCentredString(cx_firma, y_credenciales, ml[:65])
            y_credenciales -= 3.5 * MM

    c.setStrokeColor(LINE); c.setLineWidth(0.8)
    c.line(mid, header_bot + 6 * MM, mid, header_top - 6 * MM)

    # ── Patient data block (two columns, underlined fields) ────────────
    y = header_bot - 12 * MM
    row_h = 9 * MM
    col_gap = 10 * MM
    col_w = (cw - col_gap) / 2.0

    def field(fx, fy, label, value):
        c.setFillColor(PURPLE); c.setFont("Helvetica-Bold", 7)
        c.drawString(fx, fy, label)
        lw = c.stringWidth(label, "Helvetica-Bold", 7)
        c.setFillColor(TXT); c.setFont("Helvetica", 9)
        c.drawString(fx + lw + 5, fy, _san(value)[:46])
        c.setStrokeColor(FIELD); c.setLineWidth(0.7)
        c.line(fx + lw + 5, fy - 2.5, fx + col_w, fy - 2.5)

    # Solo lo imprescindible para identificar a la paciente. El numero de
    # EXPEDIENTE y el motivo de CONSULTA salieron de la receta: son expediente
    # clinico y el consultorio pidio que la receta no lo lleve.
    campos = [("NOMBRE DEL PACIENTE:", patient_name)]
    if ajustes["mostrar_fecha_nacimiento"] and dob:
        campos.append(("FECHA DE NACIMIENTO:", dob))
    if ajustes["mostrar_edad"]:
        campos.append(("EDAD:", age))
    # La fecha es obligatoria en una receta; no lleva interruptor.
    campos.append(("FECHA:", fmt_date(created)))

    for i, (lab, val) in enumerate(campos):
        fila, columna = divmod(i, 2)
        fx = x0 if columna == 0 else x0 + col_w + col_gap
        field(fx, y - fila * row_h, lab, val)
    filas = (len(campos) + 1) // 2
    y_after = y - filas * row_h

    # ── Vitals + allergies (clinical data on the printout) ─────────────
    vit = []
    if triage and ajustes["mostrar_signos_vitales"]:
        if getattr(triage, "weight_kg", None): vit.append(f"Peso {triage.weight_kg} kg")
        if getattr(triage, "height_cm", None): vit.append(f"Talla {triage.height_cm} cm")
        if getattr(triage, "blood_pressure_systolic", None) and getattr(triage, "blood_pressure_diastolic", None):
            vit.append(f"T/A {triage.blood_pressure_systolic}/{triage.blood_pressure_diastolic}")
        if getattr(triage, "temperature_celsius", None): vit.append(f"Temp {triage.temperature_celsius}°C")
    has_vitals = bool(vit)
    if vit:
        c.setFillColor(SUBTLE); c.setFont("Helvetica", 7.5)
        c.drawString(x0, y_after - 2 * MM, "Signos vitales:   " + "     ".join(vit))
    allergies = _san(getattr(patient, "allergies", None)) if ajustes["mostrar_alergias"] else ""
    if allergies:
        c.setFillColor(ALERTA); c.setFont("Helvetica-Bold", 7.5)
        c.drawString(x0, y_after - 7 * MM, "ALERGIAS: " + allergies[:92])

    # ── El expediente NO se imprime en la receta ────────────────
    # Aqui se imprimia la nota SOAP entera (SINTOMAS, HALLAZGOS, DIAGNOSTICO y
    # PLAN) bajo el titulo "NOTAS DE CONSULTA". Es expediente clinico y el
    # consultorio pidio expresamente que la receta no lo lleve: la receta se
    # entrega impresa y la paciente puede ensenarsela a quien sea (farmacia,
    # familia, trabajo), asi que su diagnostico no tiene por que viajar en
    # ella. ``soap_note`` se sigue recibiendo para no romper a quien llama a
    # esta funcion, pero ya no se imprime.
    soap_y = y_after - (11 * MM if (has_vitals or allergies) else 2 * MM)

    # ── Motivo de consulta, solo si la doctora lo pidió en ESTA receta ────
    # Sigue apagado de origen: la receta viaja a la farmacia y la puede leer
    # cualquiera. Se imprime únicamente el texto que ella escribió al emitirla,
    # congelado con el documento; nunca se lee de la nota de consulta al
    # imprimir, para que una reimpresión diga lo mismo que el papel que ya
    # tiene la paciente en la mano.
    motivo = _san(getattr(prescription, "diagnosis", None))
    box_top = soap_y - 4 * MM
    if motivo:
        etiqueta = "MOTIVO DE CONSULTA: "
        c.setFillColor(PURPLE); c.setFont("Helvetica-Bold", 7.5)
        c.drawString(x0, soap_y, etiqueta)
        ancho_etiqueta = c.stringWidth(etiqueta, "Helvetica-Bold", 7.5)
        c.setFillColor(TXT); c.setFont("Helvetica", 8)
        c.drawString(x0 + ancho_etiqueta, soap_y, motivo[:110])
        box_top = soap_y - 10 * MM

    # ── TX treatment box ───────────────────────────────────────────────
    footer_top = M_BOT + 20 * MM
    box_bot = footer_top + 5 * MM
    c.setStrokeColor(PURPLE); c.setLineWidth(0.9)
    c.roundRect(x0, box_bot, cw, box_top - box_bot, 10, stroke=1, fill=0)

    if logo_path:
        try:
            c.saveState(); c.setFillAlpha(0.05)
            reader = logo_path if isinstance(logo_path, ImageReader) else ImageReader(logo_path)
            iw, ih = reader.getSize()
            wm = 52 * MM
            c.drawImage(reader, x1 - wm - 8 * MM, box_bot + 8 * MM,
                        width=wm, height=wm * ih / iw, preserveAspectRatio=True, mask="auto")
            c.restoreState()
        except Exception:
            pass

    c.setFillColor(PURPLE); c.setFont("Times-Bold", 30)
    c.drawString(x0 + 6 * MM, box_top - 12 * MM, "TX")

    mx = x0 + 9 * MM
    my = box_top - 21 * MM
    for idx, med in enumerate(getattr(prescription, "medications", None) or []):
        if my < box_bot + 22 * MM:
            break
        # La presentación se guarda aparte desde que la receta es configurable;
        # las recetas de antes la traen pegada dentro del nombre. Se juntan las
        # dos formas y sale el mismo renglón de siempre.
        titulo = _san(
            " ".join(
                parte
                for parte in (med.get("name"), med.get("presentation"), med.get("dosage"))
                if parte
            )
        )
        c.setFillColor(TXT); c.setFont("Helvetica-Bold", 11)
        c.drawString(mx, my, f"{idx + 1}.   {titulo[:58]}")

        pauta = []
        if med.get("route"): pauta.append(med["route"])
        if med.get("frequency"): pauta.append(med["frequency"])
        if med.get("duration"): pauta.append(f"por {med['duration']}")
        if med.get("intake_time"): pauta.append(med["intake_time"])

        renglones = []
        if pauta:
            renglones.append(_san("   ·   ".join(pauta))[:72])
        if med.get("quantity"):
            renglones.append(f"Surtir: {_san(med['quantity'])}")
        # Las indicaciones propias de ESTE medicamento se capturaban desde
        # siempre y no se imprimían en ningún lado: la paciente solo veía las
        # generales del pie.
        if med.get("notes"):
            renglones.append(f"Indicaciones: {_san(med['notes'])}")

        for renglon in renglones:
            my -= 5 * MM
            if my < box_bot + 14 * MM:
                break
            c.setFillColor(SUBTLE); c.setFont("Helvetica", 9)
            c.drawString(mx + 9 * MM, my, renglon[:72])
        my -= 8.5 * MM

    instr = _san(getattr(prescription, "instructions", None))
    if instr and my > box_bot + 18 * MM:
        my -= 3 * MM
        c.setFillColor(PURPLE); c.setFont("Helvetica-Bold", 8.5)
        c.drawString(mx, my, "INDICACIONES:")
        my -= 5 * MM
        c.setFillColor(TXT); c.setFont("Helvetica", 9)
        for ln in _wrap_text(c, instr, cw - 18 * MM, "Helvetica", 9)[:4]:
            if my < box_bot + 14 * MM:
                break
            c.drawString(mx, my, ln); my -= 4.6 * MM

    # ── Footer: institutional contact + message ────────────────────────
    c.setStrokeColor(FIELD); c.setLineWidth(0.7)
    c.line(x0, footer_top, x1, footer_top)

    contact = []
    addr = _san(getattr(doctor_profile, "clinic_address", None))
    if addr and ajustes["mostrar_direccion"]:
        contact.append(addr)
    phone = _san(getattr(doctor_profile, "phone", None))
    if phone and ajustes["mostrar_telefono"]:
        contact.append(f"Tel. {phone}")
    celular = _san(getattr(doctor_profile, "mobile_phone", None))
    if celular and ajustes["mostrar_celular"]:
        contact.append(f"Cel./WhatsApp {celular}")
    correo = _san(getattr(doctor_profile, "contact_email", None))
    if correo and ajustes["mostrar_correo"]:
        contact.append(correo)
    if contact:
        c.setFillColor(TXT); c.setFont("Helvetica", 8)
        c.drawCentredString(PW / 2, footer_top - 6 * MM, ("     |     ".join(contact))[:120])

    if ajustes["mostrar_pie_legal"]:
        # La leyenda la escribe la doctora; sin nada escrito manda la de
        # fábrica, que es la que estaba aquí dentro.
        c.setFillColor(PURPLE); c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(PW / 2, M_BOT + 3 * MM, resolver_leyenda(doctor_profile)[:110])

    # El folio no lleva interruptor: es como se rastrea una receta concreta.
    c.setFillColor(colors.HexColor("#9A9A9A")); c.setFont("Helvetica", 6.5)
    c.drawRightString(x1, M_BOT - 4, f"Folio: {folio}")

    # ── Watermark for emailed copies ──
    if watermark_text:
        c.saveState()
        c.setFillAlpha(0.06)
        c.setFillColor(colors.HexColor("#999999"))
        c.setFont("Helvetica-Bold", 36)
        c.translate(PW / 2, PH / 2)
        c.rotate(30)
        c.drawCentredString(0, 0, watermark_text)
        c.rotate(-30)
        c.translate(-PW / 2, -PH / 2)
        # Second line for clarity
        c.translate(PW / 2, PH / 2 - 40)
        c.rotate(30)
        c.setFont("Helvetica", 14)
        c.drawCentredString(0, 0, "Sin validez oficial — solo para consulta del paciente")
        c.restoreState()

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer


# ---------------------------------------------------------------------------
# Certificate PDF — professional legal format
# ---------------------------------------------------------------------------

def generate_certificate_pdf(certificate, doctor_profile, patient):
    """Generates a professional medical certificate with consistent branding:
    same header/footer as prescriptions, formal legal body text, diagnosis
    box, and optional incapacity section."""

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)

    # ── Document metadata ─────────────────────────────────────────────
    doc_title = "CERTIFICADO MÉDICO"
    folio = getattr(certificate, "folio_number", None) or str(certificate.id)
    # En hora de Mazatlán: ``created_at`` es UTC y en la noche ya es mañana (D-12).
    emitido = _en_hora_local(certificate.created_at) if getattr(certificate, "created_at", None) else ahora_local()
    date_str = emitido.strftime("%d/%m/%Y")

    # ── Professional header ───────────────────────────────────────────
    content_y = draw_professional_header(c, doctor_profile, doc_title, folio=folio, date_str=date_str)

    # ── Body — formal legal text ──────────────────────────────────────
    y = content_y - 0.5 * inch

    c.setFillColor(MEDICAL_DARK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(MARGIN, y, "A QUIEN CORRESPONDA:")
    y -= 22

    c.setFont("Helvetica", 11)
    c.setFillColor(colors.black)

    # Greeting paragraph
    body_text = (
        f"Por medio de la presente, CERTIFICO que el(la) paciente "
        f"<b>{patient.first_name} {patient.last_name}</b>, "
        f"quien se identifica con los datos arriba registrados, "
        f"acudió a consulta médica el día "
        f"{_fecha_larga(emitido)}."
    )

    styles = getSampleStyleSheet()
    style_body = ParagraphStyle(
        "cert_body",
        parent=styles["Normal"],
        fontSize=11,
        leading=16,
        textColor=colors.black,
        alignment=0,  # left
    )
    p = Paragraph(body_text, style_body)
    avail_w = PAGE_W - 2 * MARGIN
    _, ph = p.wrap(avail_w, PAGE_H)
    p.drawOn(c, MARGIN, y - ph)
    y -= ph + 18

    # ── Diagnosis box ─────────────────────────────────────────────────
    diag_h = 0.7 * inch
    _draw_rounded_box(c, MARGIN, y - diag_h, PAGE_W - 2 * MARGIN, diag_h, radius=5, fill_color=colors.white, stroke_color=MEDICAL_PRIMARY, stroke_width=1.2)

    dx = MARGIN + 0.2 * inch
    dy = y - 16
    c.setFillColor(MEDICAL_DARK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(dx, dy, "DIAGNÓSTICO:")
    dy -= 18

    c.setFillColor(colors.black)
    c.setFont("Helvetica", 10)
    diagnosis = getattr(certificate, "diagnosis", "") or "No especificado"
    diag_lines = _wrap_text(c, diagnosis, PAGE_W - 2 * MARGIN - 0.4 * inch, "Helvetica", 10)
    for line in diag_lines[:3]:
        c.drawString(dx, dy, line[:95])
        dy -= 14

    y -= diag_h + 12

    # ── Incapacity / additional info ──────────────────────────────────
    cert_type = getattr(certificate, "certificate_type", "")
    notes = getattr(certificate, "notes", "") or ""

    if cert_type in ("incapacidad", "sick_leave") or notes:
        y -= 8
        incap_h = 0.5 * inch
        _draw_rounded_box(c, MARGIN, y - incap_h, PAGE_W - 2 * MARGIN, incap_h, radius=5, fill_color=colors.white, stroke_color=MEDICAL_ACCENT, stroke_width=1)

        ix = MARGIN + 0.2 * inch
        iy = y - 16
        c.setFillColor(MEDICAL_ACCENT)
        c.setFont("Helvetica-Bold", 11)
        if cert_type in ("incapacidad", "sick_leave"):
            c.drawString(ix, iy, f"Se otorga INCAPACIDAD TEMPORAL por {notes}")
        else:
            c.drawString(ix, iy, "OBSERVACIONES:")
            iy -= 16
            c.setFillColor(MEDICAL_DARK)
            c.setFont("Helvetica", 9)
            for line in _wrap_text(c, notes, PAGE_W - 2 * MARGIN - 0.4 * inch, "Helvetica", 9)[:2]:
                c.drawString(ix, iy, line[:95])
                iy -= 12

        y -= incap_h + 12

    # ── Validity / closing ────────────────────────────────────────────
    y -= 10
    c.setFillColor(MEDICAL_GRAY)
    c.setFont("Helvetica-Oblique", 9)
    c.drawString(MARGIN, y, "Este certificado se expide a solicitud del interesado para los fines legales que correspondan.")
    y -= 16
    c.setFont("Helvetica", 9)
    c.drawString(MARGIN, y, f"Fecha de emisión: {date_str}")

    # ── Professional footer ───────────────────────────────────────────
    tenant_id = getattr(certificate, "tenant_id", None)
    draw_professional_footer(c, doctor_profile, folio=folio, tenant_id=tenant_id)

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer


# ---------------------------------------------------------------------------
# Payment Receipt PDF — Plan 09
# ---------------------------------------------------------------------------

def generate_receipt_pdf(payment, patient, doctor_name: str = "", tenant_name: str = ""):
    """Professional payment receipt (ticket de pago).

    Clean single-page layout with:
      - Clinic header (doctor or tenant name)
      - "RECIBO DE PAGO" title
      - Large prominent amount display
      - Payment details (method, date, concept)
      - Folio + footer
    """
    buffer = io.BytesIO()
    PW, PH = A4
    c = canvas.Canvas(buffer, pagesize=A4)

    # ── Colors ──
    DARK = colors.HexColor("#0f172a")
    PRIMARY = colors.HexColor("#2563eb")
    LIGHT_BG = colors.HexColor("#f8fafc")
    GRAY = colors.HexColor("#64748b")
    BORDER = colors.HexColor("#e2e8f0")
    GREEN = colors.HexColor("#16a34a")

    M = 0.7 * inch
    cw = PW - 2 * M
    center_x = PW / 2

    # ── Header bar ──
    header_h = 1.2 * inch
    header_top = PH - M
    header_bot = header_top - header_h
    _draw_rounded_box(c, M, header_bot, cw, header_h, radius=10, fill_color=LIGHT_BG, stroke_color=BORDER)

    clinic_name = doctor_name or tenant_name or "Consultorio Médico"
    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(center_x, header_bot + header_h - 0.45 * inch, clinic_name)

    c.setFont("Helvetica", 9)
    c.setFillColor(GRAY)
    c.drawCentredString(center_x, header_bot + header_h - 0.72 * inch, "RECIBO DE PAGO")

    # ── Amount ──
    amount_y = header_bot - 0.5 * inch
    amount_str = f"${payment.amount:,.2f}"
    c.setFillColor(DARK)
    c.setFont("Helvetica-Bold", 36)
    c.drawCentredString(center_x, amount_y, amount_str)
    c.setFont("Helvetica", 10)
    c.setFillColor(GRAY)
    c.drawCentredString(center_x, amount_y - 0.3 * inch, "MXN — Total pagado")

    # ── Blue accent line ──
    line_y = amount_y - 0.65 * inch
    c.setStrokeColor(PRIMARY)
    c.setLineWidth(2)
    c.line(center_x - 0.6 * inch, line_y, center_x + 0.6 * inch, line_y)
    c.setLineWidth(0.5)
    c.setStrokeColor(BORDER)
    c.line(M, line_y - 0.15 * inch, PW - M, line_y - 0.15 * inch)

    # ── Details card ──
    details_y = line_y - 0.5 * inch
    methods = {"cash": "Efectivo", "card": "Tarjeta", "transfer": "Transferencia", "other": "Otro"}
    method_str = methods.get(payment.method.value if hasattr(payment.method, 'value') else str(payment.method), str(payment.method))
    # ``paid_at`` es UTC: un cobro de las 20:00 salía a las 03:00 del día siguiente (D-12).
    pagado = _en_hora_local(payment.paid_at) if payment.paid_at else None
    paid_date = _fecha_larga(pagado, con_hora=True) if pagado else ""
    patient_name = f"{patient.first_name} {patient.last_name}"

    details = [
        ("Paciente", patient_name),
        ("Método de pago", method_str),
        ("Fecha", paid_date),
    ]
    if payment.description:
        details.append(("Concepto", payment.description))

    detail_card_top = details_y
    row_h = 0.3 * inch
    detail_left = M + 0.3 * inch
    detail_right = PW - M - 0.3 * inch

    for i, (label, value) in enumerate(details):
        dy = details_y - i * row_h
        c.setFillColor(GRAY)
        c.setFont("Helvetica", 9)
        c.drawString(detail_left, dy + 2, label)
        c.setFillColor(DARK)
        c.setFont("Helvetica-Bold", 10)
        c.drawRightString(detail_right, dy + 2, value[:50])

    detail_card_bot = details_y - len(details) * row_h

    _draw_rounded_box(c, M, detail_card_bot - 0.15 * inch, cw, detail_card_top - detail_card_bot + 0.3 * inch, radius=8, fill_color=LIGHT_BG, stroke_color=BORDER)

    # ── Folio ──
    folio_y = detail_card_bot - 0.55 * inch
    folio = f"REC-{getattr(payment, 'tenant_id', 'XX')}-{pagado.strftime('%Y') if pagado else ahora_local().strftime('%Y')}-{payment.id:04d}"
    c.setFillColor(GRAY)
    c.setFont("Helvetica", 7.5)
    c.drawCentredString(center_x, folio_y, f"Folio: {folio}")

    # ── Footer ──
    footer_y = 0.8 * inch
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.line(M, footer_y + 0.25 * inch, PW - M, footer_y + 0.25 * inch)

    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(center_x, footer_y, "✓ PAGO CONFIRMADO")

    c.setFillColor(GRAY)
    c.setFont("Helvetica", 7)
    c.drawCentredString(center_x, footer_y - 0.2 * inch, "Gracias por su preferencia")

    c.setFont("Helvetica", 6)
    c.drawCentredString(center_x, footer_y - 0.4 * inch, f"Generado: {ahora_local().strftime('%d/%m/%Y %H:%M')}   |   G.E.M.S — Sistema de Gestión Médica")

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer


# ---------------------------------------------------------------------------
# Orden de estudio (O-01 del backlog de auditoría; papel rehecho en el plan 26)
# ---------------------------------------------------------------------------

# Etiquetas en español de los valores que guarda la orden. Son los mismos del
# formulario de la consulta (``ClinicalPlanPanel.tsx``); un valor que no esté
# aquí se imprime tal cual en vez de esconderse, porque un estudio con tipo
# desconocido sigue siendo un estudio que la paciente tiene que hacerse.
CATEGORIAS_DE_ORDEN = {
    "laboratory": "Laboratorio",
    "gynecology": "Ginecología / Pap / HPV",
    # «Mama e imagen» se leía como dos cosas; es una sola (plan 26, P-8).
    "breast": "Imagen de mama",
    "obstetric": "Obstetricia",
    "procedure": "Procedimiento",
    "referral": "Interconsulta",
    "other": "Otro",
}
PRIORIDADES_DE_ORDEN = {
    "routine": "Rutinaria",
    "preferential": "Preferente",
    "urgent": "Urgente",
}

# Destino físico de cada hoja del papel consolidado (plan 26, D-2): la paciente
# entrega cada hoja en un lugar distinto. La citología y el VPH se toman en el
# laboratorio, por eso ginecología va con laboratorio. Lo que no esté en las
# dos primeras va a «Otros», incluida una categoría desconocida.
DESTINOS_FISICOS = (
    ("laboratorio", "LABORATORIO", ("laboratory", "gynecology")),
    ("imagen", "IMAGEN Y GABINETE", ("breast", "obstetric")),
    ("otros", "OTROS", None),
)

SIN_PREPARACION = "Sin indicaciones de preparación. Si tienes dudas, pregunta en el laboratorio antes de acudir."

# Un texto más largo que esto no va dentro de la tabla sino debajo, como
# párrafo: una celda no se parte entre páginas y una preparación de 4000
# caracteres se saldría del papel. Partida como párrafo se imprime completa.
LARGO_MAXIMO_EN_CELDA = 280


def destino_fisico(categoria: str | None) -> str:
    for clave, _, categorias in DESTINOS_FISICOS:
        if categorias is None or categoria in categorias:
            return clave
    return "otros"  # pragma: no cover - el último grupo siempre atrapa


def _normalizar_para_comparar(texto) -> str:
    """Sin acentos, mayúsculas ni signos: «USG mama.» y «usg MAMA» son lo mismo."""
    import unicodedata

    sin_acentos = "".join(
        ch for ch in unicodedata.normalize("NFKD", _san(texto)) if not unicodedata.combining(ch)
    )
    return " ".join("".join(ch if ch.isalnum() else " " for ch in sin_acentos.casefold()).split())


def _repite_el_estudio(valor, estudio) -> bool:
    """¿El campo sólo repite el nombre del estudio? Entonces no se imprime (P-8)."""
    return bool(_san(valor)) and _normalizar_para_comparar(valor) == _normalizar_para_comparar(estudio)


def _aclarar(color_hex: str, cuanto: float) -> colors.Color:
    """El color mezclado con blanco: el fondo del membrete no debe competir con el texto."""
    base = colors.HexColor(color_hex)
    return colors.Color(
        base.red + (1 - base.red) * cuanto,
        base.green + (1 - base.green) * cuanto,
        base.blue + (1 - base.blue) * cuanto,
    )


def _recortar(c: canvas.Canvas, texto: str, fuente: str, tamano: float, ancho: float) -> str:
    """El texto que cabe en ``ancho``; si no cabe entero, termina en «…»."""
    if c.stringWidth(texto, fuente, tamano) <= ancho:
        return texto
    while texto and c.stringWidth(texto + "…", fuente, tamano) > ancho:
        texto = texto[:-1]
    return texto.rstrip() + "…"


class _PapelDeOrden:
    """Lleva las páginas de una orden: membrete arriba y firma abajo en CADA hoja.

    Antes la firma se dibujaba una sola vez, al final, y en un papel de varias
    hojas sólo la última iba firmada (plan 26, P-9). Aquí cada hoja se cierra
    con su pie antes de pasar a la siguiente.
    """

    def __init__(self, doctor_profile, *, doc_title: str, folio: str, date_str: str, tenant_name: str, ajustes_orden: dict):
        from app.utils.orden_config import resolver_leyenda_orden

        self.buffer = io.BytesIO()
        self.c = canvas.Canvas(self.buffer, pagesize=A4)
        self.perfil = doctor_profile
        self.doc_title = doc_title
        self.folio = folio
        self.date_str = date_str
        self.tenant_name = _san(tenant_name)
        self.ajustes = ajustes_orden
        self.leyenda = resolver_leyenda_orden(ajustes_orden)
        # El membrete es el de la orden (D-11), configurado aparte de la receta.
        acento, linea, campo = tonos(ajustes_orden.get("color_acento"))
        self.acento = colors.HexColor(acento)
        self.linea = colors.HexColor(linea)
        self.fondo = _aclarar(campo, 0.75)
        self.ancho = PAGE_W - 2 * MARGIN
        # Debajo de esta altura va la firma: el contenido nunca la pisa.
        self.piso = FOOTER_Y0 + 0.9 * inch
        self.pagina = 0
        self.inicio_de_pagina = 0.0
        self.y = 0.0
        styles = getSampleStyleSheet()
        self.estilo_texto = ParagraphStyle(
            "orden_texto", parent=styles["Normal"], fontSize=10, leading=14, textColor=colors.black
        )
        self.estilo_celda = ParagraphStyle(
            "orden_celda", parent=styles["Normal"], fontSize=8.5, leading=10.5, textColor=colors.black
        )
        self.estilo_encabezado = ParagraphStyle(
            "orden_encabezado", parent=self.estilo_celda, fontName="Helvetica-Bold", textColor=colors.white
        )
        self.empezar_pagina()

    # ── Páginas ──────────────────────────────────────────────────────────
    def empezar_pagina(self) -> None:
        self.pagina += 1
        self.y = self._membrete() - 0.15 * inch
        self.inicio_de_pagina = self.y

    def cerrar_pagina(self) -> None:
        self._pie()
        self.c.showPage()

    def nueva_pagina(self) -> float:
        self.cerrar_pagina()
        self.empezar_pagina()
        return self.y

    def terminar(self) -> io.BytesIO:
        self.cerrar_pagina()
        self.c.save()
        self.buffer.seek(0)
        return self.buffer

    # ── Membrete ─────────────────────────────────────────────────────────
    def _membrete(self) -> float:
        """Dibuja el membrete y devuelve la ``y`` donde empieza el cuerpo.

        La altura del recuadro se calcula: es la mayor entre el logo, el
        bloque de la doctora y la columna de credenciales. Con la caja fija de
        antes (108 pt) un perfil completo dejaba tres credenciales fuera,
        encimadas con el folio (plan 26, P-1).
        """
        c, perfil = self.c, self.perfil
        izquierda, derecha = MARGIN, PAGE_W - MARGIN
        relleno = 10
        arriba = HEADER_TOP

        logo = None
        if self.ajustes["mostrar_logo"] and getattr(perfil, "logo_url", None):
            logo = _resolve_file_url(perfil.logo_url)
        lado_logo = 62 if logo else 0
        texto_x = izquierda + relleno + (lado_logo + 12 if logo else 0)
        ancho_credenciales = 175
        ancho_texto = (derecha - relleno - ancho_credenciales - 12) - texto_x

        # Bloque de la doctora: (texto, fuente, tamaño, color).
        renglones: list[tuple[str, str, float, colors.Color]] = []
        nombre = _san(nombre_para_orden(perfil, self.ajustes))
        if self.ajustes["mostrar_nombre"] and nombre:
            tamano_nombre = 14.0
            while tamano_nombre > 10 and c.stringWidth(nombre, "Helvetica-Bold", tamano_nombre) > ancho_texto:
                tamano_nombre -= 0.5
            renglones.append((_recortar(c, nombre, "Helvetica-Bold", tamano_nombre, ancho_texto), "Helvetica-Bold", tamano_nombre, self.acento))
        especialidad = _san(getattr(getattr(perfil, "specialty", None), "name", None))
        if especialidad and self.ajustes["mostrar_especialidad"]:
            renglones.append((_recortar(c, especialidad, "Helvetica", 9, ancho_texto), "Helvetica", 9, MEDICAL_GRAY))
        # El consultorio va aquí, debajo de la especialidad. Antes salía suelto
        # y en negritas como primer renglón del cuerpo (P-4).
        if self.ajustes["mostrar_consultorio"] and self.tenant_name:
            renglones.append((_recortar(c, self.tenant_name, "Helvetica-Bold", 8.5, ancho_texto), "Helvetica-Bold", 8.5, colors.HexColor("#333333")))
        universidad = _san(getattr(perfil, "university", None))
        if universidad and self.ajustes["mostrar_universidad"]:
            for linea in _wrap_text(c, universidad, ancho_texto, "Helvetica-Oblique", 8)[:2]:
                renglones.append((linea, "Helvetica-Oblique", 8, MEDICAL_GRAY))
        direccion = _san(getattr(perfil, "clinic_address", None))
        if direccion and self.ajustes["mostrar_direccion"]:
            for linea in _wrap_text(c, direccion, ancho_texto, "Helvetica", 8)[:3]:
                renglones.append((linea, "Helvetica", 8, MEDICAL_GRAY))
        telefono = _san(getattr(perfil, "phone", None))
        if telefono and self.ajustes["mostrar_telefono"]:
            renglones.append((f"Tel. {telefono}", "Helvetica", 8, MEDICAL_GRAY))
        celular = _san(getattr(perfil, "mobile_phone", None))
        if celular and self.ajustes["mostrar_celular"]:
            renglones.append((f"Cel./WhatsApp {celular}", "Helvetica", 8, MEDICAL_GRAY))
        correo = _san(getattr(perfil, "contact_email", None))
        if correo and self.ajustes["mostrar_correo"]:
            renglones.append((_recortar(c, correo, "Helvetica", 8, ancho_texto), "Helvetica", 8, MEDICAL_GRAY))
        alto_texto = sum(tamano + 3.5 for _, _, tamano, _ in renglones)

        # Credenciales de la orden: la cédula profesional siempre (D-11) y las
        # demás según sus interruptores.
        credenciales = lineas_credenciales_orden(perfil, self.ajustes)
        alto_insignia = 20
        alto_credenciales = alto_insignia + (8 + 10 * len(credenciales) if credenciales else 0)

        alto = max(alto_texto, alto_credenciales, lado_logo) + 2 * relleno
        abajo = arriba - alto
        _draw_rounded_box(c, izquierda, abajo, derecha - izquierda, alto, radius=8,
                          fill_color=self.fondo, stroke_color=self.linea, stroke_width=1.2)

        if logo:
            try:
                c.drawImage(logo, izquierda + relleno, arriba - relleno - lado_logo, width=lado_logo,
                            height=lado_logo, preserveAspectRatio=True, anchor="c", mask="auto")
            except Exception:
                pass

        y = arriba - relleno
        for texto, fuente, tamano, color in renglones:
            y -= tamano
            c.setFillColor(color)
            c.setFont(fuente, tamano)
            c.drawString(texto_x, y, texto)
            y -= 3.5

        # Insignia del documento y, debajo, las credenciales alineadas a la derecha.
        ancho_insignia = c.stringWidth(self.doc_title, "Helvetica-Bold", 10) + 20
        x_insignia = derecha - relleno - ancho_insignia
        y_insignia = arriba - relleno - alto_insignia
        _draw_rounded_box(c, x_insignia, y_insignia, ancho_insignia, alto_insignia, radius=4, fill_color=self.acento)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(x_insignia + ancho_insignia / 2, y_insignia + 6, self.doc_title)
        y = y_insignia - 8
        c.setFillColor(colors.HexColor("#555555"))
        for credencial in credenciales:
            y -= 7.5
            c.setFont("Helvetica", 7.5)
            c.drawRightString(derecha - relleno, y, _recortar(c, credencial, "Helvetica", 7.5, ancho_credenciales))
            y -= 2.5

        # Folio y fecha, debajo del recuadro y ya sin riesgo de encimarse.
        y_meta = abajo - 14
        c.setFillColor(MEDICAL_GRAY)
        c.setFont("Helvetica", 8)
        c.drawString(izquierda, y_meta, f"FOLIO: {self.folio}")
        if self.date_str:
            c.drawRightString(derecha, y_meta, self.date_str)
        c.setStrokeColor(self.acento)
        c.setLineWidth(1.5)
        c.line(izquierda, y_meta - 7, derecha, y_meta - 7)
        return y_meta - 18

    # ── Pie con la firma ─────────────────────────────────────────────────
    def _pie(self) -> None:
        c, perfil = self.c, self.perfil
        centro = PAGE_W / 2.0
        raya_y = FOOTER_Y0 + 0.1 * inch
        # La imagen depende sólo de la configuración de la orden (D-11).
        mostrar_imagen = self.ajustes["mostrar_firma"]
        if mostrar_imagen and getattr(perfil, "signature_url", None):
            firma = _resolve_file_url(perfil.signature_url)
            if firma:
                try:
                    c.drawImage(firma, centro - 0.7 * inch, FOOTER_Y0 + 0.15 * inch, width=1.4 * inch,
                                height=0.55 * inch, preserveAspectRatio=True, anchor="s", mask="auto")
                except Exception:
                    pass
        # Con o sin imagen queda la raya, para la firma autógrafa.
        c.setStrokeColor(MEDICAL_DARK)
        c.setLineWidth(1)
        c.line(centro - 1.5 * inch, raya_y, centro + 1.5 * inch, raya_y)
        # El nombre bajo la raya sale siempre, con la letra que la doctora
        # eligió para la orden; el tamaño se acota para no pisar la raya.
        estilo = self.ajustes.get("estilo_firma")
        if estilo:
            fuente, tamano = fuente_de_firma(estilo), min(max(estilo["tamano"], 9), 14)
            c.setFillColor(colors.HexColor(estilo.get("color") or COLOR_FIRMA_POR_DEFECTO))
        else:
            fuente, tamano = "Helvetica-Bold", 10
            c.setFillColor(MEDICAL_DARK)
        c.setFont(fuente, tamano)
        c.drawCentredString(centro, raya_y - 14, _recortar(c, _san(nombre_para_orden(perfil, self.ajustes)), fuente, tamano, 3 * inch))
        c.setFont("Helvetica-Oblique", 8)
        c.setFillColor(MEDICAL_GRAY)
        c.drawCentredString(centro, raya_y - 26, "Firma")

        barra_y = 0.55 * inch
        c.setStrokeColor(self.linea)
        c.setLineWidth(0.5)
        c.line(MARGIN, barra_y + 8, PAGE_W - MARGIN, barra_y + 8)
        c.setFont("Helvetica", 7)
        c.setFillColor(MEDICAL_GRAY)
        c.drawString(MARGIN, barra_y, f"Generado: {ahora_local().strftime('%d/%m/%Y %H:%M')}")
        c.drawRightString(PAGE_W - MARGIN, barra_y, f"Folio: {self.folio} · Hoja {self.pagina}")
        c.setFont("Helvetica-Oblique", 6.5)
        # La advertencia va siempre; la leyenda propia, encima y además.
        from app.utils.orden_config import LEYENDA_ORDEN_POR_DEFECTO

        c.drawCentredString(centro, barra_y - 10, LEYENDA_ORDEN_POR_DEFECTO)
        if self.leyenda:
            c.setFont("Helvetica-Oblique", 7)
            c.drawCentredString(centro, barra_y + 14, _recortar(c, self.leyenda, "Helvetica-Oblique", 7, self.ancho))

    # ── Piezas del cuerpo ────────────────────────────────────────────────
    def titulo(self, texto: str, espacio_minimo: float = 30) -> None:
        self.y -= 6
        if self.y - espacio_minimo < self.piso:
            self.nueva_pagina()
        c = self.c
        c.setFillColor(self.acento)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(MARGIN, self.y, texto)
        c.setStrokeColor(self.linea)
        c.setLineWidth(0.5)
        c.line(MARGIN, self.y - 4, PAGE_W - MARGIN, self.y - 4)
        self.y -= 18

    def renglon(self, etiqueta: str, valor: str) -> None:
        if self.y - 14 < self.piso:
            self.nueva_pagina()
        c = self.c
        c.setFillColor(MEDICAL_GRAY)
        c.setFont("Helvetica", 9)
        c.drawString(MARGIN, self.y, etiqueta)
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(MARGIN + 1.6 * inch, self.y, _recortar(c, _san(valor), "Helvetica-Bold", 10, self.ancho - 1.6 * inch))
        self.y -= 15

    def _marcado(self, texto, negritas: bool = False) -> str:
        from xml.sax.saxutils import escape

        # Los saltos de línea se respetan: «1. Ayuno de 8 h / 2. ...» en un
        # solo renglón se lee mal.
        renglones = [escape(_san(linea)) for linea in str(texto or "").splitlines()]
        marcado = "<br/>".join(r for r in renglones if r)
        return f"<b>{marcado}</b>" if negritas and marcado else marcado

    def parrafo(self, texto: str, negritas: bool = False) -> None:
        # Una indicación o una preparación pueden ser largas (hasta 4000
        # caracteres): se parte en páginas en vez de cortarse, porque un
        # renglón de preparación que no sale impreso es uno que la paciente
        # no sigue.
        self.fluir(Paragraph(self._marcado(texto, negritas), self.estilo_texto))

    def fluir(self, elemento) -> None:
        """Dibuja un párrafo o una tabla, partiéndolo entre páginas si hace falta."""
        pendiente = [elemento]
        while pendiente:
            actual = pendiente.pop(0)
            disponible = self.y - self.piso
            _, alto = actual.wrap(self.ancho, disponible)
            if alto <= disponible:
                actual.drawOn(self.c, MARGIN, self.y - alto)
                self.y -= alto + 8
                continue
            partes = actual.split(self.ancho, disponible)
            if len(partes) < 2:
                if self.y >= self.inicio_de_pagina:
                    # Ni en una página vacía cabe ni se deja partir: se dibuja
                    # como venga antes que ciclar para siempre.
                    actual.drawOn(self.c, MARGIN, self.y - alto)
                    self.y -= alto + 8
                    continue
                self.nueva_pagina()
                pendiente.insert(0, actual)
                continue
            _, alto = partes[0].wrap(self.ancho, disponible)
            partes[0].drawOn(self.c, MARGIN, self.y - alto)
            self.nueva_pagina()
            pendiente = list(partes[1:]) + pendiente

    def celda(self, texto, negritas: bool = False) -> Paragraph:
        return Paragraph(self._marcado(texto, negritas) or "—", self.estilo_celda)

    def bloque_paciente(self, patient, fecha_solicitud: str) -> None:
        self.titulo("PACIENTE")
        self.renglon("Nombre", f"{patient.first_name} {patient.last_name}")
        nacimiento = getattr(patient, "date_of_birth", None)
        if nacimiento and self.ajustes["mostrar_fecha_nacimiento"] and self.ajustes["mostrar_edad"]:
            self.renglon("Fecha de nacimiento", f"{nacimiento.strftime('%d/%m/%Y')} ({_age_str(nacimiento)})")
        elif nacimiento and self.ajustes["mostrar_fecha_nacimiento"]:
            self.renglon("Fecha de nacimiento", nacimiento.strftime('%d/%m/%Y'))
        elif nacimiento and self.ajustes["mostrar_edad"]:
            self.renglon("Edad", _age_str(nacimiento))
        self.renglon("Fecha de solicitud", fecha_solicitud)
        self.y -= 8


def _fecha_de_solicitud(ordenes, requested_on=None) -> str:
    fecha = requested_on or max((o.requested_on for o in ordenes if getattr(o, "requested_on", None)), default=None)
    return fecha.strftime("%d/%m/%Y") if fecha else ahora_local().strftime("%d/%m/%Y")


def generate_diagnostic_order_pdf(order, doctor_profile, patient, tenant_name: str = "", ajustes_orden: dict | None = None):
    """La orden de estudio de un solo estudio, la que la paciente lleva al laboratorio.

    Es un formato propio de la clínica y genérico (decisión de Emilio,
    preguntas 1.1–1.6): no copia el papel de ningún laboratorio, porque la
    paciente puede llevarla a cualquiera. El membrete es el mismo de la receta
    (plan 24) para que el laboratorio reconozca a la médica.

    Sólo lleva lo que el laboratorio necesita para hacer el estudio: quién es
    la paciente, qué se pide, por qué, con qué urgencia y cómo prepararse. Nada
    del expediente (notas, alergias, antecedentes, teléfono): el papel sale de
    la clínica y no se sabe en cuántas manos acaba.

    El folio es el id de la orden: es único y es con el que recepción liga el
    resultado cuando la paciente vuelve con el papel.
    """
    from app.utils.orden_config import resolver_ajustes_orden

    ajustes = ajustes_orden or resolver_ajustes_orden(doctor_profile)
    fecha = _fecha_de_solicitud([order])
    papel = _PapelDeOrden(doctor_profile, doc_title="ORDEN DE ESTUDIO", folio=str(order.id),
                          date_str=fecha, tenant_name=tenant_name, ajustes_orden=ajustes)
    papel.bloque_paciente(patient, fecha)

    papel.titulo("ESTUDIO SOLICITADO")
    papel.parrafo(order.study_name, negritas=True)
    categoria = getattr(order, "category", "") or ""
    papel.renglon("Tipo", CATEGORIAS_DE_ORDEN.get(categoria, categoria))
    if getattr(order, "specimen_or_body_site", None) and not _repite_el_estudio(order.specimen_or_body_site, order.study_name):
        papel.renglon("Muestra o región", order.specimen_or_body_site)
    if ajustes["mostrar_prioridad"]:
        prioridad = getattr(order, "priority", "") or "routine"
        papel.renglon("Prioridad", PRIORIDADES_DE_ORDEN.get(prioridad, prioridad))
    if ajustes["mostrar_fecha_limite"] and getattr(order, "desired_on", None):
        papel.renglon("Realizar a más tardar", order.desired_on.strftime("%d/%m/%Y"))
    # «Destino: USG MAMA» bajo el estudio USG MAMA no le dice nada a nadie (P-8).
    if getattr(order, "destination", None) and not _repite_el_estudio(order.destination, order.study_name):
        papel.renglon("Destino", order.destination)
    papel.y -= 8

    indicacion = getattr(order, "clinical_indication", None) or ""
    if ajustes["mostrar_indicacion"] and _san(indicacion) and not _repite_el_estudio(indicacion, order.study_name):
        papel.titulo("INDICACIÓN CLÍNICA")
        papel.parrafo(indicacion)
        papel.y -= 4

    if ajustes["mostrar_preparacion"]:
        papel.titulo("PREPARACIÓN")
        # No se inventa una preparación: el catálogo no la trae y la médica no
        # la escribió. Se dice que no hay para que nadie la busque en el papel.
        papel.parrafo(getattr(order, "preparation_instructions", None) or SIN_PREPARACION)

    return papel.terminar()


def generate_diagnostic_order_group_pdf(group, orders, doctor_profile, patient, tenant_name: str = "",
                                        modo: str | None = None, ajustes_orden: dict | None = None,
                                        folio: str | None = None):
    """El papel de un lote (O-02), ya en el formato consolidado del plan 26.

    Desde la 1.2.0 el folio es el homologado ``ORD`` que decide el router; sin
    él, el de antes, ``G-{lote}``, para que no se confunda con el número de
    una orden suelta (son ids de tablas distintas y pueden coincidir).
    """
    return generate_consolidated_order_pdf(
        list(orders), doctor_profile, patient, tenant_name, folio=folio or f"G-{group.id}", modo=modo,
        indicacion_comun=getattr(group, "clinical_indication", None),
        requested_on=getattr(group, "requested_on", None), ajustes_orden=ajustes_orden,
    )


def generate_consolidated_order_pdf(ordenes, doctor_profile, patient, tenant_name: str = "", *, folio: str,
                                    modo: str | None = None, indicacion_comun: str | None = None,
                                    requested_on=None, ajustes_orden: dict | None = None):
    """Un papel con varios estudios de la misma paciente (plan 26, D-2 y D-5).

    Dos formas, que la doctora elige al imprimir (y fija por omisión en su
    perfil):

    - ``separado``: una hoja por destino físico (laboratorio, imagen y
      gabinete, otros), porque la paciente entrega cada una en un lugar
      distinto. Cada hoja lleva la paciente, la indicación y la firma.
    - ``una_hoja``: todo seguido, con un subtítulo por destino.

    Cada renglón conserva su «Orden n.º {id}»: es con lo que recepción liga el
    resultado de cada estudio (O-04). El folio del papel no cambia eso.
    """
    from app.utils.orden_config import MODOS_DE_IMPRESION, resolver_ajustes_orden

    ajustes = ajustes_orden or resolver_ajustes_orden(doctor_profile)
    # Sin modo pedido manda el que la doctora dejó en su perfil.
    modo = modo if modo in MODOS_DE_IMPRESION else ajustes["modo_impresion"]
    ordenes = list(ordenes)
    fecha = _fecha_de_solicitud(ordenes, requested_on)
    titulo_doc = "ORDEN DE ESTUDIOS" if len(ordenes) > 1 else "ORDEN DE ESTUDIO"
    papel = _PapelDeOrden(doctor_profile, doc_title=titulo_doc, folio=folio, date_str=fecha,
                          tenant_name=tenant_name, ajustes_orden=ajustes)

    secciones = []
    for clave, nombre, _ in DESTINOS_FISICOS:
        de_aqui = [o for o in ordenes if destino_fisico(getattr(o, "category", None)) == clave]
        if de_aqui:
            secciones.append((nombre, de_aqui))
    # Numeración corrida en todo el papel: «3.» es el mismo estudio en
    # cualquiera de las hojas.
    numero = {}
    for _, de_aqui in secciones:
        for orden in de_aqui:
            numero[orden.id] = len(numero) + 1

    # La indicación común se imprime una sola vez; la de un estudio, sólo si
    # es distinta, para que el laboratorio no lea seis veces lo mismo.
    propias = {_normalizar_para_comparar(o.clinical_indication) for o in ordenes if _san(o.clinical_indication)}
    if indicacion_comun and _san(indicacion_comun):
        comun = indicacion_comun
    elif len(propias) == 1:
        comun = next(o.clinical_indication for o in ordenes if _san(o.clinical_indication))
    else:
        comun = None
    comun_normal = _normalizar_para_comparar(comun) if comun else None

    def encabezado_de_hoja():
        papel.bloque_paciente(patient, fecha)
        if ajustes["mostrar_indicacion"] and comun:
            papel.titulo("INDICACIÓN CLÍNICA")
            papel.parrafo(comun)
            papel.y -= 4

    def tabla(de_aqui):
        from reportlab.platypus import Table, TableStyle

        alguna_preparacion = ajustes["mostrar_preparacion"] and any(_san(o.preparation_instructions) for o in de_aqui)
        destinos = {_san(o.destination) for o in de_aqui}
        destino_unico = next(iter(destinos)) if len(destinos) == 1 else None
        if destino_unico and not (len(de_aqui) == 1 and _repite_el_estudio(destino_unico, de_aqui[0].study_name)):
            papel.renglon("Destino", destino_unico)
            papel.y -= 2

        # La columna del número cabe «Orden n.º 123456» en un renglón: partido
        # en dos, recepción lo leía mal al buscar la orden para ligar el resultado.
        columnas = [("Orden", 78), ("Estudio", None), ("Muestra o región", 84)]
        if ajustes["mostrar_prioridad"]:
            columnas.append(("Prioridad", 60))
        if alguna_preparacion:
            columnas.append(("Preparación", 140))
        fijo = sum(ancho for _, ancho in columnas if ancho)
        anchos = [ancho or (papel.ancho - fijo) for _, ancho in columnas]

        filas = [[Paragraph(nombre, papel.estilo_encabezado) for nombre, _ in columnas]]
        aparte = []  # (orden, etiqueta, texto) que no caben en una celda
        for orden in de_aqui:
            partes_estudio = [papel._marcado(f"{numero[orden.id]}. {orden.study_name}", negritas=True)]
            categoria = getattr(orden, "category", "") or ""
            partes_estudio.append(papel._marcado(CATEGORIAS_DE_ORDEN.get(categoria, categoria)))
            if not destino_unico and _san(orden.destination) and not _repite_el_estudio(orden.destination, orden.study_name):
                partes_estudio.append(papel._marcado(f"Destino: {orden.destination}"))
            if ajustes["mostrar_fecha_limite"] and getattr(orden, "desired_on", None):
                partes_estudio.append(papel._marcado(f"Realizar a más tardar: {orden.desired_on.strftime('%d/%m/%Y')}"))
            propia = orden.clinical_indication
            if (ajustes["mostrar_indicacion"] and _san(propia)
                    and _normalizar_para_comparar(propia) != comun_normal
                    and not _repite_el_estudio(propia, orden.study_name)):
                if len(_san(propia)) > LARGO_MAXIMO_EN_CELDA:
                    partes_estudio.append(papel._marcado("Indicación: ver abajo"))
                    aparte.append((orden, "Indicación", propia))
                else:
                    partes_estudio.append(papel._marcado(f"Indicación: {propia}"))
            fila = [
                papel.celda(f"Orden n.º {orden.id}"),
                Paragraph("<br/>".join(p for p in partes_estudio if p), papel.estilo_celda),
                papel.celda(orden.specimen_or_body_site
                            if not _repite_el_estudio(orden.specimen_or_body_site, orden.study_name) else None),
            ]
            if ajustes["mostrar_prioridad"]:
                prioridad = getattr(orden, "priority", "") or "routine"
                fila.append(papel.celda(PRIORIDADES_DE_ORDEN.get(prioridad, prioridad),
                                        negritas=prioridad != "routine"))
            if alguna_preparacion:
                preparacion = orden.preparation_instructions
                if _san(preparacion) and len(_san(preparacion)) > LARGO_MAXIMO_EN_CELDA:
                    fila.append(papel.celda("Ver abajo"))
                    aparte.append((orden, "Preparación", preparacion))
                else:
                    fila.append(papel.celda(preparacion))
            filas.append(fila)

        estilo = TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), papel.acento),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("GRID", (0, 0), (-1, -1), 0.4, papel.linea),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ])
        papel.fluir(Table(filas, colWidths=anchos, repeatRows=1, style=estilo))

        for orden, etiqueta, texto in aparte:
            papel.parrafo(f"{etiqueta} de {orden.study_name} (Orden n.º {orden.id}):", negritas=True)
            papel.parrafo(texto)
        if ajustes["mostrar_preparacion"] and not alguna_preparacion:
            papel.parrafo(SIN_PREPARACION)

    if modo == "separado":
        for indice, (nombre, de_aqui) in enumerate(secciones):
            if indice:
                papel.nueva_pagina()
            encabezado_de_hoja()
            papel.titulo(f"{nombre} ({len(de_aqui)})")
            tabla(de_aqui)
    else:
        encabezado_de_hoja()
        papel.titulo(f"ESTUDIOS SOLICITADOS ({len(ordenes)})")
        for nombre, de_aqui in secciones:
            if len(secciones) > 1:
                papel.y -= 2
                if papel.y - 40 < papel.piso:
                    papel.nueva_pagina()
                papel.c.setFillColor(MEDICAL_DARK)
                papel.c.setFont("Helvetica-Bold", 9.5)
                papel.c.drawString(MARGIN, papel.y, nombre)
                papel.y -= 12
            tabla(de_aqui)

    return papel.terminar()
