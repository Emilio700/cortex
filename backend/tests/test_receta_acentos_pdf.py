"""Los atajos de la receta llevan acentos y así se imprimen (plan 29, T-5).

Los botones de atajo de la receta («Vía oral», «3 días», «Cápsulas») se
guardan tal cual en el medicamento y salen en el PDF. Antes iban sin acentos
y la receta impresa decía «Via oral por 3 dias». Esto comprueba que el PDF
conserva los acentos (Helvetica de ReportLab los trae en su codificación).
"""
from datetime import datetime
from types import SimpleNamespace

import pytest
import reportlab.rl_config

import app.utils.pdf as pdf
from test_hora_mazatlan_pdf import _paciente, _perfil
from test_orden_estudio_pdf import _texto_del_pdf


@pytest.fixture(autouse=True)
def _pdf_sin_comprimir():
    anterior = reportlab.rl_config.pageCompression
    reportlab.rl_config.pageCompression = 0
    yield
    reportlab.rl_config.pageCompression = anterior


def test_los_atajos_con_acento_salen_igual_en_la_receta():
    receta = SimpleNamespace(
        id=1, folio_number="RX-1", created_at=datetime(2026, 10, 4, 18, 0), diagnosis=None,
        medications=[{
            "name": "PARACETAMOL", "presentation": "Cápsulas", "dosage": "1 tableta",
            "frequency": "Cada 8 h", "route": "Vía oral", "duration": "3 días",
        }],
        instructions="SI PERSISTEN LOS SÍNTOMAS, ACUDIR AL MÉDICO",
    )

    texto = _texto_del_pdf(pdf.generate_prescription_pdf(receta, _perfil(), _paciente()).read())

    for frase in ("Cápsulas", "Vía oral", "3 días", "SÍNTOMAS", "MÉDICO"):
        assert frase in texto, frase
