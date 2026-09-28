# MORAX Multi-Tenant Organization Architecture

## A. Current architecture conflicts

The original MVP already stored organization ownership on the important operational records, but it treated User.organization_id as a fixed single-organization context. MORAX_ADMIN was also stored as an organization role. This made the Organization table a data owner, not a true platform tenant boundary.

MORAX Platform Owner
  = MORAX_ADMIN
  = admin@morax.example.com / Admin@123

MORAX_ADMIN
  → Creates or selects an Organization
  → Enters/Manages that Organization
  → Creates organization users
  → Assigns Organization Admin, Maker, Checker, Viewer roles

  For each new organization, the MORAX Admin should create an organization owner/admin:
1. Log in as admin@morax.example.com.
2. Open Organizations.
3. Create the organization.
4. Select Manage for that organization.
5. Open Users & access.
6. Create a user, for example:
   - Email: admin@abccompany.com
   - Password: a temporary password you choose
7. Assign:
   - Role: ORGANIZATION_ADMIN
   - Scope: ORGANIZATION
   - Scope value: that organization.
8. That user can now log in through the same MORAX login screen.
Maker and Checker are separate login accounts, also created by the Organization Admin or MORAX Admin:
User	Example role	Access
maker@abccompany.com	UNIT_MAKER	Assigned Unit/Contractor/Site and assigned compliance items
checker@abccompany.com	UNIT_CHECKER or CONTRACTOR_CHECKER	Same relevant scope and assigned review items
viewer@abccompany.com	VIEWER	Read-only, scoped access

Maker logs in
  → sees only authorized organization/entity work
  → updates activity and uploads evidence
  → submits

Checker logs in
  → sees assigned review notification/work
  → verifies evidence
  → approves, rejects, or requests correction

  Important current behavior:
- All users use the same login page; there are no separate Maker/Checker URLs.
- A user belongs to one organization in the current MVP.
- A user may have multiple roles/scopes within that organization.
- A Maker/Checker also needs assignment to the individual compliance item.
- An inactive organization blocks its organization users from logging in.
- MORAX_ADMIN is the platform owner; ORGANIZATION_ADMIN is the customer/company owner inside one organization.

## B. Database changes

Migration 0004_platform_organizations adds:

- Organization profile fields: registration number, PAN, GSTIN, city, pincode, primary contact, created-by, and updated-by.
- User.platform_role for the platform-only MORAX_ADMIN role.
- AuthSession.active_organization_id for trusted selected-organization context.

Existing operational ownership is retained:

Organization -> Unit, Contractor, Contractor Site, User, Compliance Rule, Import, Instance, Notification, and Audit Log.

## C. Migration strategy

Existing records remain attached to their existing organization IDs. No Unit, user, rule, instance, evidence record, or audit record is reassigned.

Legacy MORAX_ADMIN and SUPER_ADMIN scope rows are converted to ORGANIZATION_ADMIN scope rows, retaining their previous tenant-admin capability. Only the configured bootstrap administrator is assigned the new platform MORAX_ADMIN role by startup setup.

## D. Backend and API design

Platform-only APIs:

- GET /platform/organizations
- POST /platform/organizations
- GET /platform/organizations/{organization_id}
- PATCH /platform/organizations/{organization_id}
- POST /platform/organizations/{organization_id}/status
- POST /platform/organizations/{organization_id}/enter

The enter endpoint changes AuthSession.active_organization_id only after verifying the caller is a platform MORAX_ADMIN.

Existing organization APIs continue to use their existing paths. Their tenant is now resolved from the authenticated session context, not from a browser-supplied organization ID.

## E. Frontend navigation

Platform administrators use Organizations to search, create, edit, activate/deactivate, and manage organizations.

Manage routes to:

~~~
/app/organizations/{organizationId}/dashboard
/app/organizations/{organizationId}/units
/app/organizations/{organizationId}/contractors
/app/organizations/{organizationId}/users
/app/organizations/{organizationId}/compliance-master
~~~

The sidebar displays the selected organization. Organization users continue to use their own home organization context.

## F. Authentication and RBAC

Platform role:

- MORAX_ADMIN: platform organization management and verified entry into any organization.

Organization roles:

- ORGANIZATION_ADMIN
- UNIT_ADMIN
- UNIT_MAKER
- UNIT_CHECKER
- CONTRACTOR_ADMIN
- CONTRACTOR_MAKER
- CONTRACTOR_CHECKER
- VIEWER
- AUDITOR

Platform and organization roles are separate fields/concerns. A platform role is not accepted in the organization role-scope assignment API.

## G. Tenant-isolation strategy

1. Login creates a session with active_organization_id.
2. Each request resolves tenant context from that server-side session.
3. Organization users can only use their own User.organization_id as context.
4. Only MORAX_ADMIN can switch context.
5. Existing endpoint filters and object lookups compare each entity's organization_id to the trusted context.
6. Subject scope checks apply after tenant ownership checks.

This prevents a changed URL, payload, query parameter, or entity ID from bypassing tenant isolation.

## H. Test coverage

backend/tests/platform_tenant_isolation.ps1 validates:

- platform organization create and update path
- unique organization-code rejection
- activate/deactivate behavior
- organization-admin denial of platform organization creation
- Unit isolation across two organizations
- cross-organization Unit ID update denial
- compliance instance isolation
- organization change audit records

backend/tests/live_e2e.ps1 remains the complete Maker/Checker workflow test.

## I. Modified and created files

- backend/app/models/models.py
- backend/app/schemas/common.py
- backend/app/services/access.py
- backend/app/services/compliance.py
- backend/app/api/v1/router.py
- backend/app/main.py
- backend/alembic/versions/0004_platform_organizations.py
- backend/tests/platform_tenant_isolation.ps1
- frontend/src/api/morax.ts
- frontend/src/App.tsx
- frontend/tsconfig.app.json

