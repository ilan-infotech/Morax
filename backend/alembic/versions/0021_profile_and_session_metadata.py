"""Add private profile logo and last-login metadata.

Revision ID: 0021_profile_and_session_metadata
Revises: 0020_notification_engine_fields
"""

from alembic import op
import sqlalchemy as sa


revision = "0021_profile_and_session_metadata"
down_revision = "0020_notification_engine_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    organization_columns = {column["name"] for column in inspector.get_columns("organizations")}
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "logo_filename" not in organization_columns:
        op.add_column("organizations", sa.Column("logo_filename", sa.String(255), nullable=True))
    if "last_login_at" not in user_columns:
        op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this production data migration")
