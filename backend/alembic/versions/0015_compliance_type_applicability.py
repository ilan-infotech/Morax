"""Connect Compliance Master rules to Unit compliance types.

Revision ID: 0015_compliance_type_applicability
Revises: 0014_active_contractor_context
"""

from alembic import op
import sqlalchemy as sa


revision = "0015_compliance_type_applicability"
down_revision = "0014_active_contractor_context"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("rule_applicability_criteria")}
    if "unit_compliance_types_json" not in columns:
        op.add_column(
            "rule_applicability_criteria",
            sa.Column("unit_compliance_types_json", sa.Text(), nullable=True),
        )

    # Preserve generic rules as universal, while connecting the classifications
    # that are explicit in the existing SME master. More detailed PF/ESI tags
    # are populated by the normalized workbook importer.
    bind.execute(sa.text("""
        UPDATE rule_applicability_criteria
        SET unit_compliance_types_json = CASE
            WHEN rule_version_id IN (
                SELECT v.id FROM compliance_rule_versions v
                WHERE (UPPER(v.name) LIKE '%EPF%' OR UPPER(v.name) LIKE '%PF/%')
                  AND (UPPER(v.name) LIKE '%ESI%' OR UPPER(v.name) LIKE '%ESIC%')
            ) THEN '["PF", "ESI"]'
            WHEN rule_version_id IN (
                SELECT v.id FROM compliance_rule_versions v
                WHERE UPPER(v.name) LIKE '%EPF%' OR UPPER(v.name) LIKE '%PROVIDENT FUND%'
            ) THEN '["PF"]'
            WHEN rule_version_id IN (
                SELECT v.id FROM compliance_rule_versions v
                WHERE UPPER(v.name) LIKE '%ESI%' OR UPPER(v.name) LIKE '%ESIC%'
            ) THEN '["ESI"]'
            WHEN rule_version_id IN (
                SELECT v.id FROM compliance_rule_versions v
                WHERE UPPER(COALESCE(v.compliance_type, '')) LIKE '%SHOPS%'
            ) THEN '["Shops & Establishments"]'
            WHEN rule_version_id IN (
                SELECT v.id FROM compliance_rule_versions v
                WHERE UPPER(COALESCE(v.compliance_type, '')) LIKE '%BOCW%'
            ) THEN '["BOCW"]'
            ELSE '[]'
        END
        WHERE entity_type = 'UNIT' AND unit_compliance_types_json IS NULL
    """))

    # The supplied SME workbook is Tamil Nadu-specific, but its Central Acts
    # must apply in every state. Industry defaults introduced by the original
    # conversion are removed because the workbook itself did not prescribe an
    # industry restriction; Unit Compliance Type is now the primary gate.
    bind.execute(sa.text("""
        UPDATE rule_applicability_criteria
        SET industry_type_id = NULL
        WHERE rule_version_id IN (
            SELECT v.id FROM compliance_rule_versions v
            JOIN compliance_rules r ON r.id = v.rule_id
            WHERE r.compliance_id LIKE 'TN-%'
        )
    """))
    bind.execute(sa.text("""
        UPDATE rule_applicability_criteria
        SET state_id = NULL
        WHERE rule_version_id IN (
            SELECT v.id FROM compliance_rule_versions v
            JOIN compliance_rules r ON r.id = v.rule_id
            WHERE r.compliance_id LIKE 'TN-%'
              AND UPPER(COALESCE(v.act, '')) NOT LIKE '%TAMIL NADU%'
        )
    """))

    # SME-approved default: previous-month monthly obligations are due on day
    # 15 of the new month. Narrative annual/event rules remain MANUAL.
    bind.execute(sa.text("""
        UPDATE compliance_rule_versions
        SET due_date_rule = 'FIXED_DAY_OF_MONTH', due_date_offset = 15
        WHERE frequency = 'MONTHLY' AND due_date_rule = 'MANUAL'
          AND rule_id IN (SELECT id FROM compliance_rules WHERE compliance_id LIKE 'TN-%')
    """))

    # Only one effective active version of a logical rule may generate work.
    bind.execute(sa.text("""
        UPDATE compliance_rule_versions
        SET active = 0
        WHERE active = 1 AND id NOT IN (
            SELECT v2.id FROM compliance_rule_versions v2
            WHERE v2.version = (
                SELECT MAX(v3.version) FROM compliance_rule_versions v3
                WHERE v3.rule_id = v2.rule_id AND v3.active = 1
            )
        )
    """))


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this production data migration")
