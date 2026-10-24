"""Central helpers for enforcing tenant isolation and resource ownership.

Tenant isolation is the single most important architectural invariant in
G.E.M.S: a user in one clinic (tenant) must never be able to read or modify
another clinic's data. Until now this was enforced by hand in every router,
either as a query filter (``.filter(Model.id == x, Model.tenant_id ==
current_user.tenant_id)``) or as a fetch-then-check (``if obj.tenant_id !=
current_user.tenant_id: raise 403``) - both patterns repeated ad hoc across
every router. That repetition already caused at least 3 confirmed
cross-tenant leaks (``GET/PUT /users/{id}``, the public doctor-files
endpoint, unrestricted document writes - see docs/analisis/02_deuda_tecnica_y_espacios_en_blanco.md,
fixed in Fase 0.2 of the roadmap).

These helpers don't introduce new behavior; they just give every router one
hard-to-forget way to apply the same filter/check, so the next new endpoint
doesn't have to reinvent (or forget) tenant scoping.

MASTER BYPASS: The MASTER role is exempt from tenant scoping — it can
read/write across all tenants. This mirrors the ``require_permission`` bypass
in ``deps.py`` (MASTER always passes permission checks). Without this, MASTER
would be limited to a single tenant like any other user, defeating its purpose
as a super-admin / developer role.
"""
from typing import Optional, Type, TypeVar

from fastapi import HTTPException, status
from sqlalchemy.orm import Query

from app.models.user import Role, User

ModelT = TypeVar("ModelT")


def _is_master(user: User) -> bool:
    """Check if the user has the MASTER role (bypasses tenant scoping)."""
    return user.role == Role.MASTER


def scoped_query(query: Query, model: Type[ModelT], current_user: User) -> Query:
    """Add the tenant filter to a query for a model with a ``tenant_id`` column.

    MASTER role bypasses the filter entirely — can see data across all tenants.

    Usage::

        scoped_query(db.query(Patient), Patient, current_user).filter(Patient.id == patient_id).first()
    """
    if _is_master(current_user):
        return query
    return query.filter(model.tenant_id == current_user.tenant_id)


def assert_same_tenant(
    resource: Optional[object], current_user: User, *, detail: str = "Access denied"
) -> None:
    """Raise 403 if ``resource.tenant_id`` doesn't match the caller's tenant.

    MASTER role bypasses the check — can access resources in any tenant.

    For the fetch-then-check pattern: fetch a row by id (without a tenant
    filter in the query itself), then verify it belongs to the caller's
    tenant before returning/mutating it. A ``None`` resource is a no-op here;
    routers should still 404 on a missing resource themselves.
    """
    if resource is None:
        return
    if _is_master(current_user):
        return
    if resource.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def assert_owner(
    resource_doctor_id: Optional[int],
    current_user: User,
    *,
    detail: str = "You can only access your own resources",
) -> None:
    """Raise 403 if the resource's owning doctor isn't the current user.

    MASTER role bypasses the check — can act on any doctor's resources.

    Centralizes the "doctor owns this appointment/note/prescription/
    certificate" check that was re-implemented per router (e.g.
    ``appointment.doctor_id != current_user.id``).
    """
    if _is_master(current_user):
        return
    if resource_doctor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
