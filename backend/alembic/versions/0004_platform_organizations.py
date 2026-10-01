"""Add platform organization management and trusted session context.

Revision ID: 0004_platform_organizations
Revises: 0003_workflow_governance
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_platform_organizations"
down_revision = "0003_workflow_governance"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _indexes(table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if column.name not in _columns(table_name):
        op.add_column(table_name, column)


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if index_name not in _indexes(table_name):
        op.create_index(index_name, table_name, columns)


def upgrade() -> None:
    for column in [
        sa.Column("registration_number", sa.String(100)),
        sa.Column("pan", sa.String(20)),
        sa.Column("gstin", sa.String(30)),
        sa.Column("city", sa.String(100)),
        sa.Column("pincode", sa.String(20)),
        sa.Column("primary_contact_name", sa.String(150)),
        sa.Column("created_by_id", sa.String(36)),
        sa.Column("updated_by_id", sa.String(36)),
    ]:
        _add_column_if_missing("organizations", column)
    _add_column_if_missing("users", sa.Column("platform_role", sa.String(40)))
    _create_index_if_missing("ix_users_platform_role", "users", ["platform_role"])
    _add_column_if_missing("auth_sessions", sa.Column("active_organization_id", sa.String(36)))
    _create_index_if_missing("ix_auth_sessions_active_organization_id", "auth_sessions", ["active_organization_id"])
    # Legacy MORAX_ADMIN/SUPER_ADMIN scope rows represented organization-level
    # administration in the MVP. Preserve that authority under the explicit
    # organization role; platform authority is assigned only by bootstrap setup.
    op.execute("UPDATE user_role_scopes SET role = 'ORGANIZATION_ADMIN' WHERE role IN ('MORAX_ADMIN', 'SUPER_ADMIN')")


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this SQLite migration")
