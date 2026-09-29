"""Add auditable organization-admin impersonation sessions.

Revision ID: 0005_impersonation_sessions
Revises: 0004_platform_organizations
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_impersonation_sessions"
down_revision = "0004_platform_organizations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("auth_sessions", sa.Column("impersonated_by_session_id", sa.String(36)))
    op.add_column("auth_sessions", sa.Column("impersonated_by_id", sa.String(36)))
    op.create_index("ix_auth_sessions_impersonated_by_session_id", "auth_sessions", ["impersonated_by_session_id"])
    op.create_index("ix_auth_sessions_impersonated_by_id", "auth_sessions", ["impersonated_by_id"])


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this SQLite migration")
