"""Link workflow decisions to their reviewed submission revision.

Revision ID: 0022_workflow_submission_revision
Revises: 0021_profile_and_session_metadata
"""

from alembic import op
import sqlalchemy as sa


revision = "0022_workflow_submission_revision"
down_revision = "0021_profile_and_session_metadata"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("compliance_workflow_history")}
    if "submission_revision" not in columns:
        op.add_column("compliance_workflow_history", sa.Column("submission_revision", sa.Integer(), nullable=True))


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this production data migration")
