from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

import app.api.v1.router as api
import app.services.access as access
from app.core.security import hash_password, verify_password
from app.db.base import Base
from app.models import AuditLog, AuthSession, Contractor, IndustryType, Organization, State, Unit, User, UserActivation, UserRoleScope
from app.schemas import AdministratorPasswordResetInput, ContractorContextInput, ContractorInput, EntityUserAssignmentInput, LoginRequest, OrganizationDeleteInput, PlatformOrganizationInput, RoleScopeInput, UnitInput, UserCreateInput


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def test_platform_organization_provisions_admin_password(db):
    platform_admin = User(
        name="MORAX Admin",
        email="platform@example.test",
        password_hash="not-a-real-password",
        active=True,
        platform_role="MORAX_ADMIN",
    )
    db.add(platform_admin)
    db.flush()

    preview = api.preview_platform_organization_code("Acme Compliance", platform_admin, db)
    assert preview["code"] == "ORG-ACME-COMPLIANCE"

    created = api.create_platform_organization(
        PlatformOrganizationInput(
            organization_name="Acme Compliance",
            organization_code="ACME",
            organization_admin_name="Acme Admin",
            organization_admin_email="admin@acme.example.com",
            organization_admin_password="Acme-Admin-Password-1",
        ),
        platform_admin,
        db,
    )

    organization_id = created["id"]
    admin = db.scalar(select(User).where(User.email == "admin@acme.example.com"))
    assert created["organization_admin"]["email"] == "admin@acme.example.com"
    assert admin.organization_id == organization_id
    assert admin.must_change_password is False
    assert verify_password("Acme-Admin-Password-1", admin.password_hash)
    assert db.scalar(select(UserActivation).where(UserActivation.user_id == admin.id)) is None
    assert db.scalar(select(UserRoleScope).where(
        UserRoleScope.user_id == admin.id,
        UserRoleScope.role == "ORGANIZATION_ADMIN",
        UserRoleScope.scope_id == organization_id,
    )) is not None

    # Product Admin sees the Organization Admin username but never a password;
    # they can set a direct replacement without SMTP, OTP, or activation links.
    listed = api.list_platform_organizations(user=platform_admin, db=db)
    assert listed[0]["organization_admin"]["email"] == admin.email
    reset = api.reset_organization_admin_password(
        organization_id,
        AdministratorPasswordResetInput(new_password="Acme-Admin-Replacement-1"),
        platform_admin,
        db,
    )
    assert reset["username"] == admin.email
    assert verify_password("Acme-Admin-Replacement-1", admin.password_hash)
    with pytest.raises(HTTPException, match="Invalid email or password"):
        api.login(LoginRequest(email=admin.email, password="Acme-Admin-Password-1"), db)
    assert api.login(LoginRequest(email=admin.email, password="Acme-Admin-Replacement-1"), db)["user"]["id"] == admin.id

    # The centralized User Access endpoint provisions the same immediately
    # usable, password-based user records used by the Unit/Contractor popup.
    created_user = api.create_user(
        UserCreateInput(
            name="Shared Access User",
            email="shared@acme.example.com",
            password="Shared-Access-Password-1",
            role_scopes=[RoleScopeInput(
                role="VIEWER", scope_type="ORGANIZATION", scope_id=organization_id,
            )],
        ),
        admin,
        db,
    )
    assert db.get(User, created_user["id"]).must_change_password is False
    assert verify_password("Shared-Access-Password-1", db.get(User, created_user["id"]).password_hash)
    assert db.scalar(select(UserActivation).where(UserActivation.user_id == created_user["id"])) is None
    assert any(row["id"] == created_user["id"] for row in api.list_users(user=admin, db=db))

    user_reset = api.reset_user_password(
        created_user["id"],
        AdministratorPasswordResetInput(new_password="Shared-Access-Replacement-1"),
        admin,
        db,
    )
    assert user_reset["username"] == "shared@acme.example.com"
    assert verify_password("Shared-Access-Replacement-1", db.get(User, created_user["id"]).password_hash)
    with pytest.raises(HTTPException, match="Invalid email or password"):
        api.login(LoginRequest(email="shared@acme.example.com", password="Shared-Access-Password-1"), db)
    assert api.login(LoginRequest(email="shared@acme.example.com", password="Shared-Access-Replacement-1"), db)["user"]["id"] == created_user["id"]

    actions = set(db.scalars(select(AuditLog.action).where(AuditLog.organization_id == organization_id)))
    assert {"ORGANIZATION_CREATED", "CREATE_ORGANIZATION_ADMIN", "ORGANIZATION_ADMIN_PASSWORD_SET", "CREATE_USER", "USER_PASSWORD_SET", "PRODUCT_ADMIN_RESET_ORGANIZATION_ADMIN_PASSWORD", "ORGANIZATION_ADMIN_RESET_USER_PASSWORD"} <= actions


