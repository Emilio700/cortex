"""Add diagnostic result review and communication ownership.

Revision ID: 2026_08_08_0009
Revises: 2026_08_08_0008
"""

import sqlalchemy as sa
from alembic import op

revision = "2026_08_08_0009"
down_revision = "2026_08_08_0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("diagnostic_results", sa.Column("is_critical", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("diagnostic_results", sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True))
    op.add_column("diagnostic_results", sa.Column("communicated_by_user_id", sa.Integer(), nullable=True))
    op.add_column("diagnostic_results", sa.Column("communication_note", sa.Text(), nullable=True))
    op.create_foreign_key("fk_result_reviewed_by", "diagnostic_results", "users", ["reviewed_by_user_id"], ["id"])
    op.create_foreign_key("fk_result_communicated_by", "diagnostic_results", "users", ["communicated_by_user_id"], ["id"])
    op.create_index("ix_diagnostic_results_is_critical", "diagnostic_results", ["is_critical"])


def downgrade():
    op.drop_index("ix_diagnostic_results_is_critical", table_name="diagnostic_results")
    op.drop_constraint("fk_result_communicated_by", "diagnostic_results", type_="foreignkey")
    op.drop_constraint("fk_result_reviewed_by", "diagnostic_results", type_="foreignkey")
    for column in ("communication_note", "communicated_by_user_id", "reviewed_by_user_id", "is_critical"):
        op.drop_column("diagnostic_results", column)
