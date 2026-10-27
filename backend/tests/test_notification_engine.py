from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

import app.api.v1.router as api
from app.db.base import Base
from app.models import ComplianceAssignment, ComplianceInstance, ComplianceRule, ComplianceRuleVersion, Organization, State, IndustryType, Unit, User, UserRoleScope
from app.services.notifications import schedule_compliance_reminders


def test_reminders_are_recipient_scoped_and_idempotent():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        org = Organization(name="Customer", code="CUSTOMER", status="ACTIVE")
        state = State(name="Tamil Nadu", code="TN")
        industry = IndustryType(name="Services", code="SERVICES")
        db.add_all([org, state, industry]); db.flush()
        unit = Unit(organization_id=org.id, name="Chennai Unit", code="CHN", state_id=state.id, industry_type_id=industry.id, employer_name="Customer", compliance_start_date=date(2020, 1, 1), status="ACTIVE")
        maker = User(organization_id=org.id, name="Maker", email="maker@example.test", password_hash="x", active=True)
        checker = User(organization_id=org.id, name="Checker", email="checker@example.test", password_hash="x", active=True)
        rule = ComplianceRule(organization_id=org.id, compliance_id="TEST-NOTIFICATION")
        db.add_all([unit, maker, checker, rule]); db.flush()
        version = ComplianceRuleVersion(rule_id=rule.id, version=1, name="Monthly return", frequency="MONTHLY", due_date_rule="FIXED_DAY_OF_MONTH", due_date_offset=15, effective_from=date(2020, 1, 1), active=True)
        db.add(version); db.flush()
        instance = ComplianceInstance(organization_id=org.id, rule_version_id=version.id, subject_type="UNIT", subject_id=unit.id, unit_id=unit.id, period_key="2026-10", due_date=date(2026, 11, 15), rule_snapshot_json="{}", applicability_snapshot_json="{}", status="PENDING")
        db.add(instance); db.flush()
        db.add_all([
            ComplianceAssignment(instance_id=instance.id, user_id=maker.id, assignment_type="MAKER"),
            ComplianceAssignment(instance_id=instance.id, user_id=checker.id, assignment_type="CHECKER"),
            UserRoleScope(user_id=maker.id, role="UNIT_MAKER", scope_type="UNIT", scope_id=unit.id),
            UserRoleScope(user_id=checker.id, role="UNIT_CHECKER", scope_type="UNIT", scope_id=unit.id),
        ])
        db.commit()

        assert schedule_compliance_reminders(db, date(2026, 11, 8)) == 1
        db.commit()
        # Re-running the same reminder stage is harmless.
        assert schedule_compliance_reminders(db, date(2026, 11, 8)) == 0
        db.commit()
        maker_page = api.list_notifications(user=maker, db=db)
        assert maker_page["summary"]["unread"] == 1
        assert maker_page["items"][0]["event_type"] == "DUE_IN_7_DAYS"
        assert api.list_notifications(user=checker, db=db)["total"] == 0

        instance.status = "SUBMITTED"
        db.commit()
        assert schedule_compliance_reminders(db, date(2026, 11, 8)) == 1
        db.commit()
        checker_page = api.list_notifications(user=checker, db=db)
        assert checker_page["summary"]["unread"] == 1
        assert checker_page["items"][0]["event_type"] == "REVIEW_REMINDER"
        notification_id = maker_page["items"][0]["id"]
        assert api.read_notification(notification_id, maker, db)["ok"] is True
        assert api.read_all_notifications(checker, db)["updated"] == 1
    engine.dispose()
