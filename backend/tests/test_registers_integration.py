"""Repeatable integration/security coverage for the MORAX Registers workflow.

These tests intentionally use synthetic identities, workbook bytes and an
in-memory SQLite schema.  They call the same route functions used by FastAPI,
so authorization, storage parsing, import, generation, approval, evidence and
notification paths are exercised without production data.
"""

import asyncio
import io
from datetime import date

import pytest
from fastapi import HTTPException, UploadFile
from openpyxl import Workbook, load_workbook
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.v1 import registers as api
from app.core.config import settings
from app.db.base import Base
from app.models import (
    ComplianceInstance, ComplianceRule, ComplianceRuleVersion, GeneratedRegister,
    InAppNotification, IndustryType, Organization, RegisterEmployee, State, Unit,
    User, UserRoleScope,
)
from app.schemas import RegisterComplianceLinkInput, RegisterDecisionInput, RegisterGenerationInput
from app.services.notifications import schedule_register_reminders
from app.services.registers import parse_workbook


def workbook_bytes(headers, rows):
    workbook = Workbook(); sheet = workbook.active; sheet.append(headers)
    for row in rows:
        sheet.append(row)
    output = io.BytesIO(); workbook.save(output)
    return output.getvalue()


def active(user, org_id):
    setattr(user, "_morax_active_organization_id", org_id)
    return user


def upload(dataset, entity_type, entity_id, period, content, name, user, db):
    file = UploadFile(filename=name, file=io.BytesIO(content))
    return asyncio.run(api.validate_upload(dataset, entity_type, entity_id, period, None, file, user, db))


def seed(db):
    org_a = Organization(name="Registers Test A", code="REG-A", status="ACTIVE")
    org_b = Organization(name="Registers Test B", code="REG-B", status="ACTIVE")
    state = State(name="Karnataka", code="KA")
    industry = IndustryType(name="Construction", code="CON")
    db.add_all([org_a, org_b, state, industry]); db.flush()
    unit_a1 = Unit(organization_id=org_a.id, name="Unit A1", code="A1", state_id=state.id, industry_type_id=industry.id, employer_name="A", compliance_start_date=date(2020, 1, 1), status="ACTIVE")
    unit_a2 = Unit(organization_id=org_a.id, name="Unit A2", code="A2", state_id=state.id, industry_type_id=industry.id, employer_name="A", compliance_start_date=date(2020, 1, 1), status="ACTIVE")
    unit_b1 = Unit(organization_id=org_b.id, name="Unit B1", code="B1", state_id=state.id, industry_type_id=industry.id, employer_name="B", compliance_start_date=date(2020, 1, 1), status="ACTIVE")
    maker = User(organization_id=org_a.id, name="Unit Maker", email="reg-maker@test.local", password_hash="x", active=True)
    checker = User(organization_id=org_a.id, name="Unit Checker", email="reg-checker@test.local", password_hash="x", active=True)
    viewer = User(organization_id=org_a.id, name="Auditor", email="reg-auditor@test.local", password_hash="x", active=True)
    outsider = User(organization_id=org_b.id, name="Other Maker", email="reg-other@test.local", password_hash="x", active=True)
    db.add_all([unit_a1, unit_a2, unit_b1, maker, checker, viewer, outsider]); db.flush()
    db.add_all([
        UserRoleScope(user_id=maker.id, role="UNIT_MAKER", scope_type="UNIT", scope_id=unit_a1.id),
        UserRoleScope(user_id=checker.id, role="UNIT_CHECKER", scope_type="UNIT", scope_id=unit_a1.id),
        UserRoleScope(user_id=viewer.id, role="AUDITOR", scope_type="UNIT", scope_id=unit_a1.id),
        UserRoleScope(user_id=outsider.id, role="UNIT_MAKER", scope_type="UNIT", scope_id=unit_b1.id),
    ])
    db.commit()
    return org_a, org_b, unit_a1, unit_a2, unit_b1, active(maker, org_a.id), active(checker, org_a.id), active(viewer, org_a.id), active(outsider, org_b.id)


