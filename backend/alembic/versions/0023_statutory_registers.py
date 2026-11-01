"""Add tenant-scoped statutory register storage.

Revision ID: 0023_statutory_registers
Revises: 0022_workflow_submission_revision
"""

from alembic import op
import sqlalchemy as sa


revision = "0023_statutory_registers"
down_revision = "0022_workflow_submission_revision"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Development deployments before this migration can already have these
    # tables because MORAX starts with Base.metadata.create_all().  Treat that
    # fully materialized schema as a safe, idempotent migration target instead
    # of failing an upgrade on a tenant database that has not yet been stamped.
    existing_tables = set(sa.inspect(op.get_bind()).get_table_names())
    register_tables = {
        "register_templates", "register_template_versions", "register_column_mappings",
        "register_upload_batches", "register_employees", "register_attendance",
        "register_payroll", "generated_registers", "register_workflow_history",
        "register_compliance_links",
    }
    if register_tables.issubset(existing_tables):
        return

    op.create_table(
        "register_templates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=True, index=True),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("name", sa.String(250), nullable=False),
        sa.Column("category", sa.String(100), nullable=False, server_default="STATUTORY_REGISTER"),
        sa.Column("description", sa.Text()),
        sa.Column("entity_scope", sa.String(30), nullable=False, server_default="ALL"),
        sa.Column("frequency", sa.String(30), nullable=False, server_default="MONTHLY"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "code", name="uq_register_template_org_code"),
    )
    op.create_table(
        "register_template_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("template_id", sa.String(36), sa.ForeignKey("register_templates.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("version", sa.Integer(), nullable=False), sa.Column("status", sa.String(20), nullable=False, server_default="DRAFT", index=True),
        sa.Column("applicable_legislation", sa.String(300)), sa.Column("applicable_rule", sa.String(300)), sa.Column("form_number", sa.String(100)), sa.Column("jurisdiction", sa.String(100)),
        sa.Column("effective_from", sa.Date()), sa.Column("effective_to", sa.Date()), sa.Column("config_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("published_at", sa.DateTime(timezone=True)), sa.Column("published_by_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("template_id", "version", name="uq_register_template_version"),
    )
    op.create_table(
        "register_column_mappings",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("dataset_type", sa.String(30), nullable=False, index=True), sa.Column("name", sa.String(150), nullable=False), sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("mapping_json", sa.Text(), nullable=False, server_default="{}"), sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("created_by_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "dataset_type", "name", "version", name="uq_register_mapping_version"),
    )
    op.create_table(
        "register_upload_batches",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("entity_type", sa.String(30), nullable=False, index=True), sa.Column("entity_id", sa.String(36), nullable=False, index=True), sa.Column("dataset_type", sa.String(30), nullable=False, index=True), sa.Column("period_key", sa.String(7), index=True),
        sa.Column("original_filename", sa.String(255), nullable=False), sa.Column("stored_filename", sa.String(255), nullable=False), sa.Column("checksum_sha256", sa.String(64), nullable=False), sa.Column("mapping_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(30), nullable=False, server_default="VALIDATED", index=True), sa.Column("total_rows", sa.Integer(), nullable=False, server_default="0"), sa.Column("valid_rows", sa.Integer(), nullable=False, server_default="0"), sa.Column("error_rows", sa.Integer(), nullable=False, server_default="0"), sa.Column("warning_rows", sa.Integer(), nullable=False, server_default="0"), sa.Column("validation_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("uploaded_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False), sa.Column("imported_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "register_employees",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False, index=True), sa.Column("entity_type", sa.String(30), nullable=False, index=True), sa.Column("entity_id", sa.String(36), nullable=False, index=True), sa.Column("employee_id", sa.String(100), nullable=False, index=True), sa.Column("employee_name", sa.String(250), nullable=False), sa.Column("date_of_joining", sa.Date()), sa.Column("date_of_exit", sa.Date()), sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true(), index=True), sa.Column("data_json", sa.Text(), nullable=False, server_default="{}"), sa.Column("source_batch_id", sa.String(36), sa.ForeignKey("register_upload_batches.id"), index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "entity_type", "entity_id", "employee_id", name="uq_register_employee_subject_code"),
    )
    for table, unique, columns in [
        ("register_attendance", "uq_register_attendance_day", [("attendance_date", sa.Date(), False), ("status", sa.String(30), False), ("working_hours", sa.Float(), False), ("overtime_hours", sa.Float(), False)]),
        ("register_payroll", "uq_register_payroll_period", [("period_key", sa.String(7), False), ("gross_earnings", sa.Float(), False), ("total_deductions", sa.Float(), False), ("net_pay", sa.Float(), False)]),
    ]:
        base = [sa.Column("id", sa.String(36), primary_key=True), sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False, index=True), sa.Column("entity_type", sa.String(30), nullable=False, index=True), sa.Column("entity_id", sa.String(36), nullable=False, index=True), sa.Column("employee_id", sa.String(100), nullable=False, index=True)]
        base.extend(sa.Column(name, kind, nullable=nullable, server_default="0" if name in {"working_hours", "overtime_hours", "gross_earnings", "total_deductions", "net_pay"} else None, index=name in {"attendance_date", "period_key"}) for name, kind, nullable in columns)
        base.extend([sa.Column("data_json", sa.Text(), nullable=False, server_default="{}"), sa.Column("source_batch_id", sa.String(36), sa.ForeignKey("register_upload_batches.id"), index=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())])
        constraint_columns = ["organization_id", "entity_type", "entity_id", "employee_id", "attendance_date" if table == "register_attendance" else "period_key"]
        op.create_table(table, *base, sa.UniqueConstraint(*constraint_columns, name=unique))
    op.create_table(
        "generated_registers",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False, index=True), sa.Column("entity_type", sa.String(30), nullable=False, index=True), sa.Column("entity_id", sa.String(36), nullable=False, index=True), sa.Column("template_version_id", sa.String(36), sa.ForeignKey("register_template_versions.id"), nullable=False, index=True), sa.Column("register_code", sa.String(30), nullable=False, index=True), sa.Column("register_name", sa.String(250), nullable=False), sa.Column("period_key", sa.String(7), nullable=False, index=True), sa.Column("due_date", sa.Date(), index=True), sa.Column("version", sa.Integer(), nullable=False, server_default="1"), sa.Column("status", sa.String(30), nullable=False, server_default="GENERATED", index=True), sa.Column("employee_count", sa.Integer(), nullable=False, server_default="0"), sa.Column("validation_summary_json", sa.Text(), nullable=False, server_default="{}"), sa.Column("content_json", sa.Text(), nullable=False, server_default="{}"), sa.Column("generated_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False), sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("submitted_at", sa.DateTime(timezone=True)), sa.Column("approved_at", sa.DateTime(timezone=True)), sa.Column("approved_by_id", sa.String(36), sa.ForeignKey("users.id")), sa.Column("row_version", sa.Integer(), nullable=False, server_default="1"), sa.Column("supersedes_id", sa.String(36), sa.ForeignKey("generated_registers.id"), index=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "entity_type", "entity_id", "template_version_id", "period_key", "version", name="uq_generated_register_version"),
    )
    op.create_table("register_workflow_history", sa.Column("id", sa.String(36), primary_key=True), sa.Column("register_id", sa.String(36), sa.ForeignKey("generated_registers.id", ondelete="CASCADE"), nullable=False, index=True), sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False), sa.Column("action", sa.String(40), nullable=False), sa.Column("from_status", sa.String(30)), sa.Column("to_status", sa.String(30), nullable=False), sa.Column("remarks", sa.Text()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_table("register_compliance_links", sa.Column("id", sa.String(36), primary_key=True), sa.Column("register_id", sa.String(36), sa.ForeignKey("generated_registers.id", ondelete="CASCADE"), nullable=False, index=True), sa.Column("compliance_instance_id", sa.String(36), sa.ForeignKey("compliance_instances.id", ondelete="CASCADE"), nullable=False, index=True), sa.Column("linked_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False), sa.Column("evidence_id", sa.String(36), sa.ForeignKey("compliance_evidence.id")), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.UniqueConstraint("register_id", "compliance_instance_id", name="uq_register_compliance_link"))


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this production data migration")