def test_product_admin_can_start_and_end_an_audited_organization_session(db):
    platform_admin = User(
        name="MORAX Admin", email="platform-login@example.test", password_hash="not-a-real-password",
        active=True, platform_role="MORAX_ADMIN",
    )
    db.add(platform_admin)
    db.flush()
    created = api.create_platform_organization(
        PlatformOrganizationInput(
            organization_name="Organization Login Test", organization_code="ORG-LOGIN",
            organization_admin_name="Organization Admin", organization_admin_email="org-login@morax.example.com",
            organization_admin_password="Organization-Admin-Password-1",
        ),
        platform_admin,
        db,
    )
    originating_session = AuthSession(user_id=platform_admin.id, expires_at=datetime.now(UTC) + timedelta(minutes=30))
    db.add(originating_session)
    db.commit()
    setattr(platform_admin, "_morax_session_id", originating_session.id)

    switched = api.login_as_organization(created["id"], platform_admin, db)
    organization_admin = db.scalar(select(User).where(User.email == "org-login@morax.example.com"))
    assert switched["user"]["id"] == organization_admin.id
    assert "ORGANIZATION_ADMIN" in switched["user"]["roles"]
    switched_session = db.scalar(select(AuthSession).where(AuthSession.user_id == organization_admin.id))
    assert switched_session.impersonated_by_id == platform_admin.id
    assert switched_session.impersonated_by_session_id == originating_session.id
    assert "PLATFORM_ORGANIZATION_LOGIN_STARTED" in set(db.scalars(select(AuditLog.action)))


def test_product_admin_can_switch_from_organization_to_contractor_and_return(db):
    platform_admin = User(
        name="MORAX Admin", email="platform-switch@example.test", password_hash="not-a-real-password",
        active=True, platform_role="MORAX_ADMIN",
    )
    db.add(platform_admin)
    db.flush()
    created = api.create_platform_organization(
        PlatformOrganizationInput(
            organization_name="Contractor Switch Test", organization_code="CON-SWITCH",
            organization_admin_name="Organization Admin", organization_admin_email="switch-org@morax.example.com",
            organization_admin_password="Organization-Admin-Password-1",
        ),
        platform_admin,
        db,
    )
    organization_admin = db.scalar(select(User).where(User.email == "switch-org@morax.example.com"))
    contractor_maker = User(
        organization_id=created["id"], name="Contractor Maker", email="switch-contractor@morax.example.com",
        password_hash="not-a-real-password", active=True,
    )
    db.add(contractor_maker)
    db.flush()
    db.add(UserRoleScope(
        user_id=contractor_maker.id, role="CONTRACTOR_MAKER", scope_type="CONTRACTOR", scope_id="contractor-switch-test",
    ))
    originating_session = AuthSession(user_id=platform_admin.id, expires_at=datetime.now(UTC) + timedelta(minutes=30))
    db.add(originating_session)
    db.commit()
    setattr(platform_admin, "_morax_session_id", originating_session.id)

    api.login_as_organization(created["id"], platform_admin, db)
    organization_session = db.scalar(select(AuthSession).where(AuthSession.user_id == organization_admin.id))
    setattr(organization_admin, "_morax_active_organization_id", created["id"])
    setattr(organization_admin, "_morax_session_id", organization_session.id)
    setattr(organization_admin, "_morax_impersonated_by_id", platform_admin.id)
    setattr(organization_admin, "_morax_impersonated_by_session_id", originating_session.id)

    switched = api.start_impersonation(contractor_maker.id, organization_admin, db)
    contractor_session = db.scalar(select(AuthSession).where(AuthSession.user_id == contractor_maker.id))
    assert switched["user"]["id"] == contractor_maker.id
    assert switched["user"]["organization_name"] == "Contractor Switch Test"
    assert db.get(AuthSession, organization_session.id).revoked_at is not None
    assert contractor_session.impersonated_by_id == platform_admin.id
    assert contractor_session.impersonated_by_session_id == originating_session.id
    assert "IMPERSONATION_SWITCHED" in set(db.scalars(select(AuditLog.action)))

    returned = api.end_impersonation(contractor_maker, db)
    assert returned["user"]["id"] == platform_admin.id
    assert db.get(AuthSession, contractor_session.id).revoked_at is not None


