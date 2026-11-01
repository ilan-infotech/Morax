from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.api.v1 import registers as api
from app.db.base import Base
from app.models import (
    GeneratedRegister,
    IndustryType,
    Organization,
    RegisterEmployee,
    State,
    Unit,
    User,
    UserRoleScope,
)
from app.schemas import RegisterDecisionInput, RegisterGenerationInput
from app.services.registers import clean_cell, suggest_mapping, validate_rows


def _context_user(user: User, organization_id: str) -> User:
    # Endpoint functions receive a user after the authentication dependency has
    # established a trusted active organization. Recreate that state directly
    # for focused service/API workflow tests.
    setattr(user, "_morax_active_organization_id", organization_id)
    return user


def test_register_generation_review_and_derived_filters_are_tenant_scoped():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        org = Organization(name="Register customer", code="REG-CUST", status="ACTIVE")
        state = State(name="Karnataka", code="KA")
        industry = IndustryType(name="Construction", code="CONSTRUCTION")
        db.add_all([org, state, industry])
        db.flush()
        unit = Unit(
            organization_id=org.id, name="Bengaluru Unit", code="BLR-REG",
            state_id=state.id, industry_type_id=industry.id,
            employer_name="Register customer", compliance_start_date=date(2025, 1, 1), status="ACTIVE",
        )
        maker = User(organization_id=org.id, name="Maker", email="register-maker@example.test", password_hash="x", active=True)
        checker = User(organization_id=org.id, name="Checker", email="register-checker@example.test", password_hash="x", active=True)
        db.add_all([unit, maker, checker])
        db.flush()
        db.add_all([
            UserRoleScope(user_id=maker.id, role="UNIT_MAKER", scope_type="UNIT", scope_id=unit.id),
            UserRoleScope(user_id=maker.id, role="UNIT_ADMIN", scope_type="UNIT", scope_id=unit.id),
            UserRoleScope(user_id=checker.id, role="UNIT_CHECKER", scope_type="UNIT", scope_id=unit.id),
            RegisterEmployee(
                organization_id=org.id, entity_type="UNIT", entity_id=unit.id,
                employee_id="E-001", employee_name="Asha", data_json="{}", source_batch_id="test-batch",
            ),
        ])
        db.commit()
        maker = _context_user(maker, org.id)
        checker = _context_user(checker, org.id)

        readiness = api.register_readiness("UNIT", unit.id, "2026-09", maker, db)
        employee_template = next(item for item in readiness if item["template"]["code"] == "R01")
        assert employee_template["status"] == "READY_TO_GENERATE"

        generated = api.generate_registers(
            RegisterGenerationInput(
                entity_type="UNIT", entity_id=unit.id, period_key="2026-09",
                due_date=date(2026, 10, 1),
                template_version_ids=[employee_template["template"]["version"]["id"]],
            ),
            maker,
            db,
        )
        assert len(generated) == 1
        register_id = generated[0]["id"]
        assert api.list_registers("UNIT", unit.id, "GENERATED_ANY", "2026-09", "", 1, 25, maker, db)["total"] == 1
        assert api.list_registers("UNIT", unit.id, "OVERDUE", "2026-09", "", 1, 25, maker, db)["total"] == 1

        submitted = api.submit_register(register_id, RegisterDecisionInput(row_version=generated[0]["row_version"]), maker, db)
        assert submitted["status"] == "SUBMITTED"
        pending = api.pending_register_reviews(checker, db)
        assert pending["total"] == 1
        approved = api.approve_register(register_id, RegisterDecisionInput(row_version=submitted["row_version"]), checker, db)
        assert approved["status"] == "APPROVED"
        detail = api.get_register(register_id, checker, db)
        assert [entry["action"] for entry in detail["history"]] == ["GENERATE", "SUBMIT", "APPROVED"]
        assert db.get(GeneratedRegister, register_id).status == "APPROVED"

        other_org = Organization(name="Other customer", code="REG-OTHER", status="ACTIVE")
        db.add(other_org); db.flush()
        other_unit = Unit(organization_id=other_org.id, name="Other Unit", code="OTHER-REG", state_id=state.id, industry_type_id=industry.id, employer_name="Other customer", compliance_start_date=date(2025, 1, 1), status="ACTIVE")
        outsider = User(organization_id=other_org.id, name="Outsider", email="register-outsider@example.test", password_hash="x", active=True)
        db.add_all([other_unit, outsider]); db.flush()
        db.add(UserRoleScope(user_id=outsider.id, role="UNIT_MAKER", scope_type="UNIT", scope_id=other_unit.id)); db.commit()
        with pytest.raises(HTTPException) as cross_tenant:
            api.get_register(register_id, _context_user(outsider, other_org.id), db)
        assert cross_tenant.value.status_code == 404

        # A valid submitted register cannot be approved by its Maker, even if
        # a permission assignment is later broadened.
        second = api.generate_registers(
            RegisterGenerationInput(entity_type="UNIT", entity_id=unit.id, period_key="2026-10", template_version_ids=[employee_template["template"]["version"]["id"]]),
            maker, db,
        )[0]
        submitted_second = api.submit_register(second["id"], RegisterDecisionInput(row_version=second["row_version"]), maker, db)
        with pytest.raises(HTTPException) as exc:
            api.review_register(second["id"], RegisterDecisionInput(row_version=submitted_second["row_version"]), "APPROVED", maker, db)
        assert exc.value.status_code == 403
    engine.dispose()


def test_register_validation_rejects_unknown_people_duplicates_and_formula_values():
    assert clean_cell("=HYPERLINK(\"https://unsafe.example\")") == "'=HYPERLINK(\"https://unsafe.example\")"
    assert suggest_mapping(["Emp Code", "Staff Name"], "EMPLOYEE") == {"Emp Code": "employee_id", "Staff Name": "employee_name"}
    assert suggest_mapping(["Emp Code", "Basic Pay", "PF Amount"], "PAYROLL") == {"Emp Code": "employee_id", "Basic Pay": "basic_salary", "PF Amount": "employee_pf"}
    issues = validate_rows(
        "ATTENDANCE",
        [
            {"_row_number": 2, "employee_id": "UNKNOWN", "attendance_date": "2026-09-01", "attendance_status": "Present", "working_hours": "-1"},
            {"_row_number": 3, "employee_id": "UNKNOWN", "attendance_date": "2026-09-01", "attendance_status": "Present", "working_hours": "8"},
        ],
        {"E-001"},
        "2026-09",
    )
    messages = " ".join(issue["message"] for issue in issues)
    assert "not available in Employee Master" in messages
    assert "Duplicate record" in messages
    assert "non-negative" in messages
