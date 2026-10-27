"""Persist Unit effective date and restore legacy district selections.

Revision ID: 0016_unit_edit_fields
Revises: 0015_compliance_type_applicability
"""

from alembic import op
import sqlalchemy as sa


revision = "0016_unit_edit_fields"
down_revision = "0015_compliance_type_applicability"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("units")}
    if "effective_date" not in columns:
        op.add_column("units", sa.Column("effective_date", sa.Date(), nullable=True))

    # Existing builds displayed an Effective Date field but never persisted it.
    # Compliance start is the safest non-destructive fallback for those rows.
    bind.execute(sa.text(
        "UPDATE units SET effective_date = compliance_start_date "
        "WHERE effective_date IS NULL"
    ))
    # Early records stored only the district name. Restore the controlled ID so
    # the dependent State -> City dropdown can select the saved value on edit.
    bind.execute(sa.text("""
        UPDATE units
        SET city_id = (
            SELECT cities.id FROM cities
            WHERE cities.state_id = units.state_id
              AND LOWER(TRIM(cities.name)) = LOWER(TRIM(units.city))
            LIMIT 1
        )
        WHERE city_id IS NULL AND city IS NOT NULL
    """))


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this production data migration")
