"""El PDF del consentimiento imprime firma y cancelación en hora de Mazatlán.

``patient_signed_at`` y ``cancelled_at`` se guardan en UTC. Un consentimiento
firmado a las 17:30 de Mazatlán (00:30 del día siguiente en UTC) salía con la
fecha de mañana, y es un documento legal (plan 29, K-1).
"""
from datetime import datetime
from types import SimpleNamespace

import pytest
import reportlab.rl_config

import app.services.consent_pdf_service as servicio
from test_orden_estudio_pdf import _texto_del_pdf


@pytest.fixture(autouse=True)
def _pdf_sin_comprimir():
    anterior = reportlab.rl_config.pageCompression
    reportlab.rl_config.pageCompression = 0
    yield
    reportlab.rl_config.pageCompression = anterior


def _consentimiento(**extra):
    datos = dict(
        title="Consentimiento informado", field_values={"patient_age": "35"}, procedure_name=None,
        diagnosis=None, rendered_body="Texto.", acknowledgements=["Entendí"], patient_signed_name="ANA",
        patient_signed_at=None, cancelled_at=None, cancelled_reason=None, content_hash="abc",
    )
    datos.update(extra)
    return SimpleNamespace(**datos)


def _pdf(consentimiento):
    paciente = SimpleNamespace(id=4, first_name="Ana", last_name="López")
    doctora = SimpleNamespace(full_name="Yara Gutiérrez")
    return _texto_del_pdf(servicio.generate_consent_pdf(consentimiento, paciente, doctora))


@pytest.mark.parametrize(
    "utc, local",
    [
        # 16:59 de Mazatlán = 23:59 UTC: mismo día en las dos zonas.
        (datetime(2026, 10, 3, 23, 59), "03/10/2026 16:59"),
        # 17:00 de Mazatlán = 00:00 UTC del día siguiente: aquí fallaba.
        (datetime(2026, 10, 4, 0, 0), "03/10/2026 17:00"),
        (datetime(2026, 10, 4, 0, 30), "03/10/2026 17:30"),
    ],
)
def test_la_firma_sale_en_hora_del_consultorio(utc, local):
    texto = _pdf(_consentimiento(patient_signed_at=utc))

    assert f"Firmado: {local}" in texto
    assert f"Fecha: {local[:10]}" in texto


def test_la_cancelacion_sale_en_hora_del_consultorio():
    texto = _pdf(
        _consentimiento(
            patient_signed_at=datetime(2026, 10, 3, 18, 0),
            cancelled_at=datetime(2026, 10, 4, 0, 30),
            cancelled_reason="Error de captura",
        )
    )

    assert "Cancelado el 03/10/2026 17:30" in texto


def test_sin_firma_la_fecha_es_la_de_hoy_en_el_consultorio(monkeypatch):
    monkeypatch.setattr(servicio, "ahora_local", lambda: datetime(2026, 10, 3, 17, 30))

    texto = _pdf(_consentimiento())

    assert "Fecha: 03/10/2026" in texto
