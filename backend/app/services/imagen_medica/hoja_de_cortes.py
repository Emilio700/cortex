"""La hoja de cortes clave en PDF: lo que se adjunta a la nota o se le entrega al paciente.

Una figura por corte, con la serie, la posición del corte, la fecha del estudio
y la nota del médico. Lleva siempre la leyenda de que es material de apoyo y no
un informe radiológico: el visor muestra, mide y compara, no interpreta.

Con ``anonimo`` no se imprime el nombre ni la fecha de nacimiento, para mandarla
a un colega sin darle el expediente.
"""
from dataclasses import dataclass
from io import BytesIO
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.utils.pdf import _age_str, _fecha_larga, _san, _wrap_text

PAGE_W, PAGE_H = A4
MARGEN = 0.6 * inch
AZUL = colors.HexColor("#0b1d45")
TENUE = colors.HexColor("#6b7a99")

LEYENDA = (
    "Material de apoyo para la consulta. No es un informe radiológico ni sustituye "
    "la interpretación del médico especialista."
)

COLUMNAS = 2
FILAS = 3


@dataclass
class FiguraDeCorte:
    """Una figura de la hoja. ``imagen`` es el PNG de la captura."""

    imagen: bytes
    titulo: str
    detalle: str = ""
    nota: Optional[str] = None


def _recortar(c: canvas.Canvas, texto: str, fuente: str, tamano: float, ancho: float) -> str:
    texto = _san(texto)
    while texto and c.stringWidth(texto, fuente, tamano) > ancho:
        texto = texto[:-1]
    return texto


def _encabezado(c, *, consultorio: str, estudio: str, paciente_linea: str, hoja: int, total: int):
    c.setFillColor(AZUL)
    c.rect(0, PAGE_H - 0.95 * inch, PAGE_W, 0.95 * inch, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 17)
    c.drawString(MARGEN, PAGE_H - 0.5 * inch, "CORTEX")
    c.setFont("Helvetica", 8.5)
    c.setFillColor(colors.HexColor("#9fb2d6"))
    c.drawString(MARGEN, PAGE_H - 0.68 * inch, _san(consultorio).upper()[:70])
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(PAGE_W - MARGEN, PAGE_H - 0.45 * inch, _recortar(c, estudio, "Helvetica-Bold", 10, 4.2 * inch))
    c.setFont("Helvetica", 8.5)
    c.setFillColor(colors.HexColor("#c9d4e6"))
    c.drawRightString(PAGE_W - MARGEN, PAGE_H - 0.63 * inch, _recortar(c, paciente_linea, "Helvetica", 8.5, 4.2 * inch))
    c.drawRightString(PAGE_W - MARGEN, PAGE_H - 0.8 * inch, f"Hoja {hoja} de {total}")


def _pie(c, *, generado_por: str, generado_el: str):
    c.setStrokeColor(colors.HexColor("#d5dbe8"))
    c.line(MARGEN, 0.78 * inch, PAGE_W - MARGEN, 0.78 * inch)
    c.setFillColor(TENUE)
    c.setFont("Helvetica", 7.5)
    for i, linea in enumerate(_wrap_text(c, LEYENDA, PAGE_W - 2 * MARGEN, "Helvetica", 7.5)):
        c.drawString(MARGEN, 0.62 * inch - i * 9, linea)
    c.drawString(MARGEN, 0.36 * inch, _san(f"Generado por {generado_por} el {generado_el}"))


def generar_hoja_de_cortes(
    figuras: list[FiguraDeCorte],
    *,
    consultorio: str,
    estudio: str,
    paciente=None,
    generado_por: str,
    ahora,
    anonimo: bool = False,
) -> bytes:
    """Arma el PDF. ``figuras`` no puede estar vacía (lo valida quien llama)."""
    por_hoja = COLUMNAS * FILAS
    total = max(1, -(-len(figuras) // por_hoja))
    if anonimo or paciente is None:
        paciente_linea = "Paciente anónimo"
    else:
        nombre = _san(f"{paciente.first_name} {paciente.last_name}")
        paciente_linea = f"{nombre} · {_age_str(paciente.date_of_birth)}"

    buffer = BytesIO()
    # Sin comprimir el texto de la página: pesa poco y así se puede comprobar en
    # pruebas qué datos lleva el PDF (p. ej. que el modo anónimo no imprime el
    # nombre). Las imágenes se comprimen igual.
    c = canvas.Canvas(buffer, pagesize=A4, pageCompression=0)
    c.setTitle(f"Cortes clave - {_san(estudio)}")
    c.setAuthor("CORTEX")

    ancho_celda = (PAGE_W - 2 * MARGEN - 0.25 * inch * (COLUMNAS - 1)) / COLUMNAS
    zona_alto = PAGE_H - 0.95 * inch - 0.35 * inch - 0.95 * inch
    alto_celda = zona_alto / FILAS
    generado_el = _fecha_larga(ahora, con_hora=True)

    for pagina in range(total):
        _encabezado(
            c, consultorio=consultorio, estudio=estudio, paciente_linea=paciente_linea,
            hoja=pagina + 1, total=total,
        )
        _pie(c, generado_por=generado_por, generado_el=generado_el)
        for posicion, figura in enumerate(figuras[pagina * por_hoja : (pagina + 1) * por_hoja]):
            fila, columna = divmod(posicion, COLUMNAS)
            x = MARGEN + columna * (ancho_celda + 0.25 * inch)
            y_tope = PAGE_H - 0.95 * inch - 0.25 * inch - fila * alto_celda

            lado = min(ancho_celda, alto_celda - 0.62 * inch)
            c.setFillColor(colors.black)
            c.rect(x, y_tope - lado, ancho_celda, lado, fill=1, stroke=0)
            try:
                lector = ImageReader(BytesIO(figura.imagen))
                ancho_img, alto_img = lector.getSize()
                escala = min(ancho_celda / ancho_img, lado / alto_img)
                w, h = ancho_img * escala, alto_img * escala
                c.drawImage(lector, x + (ancho_celda - w) / 2, y_tope - lado + (lado - h) / 2, w, h)
            except Exception:
                c.setFillColor(colors.white)
                c.setFont("Helvetica", 8)
                c.drawCentredString(x + ancho_celda / 2, y_tope - lado / 2, "No se pudo leer la imagen")

            c.setFillColor(AZUL)
            c.setFont("Helvetica-Bold", 8.5)
            c.drawString(x, y_tope - lado - 11, _recortar(c, figura.titulo, "Helvetica-Bold", 8.5, ancho_celda))
            c.setFillColor(TENUE)
            c.setFont("Helvetica", 7.5)
            c.drawString(x, y_tope - lado - 21, _recortar(c, figura.detalle, "Helvetica", 7.5, ancho_celda))
            if figura.nota:
                c.setFillColor(colors.HexColor("#25314d"))
                lineas = _wrap_text(c, figura.nota, ancho_celda, "Helvetica", 7.5)[:2]
                for i, linea in enumerate(lineas):
                    c.drawString(x, y_tope - lado - 31 - i * 9, linea)
        c.showPage()
    c.save()
    return buffer.getvalue()
