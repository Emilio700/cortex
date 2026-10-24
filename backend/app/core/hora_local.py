"""Hora local del consultorio.

``appointments.scheduled_at`` es ``timestamp without time zone`` y guarda la
hora **local** del consultorio: si la cita es a las 6 de la tarde, ahi dice
18:00. El contenedor, en cambio, corre en UTC.

Comparar una contra otra desfasa los recordatorios tantas horas como diga el
huso (7 en Mazatlan): los avisos salian a deshora. De ahi este modulo.
"""
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.config import settings


def zona_del_consultorio() -> ZoneInfo:
    """Zona configurada; si no se puede resolver, se cae a UTC avisando.

    Un contenedor sin la base de datos de husos horarios haria estallar el
    programador entero, y es preferible un recordatorio desfasado a que no
    salga ninguno.
    """
    try:
        return ZoneInfo(settings.CLINIC_TIMEZONE)
    except (ZoneInfoNotFoundError, ValueError):  # pragma: no cover
        import logging

        logging.getLogger(__name__).warning(
            "No se pudo cargar la zona horaria %s; se usa UTC y los "
            "recordatorios saldran desfasados",
            settings.CLINIC_TIMEZONE,
        )
        return ZoneInfo("UTC")


def ahora_local() -> datetime:
    """El ahora del consultorio, **sin** zona horaria.

    Se devuelve ingenuo a proposito, para poder compararlo con
    ``scheduled_at``, que tambien lo es.
    """
    return datetime.now(zona_del_consultorio()).replace(tzinfo=None)


def hoy_local():
    """La fecha de hoy en el consultorio."""
    return ahora_local().date()


# ---------------------------------------------------------------------------
# Conversión entre la hora local y la UTC de las marcas de tiempo
# ---------------------------------------------------------------------------
# ``payments.paid_at`` (y casi todo ``created_at``) se guarda en UTC ingenuo,
# al revés que ``scheduled_at``. Por eso "el corte de hoy" calculado en UTC
# cortaba el día a las 17:00 o 18:00 de Mazatlán y los cobros de la tarde caían
# en el corte de mañana (plan 23). Estas funciones son la única traducción.


def utc_a_local(momento: datetime) -> datetime:
    """Una marca UTC ingenua, vista como hora del consultorio (también ingenua)."""
    return (
        momento.replace(tzinfo=timezone.utc)
        .astimezone(zona_del_consultorio())
        .replace(tzinfo=None)
    )


def local_a_utc(momento: datetime) -> datetime:
    """Una hora del consultorio, traducida a UTC ingenuo para compararla con la BD.

    Si ``momento`` ya trae zona se respeta la suya: quien la mandó sabe mejor
    que nosotros qué hora quiso decir.
    """
    if momento.tzinfo is None:
        momento = momento.replace(tzinfo=zona_del_consultorio())
    return momento.astimezone(timezone.utc).replace(tzinfo=None)


def dia_local_en_utc(fecha: date) -> tuple[datetime, datetime]:
    """Inicio y fin del día local ``fecha``, expresados en UTC ingenuo."""
    return (
        local_a_utc(datetime.combine(fecha, time.min)),
        local_a_utc(datetime.combine(fecha, time.max)),
    )
