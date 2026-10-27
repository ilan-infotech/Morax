"""Add MORAX support-admin assignment to tickets.

Revision ID: 0018_support_ticket_assignee
Revises: 0017_support_tickets
"""

from alembic import op
import sqlalchemy as sa


revision = "0018_support_ticket_assignee"
down_revision = "0017_support_tickets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("support_tickets")}
    indexes = {index["name"] for index in inspector.get_indexes("support_tickets")}
    if "assigned_to_id" not in columns:
        op.add_column(
            "support_tickets",
            sa.Column("assigned_to_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        )
    if "ix_support_tickets_assigned_to_id" not in indexes:
        op.create_index("ix_support_tickets_assigned_to_id", "support_tickets", ["assigned_to_id"])


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this production data migration")
