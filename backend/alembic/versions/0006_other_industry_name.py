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


def upgrade() -> None:
    for table in ("units", "contractors", "contractor_sites"):
        op.add_column(table, sa.Column("other_industry_name", sa.String(150)))


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this SQLite migration")
