"""Add the client-recommendation onboarding and scheduling foundations.

Revision ID: 0009_client_recommendations_foundation
Revises: 0008_controlled_document_types
"""

from alembic import op
import sqlalchemy as sa


revision = "0009_client_recommendations_foundation"
down_revision = "0008_controlled_document_types"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _add_column(table_name: str, column: sa.Column) -> None:
    if column.name not in _columns(table_name):
        op.add_column(table_name, column)


def upgrade() -> None:
    if not sa.inspect(op.get_bind()).has_table("cities"):
        op.create_table(
            "cities",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("state_id", sa.String(36), sa.ForeignKey("states.id"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.UniqueConstraint("state_id", "name", name="uq_city_state_name"),
        )
        op.create_index("ix_cities_state_id", "cities", ["state_id"])

    # SQLite cannot add a column with an inline foreign key through ALTER
    # TABLE. The ORM relationship is retained; new SQLite databases receive
    # the logical reference without a destructive table rebuild.
    for table_name in ("units", "contractors", "contractor_sites"):
        _add_column(table_name, sa.Column("city_id", sa.String(36)))
    _add_column("units", sa.Column("contact_email", sa.String(255)))
    _add_column("units", sa.Column("contact_phone", sa.String(50)))
    _add_column("units", sa.Column("worker_limit", sa.Integer()))
    _add_column("contractors", sa.Column("contract_start_date", sa.Date()))
    _add_column("contractors", sa.Column("contract_end_date", sa.Date()))
    _add_column("contractors", sa.Column("work_order_expiry_date", sa.Date()))
    _add_column("compliance_rule_versions", sa.Column("applicable_months_json", sa.Text()))
    # An instance has one current owner for each workflow responsibility.
    # This protects reassignment and submit-notification logic from races.
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_active_compliance_assignment "
        "ON compliance_assignments(instance_id, assignment_type) WHERE active = 1"
    )

    if not sa.inspect(op.get_bind()).has_table("user_permission_grants"):
        op.create_table(
            "user_permission_grants",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("permission", sa.String(80), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("user_id", "permission", name="uq_user_permission_grant"),
        )
        op.create_index("ix_user_permission_grants_user_id", "user_permission_grants", ["user_id"])

    if not sa.inspect(op.get_bind()).has_table("contractor_documents"):
        op.create_table(
            "contractor_documents",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("contractor_id", sa.String(36), sa.ForeignKey("contractors.id", ondelete="CASCADE"), nullable=False),
            sa.Column("document_type", sa.String(50), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("original_filename", sa.String(255), nullable=False),
            sa.Column("stored_filename", sa.String(255), nullable=False, unique=True),
            sa.Column("content_type", sa.String(150)),
            sa.Column("size_bytes", sa.Integer(), nullable=False),
            sa.Column("checksum_sha256", sa.String(64)),
            sa.Column("uploaded_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("status", sa.String(30), nullable=False, server_default="ACTIVE"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("contractor_id", "document_type", "version", name="uq_contractor_document_version"),
        )
        op.create_index("ix_contractor_documents_contractor_id", "contractor_documents", ["contractor_id"])


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this production data migration")
