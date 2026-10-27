import json
from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import (
    ComplianceInstance,
    ComplianceRule,
    ComplianceRuleVersion,
    IndustryType,
    Organization,
    RuleApplicabilityCriteria,
    State,
    Unit,
)
from app.services.compliance import calculate_due_date, compliance_display_status, evaluate, generate_for_subject, period_end, period_for, period_start
from scripts.replace_compliance_master import unit_compliance_types


def test_master_classifier_does_not_treat_determine_as_mines():
    assert unit_compliance_types(
        "Central",
        "ALL COVERED ESTABLISHMENTS",
        "Determine Professional Tax applicability",
        "Local-body provisions",
    ) == []
    assert unit_compliance_types(
        "SHOPS",
        "SHOPS & ESTABLISHMENTS",
        "Determine Professional Tax applicability",
        "Local-body provisions",
    ) == ["Shops & Establishments"]
    assert unit_compliance_types(
        "Central",
        "MINES",
        "Maintain mine records",
        "Mines Act",
    ) == ["Mines"]


def test_unit_compliance_type_is_the_first_applicability_gate():
    version = type("Version", (), {"id": "version-1"})()
    criteria = type(
        "Criteria",
        (),
        {
            "entity_type": "UNIT",
            "state_id": "TN",
            "industry_type_id": None,
            "employee_threshold": None,
            "unit_compliance_types_json": json.dumps(["PF"]),
            "applicability_flag": True,
            "notes": None,
        },
    )()
    unit = type(
        "UnitSubject",
        (),
        {
            "entity_type": "UNIT",
            "state_id": "TN",
            "industry_type_id": "IT",
            "total_employees": 50,
            "compliance_types_json": json.dumps(["ESI"]),
        },
    )()

    applicable, explanation = evaluate(version, criteria, unit)
    assert applicable is False
    assert explanation["matched"]["unit_compliance_type"] is False

    unit.compliance_types_json = json.dumps(["PF", "ESI"])
    applicable, explanation = evaluate(version, criteria, unit)
    assert applicable is True
    assert explanation["matched"]["unit_compliance_type"] is True


def test_monthly_generation_creates_previous_month_due_on_day_15_once():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        master = Organization(name="MORAX Platform", code="SYSTEM", status="CONFIGURED", is_system=True)
        customer = Organization(name="Example Company", code="EXAMPLE", status="ACTIVE", is_system=False)
        state = State(name="Tamil Nadu", code="TN")
        industry = IndustryType(name="IT Services", code="IT")
        db.add_all([master, customer, state, industry])
        db.flush()
        unit = Unit(
            organization_id=customer.id,
            name="Chennai Unit",
            code="CHN-001",
            industry_type_id=industry.id,
            state_id=state.id,
            employer_name="Example Company",
            compliance_types_json=json.dumps(["PF"]),
            male_employees=20,
            female_employees=10,
            compliance_start_date=date(2026, 1, 1),
            status="ACTIVE",
        )
        rule = ComplianceRule(organization_id=master.id, compliance_id="PF-MONTHLY")
        db.add_all([unit, rule])
        db.flush()
        version = ComplianceRuleVersion(
            rule_id=rule.id,
            version=1,
            name="PF monthly filing",
            act="Code on Social Security",
            frequency="MONTHLY",
            due_date_rule="FIXED_DAY_OF_MONTH",
            due_date_offset=15,
            risk_level="HIGH",
            effective_from=date(2026, 1, 1),
            active=True,
        )
        db.add(version)
        db.flush()
        db.add(
            RuleApplicabilityCriteria(
                rule_version_id=version.id,
                entity_type="UNIT",
                state_id=None,
                industry_type_id=None,
                unit_compliance_types_json=json.dumps(["PF"]),
            )
        )
        db.commit()

        created = generate_for_subject(db, customer.id, "UNIT", unit.id, date(2026, 10, 25))
        db.commit()
        assert len(created) == 1
        assert created[0].period_key == "2026-09"
        assert created[0].due_date == date(2026, 10, 15)
        assert compliance_display_status(created[0], date(2026, 10, 25)) == "OVERDUE"

        assert generate_for_subject(db, customer.id, "UNIT", unit.id, date(2026, 10, 25)) == []
        assert db.query(ComplianceInstance).count() == 1

        next_cycle = generate_for_subject(db, customer.id, "UNIT", unit.id, date(2026, 11, 1))
        db.commit()
        assert len(next_cycle) == 1
        assert next_cycle[0].period_key == "2026-10"
        assert next_cycle[0].due_date == date(2026, 11, 15)
        assert compliance_display_status(next_cycle[0], date(2026, 11, 1)) == "UPCOMING"
        assert generate_for_subject(db, customer.id, "UNIT", unit.id, date(2026, 11, 1)) == []
        assert db.query(ComplianceInstance).count() == 2

        # Daily and weekly rules used to collapse into the shared ONCE period
        # key. Verify real persistence now creates an independent occurrence
        # while a scheduler retry for the same calendar period remains safe.
        daily_rule = ComplianceRule(organization_id=master.id, compliance_id="DAILY-REGISTER")
        weekly_rule = ComplianceRule(organization_id=master.id, compliance_id="WEEKLY-RETURN")
        db.add_all([daily_rule, weekly_rule]); db.flush()
        daily = ComplianceRuleVersion(
            rule_id=daily_rule.id, version=1, name="Daily register", frequency="DAILY",
            due_date_rule="DAYS_AFTER_PERIOD_END", due_date_offset=1,
            effective_from=date(2026, 1, 1), active=True,
        )
        weekly = ComplianceRuleVersion(
            rule_id=weekly_rule.id, version=1, name="Weekly return", frequency="WEEKLY",
            due_date_rule="DAYS_AFTER_PERIOD_END", due_date_offset=2,
            effective_from=date(2026, 1, 1), active=True,
        )
        db.add_all([daily, weekly]); db.flush()
        db.add_all([
            RuleApplicabilityCriteria(rule_version_id=daily.id, entity_type="UNIT", unit_compliance_types_json=json.dumps(["PF"])),
            RuleApplicabilityCriteria(rule_version_id=weekly.id, entity_type="UNIT", unit_compliance_types_json=json.dumps(["PF"])),
        ])
        db.commit()

        first_daily_weekly = generate_for_subject(db, customer.id, "UNIT", unit.id, date(2026, 11, 1))
        db.commit()
        assert {(item.period_key, item.due_date) for item in first_daily_weekly} == {
            ("2026-11-01", date(2026, 11, 2)),
            ("2026-W44", date(2026, 11, 3)),
        }
        assert generate_for_subject(db, customer.id, "UNIT", unit.id, date(2026, 11, 1)) == []
        next_daily_weekly = generate_for_subject(db, customer.id, "UNIT", unit.id, date(2026, 11, 2))
        db.commit()
        assert {(item.period_key, item.due_date) for item in next_daily_weekly} == {
            ("2026-11-02", date(2026, 11, 3)),
            ("2026-W45", date(2026, 11, 10)),
        }


