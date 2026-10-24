"""El freno de fuerza bruta del login: configurable y con el límite documentado (B-10).

El limitador es en memoria y por proceso; su límite efectivo entre varios
workers es ``max_intentos × WEB_CONCURRENCY``. Aquí se prueba que el número sale
de la configuración (no está clavado), que el cálculo del límite efectivo es
correcto y que una configuración de backend equivocada no deja el login sin
freno.
"""
import pytest
from fastapi import HTTPException

import app.core.rate_limit as rl
from app.core.rate_limit import (
    InMemoryRateLimiter,
    build_login_rate_limiter,
    effective_cross_worker_limit,
)


def test_frena_al_pasar_el_maximo_configurado():
    limiter = InMemoryRateLimiter(max_attempts=2, window_seconds=60)
    limiter.check("ip")  # 1
    limiter.check("ip")  # 2
    with pytest.raises(HTTPException) as exc:
        limiter.check("ip")  # 3: se pasa
    assert exc.value.status_code == 429
    assert "Demasiados intentos" in exc.value.detail


def test_el_freno_es_por_llave_no_global():
    limiter = InMemoryRateLimiter(max_attempts=1, window_seconds=60)
    limiter.check("ip-a")
    # Otra IP no hereda el freno de la primera.
    limiter.check("ip-b")
    with pytest.raises(HTTPException):
        limiter.check("ip-a")


def test_el_limite_efectivo_entre_workers_es_el_configurado_por_los_workers(monkeypatch):
    """El número que hay que documentar: por proceso × nº de workers."""
    monkeypatch.setattr(rl.settings, "LOGIN_RATE_LIMIT_MAX_ATTEMPTS", 5)
    monkeypatch.setattr(rl.settings, "WEB_CONCURRENCY", 4)
    assert effective_cross_worker_limit() == 20

    monkeypatch.setattr(rl.settings, "WEB_CONCURRENCY", 1)
    assert effective_cross_worker_limit() == 5


def test_con_un_solo_worker_el_efectivo_es_el_configurado(monkeypatch):
    monkeypatch.setattr(rl.settings, "LOGIN_RATE_LIMIT_MAX_ATTEMPTS", 7)
    monkeypatch.setattr(rl.settings, "WEB_CONCURRENCY", 1)
    assert effective_cross_worker_limit() == 7


def test_el_limitador_toma_el_maximo_de_la_configuracion(monkeypatch):
    monkeypatch.setattr(rl.settings, "LOGIN_RATE_LIMIT_MAX_ATTEMPTS", 3)
    monkeypatch.setattr(rl.settings, "LOGIN_RATE_LIMIT_WINDOW_SECONDS", 30)
    monkeypatch.setattr(rl.settings, "RATE_LIMIT_BACKEND", "memory")
    limiter = build_login_rate_limiter()
    assert isinstance(limiter, InMemoryRateLimiter)
    assert limiter.max_attempts == 3
    assert limiter.window_seconds == 30


def test_un_backend_desconocido_cae_a_memoria_y_no_deja_el_login_sin_freno(monkeypatch):
    """Un valor equivocado no debe quitar el freno: mejor por proceso que nada."""
    monkeypatch.setattr(rl.settings, "RATE_LIMIT_BACKEND", "redis")
    limiter = build_login_rate_limiter()
    # Aunque se pidió un backend no implementado, hay freno (en memoria).
    assert isinstance(limiter, InMemoryRateLimiter)


def test_la_ventana_libera_los_intentos_viejos(monkeypatch):
    """Pasada la ventana, los intentos viejos ya no cuentan."""
    reloj = {"t": 1000.0}
    monkeypatch.setattr(rl.time, "monotonic", lambda: reloj["t"])
    limiter = InMemoryRateLimiter(max_attempts=1, window_seconds=60)
    limiter.check("ip")
    with pytest.raises(HTTPException):
        limiter.check("ip")
    # Avanza más que la ventana: el intento viejo se descarta.
    reloj["t"] += 61
    limiter.check("ip")  # ya no truena
