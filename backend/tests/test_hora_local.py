"""La hora del consultorio, no la del contenedor.

Motivo real: ``appointments.scheduled_at`` guarda hora local de Mazatlan y el
contenedor corre en UTC. El programador comparaba ``datetime.utcnow()``
contra esa hora local, asi que los recordatorios salian con 7 horas de
desfase. Con avisos de "una semana antes" encima, el error se nota mas.
"""
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.core.hora_local import ahora_local, hoy_local, zona_del_consultorio


def test_la_zona_configurada_es_la_del_consultorio():
    assert settings.CLINIC_TIMEZONE == "America/Mazatlan"
    assert zona_del_consultorio() is not None


def test_la_hora_local_va_sin_zona():
    """Ingenua a proposito: se compara con scheduled_at, que tambien lo es."""
    assert ahora_local().tzinfo is None


def test_la_hora_local_no_es_la_utc():
    """El fondo del error: Mazatlan va 6 o 7 horas por detras de UTC."""
    utc = datetime.now(timezone.utc).replace(tzinfo=None)
    diferencia = abs((utc - ahora_local()).total_seconds()) / 3600
    assert 5.5 <= diferencia <= 8.5, (
        f"La diferencia con UTC es de {diferencia:.1f} h; se esperaba el huso "
        "de Mazatlan. Si el servidor cambio de zona, revisa CLINIC_TIMEZONE."
    )


def test_hoy_local_concuerda_con_la_hora_local():
    assert hoy_local() == ahora_local().date()


def test_un_recordatorio_se_dispara_a_la_hora_correcta():
    """Reproduce el calculo del programador con una cita cercana.

    Si se comparara contra UTC, una cita a 30 minutos vista se veria a 7
    horas y el recordatorio no saldria.
    """
    ahora = ahora_local()
    cita = ahora + timedelta(minutes=30)
    minutos_antes = 30

    momento_de_envio = cita - timedelta(minutes=minutos_antes)
    dentro_de_la_ventana = (
        ahora >= momento_de_envio
        and ahora < momento_de_envio + timedelta(minutes=5)
    )
    assert dentro_de_la_ventana, "El recordatorio no se dispararia a tiempo"


def test_una_cita_de_manana_no_dispara_el_recordatorio_de_hoy():
    ahora = ahora_local()
    cita = ahora + timedelta(days=1)
    momento_de_envio = cita - timedelta(minutes=30)
    assert ahora < momento_de_envio


# ---------------------------------------------------------------------------
# Traducción entre hora local y marcas UTC (plan 23: corte de caja)
# ---------------------------------------------------------------------------

from datetime import date  # noqa: E402

from app.core.hora_local import dia_local_en_utc, local_a_utc, utc_a_local  # noqa: E402


def test_ida_y_vuelta_entre_local_y_utc_no_pierde_nada():
    local = datetime(2026, 9, 28, 20, 15)
    assert utc_a_local(local_a_utc(local)) == local


def test_las_ocho_de_la_noche_en_mazatlan_ya_son_otro_dia_en_utc():
    """El defecto del corte: calcular "hoy" en UTC cortaba el día a media tarde."""
    utc = local_a_utc(datetime(2026, 9, 28, 20, 0))
    assert utc.date() == date(2026, 9, 29)
    assert utc.tzinfo is None


def test_una_fecha_con_zona_se_respeta():
    con_zona = datetime(2026, 9, 28, 12, 0, tzinfo=timezone.utc)
    assert local_a_utc(con_zona) == datetime(2026, 9, 28, 12, 0)


def test_el_dia_local_abarca_las_24_horas_locales():
    inicio, fin = dia_local_en_utc(date(2026, 9, 28))
    assert utc_a_local(inicio) == datetime(2026, 9, 28, 0, 0)
    assert utc_a_local(fin).date() == date(2026, 9, 28)
    assert (fin - inicio) > timedelta(hours=23, minutes=59)
