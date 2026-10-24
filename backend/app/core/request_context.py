"""Privacy-preserving request metadata for sessions and audit events."""

import hashlib
import hmac
from contextvars import ContextVar, Token

from fastapi import Request

from app.core.config import settings


_audit_request_context: ContextVar[tuple[str, str] | None] = ContextVar(
    "audit_request_context", default=None
)


def _digest(value: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), value.encode(), hashlib.sha256).hexdigest()


def client_ip_hash(request: Request) -> str:
    # The API is only exposed through our nginx service. nginx resolves the
    # trusted proxy chain and overwrites X-Real-IP, so no raw address is stored.
    ip = request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")
    return _digest(ip)


def request_device(request: Request) -> tuple[str, str]:
    user_agent = request.headers.get("user-agent", "unknown")[:1000]
    lowered = user_agent.lower()
    if "ipad" in lowered:
        label = "iPad"
    elif "iphone" in lowered:
        label = "iPhone"
    elif "android" in lowered:
        label = "Android"
    elif "windows" in lowered:
        label = "Windows"
    elif "macintosh" in lowered or "mac os" in lowered:
        label = "macOS"
    elif "linux" in lowered:
        label = "Linux"
    else:
        label = "Dispositivo desconocido"
    return label, _digest(user_agent)


def bind_request_context(request: Request) -> Token:
    """Bind only anonymized metadata for audit calls made in this request."""
    device_label, _ = request_device(request)
    return _audit_request_context.set((client_ip_hash(request), device_label))


def reset_request_context(token: Token) -> None:
    _audit_request_context.reset(token)


def current_audit_context() -> tuple[str, str] | None:
    return _audit_request_context.get()
