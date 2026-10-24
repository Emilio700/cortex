"""Freno de fuerza bruta para los endpoints sensibles (login y MFA).

Historia y límite conocido
--------------------------
G.E.M.S no tenía ningún freno en ``/auth/login``: una contraseña se podía probar
sin límite de intentos. Este módulo es un limitador de ventana deslizante **en
memoria y por proceso**. Es a propósito simple, y tiene una limitación que hay
que tener presente (hueco 06 B2):

**El límite es por worker.** En producción Gunicorn corre con cuatro workers
(``-w 4`` en el Dockerfile), cada uno con su propia memoria. Como el sistema
operativo reparte las conexiones entre los workers, el límite efectivo entre
todos es, en el peor caso, ``LOGIN_RATE_LIMIT_MAX_ATTEMPTS × WEB_CONCURRENCY``:
con la configuración por defecto (5 intentos/min y 4 workers) hasta 20 por
minuto por IP. Sigue frenando la fuerza bruta —de "sin límite" a una veintena
por minuto—, pero no es el número exacto que dice la configuración.

Cómo volverlo exacto entre workers (el gancho)
----------------------------------------------
Para que el límite efectivo sea **exactamente** el configurado sin importar
cuántos workers haya, hace falta un contador compartido entre procesos. Este
módulo deja el gancho: el limitador se construye por ``RATE_LIMIT_BACKEND`` y
cumple el protocolo ``RateLimiterBackend``, así que sustituirlo por uno
compartido es un cambio localizado que **no toca los routers**. Hoy el único
backend implementado es ``memory``, porque este entorno no garantiza Redis y no
se introduce una dependencia nueva que PROD no tenga. El Postgres que ya existe
(una tabla pequeña de intentos) o un Redis, cuando lo haya, son los candidatos
naturales; su implementación es un ítem aparte (decide Emilio) porque escribiría
en el camino de autenticación en cada intento.

``effective_cross_worker_limit()`` deja ese número documentado y a la mano para
registrarlo al arrancar.
"""
import time
from collections import defaultdict, deque
from threading import Lock
from typing import Protocol

from fastapi import HTTPException, Request, status

from app.core.config import settings
from app.core.request_context import client_ip_hash


class RateLimiterBackend(Protocol):
    """Contrato del limitador. Un backend compartido (Redis/Postgres) implementa
    lo mismo y se enchufa por ``build_login_rate_limiter`` sin tocar los routers.
    """

    def check(self, key: str) -> None: ...

    def purge_stale(self) -> None: ...


class InMemoryRateLimiter:
    """Sliding-window rate limiter keyed by an arbitrary string (e.g. client IP)."""

    def __init__(self, max_attempts: int, window_seconds: float):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str) -> None:
        """Record an attempt for ``key`` and raise 429 if over the limit."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > self.window_seconds:
                hits.popleft()
            if len(hits) >= self.max_attempts:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Demasiados intentos. Intenta de nuevo en unos minutos.",
                )
            hits.append(now)

    def purge_stale(self) -> None:
        """Drop buckets with no recent hits.

        Without this, an IP that hits the limiter once and never returns
        leaves an (eventually empty) deque in memory forever - a slow,
        unbounded leak on a long-running process. Intended to be called
        periodically by the background scheduler (see app.core.scheduler),
        now that Fase 2.5 provides one.
        """
        now = time.monotonic()
        with self._lock:
            stale_keys = [
                key
                for key, hits in self._hits.items()
                if not hits or now - hits[-1] > self.window_seconds
            ]
            for key in stale_keys:
                del self._hits[key]


def effective_cross_worker_limit() -> int:
    """El límite efectivo entre TODOS los workers, en el peor caso.

    Es lo que de verdad ve una IP atacante cuando el sistema operativo reparte
    sus intentos entre los ``WEB_CONCURRENCY`` procesos: cada uno le permite
    ``LOGIN_RATE_LIMIT_MAX_ATTEMPTS`` antes de frenar. Se documenta y se registra
    al arrancar para que nadie crea que el número configurado es el efectivo
    cuando hay más de un worker.
    """
    return settings.LOGIN_RATE_LIMIT_MAX_ATTEMPTS * max(1, settings.WEB_CONCURRENCY)


def build_login_rate_limiter() -> RateLimiterBackend:
    """Construye el limitador según ``RATE_LIMIT_BACKEND``.

    Único backend implementado: ``memory`` (por proceso). Cualquier otro valor
    cae a memoria avisando, para no dejar el login SIN freno por una
    configuración equivocada (un freno por proceso es mejor que ninguno).
    """
    backend = (settings.RATE_LIMIT_BACKEND or "memory").strip().lower()
    if backend != "memory":
        import logging

        logging.getLogger(__name__).warning(
            "RATE_LIMIT_BACKEND=%s no está implementado; se usa el limitador en "
            "memoria por proceso. El límite efectivo es por worker.",
            backend,
        )
    return InMemoryRateLimiter(
        max_attempts=settings.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
        window_seconds=settings.LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    )


# Limitador del login/MFA. 5 intentos/min por IP por proceso por defecto:
# suficiente para quien teclea mal su contraseña, estricto para la fuerza bruta.
login_rate_limiter: RateLimiterBackend = build_login_rate_limiter()


def enforce_login_rate_limit(request: Request) -> None:
    """FastAPI dependency: limits login attempts per client IP.

    Applied to ``POST /auth/login`` ahead of credential validation, so it
    counts both failed and successful attempts (brute-force protection cares
    about request volume, not outcome).
    """
    login_rate_limiter.check(client_ip_hash(request))
