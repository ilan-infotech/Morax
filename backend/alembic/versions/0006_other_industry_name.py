"""Store a user-provided name for the controlled Other industry category.

Revision ID: 0006_other_industry_name
Revises: 0005_impersonation_sessions
"""

from alembic import op
import sqlalchemy as sa


revision = "0006_other_industry_name"
down_revision = "0005_impersonation_sessions"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if column.name not in _columns(table_name):
        op.add_column(table_name, column)


def upgrade() -> None:
    for table in ("units", "contractors", "contractor_sites"):
        _add_column_if_missing(table, sa.Column("other_industry_name", sa.String(150)))


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this SQLite migration")
