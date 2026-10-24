"""Las rutas usan la hora local del consultorio, no la del contenedor (B-08).

``reports.py`` filtraba con `datetime.utcnow()` un rango contra
``Appointment.scheduled_at``, que se guarda en hora local: en la tarde/noche de
Mazatlán (UTC-7) el "hoy" se adelantaba un día y el corte del mes caía
desfasado. Las vistas previas de receta imprimían la fecha del contenedor por la
misma razón. Aquí se prueba con fechas límite (fin de mes, cambio de día).
"""
from datetime import datetime

import app.routers.doctor_profile as doctor_profile
import app.routers.prescriptions as prescriptions
import app.routers.reports as reports
from app.routers.reports import _default_range


def test_el_rango_por_defecto_toma_el_mes_en_hora_local(monkeypatch):
    """El rango por defecto es el mes local, no el del contenedor."""
    # Un instante de fin de mes por la noche: en Mazatlán son las 22:00 del 31 de
    # marzo, pero en UTC ya es el 1 de abril. El reporte debe seguir en marzo.
    local = datetime(2026, 3, 31, 22, 0)
    monkeypatch.setattr(reports, "ahora_local", lambda: local)

    inicio, fin = _default_range(None, None)

    assert inicio.date().isoformat() == "2026-03-01"
    # El fin es hoy local (31 de marzo), no el 1 de abril que daría utcnow().
    assert fin.date().isoformat() == "2026-03-31"


def test_un_rango_dado_se_respeta_tal_cual(monkeypatch):
    """Si la usuaria elige fechas, no se tocan: sólo se rellenan las que falten."""
    monkeypatch.setattr(reports, "ahora_local", lambda: datetime(2026, 3, 15, 12, 0))
    dado_inicio = datetime(2026, 1, 10, 0, 0)
    dado_fin = datetime(2026, 1, 20, 0, 0)

    inicio, fin = _default_range(dado_inicio, dado_fin)

    assert inicio == dado_inicio
    assert fin == dado_fin


def test_las_rutas_usan_el_helper_de_hora_local():
    """El reporte y la vista previa del perfil leen el reloj del consultorio."""
    from app.core.hora_local import ahora_local as helper

    assert doctor_profile.ahora_local is helper
    assert reports.ahora_local is helper


def test_la_vista_previa_manda_utc_para_no_mover_la_fecha_dos_veces():
    """El PDF convierte a hora de Mazatlán (plan 26, D-12); la vista previa le da UTC."""
    from app.db.session import utcnow

    assert prescriptions.utcnow is utcnow
