"""Add tenant-scoped support ticket records.

Revision ID: 0017_support_tickets
Revises: 0016_unit_edit_fields
"""

from alembic import op
import sqlalchemy as sa


revision = "0017_support_tickets"
down_revision = "0016_unit_edit_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The local runtime schema helper can create these tables before Alembic is
    # invoked.  Inspect first so an upgrade advances the revision safely.
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "support_tickets" not in tables:
        op.create_table("support_tickets",
            sa.Column("id", sa.String(36), primary_key=True), sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("ticket_number", sa.String(30), nullable=False, unique=True), sa.Column("subject", sa.String(250), nullable=False), sa.Column("category", sa.String(80), nullable=False),
            sa.Column("priority", sa.String(20), nullable=False), sa.Column("status", sa.String(30), nullable=False), sa.Column("creator_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
    if "support_ticket_messages" not in tables:
        op.create_table("support_ticket_messages", sa.Column("id", sa.String(36), primary_key=True), sa.Column("ticket_id", sa.String(36), sa.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False), sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False), sa.Column("body", sa.Text(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    if "support_ticket_attachments" not in tables:
        op.create_table("support_ticket_attachments", sa.Column("id", sa.String(36), primary_key=True), sa.Column("ticket_id", sa.String(36), sa.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False), sa.Column("message_id", sa.String(36), sa.ForeignKey("support_ticket_messages.id", ondelete="CASCADE")), sa.Column("original_filename", sa.String(255), nullable=False), sa.Column("stored_filename", sa.String(255), nullable=False, unique=True), sa.Column("content_type", sa.String(150)), sa.Column("size_bytes", sa.Integer(), nullable=False), sa.Column("uploaded_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    if "support_ticket_activities" not in tables:
        op.create_table("support_ticket_activities", sa.Column("id", sa.String(36), primary_key=True), sa.Column("ticket_id", sa.String(36), sa.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False), sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id")), sa.Column("action", sa.String(80), nullable=False), sa.Column("detail", sa.Text()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this production data migration")
