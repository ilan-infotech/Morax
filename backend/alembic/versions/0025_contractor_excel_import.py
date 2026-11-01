"""Add tenant-scoped contractor Excel import staging.

Revision ID: 0025_contractor_excel_import
Revises: 0024_license_management
"""

from alembic import op
import sqlalchemy as sa


revision = "0025_contractor_excel_import"
down_revision = "0024_license_management"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if "contractor_imports" not in existing:
        op.create_table(
            "contractor_imports",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False, index=True),
            sa.Column("uploaded_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("original_filename", sa.String(255), nullable=False),
            sa.Column("status", sa.String(30), nullable=False, server_default="VALIDATED", index=True),
            sa.Column("total_rows", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("valid_rows", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("error_rows", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("imported_rows", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("confirmed_at", sa.DateTime(timezone=True)),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
    if "contractor_import_rows" not in existing:
        op.create_table(
            "contractor_import_rows",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("import_id", sa.String(36), sa.ForeignKey("contractor_imports.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("row_number", sa.Integer(), nullable=False),
            sa.Column("payload_json", sa.Text(), nullable=False),
            sa.Column("errors_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("valid", sa.Boolean(), nullable=False),
            sa.UniqueConstraint("import_id", "row_number", name="uq_contractor_import_row"),
        )


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for production data migrations")
