"""Helper for writing to the audit log (see app.models.audit_log.AuditLog).

Usage: call ``log_action`` from a router right after a sensitive write
succeeds (user creation/edit, irreversible deletions, etc.). This is a
best-effort, append-only log - not a replacement for real-time monitoring or
alerting.
"""
from typing import Any, Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.request_context import client_ip_hash, current_audit_context, request_device
from app.models.audit_log import AuditLog


def log_action(
    db: Session,
    *,
    action: str,
    entity_type: str,
    actor_user_id: Optional[int] = None,
    tenant_id: Optional[int] = None,
    entity_id: Optional[int] = None,
    patient_id: Optional[int] = None,
    outcome: str = "success",
    reason: Optional[str] = None,
    request: Optional[Request] = None,
    details: Optional[dict[str, Any]] = None,
) -> AuditLog:
    """Record a single audit log entry and commit it immediately.

    Args:
        db: Database session
        action: Short, dot-namespaced action identifier (e.g. "user.created")
        entity_type: The kind of entity affected (e.g. "user", "document")
        actor_user_id: Who performed the action (None for system actions)
        tenant_id: Which tenant this action belongs to, if any
        entity_id: The affected row's id, if applicable
        details: Small JSON-serializable payload with extra context

    Returns:
        The persisted AuditLog row
    """
    device_label = None
    ip_hash = None
    if request is not None:
        device_label, _ = request_device(request)
        ip_hash = client_ip_hash(request)
        if reason is None:
            reason = request.headers.get("x-access-reason")
    else:
        context = current_audit_context()
        if context is not None:
            ip_hash, device_label = context
    if patient_id is None and details and isinstance(details.get("patient_id"), int):
        patient_id = details["patient_id"]
    if reason:
        reason = reason.strip()[:300] or None
    entry = AuditLog(
        actor_user_id=actor_user_id,
        tenant_id=tenant_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        patient_id=patient_id,
        outcome=outcome,
        reason=reason,
        ip_hash=ip_hash,
        device_label=device_label,
        details=details,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