def test_upload_import_generate_export_review_link_and_regenerate(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))
    engine = create_engine("sqlite:///:memory:"); Base.metadata.create_all(engine)
    with Session(engine) as db:
        org_a, _, unit, _, _, maker, checker, _, _ = seed(db)
        employees = workbook_bytes(["Emp Code", "Staff Name", "Department"], [["E001", "Asha", "Operations"], ["E002", "Bala", "Safety"]])
        employee_batch = upload("EMPLOYEE", "UNIT", unit.id, None, employees, "employees.xlsx", maker, db)
        assert employee_batch["batch"]["status"] == "VALIDATED"
        assert employee_batch["mapping"] == {"Emp Code": "employee_id", "Staff Name": "employee_name", "Department": "department"}
        assert api.import_upload(employee_batch["batch"]["id"], maker, db)["imported_rows"] == 2
        employee_id = db.scalar(__import__("sqlalchemy").select(RegisterEmployee.id).where(RegisterEmployee.employee_id == "E001"))
        edited = api.update_employee(employee_id, {"designation": "Supervisor"}, maker, db)
        assert edited["data"]["designation"] == "Supervisor"
        attendance = workbook_bytes(["Employee ID", "Attendance Date", "Attendance Status", "Working Hours", "Overtime Hours"], [["E001", "2026-09-01", "Present", 8, 2], ["E002", "2026-09-01", "Paid Leave", 0, 0]])
        attendance_batch = upload("ATTENDANCE", "UNIT", unit.id, "2026-09", attendance, "attendance.xlsx", maker, db)
        assert api.import_upload(attendance_batch["batch"]["id"], maker, db)["status"] == "IMPORTED"
        payroll = workbook_bytes(["Employee ID", "Payroll Month", "Payroll Year", "Gross Earnings", "Total Deductions", "Net Pay", "Overtime Wages", "PF Amount"], [["E001", 9, 2026, 10000, 1000, 9000, 250, 500], ["E002", 9, 2026, 12000, 1200, 10800, 0, 600]])
        payroll_batch = upload("PAYROLL", "UNIT", unit.id, "2026-09", payroll, "payroll.xlsx", maker, db)
        assert api.import_upload(payroll_batch["batch"]["id"], maker, db)["status"] == "IMPORTED"

        readiness = api.register_readiness("UNIT", unit.id, "2026-09", maker, db)
        ready_codes = {item["template"]["code"] for item in readiness if item["status"] == "READY_TO_GENERATE"}
        assert {"R01", "R02", "R03", "R04", "R05", "R06"}.issubset(ready_codes)
        assert next(item for item in readiness if item["template"]["code"] == "R07")["status"] == "MISSING_DATA"
        ids = [item["template"]["version"]["id"] for item in readiness if item["template"]["code"] in {"R01", "R02", "R03", "R04", "R05", "R06"}]
        generated = api.generate_registers(RegisterGenerationInput(entity_type="UNIT", entity_id=unit.id, period_key="2026-09", due_date=date(2026, 10, 1), template_version_ids=ids), maker, db)
        assert len(generated) == 6
        dashboard = api.registers_dashboard("UNIT", unit.id, "2026-09", maker, db)
        assert dashboard["summary"]["generated"] == 6
        assert dashboard["summary"]["pending_generation"] == 0
        assert api.list_registers("UNIT", unit.id, "GENERATED_ANY", "2026-09", "", 1, 25, maker, db)["total"] == 6
        assert schedule_register_reminders(db, date(2026, 9, 24)) == 6
        db.commit()
        assert schedule_register_reminders(db, date(2026, 9, 24)) == 0
        combined = next(item for item in generated if item["register_code"] == "R04")
        detail = api.get_register(combined["id"], maker, db)
        assert detail["employee_count"] == 2
        assert detail["content"]["rows"][0]["paid_days"] == 1
        exported = api.xlsx_for_register(db.get(GeneratedRegister, combined["id"]))
        sheet = load_workbook(io.BytesIO(exported), data_only=True).active
        assert sheet[1][0].value == "Combined Muster Roll cum Wage Register"
        assert api.basic_pdf(db.get(GeneratedRegister, combined["id"])).startswith(b"%PDF-")

        submitted = api.submit_register(combined["id"], RegisterDecisionInput(row_version=combined["row_version"]), maker, db)
        assert api.pending_register_reviews(checker, db)["total"] == 1
        approved = api.approve_register(combined["id"], RegisterDecisionInput(row_version=submitted["row_version"]), checker, db)
        assert approved["status"] == "APPROVED"
        with pytest.raises(HTTPException) as concurrent_decision:
            api.approve_register(combined["id"], RegisterDecisionInput(row_version=submitted["row_version"]), checker, db)
        assert concurrent_decision.value.status_code == 409
        assert db.scalar(__import__("sqlalchemy").select(__import__("sqlalchemy").func.count()).select_from(InAppNotification)) >= 2

        rule = ComplianceRule(organization_id=org_a.id, compliance_id="REG-COMBINED")
        db.add(rule); db.flush()
        version = ComplianceRuleVersion(rule_id=rule.id, version=1, name="Combined evidence", frequency="MONTHLY", due_date_rule="FIXED_DAY_OF_MONTH", due_date_offset=15, effective_from=date(2020, 1, 1), active=True)
        db.add(version); db.flush()
        instance = ComplianceInstance(organization_id=org_a.id, rule_version_id=version.id, subject_type="UNIT", subject_id=unit.id, unit_id=unit.id, period_key="2026-09", due_date=date(2026, 10, 15), rule_snapshot_json="{}", applicability_snapshot_json="{}", status="PENDING")
        db.add(instance); db.commit()
        link = api.link_register_to_compliance(combined["id"], RegisterComplianceLinkInput(compliance_instance_id=instance.id), maker, db)
        assert link["compliance_instance_id"] == instance.id
        assert db.get(ComplianceInstance, instance.id).status == "PENDING"

        # A corrected September source creates a new register revision; it
        # cannot mutate the approved previous output.
        corrected = workbook_bytes(["Employee ID", "Payroll Month", "Payroll Year", "Gross Earnings", "Total Deductions", "Net Pay"], [["E001", 9, 2026, 11000, 1000, 10000], ["E002", 9, 2026, 12000, 1200, 10800]])
        batch = upload("PAYROLL", "UNIT", unit.id, "2026-09", corrected, "payroll-corrected.xlsx", maker, db)
        api.import_upload(batch["batch"]["id"], maker, db)
        next_version = api.generate_registers(RegisterGenerationInput(entity_type="UNIT", entity_id=unit.id, period_key="2026-09", template_version_ids=[next(item["template"]["version"]["id"] for item in readiness if item["template"]["code"] == "R04")]), maker, db)[0]
        assert next_version["version"] == 2
        assert db.get(GeneratedRegister, combined["id"]).status == "APPROVED"
    engine.dispose()


