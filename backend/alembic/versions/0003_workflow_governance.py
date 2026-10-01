"""Add workflow governance, evidence verification, and in-app notifications.

Revision ID: 0003_workflow_governance
Revises: 0002_full_mvp_entity_fields
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_workflow_governance"
down_revision = "0002_full_mvp_entity_fields"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _indexes(table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if column.name not in _columns(table_name):
        op.add_column(table_name, column)


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if index_name not in _indexes(table_name):
        op.create_index(index_name, table_name, columns)


def upgrade() -> None:
    _add_column_if_missing("contractors", sa.Column("compliance_start_date", sa.Date()))
    _add_column_if_missing("compliance_instances", sa.Column("not_applicable_reason", sa.Text()))
    _add_column_if_missing("compliance_evidence", sa.Column("checksum_sha256", sa.String(64)))
    _add_column_if_missing("compliance_evidence", sa.Column("verification_reason", sa.Text()))
    _add_column_if_missing("compliance_evidence", sa.Column("verified_by_id", sa.String(36)))
    _add_column_if_missing("compliance_evidence", sa.Column("verified_at", sa.DateTime(timezone=True)))
    if not sa.inspect(op.get_bind()).has_table("in_app_notifications"):
        op.create_table("in_app_notifications",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False),
            sa.Column("recipient_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("notification_type", sa.String(50), nullable=False),
            sa.Column("title", sa.String(250), nullable=False),
            sa.Column("body", sa.Text()), sa.Column("reference_type", sa.String(80)), sa.Column("reference_id", sa.String(36)),
            sa.Column("read_at", sa.DateTime(timezone=True)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
    _create_index_if_missing("ix_in_app_notifications_organization_id", "in_app_notifications", ["organization_id"])
    _create_index_if_missing("ix_in_app_notifications_recipient_id", "in_app_notifications", ["recipient_id"])


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this SQLite migration")
