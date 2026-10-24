"""PDF rendering for signed consent snapshots."""

import io
from textwrap import wrap

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.core.hora_local import ahora_local, utc_a_local


def _draw_cancellation_watermark(pdf, width: float, height: float) -> None:
    """Marca de agua diagonal para que el PDF anulado no se confunda con uno vigente."""
    pdf.saveState()
    pdf.setFillColor(colors.Color(0.85, 0.15, 0.15, alpha=0.18))
    pdf.setFont("Helvetica-Bold", 58)
    pdf.translate(width / 2, height / 2)
    pdf.rotate(38)
    pdf.drawCentredString(0, 0, "CANCELADO")
    pdf.restoreState()


def generate_consent_pdf(consent, patient, doctor, signature_content: bytes | None = None) -> bytes:
    """Render the exact persisted snapshot; this never regenerates template text.

    Cuando el consentimiento está cancelado se añade una marca de agua y una
    leyenda con el motivo; el texto firmado se reproduce igual que en el
    original, sin modificarse.
    """
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    cancelled = bool(getattr(consent, "cancelled_at", None))
    x, y = 46, height - 52
    pdf.setTitle(consent.title)
    if cancelled:
        _draw_cancellation_watermark(pdf, width, height)
    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawString(x, y, consent.title[:95])
    y -= 28
    pdf.setFont("Helvetica", 9)
    patient_name = f"{patient.first_name} {patient.last_name}"
    age = consent.field_values.get("patient_age", "")
    # Firma y cancelación se guardan en UTC (utcnow). Impresas tal cual, un
    # consentimiento firmado a las 17:30 de Mazatlán salía con la fecha del
    # día siguiente, y es un documento legal (plan 29, K-1). Sin firma, la
    # fecha es la de hoy en el consultorio, no la del contenedor.
    signed_date = utc_a_local(consent.patient_signed_at) if consent.patient_signed_at else ahora_local()
    pdf.drawString(
        x,
        y,
        f"Paciente: {patient_name}   Expediente: {patient.id}   Edad: {age}   Fecha: {signed_date.strftime('%d/%m/%Y')}",
    )
    y -= 14
    pdf.drawString(x, y, f"Médico tratante: {doctor.full_name}")
    if consent.procedure_name:
        y -= 14
        pdf.drawString(x, y, f"Procedimiento: {consent.procedure_name[:110]}")
    if consent.field_values.get("last_menstrual_period"):
        y -= 14
        pdf.drawString(
            x,
            y,
            f"FUM: {consent.field_values['last_menstrual_period']}   FPP: {consent.field_values.get('expected_delivery_date') or 'No registrada'}",
        )
    if consent.diagnosis:
        y -= 14
        pdf.drawString(x, y, f"Diagnóstico / indicación: {consent.diagnosis[:100]}")
    y -= 22
    pdf.setFont("Helvetica", 10)
    for paragraph in consent.rendered_body.split("\n"):
        for line in wrap(paragraph, width=105) or [""]:
            if y < 135:
                pdf.showPage()
                if cancelled:
                    _draw_cancellation_watermark(pdf, width, height)
                y = height - 52
                pdf.setFont("Helvetica", 10)
            pdf.drawString(x, y, line)
            y -= 14
        y -= 4
    if y < 175:
        pdf.showPage()
        if cancelled:
            _draw_cancellation_watermark(pdf, width, height)
        y = height - 52
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(x, y, "Confirmaciones de la paciente")
    y -= 16
    pdf.setFont("Helvetica", 9)
    for item in consent.acknowledgements:
        pdf.drawString(x, y, f"[X] {item[:110]}")
        y -= 13
    y -= 18
    if signature_content:
        pdf.drawImage(
            ImageReader(io.BytesIO(signature_content)),
            x,
            y - 48,
            width=150,
            height=48,
            preserveAspectRatio=True,
            mask="auto",
        )
    pdf.line(x, y - 52, x + 200, y - 52)
    pdf.setFont("Helvetica", 9)
    pdf.drawString(x, y - 65, f"Firma de paciente: {consent.patient_signed_name}")
    pdf.drawString(
        x,
        y - 78,
        f"Firmado: {signed_date.strftime('%d/%m/%Y %H:%M')}" if consent.patient_signed_at else "Firmado: sin firma",
    )
    pdf.drawString(x + 275, y - 65, f"Médico que confirmó: {doctor.full_name}")
    if cancelled:
        pdf.setFillColor(colors.HexColor("#B32020"))
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(x, 64, "CONSENTIMIENTO CANCELADO - SIN VALIDEZ")
        pdf.setFont("Helvetica", 8)
        cancelled_on = utc_a_local(consent.cancelled_at).strftime("%d/%m/%Y %H:%M")
        reason = (consent.cancelled_reason or "")[:120]
        by_name = getattr(consent, "cancelled_by_name", None) or "No registrado"
        pdf.drawString(x, 52, f"Cancelado el {cancelled_on} por {by_name}. Motivo: {reason}")
        pdf.setFillColor(colors.black)
    pdf.setFont("Helvetica-Oblique", 7)
    pdf.drawString(
        x,
        34,
        f"Consentimiento digital inmutable · Integrado al expediente clínico · Hash: {consent.content_hash}",
    )
    pdf.save()
    return buffer.getvalue()
