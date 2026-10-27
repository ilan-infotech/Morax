from datetime import timezone, datetime

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import AuthSession, Contractor, ContractorSite, Organization, Unit, User, UserPermissionGrant, UserRoleScope

bearer = HTTPBearer(auto_error=False)
PLATFORM_ADMIN_ROLE = "MORAX_ADMIN"
ADMIN_ROLES = {"ORGANIZATION_ADMIN"}
MANAGER_ROLES = {"ORGANIZATION_ADMIN", "UNIT_ADMIN", "CONTRACTOR_ADMIN"}
MAKER_ROLES = {"ORGANIZATION_ADMIN", "UNIT_ADMIN", "UNIT_MAKER", "CONTRACTOR_ADMIN", "CONTRACTOR_MAKER"}
CHECKER_ROLES = {"ORGANIZATION_ADMIN", "UNIT_ADMIN", "UNIT_CHECKER", "CONTRACTOR_ADMIN", "CONTRACTOR_CHECKER"}
CONTRACTOR_ROLES = {"CONTRACTOR_ADMIN", "CONTRACTOR_MAKER", "CONTRACTOR_CHECKER"}
BROADER_TENANT_ROLES = {"ORGANIZATION_ADMIN", "UNIT_ADMIN", "UNIT_MAKER", "UNIT_CHECKER", "VIEWER", "AUDITOR"}

ROLE_PERMISSIONS = {
    "MORAX_ADMIN": {
        "platform.organizations",
        "dashboard.read",
        "compliance.read",
        "compliance.manage",
        "documents.read",
        "documents.manage",
        "reports.read",
        "audit.read",
        "entities.read",
        "entities.manage",
        "users.manage",
        "compliance_master.manage",
        "settings.read",
        "settings.manage",
    },
    "ORGANIZATION_ADMIN": {
        "dashboard.read",
        "compliance.read",
        "compliance.manage",
        "documents.read",
        "documents.manage",
        "reports.read",
        "audit.read",
        "entities.read",
        "entities.manage",
        "users.manage",
        "settings.read",
        "settings.manage",
    },
    "UNIT_ADMIN": {
        "dashboard.read",
        "compliance.read",
        "compliance.manage",
        "documents.read",
        "documents.manage",
        "reports.read",
        "entities.read",
        "settings.read",
    },
    "UNIT_MAKER": {
        "dashboard.read",
        "compliance.read",
        "compliance.make",
        "documents.read",
        "documents.upload",
        "settings.read",
    },
    "CONTRACTOR_MAKER": {
        "dashboard.read",
        "compliance.read",
        "compliance.make",
        "documents.upload",
    },
    "UNIT_CHECKER": {
        "dashboard.read",
        "compliance.read",
        "compliance.check",
        "documents.read",
        "documents.verify",
        "settings.read",
    },
    "CONTRACTOR_ADMIN": {
        "dashboard.read",
        "compliance.read",
        "compliance.manage",
        "documents.manage",
        "documents.upload",
    },
    "CONTRACTOR_CHECKER": {
        "dashboard.read",
        "compliance.read",
        "compliance.check",
        "documents.verify",
    },
    "VIEWER": {
        "dashboard.read",
        "compliance.read",
        "documents.read",
        "settings.read",
    },
    "AUDITOR": {
        "dashboard.read",
        "compliance.read",
        "documents.read",
        "reports.read",
        "audit.read",
        "settings.read",
    },
}

# These are optional, additive product-area grants selected at user creation.
# Privileged platform administration cannot be delegated through this list.
MODULE_PERMISSION_CHOICES = {
    permission
    for role, permissions in ROLE_PERMISSIONS.items()
    if role != "MORAX_ADMIN"
    for permission in permissions
}

