from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

import app.api.v1.router as api
from app.core.security import hash_password
from app.db.base import Base
from app.models import ComplianceEvidence, ComplianceInstance, ComplianceRuleVersion, ComplianceSubmission, InAppNotification, IndustryType, Organization, State, Unit, User, UserActivation
from app.schemas import (
    ActivityInput,
    ContractorInput,
    PendingEntityUserInput,
    EntityUserAssignmentInput,
    EvidenceVerificationInput,
    GenerationRequest,
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
            description="Prepare the unit monthly return under the applicable rule.",
            act="Factory Compliance Act",
            rule_reference="Factory Rules, 2026 - Rule 42",
            section="Section 10 - Monthly registers",
            compliance_type="STATUTORY_RETURN",
            document_type="RETURN",
            form_number="Form U-10",
            legal_description="Section 10 requires the monthly register to be maintained and filed.",
            consequence_or_penalty="A missed filing may result in the applicable statutory penalty.",
            version=1,
            entity_type="UNIT",
            state_id=state.id,
            industry_type_id=industry.id,
            frequency="MONTHLY",
            due_date_rule="DAYS_AFTER_PERIOD_END",
            due_date_offset=5,
            required_document="Signed monthly return",
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
            employer_name="MRF Limited",
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
            employer_name="MRF Limited",
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
            maker_new_user=PendingEntityUserInput(
                name="Initial Contractor Maker",
                email="initial.contractor.maker@mrf-test.example.com",
                password="Initial-Contractor-Maker-Password-1",
            ),
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
                employer_name="Forbidden Employer",
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
    # Dashboard analytics and its in-place record table share the same
    # tenant-scoped projection and status grouping.
    dashboard = api.dashboard_overview(unit_id=matching_unit["id"], user=unit_maker, db=db)
    assert dashboard["summary"]["total"] == dashboard["table"]["total"]
    pending_dashboard = api.dashboard_overview(
        unit_id=matching_unit["id"], table_status="PENDING_ACTION", user=unit_maker, db=db
    )
    assert pending_dashboard["table"]["total"] == dashboard["summary"]["pending"]
    assert unit_instance.id in {item["id"] for item in pending_dashboard["table"]["items"]}
    # The shared Eye dialog receives actual subject context from the detail API
    # rather than guessing a unit or state from a display label.
    instance_detail = api.get_instance(unit_instance.id, user=unit_maker, db=db)
    assert instance_detail["subject_context"] == {
        "unit_name": matching_unit["name"],
        "contractor_name": None,
        "site_name": None,
        "state_name": "Tamil Nadu",
    }
    assert instance_detail["compliance_name"] == "Factory unit monthly return"
    assert instance_detail["compliance_id"] == "MASTER-UNIT-TN-FACTORY"
    assert instance_detail["act"] == "Factory Compliance Act"
    assert instance_detail["section"] == "Section 10 - Monthly registers"
    assert instance_detail["rule_reference"] == "Factory Rules, 2026 - Rule 42"
    assert instance_detail["description"] == "Prepare the unit monthly return under the applicable rule."
    assert instance_detail["legal_description"] == "Section 10 requires the monthly register to be maintained and filed."
    assert instance_detail["required_document"] == "Signed monthly return"
    assert instance_detail["document_type"] == "RETURN"
    assert instance_detail["form_number"] == "Form U-10"
    assert instance_detail["consequence_or_penalty"] == "A missed filing may result in the applicable statutory penalty."
    assert instance_detail["rule_snapshot"]["act"] == "Factory Compliance Act"
    assert instance_detail["rule_snapshot"]["section"] == "Section 10 - Monthly registers"
    assert instance_detail["missing_legal_fields"] == []
    # A compliance period retains its authoritative legal content when a later
    # edit clears the live master fields.
    unit_rule_version = db.get(ComplianceRuleVersion, unit_rule["id"])
    assert unit_rule_version is not None
    unit_rule_version.act = None
    unit_rule_version.section = None
    unit_rule_version.rule_reference = None
    unit_rule_version.description = None
    unit_rule_version.legal_description = None
    unit_rule_version.consequence_or_penalty = None
    db.flush()
    historical_detail = api.get_instance(unit_instance.id, user=unit_maker, db=db)
    assert historical_detail["act"] == "Factory Compliance Act"
    assert historical_detail["section"] == "Section 10 - Monthly registers"
    assert historical_detail["rule_reference"] == "Factory Rules, 2026 - Rule 42"
    assert historical_detail["description"] == "Prepare the unit monthly return under the applicable rule."
    assert historical_detail["legal_description"] == "Section 10 requires the monthly register to be maintained and filed."
    assert historical_detail["consequence_or_penalty"] == "A missed filing may result in the applicable statutory penalty."
    metric_pending = api.list_instances(status="PENDING_ACTION", user=unit_maker, db=db)
    assert unit_instance.id in {item["id"] for item in metric_pending["items"]}
    updated = api.save_activity(
        unit_instance.id,
        ActivityInput(filing_reference="MRF-UNIT-RETURN-001", completed_on=date.today(), row_version=unit_instance.row_version),
        unit_maker,
        db,
    )
    # A Maker cannot submit a rule that requires evidence until at least one
    # active supporting document exists.
    with pytest.raises(HTTPException, match="Required evidence is missing"):
        api.submit_instance(
            unit_instance.id,
            SubmissionInput(row_version=updated["row_version"]),
            unit_maker,
            db,
        )
    evidence = ComplianceEvidence(
        instance_id=unit_instance.id,
        category="SUPPORTING_DOCUMENT",
        version=1,
        original_filename="mrf-monthly-return.csv",
        stored_filename="mrf-monthly-return.csv",
        content_type="text/csv",
        size_bytes=24,
        uploaded_by_id=unit_maker.id,
    )
    db.add(evidence)
    db.commit()
    submitted = api.submit_instance(
        unit_instance.id,
        SubmissionInput(row_version=updated["row_version"]),
        unit_maker,
        db,
    )
    pending_approval = api.my_pending_approvals(user=unit_checker, db=db)
    assert submitted["id"] in {item["id"] for item in pending_approval["items"]}
    metric_pending_approval = api.list_instances(status="PENDING_APPROVAL", user=unit_checker, db=db)
    assert submitted["id"] in {item["id"] for item in metric_pending_approval["items"]}
    reviewing = api.begin_review(
        unit_instance.id,
        WorkflowDecision(comment="Reviewing MRF return", row_version=submitted["row_version"]),
        unit_checker,
        db,
    )
    # Whitespace is not a valid rejection reason. A genuine rejection is
    # recorded, returned to the Maker, then corrected and resubmitted.
    with pytest.raises(HTTPException, match="Remarks are required"):
        api.reject(
            unit_instance.id,
            WorkflowDecision(comment=" ", row_version=reviewing["row_version"]),
            unit_checker,
            db,
        )
    rejected = api.reject(
        unit_instance.id,
        WorkflowDecision(comment="Please correct the filing reference", row_version=reviewing["row_version"]),
        unit_checker,
        db,
    )
    assert rejected["status"] == "REJECTED"
    metric_rejected = api.list_instances(status="REJECTED", user=unit_maker, db=db)
    assert unit_instance.id in {item["id"] for item in metric_rejected["items"]}
    # Checker review history preserves a decision independently from the
    # current compliance state, so a later resubmission cannot erase it.
    review_history = api.my_review_history(user=unit_checker, db=db)
    assert any(
        row["id"] == unit_instance.id
        and row["decision"] == "REJECTED"
        and row["review_remarks"] == "Please correct the filing reference"
        and row["submission_revision"] == 1
        for row in review_history["items"]
    )
    resaved = api.save_activity(
        unit_instance.id,
        ActivityInput(filing_reference="MRF-UNIT-RETURN-001-REV1", completed_on=date.today(), row_version=rejected["row_version"]),
        unit_maker,
        db,
    )
    resubmitted = api.submit_instance(
        unit_instance.id,
        SubmissionInput(row_version=resaved["row_version"]),
        unit_maker,
        db,
    )
    pending_after_resubmission = api.my_pending_approvals(user=unit_checker, db=db)
    pending_row = next(row for row in pending_after_resubmission["items"] if row["id"] == unit_instance.id)
    assert pending_row["submitted_by_name"] == unit_maker.name
    assert pending_row["submission_revision"] == 2
    rereviewing = api.begin_review(
        unit_instance.id,
        WorkflowDecision(comment="Reviewing corrected return", row_version=resubmitted["row_version"]),
        unit_checker,
        db,
    )
    api.verify_evidence(
        evidence.id,
        EvidenceVerificationInput(verification_state="VERIFIED"),
        unit_checker,
        db,
    )
    approved = api.approve(
        unit_instance.id,
        WorkflowDecision(comment="Approved", row_version=rereviewing["row_version"]),
        unit_checker,
        db,
    )
    assert approved["status"] == "APPROVED"
    review_history = api.my_review_history(user=unit_checker, db=db)
    assert {row["decision"] for row in review_history["items"] if row["id"] == unit_instance.id} >= {"APPROVED", "REJECTED"}
    instance_reviews = [row for row in review_history["items"] if row["id"] == unit_instance.id]
    assert {row["submission_revision"] for row in instance_reviews} == {1, 2}
    assert review_history["summary"]["average_review_hours"] >= 0
    latest_submission = db.scalar(
        select(ComplianceSubmission)
        .where(ComplianceSubmission.instance_id == unit_instance.id)
        .order_by(ComplianceSubmission.revision.desc())
    )
    assert latest_submission is not None
    assert approved["completion_late"] == (
        latest_submission.submitted_at.date() > unit_instance.due_date
    )
    maker_submissions = api.my_submissions(user=unit_maker, db=db)
    maker_submission = next(item for item in maker_submissions["items"] if item["id"] == unit_instance.id)
    assert maker_submission["submission_status"] == "APPROVED"
    assert maker_submission["submission_revision"] == 2
    assert maker_submissions["summary"]["approved"] >= 1
    # Each committed workflow decision produces exactly one recipient-scoped
    # notification.  Resubmission is a distinct event, not a duplicate of the
    # original submission.
    checker_events = set(db.scalars(select(InAppNotification.event_type).where(InAppNotification.recipient_id == unit_checker.id)))
    maker_events = set(db.scalars(select(InAppNotification.event_type).where(InAppNotification.recipient_id == unit_maker.id)))
    assert {"SUBMITTED", "RESUBMITTED"}.issubset(checker_events)
    assert {"REJECTED", "APPROVED"}.issubset(maker_events)

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


def test_platform_generation_requires_an_explicit_customer_and_hides_system_subjects(db):
    """The global master must never offer or generate for its system tenant."""
    master = Organization(name="MORAX Platform", code="MORAX-SYSTEM", status="CONFIGURED", is_system=True)
    customer = Organization(name="Customer One", code="CUSTOMER-ONE", status="ACTIVE", is_system=False)
    state = State(name="Tamil Nadu", code="TN")
    industry = IndustryType(name="Manufacturing", code="MANUFACTURING")
    db.add_all([master, customer, state, industry])
    db.flush()
    product_admin = User(
        organization_id=master.id,
        name="Product Admin",
        email="generation.product.admin@morax.example.com",
        password_hash=hash_password("Product-Admin-Password-1"),
        active=True,
        platform_role="MORAX_ADMIN",
    )
    system_unit = Unit(
        organization_id=master.id,
        name="Internal QA Unit",
        code="QA-INTERNAL",
        state_id=state.id,
        industry_type_id=industry.id,
        employer_name="MORAX",
        compliance_start_date=date(2020, 1, 1),
        status="ACTIVE",
    )
    customer_unit = Unit(
        organization_id=customer.id,
        name="Customer Chennai Unit",
        code="CUST-CHN",
        state_id=state.id,
        industry_type_id=industry.id,
        employer_name="Customer One",
        compliance_start_date=date(2020, 1, 1),
        status="ACTIVE",
    )
    inactive_customer_unit = Unit(
        organization_id=customer.id,
        name="Inactive Customer Unit",
        code="CUST-OLD",
        state_id=state.id,
        industry_type_id=industry.id,
        employer_name="Customer One",
        compliance_start_date=date(2020, 1, 1),
        status="INACTIVE",
    )
    db.add_all([product_admin, system_unit, customer_unit, inactive_customer_unit])
    db.commit()

    api.create_rule(
        RuleInput(
            compliance_id="CUSTOMER-GENERATION-RULE",
            name="Customer generation rule",
            version=1,
            entity_type="UNIT",
            frequency="MONTHLY",
            due_date_rule="FIXED_DAY_OF_MONTH",
            due_date_offset=15,
            effective_from=date(2020, 1, 1),
        ),
        product_admin,
        db,
    )
    with pytest.raises(HTTPException, match="Select a customer organization"):
        api.run_generation(
            GenerationRequest(subject_type="UNIT", subject_id=system_unit.id),
            product_admin,
            db,
        )

    subjects = api.list_generation_subjects(customer.id, "UNIT", product_admin, db)
    assert subjects == [
        {"id": customer_unit.id, "name": "Customer Chennai Unit", "code": "CUST-CHN", "subject_type": "UNIT"}
    ]
    generated = api.run_generation(
        GenerationRequest(organization_id=customer.id, subject_type="UNIT", subject_id=customer_unit.id),
        product_admin,
        db,
    )
    assert generated["created"] == 1
    assert db.scalar(select(ComplianceInstance).where(ComplianceInstance.subject_id == system_unit.id)) is None
    assert db.scalar(select(ComplianceInstance).where(ComplianceInstance.subject_id == customer_unit.id)) is not None
