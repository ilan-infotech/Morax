# MORAX role, access, and compliance test cases

## Scope and execution

This matrix covers the organization onboarding, centralized User Access,
Unit/Contractor assignments, product-owned Compliance Master, workflow, and
tenant-isolation changes. Automated cases run against a fresh in-memory
database; no production or demonstration records are modified.

| ID | Area | Scenario | Expected result | Execution |
| --- | --- | --- | --- | --- |
| AUTH-01 | Product login | Sign in as MORAX Product Admin | Login succeeds and identifies the platform role as `MORAX_ADMIN`. | Automated |
| AUTH-02 | Organization onboarding | Product Admin creates an organization with Admin name, email, password, and confirmation | Organization and one active `ORGANIZATION_ADMIN` account are created in the same transaction. | Automated |
| AUTH-03 | Password security | Inspect organization-admin and normal-user accounts created through the application | Password is bcrypt/hashed, never returned by an API, and no activation token is created for the direct-password flow. | Automated |
| AUTH-04 | First login | Sign in as the new Organization Admin using email and chosen password | Login succeeds immediately and is bound to that organization. | Automated |
| AUTH-05 | Normal-user login | Create Unit Admin, Maker, and Checker with passwords, then sign in | Each account signs in with its own email/password and receives its assigned role only. | Automated |
| RBAC-01 | Product ownership | Product Admin opens Compliance Master | Product Admin can list and create globally shared master rules. | Automated |
| RBAC-02 | Product ownership | Organization Admin opens or creates Compliance Master rules | Request is rejected; the Compliance Master feature is absent from their feature list. | Automated |
| RBAC-03 | Organization administration | Organization Admin creates Units, Contractors, users, and assignments in its tenant | Allowed. | Automated |
| RBAC-04 | Unit roles | Unit Maker or Unit Checker attempts to create a Unit or a user | Rejected; these roles do not have organization-management permission. | Automated |
| RBAC-05 | Maker/checker separation | Unit Checker attempts to save compliance activity | Rejected; only the Maker path can prepare or submit. | Automated |
| RBAC-06 | Scope access | Contractor Admin opens its assigned Contractor | Allowed; the role is limited to its Contractor scope. | Automated |
| RBAC-07 | Scope access | Contractor Maker opens an unrelated Unit | Rejected because the user has no Unit permission/scope. | Automated |
| ISO-01 | Tenant isolation | Organization B Admin reads a Unit belonging to Organization A | `404`/not found; an entity ID cannot cross the tenant boundary. | Automated |
| ISO-02 | Tenant isolation | Organization B Admin changes Organization A user assignments | `404`/not found; no assignment is changed. | Automated |
| ISO-03 | Tenant isolation | Assign Organization B user to Organization A Unit | Rejected because the user is not active in the target organization. | Automated |
| USER-01 | Centralized User Access | Create a user in User Access and list users | The new account appears in the organization-wide User Access list. | Automated |
| USER-02 | Reuse account | Assign the same organization user to a Unit and Contractor in different roles | One user account has multiple role scopes; no duplicate account is made. | Automated |
| USER-03 | Assignment synchronization | Read Unit/Contractor assigned users after saving assignments | Assigned user and Admin/Maker/Checker roles are returned from the shared user/role records. | Automated |
| USER-04 | Safe removal | Remove all assignments from a Unit | The user account remains; only the removed Unit role scopes disappear. Other assignments remain. | Automated |
| USER-05 | Audit trail | Create a user and create/replace entity assignments | Audit log contains user creation/password-setting and role-assignment events. | Automated |
| MASTER-01 | Global matching | Product Admin configures an active Unit rule for Tamil Nadu + Factory | A matching Unit in a newly created organization receives a Company Compliance instance automatically. | Automated |
| MASTER-02 | Non-match | Create a Unit with the same State but another Industry | No instance is created for the non-matching Unit. | Automated |
| MASTER-03 | Contractor matching | Product Admin configures a Contractor rule; Organization Admin creates a matching Contractor | A Contractor Compliance instance is generated automatically. | Automated |
| MASTER-04 | No month restriction | Create a master rule with the default empty applicable-month list | The rule applies in every normal period; `[]` is not interpreted as no months. | Automated |
| FLOW-01 | Maker work queue | Unit Maker loads My Work | The user sees applicable pending compliance for their assigned Unit. | Automated |
| FLOW-02 | Submission | Unit Maker saves filing details and submits | The instance advances to `SUBMITTED`. | Automated |
| FLOW-03 | Checker approval | Unit Checker opens pending approvals, begins review, and approves | The instance advances through review to `APPROVED`. | Automated |
| UI-01 | Unit form | Open Create/Edit Unit | Status is fixed to Active; registration identifiers and applicable regulations are not shown. | Frontend build + manual smoke |
| UI-02 | Contractor form | Open Create/Edit Contractor | Registration identifiers and applicable regulations are not shown; user assignment supports multiple Admin/Maker/Checker entries. | Frontend build + manual smoke |
| UI-03 | User popup | Start new-user creation while editing a Unit or Contractor | Name, email, mobile, role, password, and confirmation are required; returning from the popup preserves the entity form values. | Frontend build + manual smoke |
| UI-04 | Master navigation | Sign in as Organization Admin | Compliance Master is not visible/available; product-admin navigation still exposes it. | Frontend build + manual smoke |

## Automated evidence

Run from `backend`:

```powershell
python -m pytest -vv
```

The automated suite is implemented in:

- `backend/tests/test_activation_and_entity_assignments.py`
- `backend/tests/test_entity_management_access.py`
- `backend/tests/test_role_matrix_and_global_compliance_master.py`

The final UI items require a browser session because they verify visual layout
and retained in-progress form state; the build confirms that these screens
compile and integrate with the application API types.