FEATURE_PERMISSIONS = {
    "platform.organizations": "platform.organizations",
    "dashboard": "dashboard.read",
    "compliances.recurring": "compliance.read",
    "compliances.one_time": "compliance.read",
    "entities.units": "entities.read",
    "entities.contractors": "entities.read",
    "entities.sites": "entities.read",
    "users": "users.manage",
    "compliance_master": "compliance_master.manage",
    "documents": "documents.read",
    # Notifications are operational work items, not an account-settings
    # screen.  Contractor Checkers/Makers have compliance.read but deliberately
    # do not receive settings.read; they must still receive submission and
    # deadline notifications in their scoped workspace.
    "notifications": "compliance.read",
    "reports": "reports.read",
    "audit": "audit.read",
    "settings": "settings.read",
}

BASE_FEATURES = {
    "dashboard",
    "compliances.recurring",
    "compliances.one_time",
    "documents",
    "notifications",
    "settings",
}
ADMIN_FEATURES = BASE_FEATURES | {
    "entities.units",
    "entities.contractors",
    "entities.sites",
    "users",
    "reports",
    "audit",
}
MANAGER_FEATURES = BASE_FEATURES | {"reports"}
AUDITOR_FEATURES = BASE_FEATURES | {"reports", "audit"}
PLATFORM_FEATURES = ADMIN_FEATURES | {"platform.organizations"}


def unauthorized(detail: str = "Authentication required") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User:
    if not credentials:
        raise unauthorized()
    try:
        claims = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise unauthorized(str(exc)) from exc
    session = db.get(AuthSession, claims.get("sid"))
    user = db.get(User, claims.get("sub"))
    expired = bool(session and session.expires_at.replace(tzinfo=None) < datetime.now(timezone.utc).replace(tzinfo=None))
    if not session or session.revoked_at or expired or not user or not user.active:
        raise unauthorized("Session is no longer active")
    active_org = session.active_organization_id or user.organization_id
    if not active_org:
        raise unauthorized("No organization context is available")
    if user.platform_role != PLATFORM_ADMIN_ROLE and user.organization_id != active_org:
        raise unauthorized("Organization context is not authorized")
    setattr(user, "_morax_active_organization_id", active_org)
    setattr(user, "_morax_session_id", session.id)
    setattr(user, "_morax_impersonated_by_id", session.impersonated_by_id)
    setattr(user, "_morax_impersonated_by_session_id", session.impersonated_by_session_id)
    contractor_context = contractor_context_for_user(db, user, active_org, session.active_contractor_id)
    setattr(user, "_morax_active_contractor_id", contractor_context["active_contractor_id"])
    return user


def scopes_for(db: Session, user_id: str) -> list[UserRoleScope]:
    return list(db.scalars(select(UserRoleScope).where(UserRoleScope.user_id == user_id)))


def roles_for(db: Session, user_id: str) -> set[str]:
    return {scope.role for scope in scopes_for(db, user_id)}


def contractor_context_for_user(
    db: Session,
    user: User,
    organization_id: str,
    active_contractor_id: str | None = None,
) -> dict:
    """Return the authorized, session-selectable contractor context.

    Only contractor-only accounts use this context. Mixed organization/unit
    administrators continue to use their normal broader access.
    """
    scopes = scopes_for(db, user.id)
    scope_roles = {scope.role for scope in scopes}
    enabled = bool(scope_roles & CONTRACTOR_ROLES) and not bool(scope_roles & BROADER_TENANT_ROLES)
    if not enabled:
        return {
            "enabled": False,
            "selection_required": False,
            "active_contractor_id": None,
            "active_contractor_name": None,
            "options": [],
        }

    contractor_ids = {
        scope.scope_id
        for scope in scopes
        if scope.role in CONTRACTOR_ROLES and scope.scope_type == "CONTRACTOR"
    }
    unit_ids = {
        scope.scope_id
        for scope in scopes
        if scope.role in CONTRACTOR_ROLES and scope.scope_type == "UNIT"
    }
    query = select(Contractor).where(
        Contractor.organization_id == organization_id,
        Contractor.status == "ACTIVE",
    )
    filters = []
    if contractor_ids:
        filters.append(Contractor.id.in_(contractor_ids))
    if unit_ids:
        filters.append(Contractor.unit_id.in_(unit_ids))
    contractors = list(db.scalars(query.where(or_(*filters)).order_by(Contractor.name, Contractor.id))) if filters else []
    authorized_ids = {contractor.id for contractor in contractors}
    selected_id = active_contractor_id if active_contractor_id in authorized_ids else None
    if selected_id is None and len(contractors) == 1:
        selected_id = contractors[0].id
    selected = next((contractor for contractor in contractors if contractor.id == selected_id), None)
    return {
        "enabled": True,
        "selection_required": selected is None,
        "active_contractor_id": selected.id if selected else None,
        "active_contractor_name": selected.name if selected else None,
        "options": [
            {"id": contractor.id, "name": contractor.name, "code": contractor.code}
            for contractor in contractors
        ],
    }