def test_mrf_onboarding_login_unit_and_assigned_user_logins(db):
    master_organization = Organization(name="MORAX Master", code="MORAX-MASTER", status="ACTIVE")
    db.add(master_organization)
    db.flush()
    platform_admin = User(
        organization_id=master_organization.id,
        name="MORAX Product Admin",
        email="product.admin@example.com",
        password_hash=hash_password("Product-Admin-Password-1"),
        active=True,
        platform_role="MORAX_ADMIN",
    )
    state = State(name="Maharashtra", code="MH")
    industry = IndustryType(name="Tyre Manufacturing", code="TYRE")
    db.add_all([platform_admin, state, industry])
    db.commit()

    mrf = api.create_platform_organization(
        PlatformOrganizationInput(
            organization_name="MRF",
            organization_code="MRF",
            organization_admin_name="MRF Organization Admin",
            organization_admin_email="org.admin@mrf.example.com",
            organization_admin_password="Mrf-Organization-Admin-1",
            status="ACTIVE",
        ),
        platform_admin,
        db,
    )
    organization_id = mrf["id"]
    org_admin_login = api.login(LoginRequest(
        email="org.admin@mrf.example.com",
        password="Mrf-Organization-Admin-1",
    ), db)
    assert org_admin_login["user"]["organization_id"] == organization_id
    assert "ORGANIZATION_ADMIN" in org_admin_login["user"]["roles"]

    organization_admin = db.scalar(select(User).where(User.email == "org.admin@mrf.example.com"))
    unit = api.create_unit(
        UnitInput(
            name="MRF Chennai Plant",
            code="MRF-CHN-01",
            industry_type_id=industry.id,
            state_id=state.id,
            compliance_start_date=date(2026, 10, 21),
            status="ACTIVE",
        ),
        organization_admin,
        db,
    )

    assigned_users = {
        "ADMIN": ("unit.admin@mrf.example.com", "Mrf-Unit-Admin-1", "UNIT_ADMIN"),
        "MAKER": ("unit.maker@mrf.example.com", "Mrf-Unit-Maker-1", "UNIT_MAKER"),
        "CHECKER": ("unit.checker@mrf.example.com", "Mrf-Unit-Checker-1", "UNIT_CHECKER"),
    }
    created_ids: dict[str, str] = {}
    for assignment_role, (email, password, scope_role) in assigned_users.items():
        created = api.create_user(
            UserCreateInput(
                name=f"MRF {assignment_role.title()} User",
                email=email,
                password=password,
                role_scopes=[RoleScopeInput(
                    role=scope_role,
                    scope_type="UNIT",
                    scope_id=unit["id"],
                )],
            ),
            organization_admin,
            db,
        )
        created_ids[assignment_role] = created["id"]

    assignments = api.replace_unit_user_assignments(
        unit["id"],
        [
            EntityUserAssignmentInput(user_id=created_ids["ADMIN"], role="ADMIN"),
            EntityUserAssignmentInput(user_id=created_ids["MAKER"], role="MAKER"),
            EntityUserAssignmentInput(user_id=created_ids["CHECKER"], role="CHECKER"),
        ],
        organization_admin,
        db,
    )
    assert {(item["user_id"], item["role"]) for item in assignments} == {
        (created_ids["ADMIN"], "ADMIN"),
        (created_ids["MAKER"], "MAKER"),
        (created_ids["CHECKER"], "CHECKER"),
    }
    with pytest.raises(HTTPException, match="Maker and Checker assignments are required"):
        api.replace_unit_user_assignments(
            unit["id"],
            [EntityUserAssignmentInput(user_id=created_ids["MAKER"], role="MAKER")],
            organization_admin,
            db,
        )

    for assignment_role, (email, password, scope_role) in assigned_users.items():
        signed_in = api.login(LoginRequest(email=email, password=password), db)
        assert signed_in["user"]["organization_id"] == organization_id
        assert scope_role in signed_in["user"]["roles"]
        assert db.scalar(select(UserActivation).where(UserActivation.user_id == created_ids[assignment_role])) is None


