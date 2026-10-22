"""Store selected Unit compliance types without changing Compliance Master.

Revision ID: 0012_unit_compliance_types
Revises: 0011_user_activation_and_entity_assignments
"""

from alembic import op
import sqlalchemy as sa


revision = "0012_unit_compliance_types"
down_revision = "0011_user_activation_and_entity_assignments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("units")}
    if "compliance_types_json" not in columns:
        op.add_column("units", sa.Column("compliance_types_json", sa.Text(), nullable=True))


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this production data migration")
