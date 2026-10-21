from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

import app.api.v1.router as api
from app.core.security import hash_password
from app.db.base import Base
from app.models import ComplianceInstance, IndustryType, Organization, State, User, UserActivation
from app.schemas import (
    ActivityInput,
    ContractorInput,
    EntityUserAssignmentInput,
    LoginRequest,
    PlatformOrganizationInput,
    RoleScopeInput,
    RuleInput,
    SubmissionInput,
    UnitInput,
    UserCreateInput,
    WorkflowDecision,
)
from app.services.access import user_summary


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def test_product_master_and_full_tenant_role_matrix(db):
    """Exercise the product-owner, tenant, scope, workflow, and isolation paths."""
    master_org = Organization(name="MORAX Master", code="MORAX-MASTER", status="ACTIVE")
    state = State(name="Tamil Nadu", code="TN")
    industry = IndustryType(name="Factory", code="FACTORY")
    other_industry = IndustryType(name="IT Services", code="IT")
    db.add_all([master_org, state, industry, other_industry])
    db.flush()
    product_admin = User(
        organization_id=master_org.id,
        name="MORAX Product Admin",
        email="product.admin@morax.example.com",
        password_hash=hash_password("Product-Admin-Password-1"),
        active=True,
        platform_role="MORAX_ADMIN",
    )
    db.add(product_admin)
    db.commit()

    # Product Admin is the only author of globally shared Compliance Master rules.
    unit_rule = api.create_rule(
        RuleInput(
            compliance_id="MASTER-UNIT-TN-FACTORY",
            name="Factory unit monthly return",
            version=1,
            entity_type="UNIT",
            state_id=state.id,
            industry_type_id=industry.id,
            frequency="MONTHLY",
            due_date_rule="DAYS_AFTER_PERIOD_END",
            due_date_offset=5,
            effective_from=date(2020, 1, 1),
        ),
        product_admin,
        db,
    )
    contractor_rule = api.create_rule(
        RuleInput(
            compliance_id="MASTER-CONTRACTOR-TN-FACTORY",
            name="Factory contractor monthly return",
            version=1,
            entity_type="CONTRACTOR",
            state_id=state.id,
            industry_type_id=industry.id,
            frequency="MONTHLY",
            due_date_rule="DAYS_AFTER_PERIOD_END",
            due_date_offset=5,
            effective_from=date(2020, 1, 1),
        ),
        product_admin,
        db,
    )
    assert {item["id"] for item in api.list_rules(user=product_admin, db=db)} >= {unit_rule["id"], contractor_rule["id"]}

    tenant_a = api.create_platform_organization(
        PlatformOrganizationInput(
            organization_name="MRF Test Tenant",
            organization_code="MRF-TEST",
            organization_admin_name="MRF Admin",
            organization_admin_email="admin@mrf-test.example.com",
            organization_admin_password="Mrf-Admin-Password-1",
            status="ACTIVE",
        ),
        product_admin,
        db,
    )
    tenant_b = api.create_platform_organization(
        PlatformOrganizationInput(
            organization_name="Other Test Tenant",
            organization_code="OTHER-TEST",
            organization_admin_name="Other Admin",
            organization_admin_email="admin@other-test.example.com",
            organization_admin_password="Other-Admin-Password-1",
            status="ACTIVE",
        ),
        product_admin,
        db,
    )
    mrf_admin = db.scalar(select(User).where(User.email == "admin@mrf-test.example.com"))
    other_admin = db.scalar(select(User).where(User.email == "admin@other-test.example.com"))

    # The Organization Admin account is immediately usable, but cannot access master rules.
    login = api.login(LoginRequest(email=mrf_admin.email, password="Mrf-Admin-Password-1"), db)
    assert login["user"]["organization_id"] == tenant_a["id"]
    assert "ORGANIZATION_ADMIN" in login["user"]["roles"]
    assert "compliance_master" not in user_summary(db, mrf_admin)["features"]
    with pytest.raises(HTTPException, match="MORAX platform administrator"):
        api.list_rules(user=mrf_admin, db=db)
    with pytest.raises(HTTPException, match="MORAX platform administrator"):
        api.create_rule(
            RuleInput(
                compliance_id="TENANT-MUST-NOT-CREATE",
                name="Forbidden tenant rule",
                version=1,
                entity_type="UNIT",
                frequency="MONTHLY",
                due_date_rule="DAYS_AFTER_PERIOD_END",
                due_date_offset=5,
                effective_from=date(2020, 1, 1),
            ),
            mrf_admin,
            db,
        )

    # State + industry matching automatically produces Company Compliance only
    # for the matching Unit; a non-matching Unit receives none.
    matching_unit = api.create_unit(
        UnitInput(
            name="MRF Factory Chennai",
            code="MRF-TN-FACTORY",
            industry_type_id=industry.id,
            state_id=state.id,
            compliance_start_date=date(2020, 1, 1),
        ),
        mrf_admin,
        db,
    )
    non_matching_unit = api.create_unit(
        UnitInput(
            name="MRF IT Chennai",
            code="MRF-TN-IT",
            industry_type_id=other_industry.id,
            state_id=state.id,
            compliance_start_date=date(2020, 1, 1),
        ),
        mrf_admin,
        db,
    )
    unit_instance = db.scalar(select(ComplianceInstance).where(
        ComplianceInstance.organization_id == tenant_a["id"],
        ComplianceInstance.subject_type == "UNIT",
        ComplianceInstance.subject_id == matching_unit["id"],
    ))
    assert unit_instance is not None
    assert db.scalar(select(ComplianceInstance).where(
        ComplianceInstance.subject_type == "UNIT",
        ComplianceInstance.subject_id == non_matching_unit["id"],
    )) is None

    contractor = api.create_contractor(
        ContractorInput(
            name="MRF Factory Contractor",
            code="MRF-CONTRACTOR-01",
            unit_id=matching_unit["id"],
            industry_type_id=industry.id,
            compliance_start_date=date(2020, 1, 1),
        ),
        mrf_admin,
        db,
    )
    contractor_instance = db.scalar(select(ComplianceInstance).where(
        ComplianceInstance.organization_id == tenant_a["id"],
        ComplianceInstance.subject_type == "CONTRACTOR",
        ComplianceInstance.subject_id == contractor["id"],
    ))
    assert contractor_instance is not None

    def create_scoped_user(label: str, role: str, scope_type: str, scope_id: str) -> User:
        email = f"{label.lower().replace('_', '.')}@mrf-test.example.com"
        password = f"{label.title().replace('_', '')}-Password-1"
        result = api.create_user(
            UserCreateInput(
                name=label.replace("_", " ").title(),
                email=email,
                password=password,
                role_scopes=[RoleScopeInput(role=role, scope_type=scope_type, scope_id=scope_id)],
            ),
            mrf_admin,
            db,
        )
        account = db.get(User, result["id"])
        signed_in = api.login(LoginRequest(email=email, password=password), db)
        assert role in signed_in["user"]["roles"]
        assert signed_in["user"]["organization_id"] == tenant_a["id"]
        assert db.scalar(select(UserActivation).where(UserActivation.user_id == account.id)) is None
        return account

    unit_admin = create_scoped_user("UNIT_ADMIN", "UNIT_ADMIN", "UNIT", matching_unit["id"])
    unit_maker = create_scoped_user("UNIT_MAKER", "UNIT_MAKER", "UNIT", matching_unit["id"])
    unit_checker = create_scoped_user("UNIT_CHECKER", "UNIT_CHECKER", "UNIT", matching_unit["id"])
    contractor_admin = create_scoped_user("CONTRACTOR_ADMIN", "CONTRACTOR_ADMIN", "CONTRACTOR", contractor["id"])
    contractor_maker = create_scoped_user("CONTRACTOR_MAKER", "CONTRACTOR_MAKER", "CONTRACTOR", contractor["id"])
    contractor_checker = create_scoped_user("CONTRACTOR_CHECKER", "CONTRACTOR_CHECKER", "CONTRACTOR", contractor["id"])

    unit_assignments = api.replace_unit_user_assignments(
        matching_unit["id"],
        [
            EntityUserAssignmentInput(user_id=unit_admin.id, role="ADMIN"),
            EntityUserAssignmentInput(user_id=unit_maker.id, role="MAKER"),
            EntityUserAssignmentInput(user_id=unit_checker.id, role="CHECKER"),
        ],
        mrf_admin,
        db,
    )
    contractor_assignments = api.replace_contractor_user_assignments(
        contractor["id"],
        [
            EntityUserAssignmentInput(user_id=contractor_admin.id, role="ADMIN"),
            EntityUserAssignmentInput(user_id=contractor_maker.id, role="MAKER"),
            EntityUserAssignmentInput(user_id=contractor_checker.id, role="CHECKER"),
        ],
        mrf_admin,
        db,
    )
    assert {item["role"] for item in unit_assignments} == {"ADMIN", "MAKER", "CHECKER"}
    assert {item["role"] for item in contractor_assignments} == {"ADMIN", "MAKER", "CHECKER"}

    # Scope roles permit the intended workflow but not organization administration.
    with pytest.raises(HTTPException, match="permission"):
        api.create_unit(
            UnitInput(
                name="Forbidden by Maker",
                code="FORBIDDEN-MAKER",
                industry_type_id=industry.id,
                state_id=state.id,
                compliance_start_date=date(2020, 1, 1),
            ),
            unit_maker,
            db,
        )
    with pytest.raises(HTTPException, match="Organization administrator"):
        api.create_user(
            UserCreateInput(
                name="Forbidden by Maker",
                email="forbidden@mrf-test.example.com",
                password="Forbidden-Password-1",
                role_scopes=[RoleScopeInput(role="UNIT_MAKER", scope_type="UNIT", scope_id=matching_unit["id"])],
            ),
            unit_maker,
            db,
        )
    with pytest.raises(HTTPException, match="Maker permission"):
        api.save_activity(
            unit_instance.id,
            ActivityInput(filing_reference="CHECKER-CANNOT-MAKE", row_version=unit_instance.row_version),
            unit_checker,
            db,
        )

    maker_work = api.my_maker_work(user=unit_maker, db=db)
    assert unit_instance.id in {item["id"] for item in maker_work["items"]}
    updated = api.save_activity(
        unit_instance.id,
        ActivityInput(filing_reference="MRF-UNIT-RETURN-001", completed_on=date.today(), row_version=unit_instance.row_version),
        unit_maker,
        db,
    )
    submitted = api.submit_instance(
        unit_instance.id,
        SubmissionInput(row_version=updated["row_version"]),
        unit_maker,
        db,
    )
    pending_approval = api.my_pending_approvals(user=unit_checker, db=db)
    assert submitted["id"] in {item["id"] for item in pending_approval["items"]}
    reviewing = api.begin_review(
        unit_instance.id,
        WorkflowDecision(comment="Reviewing MRF return", row_version=submitted["row_version"]),
        unit_checker,
        db,
    )
    approved = api.approve(
        unit_instance.id,
        WorkflowDecision(comment="Approved", row_version=reviewing["row_version"]),
        unit_checker,
        db,
    )
    assert approved["status"] == "APPROVED"

    # Contractor roles see their Contractor compliance but not unrelated Units.
    contractor_work = api.my_maker_work(user=contractor_maker, db=db)
    assert contractor_instance.id in {item["id"] for item in contractor_work["items"]}
    assert api.get_contractor(contractor["id"], contractor_admin, db)["id"] == contractor["id"]
    with pytest.raises(HTTPException, match="permission"):
        api.get_unit(non_matching_unit["id"], contractor_maker, db)

    # A second organization cannot read or assign MRF records, even with its
    # own Organization Admin role.
    with pytest.raises(HTTPException, match="Unit not found"):
        api.get_unit(matching_unit["id"], other_admin, db)
    with pytest.raises(HTTPException, match="Unit not found"):
        api.replace_unit_user_assignments(
            matching_unit["id"],
            [EntityUserAssignmentInput(user_id=unit_maker.id, role="MAKER")],
            other_admin,
            db,
        )
    assert tenant_b["id"] != tenant_a["id"]
