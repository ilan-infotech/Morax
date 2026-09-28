"""Initial MORAX MVP schema.

Revision ID: 0001_initial_schema
Revises:
"""
from alembic import op

from app.db.base import Base
import app.models  # noqa: F401 - registers all SQLAlchemy models

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This is the baseline revision. Subsequent schema changes must use explicit
    # Alembic operations rather than application start-up table creation.
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