def test_validation_security_and_entity_isolation(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))
    engine = create_engine("sqlite:///:memory:"); Base.metadata.create_all(engine)
    with Session(engine) as db:
        org_a, _, unit_a1, unit_a2, _, maker, _, viewer, outsider = seed(db)
        invalid = workbook_bytes(["Employee ID", "Attendance Date", "Attendance Status", "Working Hours"], [["UNKNOWN", "2026-09-01", "Present", -8], ["UNKNOWN", "2026-09-01", "Present", 8]])
        invalid_batch = upload("ATTENDANCE", "UNIT", unit_a1.id, "2026-09", invalid, "invalid.xlsx", maker, db)
        assert invalid_batch["batch"]["status"] == "VALIDATION_FAILED"
        assert api.import_upload.__name__ == "import_upload"
        with pytest.raises(HTTPException) as blocked_import:
            api.import_upload(invalid_batch["batch"]["id"], maker, db)
        assert blocked_import.value.status_code == 422
        with pytest.raises(HTTPException) as cross_unit:
            api.list_employees("UNIT", unit_a2.id, "", 1, 25, maker, db)
        assert cross_unit.value.status_code == 403
        with pytest.raises(HTTPException) as cross_tenant:
            api.list_employees("UNIT", unit_a1.id, "", 1, 25, outsider, db)
        assert cross_tenant.value.status_code == 403
        with pytest.raises(HTTPException) as payroll_privacy:
            api.list_payroll("UNIT", unit_a1.id, "2026-09", 1, 25, viewer, db)
        assert payroll_privacy.value.status_code == 403
        with pytest.raises(ValueError):
            parse_workbook(b"not an xlsx", "EMPLOYEE")
        assert "'" in parse_workbook(workbook_bytes(["Employee ID", "Employee Name"], [["=1+1", "Formula input"]]), "EMPLOYEE")[0][0]["employee_id"]
    engine.dispose()
