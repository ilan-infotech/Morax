"""Store the selected contractor on an authenticated session.

Revision ID: 0014_active_contractor_context
Revises: 0013_system_platform_tenant
"""

from alembic import op
import sqlalchemy as sa


revision = "0014_active_contractor_context"
down_revision = "0013_system_platform_tenant"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("auth_sessions")}
    if "active_contractor_id" not in columns:
        op.add_column("auth_sessions", sa.Column("active_contractor_id", sa.String(36), nullable=True))
    indexes = {index["name"] for index in sa.inspect(op.get_bind()).get_indexes("auth_sessions")}
    if "ix_auth_sessions_active_contractor_id" not in indexes:
        op.create_index("ix_auth_sessions_active_contractor_id", "auth_sessions", ["active_contractor_id"])


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this production data migration")