def permission_grants_for(db: Session, user_id: str) -> set[str]:
    return set(db.scalars(select(UserPermissionGrant.permission).where(UserPermissionGrant.user_id == user_id)))


def platform_master_organization_id(db: Session) -> str:
    """Return the platform-owned tenant used solely to store global rules.

    ComplianceRule retains its existing organization foreign key for data-model
    compatibility, but the rows are now owned only by the bootstrap MORAX
    platform organization and are applied to every tenant.
    """
    organization_id = db.scalar(select(Organization.id).where(Organization.is_system.is_(True)).order_by(Organization.created_at, Organization.id).limit(1))
    if not organization_id:
        # Compatibility for a database that has not yet been opened after the
        # system-tenant migration/seed. Startup will mark this tenant on its
        # next normal run.
        organization_id = db.scalar(
            select(User.organization_id)
            .where(User.platform_role == PLATFORM_ADMIN_ROLE, User.organization_id.is_not(None))
            .order_by(User.created_at, User.id)
            .limit(1)
        )
    if not organization_id:
        raise HTTPException(409, "A MORAX platform master organization is not configured")
    return organization_id


def permissions_for(user: User, scopes: list[UserRoleScope], grants: set[str] | None = None) -> set[str]:
    permissions: set[str] = set()
    if user.platform_role == PLATFORM_ADMIN_ROLE:
        permissions.update(ROLE_PERMISSIONS["MORAX_ADMIN"])
    for scope in scopes:
        permissions.update(ROLE_PERMISSIONS.get(scope.role, set()))
    # Existing tenant grants cannot preserve access to platform-only features.
    permitted_grants = set(grants or set())
    if user.platform_role != PLATFORM_ADMIN_ROLE:
        permitted_grants -= {"compliance_master.manage", "platform.organizations"}
    permissions.update(permitted_grants)
    contractor_roles = {"CONTRACTOR_ADMIN", "CONTRACTOR_MAKER", "CONTRACTOR_CHECKER"}
    broader_roles = {"ORGANIZATION_ADMIN", "UNIT_ADMIN", "UNIT_MAKER", "UNIT_CHECKER", "VIEWER", "AUDITOR"}
    scope_roles = {scope.role for scope in scopes}
    if user.platform_role != PLATFORM_ADMIN_ROLE and scope_roles & contractor_roles and not scope_roles & broader_roles:
        # A historic optional grant must never turn a contractor-only account
        # into a company, unit, dashboard, reporting, or settings user.
        permissions &= {
            "compliance.read", "compliance.make", "compliance.check", "compliance.manage",
            "documents.upload", "documents.verify", "documents.manage",
        }
    return permissions


def features_for(user: User, scopes: list[UserRoleScope], grants: set[str] | None = None) -> list[str]:
    """Return product areas visible for the user's trusted organization context."""
    contractor_roles = {"CONTRACTOR_ADMIN", "CONTRACTOR_MAKER", "CONTRACTOR_CHECKER"}
    broader_roles = {"ORGANIZATION_ADMIN", "UNIT_ADMIN", "UNIT_MAKER", "UNIT_CHECKER", "VIEWER", "AUDITOR"}
    scope_roles = {scope.role for scope in scopes}
    if scope_roles & contractor_roles and not scope_roles & broader_roles:
        # Contractor sessions are intentionally a narrow product experience.
        # The API permission checks remain authoritative for the underlying
        # compliance records and documents needed inside that experience.
        # Contractor users receive a deliberately narrow dashboard. Its data is
        # still constrained by the selected, authorized contractor context.
        return ["dashboard", "compliances.recurring", "notifications"]
    permissions = permissions_for(user, scopes, grants)
    features = {
        feature
        for feature, permission in FEATURE_PERMISSIONS.items()
        if permission in permissions
    }
    return sorted(features)


