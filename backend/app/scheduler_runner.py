"""Dedicated production entry point for scheduled background jobs.

Gunicorn runs several web workers, so starting APScheduler from every FastAPI
lifespan would execute reminders and daily notifications more than once.  This
module gives Docker Compose one process that exclusively owns the schedule.
"""

import logging
import signal
import sys
from threading import Event

from app.core.scheduler import shutdown_scheduler, start_scheduler

log = logging.getLogger(__name__)


def _configurar_bitacora() -> None:
    """Sin esto el contenedor del scheduler no emitia UNA SOLA linea.

    Python sin ``basicConfig`` solo saca WARNING y peor por la raiz, y ademas
    sin handler configurado; los ``logger.info`` de los trabajos se perdian.
    Estuvo dias corriendo a ciegas: si un trabajo fallaba, nadie se enteraba, y
    el aviso de "el espejo no se registro porque faltan credenciales" tampoco
    se veia. Es la misma familia de fallo silencioso que costo dos meses de
    notas de consulta.
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        stream=sys.stdout,
        force=True,
    )


def main() -> None:
    _configurar_bitacora()
    log.info("Scheduler arrancando")
    stop_event = Event()

    def request_shutdown(_signum: int, _frame: object) -> None:
        stop_event.set()

    signal.signal(signal.SIGINT, request_shutdown)
    signal.signal(signal.SIGTERM, request_shutdown)

    start_scheduler()
    try:
        stop_event.wait()
    finally:
        log.info("Scheduler deteniendose")
        shutdown_scheduler()


if __name__ == "__main__":
    main()
