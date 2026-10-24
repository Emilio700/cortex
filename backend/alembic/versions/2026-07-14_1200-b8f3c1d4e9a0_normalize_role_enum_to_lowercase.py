"""normalize_role_enum_to_lowercase

The PostgreSQL ``role`` enum was originally created with uppercase values
(ADMIN, SECRETARIA, DOCTOR) while the Python ``Role`` enum uses lowercase
values (admin, secretaria, doctor). This mismatch causes SQLAlchemy to send
lowercase strings that PostgreSQL rejects if strict enum validation is
enforced.

This migration replaces the old uppercase enum with a new lowercase one,
migrates existing data, and drops the old type — so the database values
match the Python code.

Revision ID: b8f3c1d4e9a0
Revises: a5efc2add40d
Create Date: 2026-07-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8f3c1d4e9a0'
down_revision: Union[str, None] = 'a5efc2add40d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Old uppercase values (the current state in the database)
OLD_VALUES = ('ADMIN', 'SECRETARIA', 'DOCTOR', 'MASTER')
# New lowercase values (matching the Python Role enum in app/models/user.py)
NEW_VALUES = ('admin', 'secretaria', 'doctor', 'master')

# Temporary type name used during the swap
TEMP_TYPE = 'role_tmp'


def upgrade() -> None:
    # 1. Create a new enum type with lowercase values
    op.execute(f"CREATE TYPE {TEMP_TYPE} AS ENUM {NEW_VALUES}")

    # 2. Alter the column to use the new type, converting values to lowercase
    #    via LOWER() so 'ADMIN' → 'admin', 'MASTER' → 'master', etc.
    op.execute(
        f"ALTER TABLE users ALTER COLUMN role TYPE {TEMP_TYPE} "
        f"USING LOWER(role::text)::{TEMP_TYPE}"
    )

    # 3. Drop the old uppercase enum type
    op.execute("DROP TYPE role")

    # 4. Rename the temporary type to the original name
    op.execute(f"ALTER TYPE {TEMP_TYPE} RENAME TO role")


def downgrade() -> None:
    # Reverse: create old uppercase type, convert back to uppercase,
    # drop the lowercase type, rename.
    op.execute(f"CREATE TYPE {TEMP_TYPE} AS ENUM {OLD_VALUES}")

    op.execute(
        f"ALTER TABLE users ALTER COLUMN role TYPE {TEMP_TYPE} "
        f"USING UPPER(role::text)::{TEMP_TYPE}"
    )

    op.execute("DROP TYPE role")

    op.execute(f"ALTER TYPE {TEMP_TYPE} RENAME TO role")
