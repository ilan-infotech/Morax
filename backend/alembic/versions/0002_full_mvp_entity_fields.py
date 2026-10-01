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
    for column in [
        sa.Column("unit_type", sa.String(50)), sa.Column("pincode", sa.String(20)),
        sa.Column("gstin", sa.String(30)), sa.Column("pan", sa.String(20)), sa.Column("lin", sa.String(30)),
        sa.Column("employer_name", sa.String(250)), sa.Column("applicable_regulations", sa.Text()),
        sa.Column("male_employees", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("female_employees", sa.Integer(), nullable=False, server_default="0"),
    ]:
        _add_column_if_missing("units", column)
    for column in [
        sa.Column("unit_id", sa.String(36)), sa.Column("pincode", sa.String(20)), sa.Column("gstin", sa.String(30)),
        sa.Column("pan", sa.String(20)), sa.Column("lin", sa.String(30)), sa.Column("applicable_regulations", sa.Text()),
        sa.Column("male_workers", sa.Integer(), nullable=False, server_default="0"), sa.Column("female_workers", sa.Integer(), nullable=False, server_default="0"),
    ]:
        _add_column_if_missing("contractors", column)
    _create_index_if_missing("ix_contractors_unit_id", "contractors", ["unit_id"])
    for column in [
        sa.Column("unit_type", sa.String(50)), sa.Column("pincode", sa.String(20)), sa.Column("gstin", sa.String(30)),
        sa.Column("pan", sa.String(20)), sa.Column("lin", sa.String(30)), sa.Column("applicable_regulations", sa.Text()),
        sa.Column("male_workers", sa.Integer(), nullable=False, server_default="0"), sa.Column("female_workers", sa.Integer(), nullable=False, server_default="0"),
    ]:
        _add_column_if_missing("contractor_sites", column)
    _add_column_if_missing("users", sa.Column("mobile", sa.String(30)))
    for column in [
        sa.Column("description", sa.Text()), sa.Column("compliance_type", sa.String(100)), sa.Column("document_type", sa.String(100)),
        sa.Column("form_number", sa.String(100)), sa.Column("legal_description", sa.Text()), sa.Column("consequence_or_penalty", sa.Text()),
    ]:
        _add_column_if_missing("compliance_rule_versions", column)


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this SQLite migration")
