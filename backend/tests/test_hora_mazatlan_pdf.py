"""Toda fecha y hora impresa sale en hora de Mazatlán (plan 26, D-12).

``created_at`` y ``paid_at`` se guardan en UTC. A las 23:30 del 3 de octubre en
Mazatlán ya son las 06:30 del 4 en UTC: impresas tal cual, la receta, el
certificado y el recibo decían «mañana».
"""
from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest
import reportlab.rl_config

import app.utils.pdf as pdf
from app.core.hora_local import utc_a_local, zona_del_consultorio
from test_orden_estudio_pdf import _texto_del_pdf

# 23:30 del 03/10/2026 en Mazatlán (UTC−7) = 06:30 del 04/10 en UTC.
NOCHE_UTC = datetime(2026, 10, 4, 6, 30)


@pytest.fixture(autouse=True)
def _pdf_sin_comprimir():
    anterior = reportlab.rl_config.pageCompression
    reportlab.rl_config.pageCompression = 0
    yield
    reportlab.rl_config.pageCompression = anterior


@pytest.fixture(autouse=True)
def _reloj_fijo(monkeypatch):
    # El pie «Generado» usa el reloj real. Corrida justo el 04/10 local, la
    # prueba fallaba aunque la fecha del documento estuviera bien: se fija un
    # «ahora» lejano para que sólo cuente la fecha que se está probando.
    monkeypatch.setattr(pdf, "ahora_local", lambda: datetime(2026, 11, 20, 12, 0))


def _perfil():
    return SimpleNamespace(
        user=SimpleNamespace(full_name="Yara Gutiérrez", tratamiento="Dra."),
        specialty=SimpleNamespace(name="Ginecología"), professional_id="123", university=None,
        clinic_address=None, phone=None, logo_url=None, signature_url=None, general_registry=None,
        specialty_license=None, health_registry=None, council_cert=None, prescription_display_name=None,
        prescription_settings=None, prescription_footer_text=None, prescription_accent_color=None,
        prescription_signature_style=None, order_settings=None,
    )


def _paciente():
    return SimpleNamespace(first_name="María", last_name="López", date_of_birth=date(1990, 5, 20), allergies=None)


def test_la_zona_es_mazatlan_sin_horario_de_verano():
    """México quitó el horario de verano en 2022: UTC−7 todo el año."""
    from zoneinfo import ZoneInfo

    assert zona_del_consultorio() == ZoneInfo("America/Mazatlan")
    for mes in (1, 4, 7, 10):
        assert utc_a_local(datetime(2026, mes, 15, 12, 0)) == datetime(2026, mes, 15, 5, 0)


def test_la_receta_imprime_la_fecha_local():
    receta = SimpleNamespace(id=1, folio_number="RX-1", created_at=NOCHE_UTC, diagnosis=None,
                             medications=[{"name": "PARACETAMOL"}], instructions=None)

    texto = _texto_del_pdf(pdf.generate_prescription_pdf(receta, _perfil(), _paciente()).read())

    assert "03/10/2026" in texto
    assert "04/10/2026" not in texto


def test_el_certificado_imprime_la_fecha_local():
    certificado = SimpleNamespace(id=1, folio_number="CM-1", created_at=NOCHE_UTC, diagnosis="Sana",
                                  certificate_type="salud", notes="", tenant_id=1)

    texto = _texto_del_pdf(pdf.generate_certificate_pdf(certificado, _perfil(), _paciente()).read())

    assert "03/10/2026" in texto
    assert "04/10/2026" not in texto


def test_el_recibo_imprime_la_hora_local():
    pago = SimpleNamespace(id=7, tenant_id=1, amount=Decimal("800"), paid_at=NOCHE_UTC,
                           method=SimpleNamespace(value="cash"), description=None)

    texto = _texto_del_pdf(pdf.generate_receipt_pdf(pago, _paciente(), doctor_name="Dra. Yara").read())

    assert "23:30" in texto
    assert "06:30" not in texto


def test_la_vista_previa_de_la_receta_no_mueve_la_fecha_dos_veces(monkeypatch):
    """La vista previa manda UTC, como una receta guardada; el PDF la convierte una vez."""
    import app.routers.doctor_profile as rutas

    monkeypatch.setattr(rutas, "utcnow", lambda: NOCHE_UTC)
    receta, paciente, _ = rutas._receta_de_muestra()

    texto = _texto_del_pdf(pdf.generate_prescription_pdf(receta, _perfil(), paciente).read())

    assert "03/10/2026" in texto


def test_los_meses_salen_en_espanol():
    certificado = SimpleNamespace(id=1, folio_number="CM-1", created_at=NOCHE_UTC, diagnosis="Sana",
                                  certificate_type="salud", notes="", tenant_id=1)
    pago = SimpleNamespace(id=7, tenant_id=1, amount=Decimal("800"), paid_at=NOCHE_UTC,
                           method=SimpleNamespace(value="cash"), description=None)

    texto = _texto_del_pdf(pdf.generate_certificate_pdf(certificado, _perfil(), _paciente()).read())
    texto += _texto_del_pdf(pdf.generate_receipt_pdf(pago, _paciente()).read())

    assert "03 de octubre de 2026" in texto
    assert "October" not in texto