def has_permission(db: Session, user: User, permission: str) -> bool:
    return permission in permissions_for(user, scopes_for(db, user.id), permission_grants_for(db, user.id))


def is_org_admin(db: Session, user: User, organization_id: str) -> bool:
    if user.platform_role == PLATFORM_ADMIN_ROLE:
        return True
    return any(scope.role in ADMIN_ROLES and scope.scope_type == "ORGANIZATION" and scope.scope_id == organization_id for scope in scopes_for(db, user.id))


def can_access_subject(db: Session, user: User, organization_id: str, subject_type: str, subject_id: str) -> bool:
    if is_org_admin(db, user, organization_id):
        return True
    scopes = scopes_for(db, user.id)
    scope_roles = {scope.role for scope in scopes}
    contractor_only = bool(scope_roles & CONTRACTOR_ROLES) and not bool(scope_roles & BROADER_TENANT_ROLES)
    # Session context is authoritative for an authenticated contractor-only
    # user. Users inspected by an administrator outside their own session do
    # not carry this attribute and retain their complete configured scope.
    if contractor_only and hasattr(user, "_morax_active_contractor_id"):
        active_contractor_id = getattr(user, "_morax_active_contractor_id", None)
        if not active_contractor_id:
            return False
        if subject_type == "CONTRACTOR":
            return subject_id == active_contractor_id
        if subject_type == "CONTRACTOR_SITE":
            site = db.get(ContractorSite, subject_id)
            return bool(
                site
                and site.organization_id == organization_id
                and site.contractor_id == active_contractor_id
            )
        if subject_type == "UNIT":
            return False
    # A Contractor Maker may be mapped to one or more Units so the system can
    # locate that contractor's work there. That mapping is not Company
    # Compliance access: only a non-contractor role can open the Unit itself.
    contractor_maker_scopes = [scope for scope in scopes if scope.role == "CONTRACTOR_MAKER"]
    if subject_type == "UNIT" and contractor_maker_scopes:
        return any(
            scope.scope_type == "UNIT" and scope.scope_id == subject_id and scope.role != "CONTRACTOR_MAKER"
            for scope in scopes
        )
    if any(
        scope.scope_type == "ORGANIZATION"
        and scope.scope_id == organization_id
        and scope.role in {"VIEWER", "AUDITOR"}
        for scope in scopes
    ):
        return True
    if any(
        scope.scope_type == subject_type and scope.scope_id == subject_id
        and not (subject_type == "UNIT" and scope.role == "CONTRACTOR_MAKER")
        for scope in scopes
    ):
        return True
    if subject_type == "CONTRACTOR":
        contractor = db.get(Contractor, subject_id)
        if contractor and contractor.organization_id == organization_id:
            return any(scope.scope_type == "UNIT" and scope.scope_id == contractor.unit_id for scope in scopes)
    if subject_type == "CONTRACTOR_SITE":
        site = db.get(ContractorSite, subject_id)
        if site and site.organization_id == organization_id:
            return any(
                (scope.scope_type == "CONTRACTOR" and scope.scope_id == site.contractor_id)
                or (scope.scope_type == "UNIT" and scope.scope_id == site.unit_id)
                for scope in scopes
            )
    return False


def require_org_admin(db: Session, user: User, organization_id: str) -> None:
    if not is_org_admin(db, user, organization_id):
        raise HTTPException(status_code=403, detail="Organization administrator permission is required")


def require_org_admin_for_entity_management(db: Session, user: User, organization_id: str) -> None:
    require_org_admin(db, user, organization_id)


def can_read_audit(db: Session, user: User, organization_id: str) -> bool:
    """Audit visibility is limited to tenant administrators and org-scoped auditors."""
    if is_org_admin(db, user, organization_id):
        return True
    return any(
        scope.role == "AUDITOR" and scope.scope_type == "ORGANIZATION" and scope.scope_id == organization_id
        for scope in scopes_for(db, user.id)
    )


