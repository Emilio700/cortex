"""El papel del resumen clínico (plan 32, punto 8).

Usa el mismo membrete, la misma firma en cada hoja y el mismo partido de
páginas que la orden de estudios (``_PapelDeOrden``): el médico ya lo
configuró para la orden y el resumen sale con su misma imagen.

La vista previa lleva la marca «VISTA PREVIA — SIN VALIDEZ» en cada hoja y no
lleva folio: lo que se imprime antes de emitir no puede pasar por un
documento emitido.
"""
from __future__ import annotations

import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.platypus import Paragraph

from app.core.hora_local import ahora_local
from app.services.resumen_clinico import Resumen
from app.utils.orden_config import resolver_ajustes_orden
from app.utils.pdf import PAGE_W, _PapelDeOrden, _san

TITULO = "RESUMEN CLÍNICO"
FOLIO_DE_VISTA_PREVIA = "VISTA PREVIA — SIN FOLIO"
MARCA_DE_VISTA_PREVIA = "VISTA PREVIA — SIN VALIDEZ"


class _PapelDeResumen(_PapelDeOrden):
    def __init__(self, *args, vista_previa: bool, **kwargs):
        self.vista_previa = vista_previa
        super().__init__(*args, **kwargs)

    def cerrar_pagina(self) -> None:
        if self.vista_previa:
            c = self.c
            c.saveState()
            c.setFillColor(colors.Color(0.8, 0.1, 0.1, alpha=0.15))
            c.setFont("Helvetica-Bold", 40)
            c.translate(PAGE_W / 2, 400)
            c.rotate(35)
            c.drawCentredString(0, 0, MARCA_DE_VISTA_PREVIA)
            c.restoreState()
        super().cerrar_pagina()

    def campo(self, etiqueta: str, valor: str) -> None:
        """«Etiqueta: valor», partiéndose entre páginas si el valor es largo."""
        renglones = [escape(_san(linea)) for linea in str(valor).splitlines()]
        texto = "<br/>".join(r for r in renglones if r) or "—"
        self.fluir(Paragraph(f"<b>{escape(etiqueta)}:</b> {texto}", self.estilo_texto))

    def subtitulo(self, texto: str) -> None:
        self.fluir(Paragraph(f"<b><u>{escape(_san(texto))}</u></b>", self.estilo_texto))


def generar_resumen_pdf(resumen: Resumen, doctor_profile, *, folio: str | None, tenant_name: str = "") -> io.BytesIO:
    """Sin ``folio`` es la vista previa."""
    vista_previa = folio is None
    emitido = ahora_local()
    papel = _PapelDeResumen(
        doctor_profile,
        doc_title=TITULO,
        folio=folio or FOLIO_DE_VISTA_PREVIA,
        date_str=f"Emitido: {emitido.strftime('%d/%m/%Y %H:%M')} (hora de Mazatlán)",
        tenant_name=tenant_name,
        ajustes_orden=resolver_ajustes_orden(doctor_profile),
        vista_previa=vista_previa,
    )
    papel.titulo("PACIENTE")
    for renglon in resumen.paciente:
        papel.campo(renglon.etiqueta, renglon.valor)

    for seccion in resumen.secciones:
        papel.titulo(seccion.titulo.upper())
        for renglon in seccion.renglones:
            papel.campo(renglon.etiqueta, renglon.valor)
        for bloque in seccion.bloques:
            papel.subtitulo(bloque.titulo)
            for renglon in bloque.renglones:
                papel.campo(renglon.etiqueta, renglon.valor)
        if seccion.vacio:
            papel.parrafo(seccion.vacio)

    return papel.terminar()
