"""Hide the internal MORAX platform tenant from customer organization management.

Revision ID: 0013_system_platform_tenant
Revises: 0012_unit_compliance_types
"""

from alembic import op
import sqlalchemy as sa


revision = "0013_system_platform_tenant"
down_revision = "0012_unit_compliance_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("organizations")}
    if "is_system" not in columns:
        op.add_column("organizations", sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()))
        op.create_index("ix_organizations_is_system", "organizations", ["is_system"])
    op.execute("UPDATE organizations SET is_system = 0 WHERE is_system IS NULL")
    # The original bootstrap/demo organization carries the Product Admin and
    # global Compliance Master in existing deployments. The role-based update
    # also handles older installations whose bootstrap tenant was renamed.
    op.execute("UPDATE organizations SET is_system = 1 WHERE code = 'MORAX-DEMO'")
    op.execute(
        "UPDATE organizations SET is_system = 1 "
        "WHERE id IN (SELECT organization_id FROM users "
        "WHERE platform_role = 'MORAX_ADMIN' AND organization_id IS NOT NULL)"
    )


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this production data migration")
