"""Add full-MVP entity, user, and Compliance Master metadata.

Revision ID: 0002_full_mvp_entity_fields
Revises: 0001_initial_schema
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_full_mvp_entity_fields"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for column in [
        sa.Column("unit_type", sa.String(50)), sa.Column("pincode", sa.String(20)),
        sa.Column("gstin", sa.String(30)), sa.Column("pan", sa.String(20)), sa.Column("lin", sa.String(30)),
        sa.Column("employer_name", sa.String(250)), sa.Column("applicable_regulations", sa.Text()),
        sa.Column("male_employees", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("female_employees", sa.Integer(), nullable=False, server_default="0"),
    ]:
        op.add_column("units", column)
    for column in [
        sa.Column("unit_id", sa.String(36)), sa.Column("pincode", sa.String(20)), sa.Column("gstin", sa.String(30)),
        sa.Column("pan", sa.String(20)), sa.Column("lin", sa.String(30)), sa.Column("applicable_regulations", sa.Text()),
        sa.Column("male_workers", sa.Integer(), nullable=False, server_default="0"), sa.Column("female_workers", sa.Integer(), nullable=False, server_default="0"),
    ]:
        op.add_column("contractors", column)
    op.create_index("ix_contractors_unit_id", "contractors", ["unit_id"])
    for column in [
        sa.Column("unit_type", sa.String(50)), sa.Column("pincode", sa.String(20)), sa.Column("gstin", sa.String(30)),
        sa.Column("pan", sa.String(20)), sa.Column("lin", sa.String(30)), sa.Column("applicable_regulations", sa.Text()),
        sa.Column("male_workers", sa.Integer(), nullable=False, server_default="0"), sa.Column("female_workers", sa.Integer(), nullable=False, server_default="0"),
    ]:
        op.add_column("contractor_sites", column)
    op.add_column("users", sa.Column("mobile", sa.String(30)))
    for column in [
        sa.Column("description", sa.Text()), sa.Column("compliance_type", sa.String(100)), sa.Column("document_type", sa.String(100)),
        sa.Column("form_number", sa.String(100)), sa.Column("legal_description", sa.Text()), sa.Column("consequence_or_penalty", sa.Text()),
    ]:
        op.add_column("compliance_rule_versions", column)


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this SQLite migration")
