"""Extend in-app notifications for centralized event delivery.

Revision ID: 0020_notification_engine_fields
Revises: 0019_support_ticket_issue_type
"""

from alembic import op
import sqlalchemy as sa


revision = "0020_notification_engine_fields"
down_revision = "0019_support_ticket_issue_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("in_app_notifications")}
    indexes = {index["name"] for index in inspector.get_indexes("in_app_notifications")}
    additions = [
        ("category", sa.Column("category", sa.String(50), nullable=False, server_default="GENERAL")),
        ("event_type", sa.Column("event_type", sa.String(80), nullable=True)),
        ("priority", sa.Column("priority", sa.String(20), nullable=False, server_default="NORMAL")),
        ("entity_type", sa.Column("entity_type", sa.String(80), nullable=True)),
        ("entity_id", sa.Column("entity_id", sa.String(36), nullable=True)),
        ("compliance_period_key", sa.Column("compliance_period_key", sa.String(40), nullable=True)),
        ("submission_revision", sa.Column("submission_revision", sa.Integer(), nullable=True)),
        ("event_key", sa.Column("event_key", sa.String(255), nullable=True)),
    ]
    for name, column in additions:
        if name not in columns:
            op.add_column("in_app_notifications", column)
    for name, columns, unique in [
        ("ix_in_app_notifications_category", ["category"], False),
        ("ix_in_app_notifications_event_type", ["event_type"], False),
        ("ix_in_app_notifications_priority", ["priority"], False),
        ("ix_in_app_notifications_event_key", ["event_key"], False),
        ("uq_in_app_notifications_recipient_event_key", ["recipient_id", "event_key"], True),
    ]:
        if name not in indexes:
            op.create_index(name, "in_app_notifications", columns, unique=unique)


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this production data migration")
