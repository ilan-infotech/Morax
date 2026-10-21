"""Record development workspace resets to suppress automatic demo seeding.

Revision ID: 0010_development_reset_marker
Revises: 0009_client_recommendations_foundation
"""

from alembic import op
import sqlalchemy as sa


revision = "0010_development_reset_marker"
down_revision = "0009_client_recommendations_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("organizations")}
    if "development_reset_at" not in columns:
        op.add_column("organizations", sa.Column("development_reset_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this production data migration")