def test_date_aware_statuses_are_derived_consistently():
    today = date(2026, 10, 25)

    def instance(status: str, due: date, completion_late=None):
        return type("Instance", (), {"status": status, "due_date": due, "completion_late": completion_late})()

    assert compliance_display_status(instance("PENDING", date(2026, 11, 10)), today) == "UPCOMING"
    assert compliance_display_status(instance("PENDING", date(2026, 10, 30)), today) == "DUE_SOON"
    assert compliance_display_status(instance("PENDING", today), today) == "DUE_TODAY"
    assert compliance_display_status(instance("SUBMITTED", date(2026, 10, 24)), today) == "OVERDUE"
    assert compliance_display_status(instance("APPROVED", date(2026, 10, 20), False), today) == "COMPLETED"
    assert compliance_display_status(instance("APPROVED", date(2026, 10, 20), True), today) == "COMPLETED_LATE"
    assert compliance_display_status(instance("NOT_APPLICABLE", date(2026, 10, 20)), today) == "NOT_APPLICABLE"


def test_daily_and_weekly_periods_are_independent_and_calendar_aware():
    # These keys are the idempotency boundary for scheduled generation.  A
    # second run on the same day/week must not duplicate work, while the next
    # day/week must produce a separate obligation.
    friday = date(2026, 10, 30)
    saturday = date(2026, 10, 31)
    monday = date(2026, 11, 2)

    assert period_for("DAILY", friday) == "2026-10-30"
    assert period_for("DAILY", saturday) == "2026-10-31"
    assert period_for("WEEKLY", friday) == "2026-W44"
    assert period_for("WEEKLY", saturday) == "2026-W44"
    assert period_for("WEEKLY", monday) == "2026-W45"
    assert period_start("WEEKLY", friday) == date(2026, 10, 26)
    assert period_end("WEEKLY", friday) == date(2026, 11, 1)
    # Yearly and half-yearly import aliases normalize to the same period.
    assert period_for("YEARLY", friday) == period_for("ANNUAL", friday) == "2026"
    assert period_for("HALF-YEARLY", friday) == "2026-H2"

    fixed_day = type("Version", (), {"due_date_rule": "FIXED_DAY_OF_MONTH", "due_date_offset": 15, "due_date_anchor": None, "frequency": "QUARTERLY"})()
    days_after = type("Version", (), {"due_date_rule": "DAYS_AFTER_PERIOD_END", "due_date_offset": 2, "due_date_anchor": None, "frequency": "WEEKLY"})()
    leap_day = type("Version", (), {"due_date_rule": "FIXED_ANNUAL_DATE", "due_date_offset": None, "due_date_anchor": "02-29", "frequency": "ANNUAL"})()
    assert calculate_due_date(fixed_day, date(2026, 2, 1)) == date(2026, 3, 15)
    assert calculate_due_date(days_after, friday) == date(2026, 11, 3)
    assert calculate_due_date(leap_day, date(2024, 1, 1)) == date(2024, 2, 29)
    assert calculate_due_date(leap_day, date(2025, 1, 1)) == date(2025, 2, 28)
