"""Add secure account activation credentials.

Revision ID: 0011_user_activation_and_entity_assignments
Revises: 0010_development_reset_marker
"""

from alembic import op
import sqlalchemy as sa


revision = "0011_user_activation_and_entity_assignments"
down_revision = "0010_development_reset_marker"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("user_activations"):
        return
    op.create_table(
        "user_activations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("created_by_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_user_activations_user_id", "user_activations", ["user_id"])
    op.create_index("ix_user_activations_token_hash", "user_activations", ["token_hash"])


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this production data migration")
