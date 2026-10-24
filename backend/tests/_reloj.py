"""Reloj fijo que imita al servidor de producción, que corre en UTC.

Los defectos de "hoy en UTC" sólo se ven por la tarde-noche de Mazatlán, cuando
el contenedor ya cambió de día y el consultorio no. Esta PC está en hora de
Mazatlán, así que un ``date.today()`` suelto aquí "funciona" y en producción no:
para que la prueba lo atrape sin depender de la máquina ni de la hora, se fija
un instante y se hace que todo reloj ingenuo (``date.today()``,
``datetime.now()``) conteste en UTC, como el contenedor.

Uso::

    servidor_en_utc(monkeypatch, datetime(2026, 10, 4, 6, 30), mi_modulo)

``mi_modulo`` es el módulo que se prueba: se le sustituyen ``date`` y
``datetime`` si los importó. ``hora_local`` y ``db.session`` siempre se fijan,
para que ``ahora_local()``, ``hoy_local()`` y ``utcnow()`` digan el mismo
instante.
"""
from datetime import date, datetime, timezone


def servidor_en_utc(monkeypatch, instante_utc: datetime, *modulos):
    instante = instante_utc.replace(tzinfo=timezone.utc)

    class FechaDelServidor(date):
        @classmethod
        def today(cls):
            return instante.date()

    class MomentoDelServidor(datetime):
        @classmethod
        def now(cls, tz=None):
            if tz is None:
                return instante.replace(tzinfo=None)
            return instante.astimezone(tz)

        @classmethod
        def utcnow(cls):
            return instante.replace(tzinfo=None)

        @classmethod
        def today(cls):
            return cls.now()

    import app.core.hora_local as hora_local
    import app.db.session as sesion

    for modulo in (hora_local, sesion, *modulos):
        if isinstance(getattr(modulo, "datetime", None), type):
            monkeypatch.setattr(modulo, "datetime", MomentoDelServidor)
        if isinstance(getattr(modulo, "date", None), type):
            monkeypatch.setattr(modulo, "date", FechaDelServidor)
