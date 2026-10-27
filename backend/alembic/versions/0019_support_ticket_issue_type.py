"""Add a triage issue type to support tickets.

Revision ID: 0019_support_ticket_issue_type
Revises: 0018_support_ticket_assignee
"""

from alembic import op
import sqlalchemy as sa


revision = "0019_support_ticket_issue_type"
down_revision = "0018_support_ticket_assignee"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # OTHER preserves existing records without incorrectly labelling their
    # historical issue as a production defect, enhancement, or UI request.
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("support_tickets")}
    indexes = {index["name"] for index in inspector.get_indexes("support_tickets")}
    if "issue_type" not in columns:
        op.add_column("support_tickets", sa.Column("issue_type", sa.String(30), nullable=False, server_default="OTHER"))
    if "ix_support_tickets_issue_type" not in indexes:
        op.create_index("ix_support_tickets_issue_type", "support_tickets", ["issue_type"])


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this production data migration")
