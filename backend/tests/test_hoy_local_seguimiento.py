"""El «hoy» del seguimiento clínico es el del consultorio (plan 26, D-12).

El tablero de FPP próximas calculaba su horizonte con ``date.today()`` del
contenedor, que corre en UTC: a las 23:30 del 3 de octubre en Mazatlán ya es el
4 en UTC, y el tablero alcanzaba un día de más.
"""
import re
from datetime import date
from pathlib import Path

from app.models.pregnancy import Pregnancy

from test_orden_estudio_pdf import (  # noqa: F401 (fixtures)
    PREFIX,
    _auth_headers,
    client,
    db_session,
    escenario,
)


def test_el_horizonte_del_tablero_de_fpp_cuenta_desde_hoy_local(client, db_session, escenario, monkeypatch):
    import app.routers.clinical_tracking as rutas

    # 23:30 del 03/10/2026 en Mazatlán: en UTC ya es el 04/10.
    monkeypatch.setattr(rutas, "hoy_local", lambda: date(2026, 10, 3))
    t, p, d = escenario["tenant"], escenario["paciente"], escenario["doctora"]
    dentro = Pregnancy(tenant_id=t.id, patient_id=p.id, doctor_id=d.id, estimated_delivery_date=date(2026, 11, 2))
    fuera = Pregnancy(tenant_id=t.id, patient_id=p.id, doctor_id=d.id, estimated_delivery_date=date(2026, 11, 3))
    db_session.add_all([dentro, fuera])
    db_session.commit()

    respuesta = client.get(f"{PREFIX}/clinical-tracking/obstetric-dashboard", params={"days": 30},
                           headers=_auth_headers(db_session, d))

    assert respuesta.status_code == 200
    assert [item["pregnancy_id"] for item in respuesta.json()] == [dentro.id]


def test_el_router_no_usa_el_reloj_del_contenedor_como_hoy():
    """Las marcas ``utcnow()`` se guardan en UTC a propósito; «hoy» es ``hoy_local()``."""
    fuente = (Path(__file__).resolve().parent.parent / "app" / "routers" / "clinical_tracking.py").read_text(encoding="utf-8")

    assert not re.search(r"date\.today\(\)|datetime\.now\(|datetime\.utcnow\(", fuente)


def test_los_pdf_no_usan_el_reloj_del_contenedor():
    fuente = (Path(__file__).resolve().parent.parent / "app" / "utils" / "pdf.py").read_text(encoding="utf-8")

    assert not re.search(r"date\.today\(\)|datetime\.now\(|datetime\.utcnow\(|utcnow\(\)", fuente)
