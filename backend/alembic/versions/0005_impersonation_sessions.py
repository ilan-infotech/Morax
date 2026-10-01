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
    _add_column_if_missing("auth_sessions", sa.Column("impersonated_by_session_id", sa.String(36)))
    _add_column_if_missing("auth_sessions", sa.Column("impersonated_by_id", sa.String(36)))
    _create_index_if_missing("ix_auth_sessions_impersonated_by_session_id", "auth_sessions", ["impersonated_by_session_id"])
    _create_index_if_missing("ix_auth_sessions_impersonated_by_id", "auth_sessions", ["impersonated_by_id"])


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this SQLite migration")