def accessible_subject_ids(db: Session, user: User, organization_id: str, subject_type: str) -> set[str] | None:
    if is_org_admin(db, user, organization_id):
        return None
    scopes = scopes_for(db, user.id)
    scope_roles = {scope.role for scope in scopes}
    contractor_only = bool(scope_roles & CONTRACTOR_ROLES) and not bool(scope_roles & BROADER_TENANT_ROLES)
    if contractor_only and hasattr(user, "_morax_active_contractor_id"):
        active_contractor_id = getattr(user, "_morax_active_contractor_id", None)
        if not active_contractor_id:
            return set()
        if subject_type == "CONTRACTOR":
            return {active_contractor_id}
        if subject_type == "CONTRACTOR_SITE":
            return set(db.scalars(select(ContractorSite.id).where(
                ContractorSite.organization_id == organization_id,
                ContractorSite.contractor_id == active_contractor_id,
            )))
        if subject_type == "UNIT":
            return set()
    if any(
        scope.scope_type == "ORGANIZATION"
        and scope.scope_id == organization_id
        and scope.role in {"VIEWER", "AUDITOR"}
        for scope in scopes
    ):
        return None
    ids = {scope.scope_id for scope in scopes if scope.scope_type == subject_type}
    if subject_type == "CONTRACTOR":
        unit_ids = {scope.scope_id for scope in scopes if scope.scope_type == "UNIT"}
        if unit_ids:
            ids.update(
                db.scalars(
                    select(Contractor.id).where(
                        Contractor.organization_id == organization_id,
                        Contractor.unit_id.in_(unit_ids),
                    )
                )
            )
    if subject_type == "CONTRACTOR_SITE":
        contractor_ids = {scope.scope_id for scope in scopes if scope.scope_type == "CONTRACTOR"}
        unit_ids = {scope.scope_id for scope in scopes if scope.scope_type == "UNIT"}
        if contractor_ids or unit_ids:
            statement = select(ContractorSite.id).where(ContractorSite.organization_id == organization_id)
            if contractor_ids and unit_ids:
                statement = statement.where((ContractorSite.contractor_id.in_(contractor_ids)) | (ContractorSite.unit_id.in_(unit_ids)))
            elif contractor_ids:
                statement = statement.where(ContractorSite.contractor_id.in_(contractor_ids))
            else:
                statement = statement.where(ContractorSite.unit_id.in_(unit_ids))
            ids.update(db.scalars(statement))
    return ids


def user_summary(db: Session, user: User) -> dict:
    scopes = scopes_for(db, user.id)
    grants = permission_grants_for(db, user.id)
    impersonator_id = getattr(user, "_morax_impersonated_by_id", None)
    impersonator = db.get(User, impersonator_id) if impersonator_id else None
    active_organization_id = getattr(user, "_morax_active_organization_id", user.organization_id)
    active_organization = db.get(Organization, active_organization_id) if active_organization_id else None
    contractor_context = contractor_context_for_user(
        db,
        user,
        active_organization_id,
        getattr(user, "_morax_active_contractor_id", None),
    ) if active_organization_id else {
        "enabled": False,
        "selection_required": False,
        "active_contractor_id": None,
        "active_contractor_name": None,
        "options": [],
    }
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "organization_id": active_organization_id,
        "organization_name": active_organization.name if active_organization else None,
        "home_organization_id": user.organization_id,
        "platform_role": user.platform_role,
        "mobile": user.mobile,
        "active": user.active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "must_change_password": user.must_change_password,
        "roles": sorted({scope.role for scope in scopes}),
        "scopes": [{"role": scope.role, "scope_type": scope.scope_type, "scope_id": scope.scope_id} for scope in scopes],
        "features": features_for(user, scopes, grants),
        "permissions": sorted(permissions_for(user, scopes, grants)),
        "contractor_context": contractor_context,
        "impersonation": {
            "active": bool(impersonator_id),
            "impersonator_id": impersonator_id,
            "impersonator_name": impersonator.name if impersonator else None,
        },
    }