def test_generated_codes_unit_types_and_contractor_maker_scope(db):
    organization = Organization(name="Scope Org", code="SCOPE", status="ACTIVE")
    state = State(name="Kerala", code="KL")
    industry = IndustryType(name="Manufacturing", code="MFG")
    db.add_all([organization, state, industry])
    db.flush()
    admin = User(organization_id=organization.id, name="Admin", email="scope.admin@example.test", password_hash=hash_password("Admin-Password-1"), active=True, platform_role="MORAX_ADMIN")
    db.add(admin)
    db.flush()
    db.add(UserRoleScope(user_id=admin.id, role="ORGANIZATION_ADMIN", scope_type="ORGANIZATION", scope_id=organization.id))
    db.commit()

    unit = api.create_unit(UnitInput(
        name="Kerala Plant",
        industry_type_id=industry.id,
        state_id=state.id,
        compliance_start_date=date(2026, 10, 22),
        compliance_types=["PF", "ESI"],
    ), admin, db)
    assert unit["code"].startswith("UNIT-KERALA-PLANT")
    assert unit["compliance_types"] == ["PF", "ESI"]

    contractor = api.create_contractor(ContractorInput(
        name="Scope Labour Services",
        unit_id=unit["id"],
        contractor_maker_email="maker@scope.example.com",
        contractor_maker_password="Maker-Password-1",
    ), admin, db)
    maker = db.scalar(select(User).where(User.email == "maker@scope.example.com"))
    assert contractor["contractor_maker_user_id"] == maker.id
    assert contractor["code"].startswith("CONTRACTOR-SCOPE-LABOUR-SERVICES")
    assert access.can_access_subject(db, maker, organization.id, "CONTRACTOR", contractor["id"])
    assert not access.can_access_subject(db, maker, organization.id, "UNIT", unit["id"])
    assert verify_password("Maker-Password-1", maker.password_hash)

    single_login = api.login(LoginRequest(email=maker.email, password="Maker-Password-1"), db)
    assert single_login["user"]["contractor_context"]["selection_required"] is False
    assert single_login["user"]["contractor_context"]["active_contractor_id"] == contractor["id"]

    second_contractor = Contractor(
        organization_id=organization.id,
        unit_id=unit["id"],
        name="Second Labour Services",
        code="CONTRACTOR-SECOND-LABOUR",
        status="ACTIVE",
    )
    db.add(second_contractor)
    db.flush()
    db.add(UserRoleScope(
        user_id=maker.id,
        role="CONTRACTOR_MAKER",
        scope_type="CONTRACTOR",
        scope_id=second_contractor.id,
    ))
    db.commit()

    multiple_login = api.login(LoginRequest(email=maker.email, password="Maker-Password-1"), db)
    context = multiple_login["user"]["contractor_context"]
    assert context["selection_required"] is True
    assert context["active_contractor_id"] is None
    assert {option["id"] for option in context["options"]} == {contractor["id"], second_contractor.id}
    assert not access.can_access_subject(db, maker, organization.id, "CONTRACTOR", contractor["id"])
    assert not access.can_access_subject(db, maker, organization.id, "CONTRACTOR", second_contractor.id)

    selected = api.select_contractor_context(
        ContractorContextInput(contractor_id=second_contractor.id),
        maker,
        db,
    )
    assert selected["contractor_context"]["active_contractor_id"] == second_contractor.id
    assert selected["contractor_context"]["active_contractor_name"] == "Second Labour Services"
    assert not access.can_access_subject(db, maker, organization.id, "CONTRACTOR", contractor["id"])
    assert access.can_access_subject(db, maker, organization.id, "CONTRACTOR", second_contractor.id)
    switched_context = api.select_contractor_context(
        ContractorContextInput(contractor_id=contractor["id"]),
        maker,
        db,
    )
    assert switched_context["contractor_context"]["active_contractor_id"] == contractor["id"]
    assert access.can_access_subject(db, maker, organization.id, "CONTRACTOR", contractor["id"])
    assert not access.can_access_subject(db, maker, organization.id, "CONTRACTOR", second_contractor.id)
    with pytest.raises(HTTPException, match="not authorized"):
        api.select_contractor_context(ContractorContextInput(contractor_id="unauthorized-contractor"), maker, db)
    assert "CONTRACTOR_CONTEXT_SELECTED" in set(db.scalars(select(AuditLog.action)))


