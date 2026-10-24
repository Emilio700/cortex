"""Add MFA state and privacy-preserving audit/session context.

Revision ID: 2026_08_08_0008
Revises: 2026_08_08_0007
"""

import sqlalchemy as sa
from alembic import op

revision = "2026_08_08_0008"
down_revision = "2026_08_08_0007"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("mfa_secret_encrypted", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("mfa_enabled", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("users", sa.Column("mfa_recovery_codes", sa.JSON(), nullable=True))
    op.add_column("users", sa.Column("mfa_enrolled_at", sa.DateTime(), nullable=True))

    op.add_column("user_sessions", sa.Column("ip_hash", sa.String(length=64), nullable=True))
    op.add_column("user_sessions", sa.Column("device_label", sa.String(length=120), nullable=True))
    op.add_column("user_sessions", sa.Column("user_agent_hash", sa.String(length=64), nullable=True))
    op.create_index("ix_user_sessions_ip_hash", "user_sessions", ["ip_hash"])

    op.add_column("audit_logs", sa.Column("patient_id", sa.Integer(), nullable=True))
    op.add_column("audit_logs", sa.Column("outcome", sa.String(length=20), server_default="success", nullable=False))
    op.add_column("audit_logs", sa.Column("ip_hash", sa.String(length=64), nullable=True))
    op.add_column("audit_logs", sa.Column("device_label", sa.String(length=120), nullable=True))
    op.add_column("audit_logs", sa.Column("reason", sa.String(length=300), nullable=True))
    op.create_foreign_key("fk_audit_logs_patient", "audit_logs", "patients", ["patient_id"], ["id"])
    op.create_index("ix_audit_logs_patient_id", "audit_logs", ["patient_id"])
    op.create_index("ix_audit_logs_outcome", "audit_logs", ["outcome"])
    op.create_index("ix_audit_logs_ip_hash", "audit_logs", ["ip_hash"])


def downgrade():
    op.drop_index("ix_audit_logs_ip_hash", table_name="audit_logs")
    op.drop_index("ix_audit_logs_outcome", table_name="audit_logs")
    op.drop_index("ix_audit_logs_patient_id", table_name="audit_logs")
    op.drop_constraint("fk_audit_logs_patient", "audit_logs", type_="foreignkey")
    for column in ("reason", "device_label", "ip_hash", "outcome", "patient_id"):
        op.drop_column("audit_logs", column)
    op.drop_index("ix_user_sessions_ip_hash", table_name="user_sessions")
    for column in ("user_agent_hash", "device_label", "ip_hash"):
        op.drop_column("user_sessions", column)
    for column in ("mfa_enrolled_at", "mfa_recovery_codes", "mfa_enabled", "mfa_secret_encrypted"):
        op.drop_column("users", column)
