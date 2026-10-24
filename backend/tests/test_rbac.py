"""Unit tests for the role-based access control dependency."""
import pytest
from fastapi import HTTPException

from app.core.deps import require_role
from app.models.user import Role, User
from app.routers.doctor_clinics import _require_master_assignment
from app.routers.users import _assert_can_manage_role


def _user_with_role(role: Role) -> User:
    """Build a detached User instance (no DB session needed)."""
    user = User()
    user.role = role
    return user


def test_require_role_allows_listed_role():
    checker = require_role(Role.DOCTOR, Role.ADMIN)
    doctor = _user_with_role(Role.DOCTOR)
    assert checker(current_user=doctor) is doctor


def test_require_role_blocks_other_roles():
    checker = require_role(Role.DOCTOR)
    secretaria = _user_with_role(Role.SECRETARIA)
    with pytest.raises(HTTPException) as exc:
        checker(current_user=secretaria)
    assert exc.value.status_code == 403


def test_require_role_flattens_list_argument():
    # require_role([...]) should behave like require_role(*[...])
    checker = require_role([Role.ADMIN])
    admin = _user_with_role(Role.ADMIN)
    assert checker(current_user=admin) is admin
    with pytest.raises(HTTPException):
        checker(current_user=_user_with_role(Role.DOCTOR))


def test_tenant_admin_cannot_promote_user_to_master():
    admin = _user_with_role(Role.ADMIN)

    with pytest.raises(HTTPException) as exc:
        _assert_can_manage_role(admin, Role.MASTER, Role.DOCTOR)

    assert exc.value.status_code == 403


def test_tenant_admin_cannot_modify_existing_master():
    admin = _user_with_role(Role.ADMIN)

    with pytest.raises(HTTPException) as exc:
        _assert_can_manage_role(admin, Role.ADMIN, Role.MASTER)

    assert exc.value.status_code == 403


def test_master_can_manage_master_accounts():
    master = _user_with_role(Role.MASTER)

    assert _assert_can_manage_role(master, Role.MASTER, Role.MASTER) is None


def test_doctor_cannot_self_assign_a_clinic():
    with pytest.raises(HTTPException) as exc:
        _require_master_assignment(_user_with_role(Role.DOCTOR))

    assert exc.value.status_code == 403


def test_master_can_assign_a_clinic():
    assert _require_master_assignment(_user_with_role(Role.MASTER)) is None