def test_entity_assignments_are_centralized_multi_role_and_tenant_scoped(db):
    org_a = Organization(name="Org A", code="ORGA", status="ACTIVE")
    org_b = Organization(name="Org B", code="ORGB", status="ACTIVE")
    state = State(name="Karnataka", code="KA")
    industry = IndustryType(name="Manufacturing", code="MFG")
    db.add_all([org_a, org_b, state, industry])
    db.flush()

    actor = User(
        organization_id=org_a.id,
        name="Org A Admin",
        email="actor@orga.test",
        password_hash="not-a-real-password",
        active=True,
        platform_role="MORAX_ADMIN",
    )
    organization_admin = User(
        organization_id=org_a.id,
        name="Organization Admin",
        email="org-admin@orga.example.com",
        password_hash="not-a-real-password",
        active=True,
    )
    member_a = User(
        organization_id=org_a.id,
        name="Shared User",
        email="shared@orga.test",
        password_hash="not-a-real-password",
        active=True,
    )
    member_b = User(
        organization_id=org_b.id,
        name="Other Tenant User",
        email="member@orgb.test",
        password_hash="not-a-real-password",
        active=True,
    )
    unit_a = Unit(
        organization_id=org_a.id,
        name="Org A Unit",
        code="UNIT-A",
        industry_type_id=industry.id,
        state_id=state.id,
        compliance_start_date=date(2026, 1, 1),
        status="ACTIVE",
    )
    unit_b = Unit(
        organization_id=org_b.id,
        name="Org B Unit",
        code="UNIT-B",
        industry_type_id=industry.id,
        state_id=state.id,
        compliance_start_date=date(2026, 1, 1),
        status="ACTIVE",
    )
    db.add_all([actor, organization_admin, member_a, member_b, unit_a, unit_b])
    db.flush()
    db.add(UserRoleScope(
        user_id=organization_admin.id,
        role="ORGANIZATION_ADMIN",
        scope_type="ORGANIZATION",
        scope_id=org_a.id,
    ))
    contractor = Contractor(
        organization_id=org_a.id,
        unit_id=unit_a.id,
        name="Org A Contractor",
        code="CON-A",
        status="ACTIVE",
    )
    db.add(contractor)
    db.flush()

    unit_assignments = api.replace_entity_assignments(
        db,
        org_a.id,
        "UNIT",
        unit_a.id,
        [
            EntityUserAssignmentInput(user_id=member_a.id, role="ADMIN"),
            EntityUserAssignmentInput(user_id=member_a.id, role="MAKER"),
        ],
        actor.id,
    )
    contractor_assignments = api.replace_entity_assignments(
        db,
        org_a.id,
        "CONTRACTOR",
        contractor.id,
        [EntityUserAssignmentInput(user_id=member_a.id, role="CHECKER")],
        actor.id,
    )
    db.commit()

    assert {(row["user_id"], row["role"]) for row in unit_assignments} == {
        (member_a.id, "ADMIN"), (member_a.id, "MAKER"),
    }
    assert contractor_assignments[0]["role"] == "CHECKER"
    roles = set(db.scalars(select(UserRoleScope.role).where(UserRoleScope.user_id == member_a.id)))
    assert {"UNIT_ADMIN", "UNIT_MAKER", "CONTRACTOR_CHECKER"} <= roles

    with pytest.raises(HTTPException, match="Unit not found"):
        api.replace_entity_assignments(
            db, org_a.id, "UNIT", unit_b.id,
            [EntityUserAssignmentInput(user_id=member_a.id, role="MAKER")], actor.id,
        )
    with pytest.raises(HTTPException, match="active organization"):
        api.replace_entity_assignments(
            db, org_a.id, "UNIT", unit_a.id,
            [EntityUserAssignmentInput(user_id=member_b.id, role="MAKER")], actor.id,
        )
    # Route-level checks protect against a tenant administrator addressing an
    # entity ID owned by another organization.
    with pytest.raises(HTTPException, match="Unit not found"):
        api.replace_unit_user_assignments(
            unit_b.id,
            [EntityUserAssignmentInput(user_id=member_a.id, role="MAKER")],
            organization_admin,
            db,
        )
    with pytest.raises(HTTPException, match="User not found"):
        api.reset_user_password(
            member_b.id,
            AdministratorPasswordResetInput(new_password="Other-Tenant-Password-1"),
            organization_admin,
            db,
        )

    api.replace_entity_assignments(db, org_a.id, "UNIT", unit_a.id, [], actor.id)
    db.commit()
    assert db.get(User, member_a.id) is not None
    assert api.entity_assignment_rows(db, org_a.id, "UNIT", unit_a.id) == []
    assert db.scalar(select(UserRoleScope).where(
        UserRoleScope.user_id == member_a.id,
        UserRoleScope.scope_type == "CONTRACTOR",
        UserRoleScope.scope_id == contractor.id,
    )) is not None


