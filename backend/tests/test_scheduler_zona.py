"""Los trabajos programados corren en hora del consultorio.

Sin zona, APScheduler toma la del contenedor, que corre en UTC: «6:00» era
las 23:00 de Mazatlán del día anterior, y la «agenda de hoy» le contaba a la
doctora, de noche, las citas de un día que ya se acababa (plan 27).
"""
from app.core.config import settings
from app.core.scheduler import scheduler


def test_los_jobs_diarios_corren_en_hora_del_consultorio():
    assert str(scheduler.timezone) == settings.CLINIC_TIMEZONE
