"""add_master_role

Revision ID: 070c0984109d
Revises: 82b7d1b445ce
Create Date: 2026-07-10 16:22:42.237456

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '070c0984109d'
down_revision: Union[str, None] = '82b7d1b445ce'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# PostgreSQL enum values are uppercase (ADMIN, SECRETARIA, DOCTOR).
# Add MASTER to the existing enum.
old_values = ('ADMIN', 'SECRETARIA', 'DOCTOR')
new_values = ('ADMIN', 'SECRETARIA', 'DOCTOR', 'MASTER')


def upgrade() -> None:
    op.execute("ALTER TYPE role ADD VALUE 'MASTER'")


def downgrade() -> None:
    # PostgreSQL cannot remove a value from an enum. The safest approach is to
    # create a new type without 'MASTER', migrate all columns, and drop the old
    # type. Since this is a development-only migration, we document it as such.
    op.execute("ALTER TYPE role RENAME TO role_old")
    op.execute(f"CREATE TYPE role AS ENUM {old_values}")
    op.execute(
        "ALTER TABLE users ALTER COLUMN role TYPE role USING "
        "role::text::role"
    )
    op.execute("DROP TYPE role_old")