def test_product_admin_can_permanently_delete_only_a_tenant_and_its_data(db):
    master = Organization(name="MORAX Platform System", code="MORAX-MASTER", status="ACTIVE", is_system=True)
    tenant = Organization(name="Delete Me", code="DELETE-ME", status="ACTIVE")
    state = State(name="Tamil Nadu", code="TN")
    industry = IndustryType(name="Factory", code="FACTORY")
    db.add_all([master, tenant, state, industry])
    db.flush()
    product_admin = User(organization_id=master.id, name="Product Admin", email="delete.product@example.test", password_hash=hash_password("Product-Password-1"), active=True, platform_role="MORAX_ADMIN")
    tenant_user = User(organization_id=tenant.id, name="Tenant User", email="delete.tenant@example.test", password_hash=hash_password("Tenant-Password-1"), active=True)
    unit = Unit(organization_id=tenant.id, name="Delete Unit", code="DEL-UNIT", industry_type_id=industry.id, state_id=state.id, compliance_start_date=date.today())
    db.add_all([product_admin, tenant_user, unit])
    db.flush()
    contractor = Contractor(organization_id=tenant.id, unit_id=unit.id, name="Delete Contractor", code="DEL-CONTRACTOR")
    db.add(contractor)
    db.add(UserRoleScope(user_id=tenant_user.id, role="UNIT_MAKER", scope_type="UNIT", scope_id=unit.id))
    db.commit()
    tenant_id, tenant_user_id, unit_id, contractor_id, master_id = tenant.id, tenant_user.id, unit.id, contractor.id, master.id

    listed = api.list_platform_organizations(user=product_admin, db=db)
    assert [item["id"] for item in listed] == [tenant_id]
    with pytest.raises(HTTPException, match="Organization not found"):
        api.get_platform_organization(master_id, product_admin, db)

    result = api.delete_platform_organization(tenant_id, OrganizationDeleteInput(confirmation_code="DELETE-ME"), product_admin, db)

    assert result["ok"] is True
    assert db.get(Organization, tenant_id) is None
    assert db.get(User, tenant_user_id) is None
    assert db.get(Unit, unit_id) is None
    assert db.get(Contractor, contractor_id) is None
    assert db.get(Organization, master_id) is not None
    with pytest.raises(HTTPException, match="cannot be deleted"):
        api.delete_platform_organization(master_id, OrganizationDeleteInput(confirmation_code="MORAX-MASTER"), product_admin, db)
