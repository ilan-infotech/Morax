# MORAX Labour Compliance Software --- MVP End-to-End Product Flow

**Document:** MVP Product Flow & Implementation Plan\
**Version:** 1.0\
**Date:** 27 September 2026\
**Purpose:** End-to-end product blueprint for designing, building,
testing, and launching the MORAX MVP.

------------------------------------------------------------------------

## 1. MVP Objective
You are a senior full-stack software engineer responsible for building the Phase 1 MVP of the MORAX Labour Compliance Software.
Build a fully functional end-to-end MVP.

The MORAX MVP must prove one complete operational compliance lifecycle:

> **Configure organization → create entities → configure users →
> maintain Compliance Master from Excel → determine applicability →
> generate compliance obligations → assign Maker/Checker → Maker
> prepares evidence → submits → Checker reviews →
> approves/rejects/corrects → compliance status updates → dashboard
> reflects the result → complete audit trail is retained.**

The MVP should be deliberately focused. It is not intended to build the
entire future MORAX platform.

### TECHNOLOGY STACK

Backend:
Python
FastAPI
SQLAlchemy
SQLite
Pydantic
Uvicorn
Frontend:
React.js
Typescript
Tailwind CSS
shadcn/ui
React Router
Axios or Fetch API
Database:
SQLite for Phase 1
SQLAlchemy ORM
Database migrations should be structured so that migration to PostgreSQL later is straightforward.


### MVP success definition

A customer administrator should be able to:

1.  Log in securely.
2.  Configure the organization.
3.  Create Units/Branches.
4.  Create Contractors.
5.  Create Contractor Sites.
6.  Maintain Industry Type and other applicability attributes.
7.  Create users and assign roles to entities.
8.  Upload the predefined Compliance Master Excel.
9.  Validate and import compliance rules.
10. Activate applicable rules.
11. Automatically generate recurring and one-time compliance instances.
12. View the generated worklist and dashboard.
13. Assign or route work to Maker/Checker.
14. Maker fills compliance details and uploads evidence.
15. Maker submits the compliance.
16. Checker reviews the submission.
17. Checker approves, rejects, or requests correction.
18. System updates status and timestamps.
19. Dashboard/KPIs update automatically.
20. Every important action is recorded in the audit trail.

------------------------------------------------------------------------

# 2. MVP Scope

## 2.1 Included

### A. Authentication and authorization

-   Login
-   Logout
-   Session/token handling
-   Password management
-   Role-based access control
-   Entity-level access control

### B. Organization and entity master

-   Company/organization
-   Unit/Branch/Establishment
-   Contractor
-   Contractor Site
-   Industry Type
-   State
-   City/location
-   Entity relationships
-   Active/inactive status

### C. User management

-   User creation
-   User activation/deactivation
-   Role assignment
-   Entity assignment
-   Maker
-   Checker
-   Admin
-   Viewer/Auditor

### D. Compliance Master

-   Excel template download
-   Excel upload
-   Template validation
-   Row validation
-   Duplicate detection
-   Preview
-   Insert/update handling
-   Import history
-   Rule activation/deactivation
-   Rule versioning
-   Applicability attributes

### E. Compliance engine

-   Applicability matching
-   Compliance instance generation
-   Recurring compliance
-   One-time compliance
-   Due-date calculation
-   Compliance start date
-   Status calculation
-   Overdue calculation
-   Completed-late calculation

### F. Compliance operations

-   Dashboard
-   Recurring compliance list
-   One-time compliance list
-   Filters
-   Search
-   Sorting
-   Compliance detail
-   Action history
-   Document upload
-   Submit
-   Approve
-   Reject
-   Request correction

### G. Audit

-   Entity changes
-   User changes
-   Compliance rule changes
-   Import history
-   Compliance status changes
-   Submission/review actions
-   Document actions

------------------------------------------------------------------------

# 3. Explicitly Out of MVP

These should be designed for future compatibility but not allowed to
expand MVP scope:

-   License Management
-   Notice Management
-   Digital Library
-   Government Notification ingestion
-   Regulatory change impact engine
-   Advanced analytics
-   Advanced reports
-   PDF report builder
-   Email escalation engine
-   Bulk entity onboarding
-   Payroll/HR integrations
-   External customer integrations
-   AI/legal interpretation
-   Automatic legal-rule discovery
-   Complex statutory interpretation engine

The MVP should execute **rules supplied and governed by MORAX
administrators**. It should not attempt to independently interpret
legislation.

------------------------------------------------------------------------

# 4. Product Architecture at Business Level

``` text
                    ┌─────────────────────┐
                    │     MORAX Admin     │
                    └──────────┬──────────┘
                               │
              ┌────────────────▼────────────────┐
              │ Organization / Entity Master    │
              │ Company / Unit / Contractor     │
              │ Contractor Site / Industry      │
              └────────────────┬────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │    User & RBAC      │
                    │ Maker / Checker     │
                    │ Admin / Viewer      │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Compliance Master   │
                    │ Excel → Validate    │
                    │ → Preview → Import  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Applicability       │
                    │ Engine              │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Compliance Instance │
                    │ Due Date / Status   │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Worklist / Dashboard│
                    └──────────┬──────────┘
                               │
                     ┌─────────▼─────────┐
                     │      Maker        │
                     │ Prepare + Evidence│
                     └─────────┬─────────┘
                               │ Submit
                     ┌─────────▼─────────┐
                     │     Checker       │
                     │ Review / Decision │
                     └─────────┬─────────┘
                               │
                 ┌─────────────┼─────────────┐
                 │             │             │
              Approve       Reject       Correction
                 │             │             │
                 └─────────────┴─────────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Dashboard + Audit   │
                    └─────────────────────┘
```

------------------------------------------------------------------------

# 5. End-to-End User Journey

## Stage 1 --- Login

### User

Any authorized MORAX user.

### Flow

``` text
Login
  ↓
Validate credentials
  ↓
Load user
  ↓
Load role
  ↓
Load entity assignments
  ↓
Load organization context
  ↓
Dashboard
```

### Rules

-   Invalid credentials are rejected.
-   Deactivated users cannot log in.
-   Users only see entities within their assigned scope.
-   Authorization must be enforced server-side.

------------------------------------------------------------------------

# 6. Stage 2 --- Initial Organization Setup

The first setup should be performed by MORAX Admin/Super Admin.

## 6.1 Organization

Capture:

-   Organization name
-   Legal name
-   Organization code
-   PAN/GST or applicable identifiers where required
-   Registered address
-   State
-   Contact details
-   Compliance start date
-   Status

## 6.2 Organization state

``` text
Draft
  ↓
Configured
  ↓
Active
  ↓
Inactive
```

------------------------------------------------------------------------

# 7. Stage 3 --- Create Unit / Branch

A Unit/Branch represents an establishment/location against which
compliance may apply.

## Required business information

At minimum:

-   Unit/Branch Name
-   Unit Code
-   Entity Type
-   Industry Type
-   State
-   City
-   Address
-   Establishment/Registration identifiers where applicable
-   Compliance Start Date
-   Status

## Industry Type is important

Industry Type must not be treated as a cosmetic field.

It participates in applicability matching.

Example:

``` text
Rule:
Industry Type = Factory

Unit A:
Industry Type = Factory
→ Rule applies

Unit B:
Industry Type = IT Services
→ Rule does not apply
```

## Unit creation flow

``` text
Admin
  ↓
Add Unit
  ↓
Enter basic details
  ↓
Select Industry Type
  ↓
Select State
  ↓
Enter compliance start date
  ↓
Validate
  ↓
Save
  ↓
Create Unit
  ↓
Run applicability evaluation
  ↓
Generate applicable compliance instances
```

------------------------------------------------------------------------

# 8. Stage 4 --- Create Contractor

Contractors are separate master entities.

Capture:

-   Contractor Name
-   Contractor Code
-   Contractor Type
-   Industry Type
-   Contact details
-   Address
-   State
-   Registration/licence identifiers if required
-   Status
-   Effective date

A contractor can have one or more Contractor Sites.

------------------------------------------------------------------------

# 9. Stage 5 --- Create Contractor Site

A Contractor Site represents where the contractor's compliance
obligations are operated/managed.

Capture:

-   Contractor
-   Site Name
-   Site Code
-   Industry Type
-   State
-   City
-   Address
-   Establishment/site identifiers
-   Compliance Start Date
-   Status

Relationship:

``` text
Company
  ├── Unit A
  ├── Unit B
  └── Unit C

Contractor X
  ├── Site X1
  ├── Site X2
  └── Site X3
```

------------------------------------------------------------------------

# 10. Stage 6 --- User and Role Setup

## MVP roles

  Role                 Primary responsibility
  -------------------- -----------------------------------
  MORAX Admin          Configure the entire organization
  Unit Admin           Manage assigned unit operations
  Unit Maker           Prepare and submit compliance
  Contractor Admin     Manage contractor/site operations
  Contractor Maker     Prepare contractor compliance
  Contractor Checker   Review contractor compliance
  Viewer/Auditor       Read-only access

## Entity assignment

A role alone is not enough.

Example:

``` text
User: Ravi
Role: Unit Maker
Assigned Units:
  - Chennai Unit
  - Bangalore Unit
```

Ravi must not see or modify:

``` text
Hyderabad Unit
Mumbai Unit
```

unless explicitly assigned.

------------------------------------------------------------------------

# 11. Stage 7 --- Compliance Master

This is a critical MVP component.

The recommended approach is:

> **Excel is the controlled onboarding/maintenance mechanism. The
> database is the runtime source of truth.**

Do not make the application read the Excel file every time it needs a
compliance rule.

## Flow

``` text
Download Template
      ↓
Fill Compliance Data
      ↓
Upload Excel
      ↓
Validate
      ↓
Show Errors
      ↓
Preview Valid Records
      ↓
Admin Confirmation
      ↓
Import
      ↓
Create / Update Rule Versions
      ↓
Activate Rules
      ↓
Applicability Engine
```

------------------------------------------------------------------------

# 12. Compliance Master Excel Design

The template should contain structured fields rather than free-form text
wherever possible.

## Recommended fields

### Identity

-   Compliance ID
-   Compliance Name
-   Short Name
-   Act
-   Rule
-   Section
-   Compliance Category

### Geography

-   State
-   Central/State
-   Region if required

### Applicability

-   Entity Type
-   Industry Type
-   Worker/Employee threshold where applicable
-   Applicability flag
-   Applicability notes

### Frequency

-   One Time
-   Monthly
-   Quarterly
-   Half-Yearly
-   Annual
-   Event Based

### Due date

-   Due Date Rule
-   Due Date Offset
-   Due Date Anchor
-   Grace period if applicable

### Execution

-   Required Form
-   Required Document
-   Maker Required
-   Checker Required
-   Risk Level
-   Compliance Start Rule

### Governance

-   Effective From
-   Effective To
-   Version
-   Active/Inactive

------------------------------------------------------------------------

# 13. Excel Import Validation

Validation should happen before changing production compliance rules.

## Validation layers

### Layer 1 --- File validation

Check:

-   File type
-   Required worksheet
-   Header names
-   Template version
-   File size

### Layer 2 --- Row validation

Check:

-   Mandatory fields
-   Valid state
-   Valid industry type
-   Valid entity type
-   Valid frequency
-   Valid risk
-   Valid date format

### Layer 3 --- Business validation

Check:

-   Duplicate Compliance ID
-   Invalid applicability combination
-   Invalid due-date configuration
-   Invalid frequency/rule combination
-   Missing required document for a rule that requires evidence

### Layer 4 --- Database validation

Check:

-   Existing Compliance ID
-   Version conflict
-   Effective-date overlap
-   Existing active rule

------------------------------------------------------------------------

# 14. Excel Import Result

After upload, show:

``` text
Import Summary

Total Rows       250
Valid Rows       238
New Rules        180
Updated Rules     58
Duplicate Rows     4
Error Rows         8
```

Then provide:

-   View errors
-   Download error Excel
-   Preview valid records
-   Cancel
-   Confirm Import

The system must not partially modify production data before
confirmation.

------------------------------------------------------------------------

# 15. Compliance Master Versioning

Never overwrite historical rule information blindly.

Example:

``` text
Compliance ID: PF-MONTHLY-001

Version 1
Effective: 01-Apr-2026
Due Rule: Existing Rule

Version 2
Effective: 01-Jul-2026
Due Rule: Updated Rule
```

Historical compliance instances must retain the rule/version that
generated them.

This prevents a future Excel update from changing historical compliance
records.

------------------------------------------------------------------------

# 16. Stage 8 --- Applicability Engine

The applicability engine answers one question:

> **Which compliance rules apply to this entity?**

## Example

Rule:

``` text
State = Tamil Nadu
Industry Type = Factory
Entity Type = Unit
Frequency = Monthly
```

Entity:

``` text
Unit:
State = Tamil Nadu
Industry Type = Factory
Entity Type = Unit
```

Result:

``` text
Applicable = TRUE
```

Another entity:

``` text
State = Tamil Nadu
Industry Type = IT Services
Entity Type = Unit
```

Result:

``` text
Applicable = FALSE
```

------------------------------------------------------------------------

# 17. Applicability Evaluation

Run applicability evaluation when:

1.  A Unit is created.
2.  A Contractor is created.
3.  A Contractor Site is created.
4.  Entity applicability fields change.
5.  A new Compliance Master rule is activated.
6.  An existing rule's applicability changes.
7.  A rule version becomes effective.

## Important

Applicability evaluation must be deterministic and explainable.

For every generated compliance, the system should be able to answer:

``` text
Why was this compliance generated?
```

Example:

``` text
Rule: CLRA-REG-001
Entity: Chennai Contractor Site

Matched:
✓ Entity Type = Contractor Site
✓ State = Tamil Nadu
✓ Industry Type = Factory

Result:
Applicable
```

------------------------------------------------------------------------

# 18. Stage 9 --- Compliance Instance Generation

A **Compliance Rule** is the master definition.

A **Compliance Instance** is the actual obligation for a specific entity
and period.

Example:

``` text
Compliance Rule
     ↓
Monthly PF Filing
     ↓
Entity: Chennai Unit
     ↓
Period: August 2026
     ↓
Due Date: September 15, 2026
     ↓
Compliance Instance
```

## Separation

``` text
COMPLIANCE MASTER
"Monthly PF Filing"

          ↓

COMPLIANCE INSTANCES

Chennai Unit - Aug 2026
Bangalore Unit - Aug 2026
Chennai Unit - Sep 2026
Bangalore Unit - Sep 2026
```

------------------------------------------------------------------------

# 19. Recurring Compliance Generation

For monthly compliance:

``` text
Rule
Frequency = Monthly

Entity Active
      ↓
Generate current period
      ↓
Calculate due date
      ↓
Create instance
      ↓
Next period
      ↓
Generate again
```

The engine must prevent duplicate instances.

Recommended uniqueness:

``` text
Rule ID
+
Rule Version
+
Entity ID
+
Compliance Period
```

------------------------------------------------------------------------

# 20. One-Time Compliance

One-time obligations should have:

-   Rule
-   Entity
-   Trigger/event
-   Due date
-   Owner
-   Status

Example:

``` text
New establishment created
        ↓
Applicable one-time compliance found
        ↓
Generate one-time obligation
        ↓
Due date calculated
```

After completion, the same one-time obligation should not be regenerated
unless the rule explicitly allows recurrence.

------------------------------------------------------------------------

# 21. Due-Date Engine

The due-date engine converts:

``` text
Compliance Rule
+
Compliance Period
+
Entity
+
Due-Date Rule
```

into:

``` text
Actual Due Date
```

It should support the initial MVP patterns required by the Excel master,
such as:

-   Fixed day of month
-   Days after period end
-   Days before/after an event
-   Fixed annual date
-   One-time configured date

The due-date calculation must be stored on the compliance instance.

Do not recalculate historical due dates from a changed rule without an
explicit controlled action.

------------------------------------------------------------------------

# 22. Compliance Status Lifecycle

Recommended MVP lifecycle:

``` text
PENDING
   ↓
IN PROGRESS
   ↓
SUBMITTED
   ↓
UNDER REVIEW
   ↓
APPROVED
```

Correction path:

``` text
UNDER REVIEW
   ↓
CORRECTION REQUIRED
   ↓
IN PROGRESS
   ↓
SUBMITTED
```

Rejection path:

``` text
UNDER REVIEW
   ↓
REJECTED
   ↓
IN PROGRESS
```

Late states should be represented through status/flags rather than
destroying the workflow state.

Example:

``` text
Status: IN PROGRESS
Due Date: 10-Sep
Today: 15-Sep

Display:
OVERDUE — 5 days
```

------------------------------------------------------------------------

# 23. Completed Late

A completed compliance should preserve the difference between:

``` text
Completed On Time
Completed Late
```

Example:

``` text
Due Date: 10-Sep
Approved: 09-Sep

Result:
APPROVED / ON TIME
```

``` text
Due Date: 10-Sep
Approved: 15-Sep

Result:
APPROVED / COMPLETED LATE
```

This distinction is important for future compliance performance
analytics.

------------------------------------------------------------------------

# 24. Stage 10 --- Dashboard

The dashboard is the operational control center.

## MVP dashboard KPIs

At minimum:

-   Total Compliance
-   Pending
-   In Progress
-   Submitted
-   Under Review
-   Approved
-   Overdue
-   Completed Late

Optional derived metrics:

-   On-time completion rate
-   Open overdue count
-   Evidence pending count
-   Checker pending count

------------------------------------------------------------------------

# 25. Dashboard Filtering

Filters should include:

-   Date/period
-   Unit
-   Contractor
-   Contractor Site
-   State
-   Industry Type
-   Compliance Type
-   Frequency
-   Risk
-   Status

Important rule:

> Dashboard KPI numbers and compliance tables must use the same filtered
> dataset.

Example:

``` text
Filter:
Unit = Chennai
Period = August 2026

Dashboard:
Total = 120
Pending = 15
Approved = 80
Overdue = 10
```

Clicking `Overdue = 10` should open the same filtered compliance dataset
containing those 10 records.

------------------------------------------------------------------------

# 26. Stage 11 --- Compliance Worklist

Separate:

``` text
Recurring Compliance
One-Time Compliance
```

## Worklist columns

Recommended:

-   Compliance ID
-   Compliance Name
-   Entity
-   Entity Type
-   Industry Type
-   Period
-   Due Date
-   Risk
-   Status
-   Owner
-   Checker
-   Evidence
-   Days Remaining / Overdue
-   Last Updated
-   Actions

------------------------------------------------------------------------

# 27. Worklist Actions

The action menu should depend on user role and current state.

Example:

### Maker

``` text
View
Edit
Upload Evidence
Save
Submit
```

### Checker

``` text
View
Review
Approve
Reject
Request Correction
```

### Admin

``` text
View
Edit
Assign
Reassign
Override where permitted
View Audit
```

### Viewer

``` text
View
```

The frontend should hide unavailable actions, but backend authorization
remains mandatory.

------------------------------------------------------------------------

# 28. Stage 12 --- Compliance Detail Page

The detail page is the most important operational screen.

## Section 1 --- Compliance information

Show:

-   Compliance name
-   Compliance ID
-   Act
-   Section
-   Rule
-   Category
-   Entity
-   Industry Type
-   State
-   Period
-   Frequency
-   Due date
-   Risk
-   Current status

## Section 2 --- Applicability

Show:

``` text
Why this compliance applies

Entity Type       ✓
State             ✓
Industry Type     ✓
Threshold         ✓
Other condition   ✓
```

## Section 3 --- Compliance activity

Maker enters:

-   Filing/return reference
-   Date completed
-   Amount where applicable
-   Remarks
-   Required fields
-   Supporting information

## Section 4 --- Evidence

Upload:

-   Required document
-   Supporting document
-   Return copy
-   Challan
-   Register
-   Other evidence

## Section 5 --- Review

Checker sees:

-   Submitted information
-   Evidence
-   Maker
-   Submission date
-   Previous corrections
-   Comments

## Section 6 --- Audit history

Example:

``` text
27-Sep 10:02 — Created
27-Sep 10:05 — Assigned to Ravi
28-Sep 14:30 — Evidence uploaded
28-Sep 14:35 — Submitted by Ravi
29-Sep 11:20 — Correction requested by Kumar
30-Sep 09:15 — Resubmitted
30-Sep 10:00 — Approved by Kumar
```

------------------------------------------------------------------------

# 29. Stage 13 --- Maker Workflow

## Complete flow

``` text
Maker Login
   ↓
Dashboard
   ↓
My Pending Compliance
   ↓
Open Compliance
   ↓
Review requirement
   ↓
Fill details
   ↓
Upload evidence
   ↓
Validate required fields
   ↓
Save Draft
   ↓
Submit
   ↓
Status = SUBMITTED / UNDER REVIEW
```

## Submission validation

Prevent submission if:

-   Mandatory fields are missing.
-   Required document is missing.
-   Invalid values are entered.
-   User is not authorized.
-   Compliance is already approved.

------------------------------------------------------------------------

# 30. Stage 14 --- Checker Workflow

``` text
Checker Login
   ↓
Review Queue
   ↓
Open Submitted Compliance
   ↓
Review details
   ↓
Review evidence
   ↓
Review applicability
   ↓
Review comments
   ↓
Decision
```

Possible decisions:

``` text
APPROVE
REJECT
REQUEST CORRECTION
```

------------------------------------------------------------------------

# 31. Approval

When Checker approves:

``` text
Compliance
SUBMITTED
   ↓
UNDER REVIEW
   ↓
APPROVED
```

Store:

-   Approved by
-   Approved at
-   Approval comment
-   Final evidence version
-   Completion date
-   On-time/late flag

Approved records should normally become read-only except for authorized
administrative correction mechanisms.

------------------------------------------------------------------------

# 32. Request Correction

Checker can request correction.

Required:

-   Correction reason
-   Comment

Flow:

``` text
UNDER REVIEW
     ↓
CORRECTION REQUIRED
     ↓
Maker notified/informed
     ↓
Maker edits
     ↓
Maker resubmits
     ↓
UNDER REVIEW
```

Every cycle must be preserved in history.

------------------------------------------------------------------------

# 33. Rejection

If the business process requires rejection:

``` text
UNDER REVIEW
     ↓
REJECTED
```

A rejection reason is mandatory.

The system should make the next action explicit, such as:

``` text
Rejected — correction required
```

or

``` text
Rejected — compliance must be recreated
```

depending on the configured rule/workflow.

------------------------------------------------------------------------

# 34. Evidence Management in MVP

MVP needs document upload but not the full future Document Library.

## Evidence model

Each evidence file belongs to a compliance instance.

Store:

-   File name
-   File type
-   File size
-   Uploaded by
-   Uploaded at
-   Document category
-   Version
-   Status
-   Verification state

Example:

``` text
Compliance Instance
   ├── Evidence v1
   ├── Evidence v2
   └── Evidence v3
```

Do not overwrite evidence history.

------------------------------------------------------------------------

# 35. Audit Trail

Auditability is a core MVP feature.

## Audit events

Capture at minimum:

### Entity

-   Created
-   Updated
-   Activated
-   Deactivated

### User

-   Created
-   Role changed
-   Assignment changed
-   Activated/deactivated

### Compliance rule

-   Imported
-   Created
-   Updated
-   Versioned
-   Activated
-   Deactivated

### Compliance instance

-   Generated
-   Assigned
-   Status changed
-   Submitted
-   Correction requested
-   Rejected
-   Approved

### Evidence

-   Uploaded
-   Replaced/versioned
-   Deleted where allowed
-   Verified/rejected

------------------------------------------------------------------------

# 36. Audit Record Structure

Recommended:

``` text
Audit ID
Timestamp
User ID
User Name
Action
Module
Entity Type
Entity ID
Old Value
New Value
Reason/Comment
IP/Session metadata where appropriate
```

Example:

``` text
2026-09-30 10:00
Kumar
APPROVE_COMPLIANCE
Compliance
CMP-000124
Status:
UNDER_REVIEW → APPROVED
Comment:
"Evidence verified"
```

------------------------------------------------------------------------

# 37. Notifications in MVP

Keep notifications simple.

MVP can use:

-   In-app notification indicators
-   Basic task/status notifications

Avoid building a sophisticated notification/escalation platform in MVP.

Future:

``` text
Email
SMS
WhatsApp
Escalation matrix
Reminder schedules
```

------------------------------------------------------------------------

# 38. Search and Filtering

Every major table should support:

-   Search
-   Filter
-   Sort
-   Pagination
-   Reset filters

Search examples:

``` text
Compliance ID
Compliance Name
Unit Name
Contractor Name
Site Name
```

Filters should never expose records outside the user's entity scope.

------------------------------------------------------------------------

# 39. Master Data Rules

Use controlled master values for:

-   State
-   Industry Type
-   Entity Type
-   Compliance Category
-   Frequency
-   Risk
-   Status
-   User Role

Avoid storing inconsistent free text such as:

``` text
Factory
factory
FACTORY
Manufacturing Factory
```

unless intentionally mapped to the same controlled value.

------------------------------------------------------------------------

# 40. Recommended MVP Database Model

Logical model:

``` text
organizations
    │
    ├── units
    │
    ├── contractors
    │       └── contractor_sites
    │
    └── users
            └── user_entity_assignments

compliance_master
    └── compliance_rule_versions

compliance_applicability
        │
        └── entity matching

compliance_instances
        │
        ├── compliance_evidence
        │
        ├── compliance_comments
        │
        └── compliance_workflow_history

audit_logs

compliance_imports
    └── compliance_import_errors
```

------------------------------------------------------------------------

# 41. Important Data Separation

Do not combine these concepts:

### Compliance Master

What should be done?

### Compliance Instance

What needs to be done for this entity/period?

### Evidence

What proves it was done?

### Workflow History

Who submitted/reviewed/approved it?

### Audit Log

What changed in the system?

This separation will make the platform much easier to scale.

------------------------------------------------------------------------

# 42. MVP Screen Map

``` text
LOGIN
│
└── DASHBOARD
    │
    ├── Compliances
    │   ├── Recurring
    │   ├── One Time
    │   └── Compliance Detail
    │
    ├── Users
    │   ├── User List
    │   ├── Add User
    │   └── User Assignment
    │
    ├── Entity Management
    │   ├── Units / Branches
    │   ├── Contractors
    │   └── Contractor Sites
    │
    ├── Compliance Master
    │   ├── Rule List
    │   ├── Rule Detail
    │   ├── Excel Import
    │   └── Import History
    │
    └── Audit Trail
```

------------------------------------------------------------------------

# 43. MVP Navigation

Recommended:

``` text
Dashboard

Compliances
  ├── Recurring Compliance
  └── One-Time Compliance

Entity Management
  ├── Units / Branches
  ├── Contractors
  └── Contractor Sites

Users

Compliance Master
  ├── Compliance Rules
  └── Import History

Audit Trail

My Profile
Logout
```

Future modules remain hidden/disabled until implemented.

------------------------------------------------------------------------

# 44. Complete Business Flow --- Happy Path

``` text
1. Admin logs in
        ↓
2. Organization configured
        ↓
3. Unit created
        ↓
4. Industry Type selected
        ↓
5. State selected
        ↓
6. Compliance Start Date selected
        ↓
7. Users assigned
        ↓
8. Compliance Excel uploaded
        ↓
9. Excel validated
        ↓
10. Admin confirms import
        ↓
11. Rules activated
        ↓
12. Applicability engine evaluates Unit
        ↓
13. Applicable rules identified
        ↓
14. Compliance instances generated
        ↓
15. Due dates calculated
        ↓
16. Dashboard updated
        ↓
17. Maker sees pending work
        ↓
18. Maker opens compliance
        ↓
19. Maker enters required information
        ↓
20. Maker uploads evidence
        ↓
21. Maker submits
        ↓
22. Checker sees review queue
        ↓
23. Checker reviews
        ↓
24. Checker approves
        ↓
25. Compliance becomes Approved
        ↓
26. Dashboard KPI updates
        ↓
27. Audit trail records every action
```

------------------------------------------------------------------------

# 45. Complete Business Flow --- Correction Path

``` text
Maker
  ↓
Submit
  ↓
Checker
  ↓
Finds issue
  ↓
Request Correction
  ↓
Maker receives correction
  ↓
Edit compliance
  ↓
Upload corrected evidence
  ↓
Resubmit
  ↓
Checker review
  ↓
Approve
```

No history should be lost.

------------------------------------------------------------------------

# 46. Complete Business Flow --- Overdue Path

``` text
Compliance generated
      ↓
Due date approaching
      ↓
No completion
      ↓
Due date passes
      ↓
System calculates overdue days
      ↓
Status remains open
      ↓
UI displays OVERDUE
      ↓
Maker completes
      ↓
Checker approves
      ↓
Completed Late
```

------------------------------------------------------------------------

# 47. MVP State Machine

``` text
                 ┌───────────────┐
                 │     PENDING   │
                 └───────┬───────┘
                         │
                         ▼
                 ┌───────────────┐
                 │  IN_PROGRESS  │
                 └───────┬───────┘
                         │
                       Submit
                         │
                         ▼
                 ┌───────────────┐
                 │   SUBMITTED   │
                 └───────┬───────┘
                         │
                         ▼
                 ┌───────────────┐
                 │ UNDER_REVIEW  │
                 └───┬─────┬─────┘
                     │     │
              Approve│     │Correction
                     │     │
                     ▼     ▼
              ┌─────────┐ ┌─────────────────┐
              │APPROVED │ │CORRECTION_REQ. │
              └─────────┘ └────────┬────────┘
                                    │
                                    ▼
                              IN_PROGRESS

UNDER_REVIEW
     │
     └── Reject → REJECTED
```

------------------------------------------------------------------------

# 48. MVP Permissions Matrix

  Feature                Admin             Unit Admin      Maker       Checker   Viewer
  -------------------- ------- ---------------------- ---------- ------------- --------
  Dashboard                Yes                    Yes        Yes           Yes      Yes
  View compliance          Yes                    Yes        Yes           Yes      Yes
  Create Unit              Yes                 Scoped         No            No       No
  Create Contractor        Yes                 Scoped         No            No       No
  Create Site              Yes                 Scoped         No            No       No
  Manage Users             Yes                 Scoped         No            No       No
  Compliance Master        Yes   Optional scoped read         No            No     Read
  Excel Import             Yes                     No         No            No       No
  Edit Compliance          Yes                 Scoped   Assigned   Review only       No
  Upload Evidence          Yes                    Yes        Yes      Optional       No
  Submit                   Yes                    Yes        Yes            No       No
  Approve                  Yes                    Yes         No           Yes       No
  Reject                   Yes                    Yes         No           Yes       No
  Request Correction       Yes                    Yes         No           Yes       No
  Audit Trail              Yes                 Scoped        Own        Scoped     Read

The exact permission matrix should be configurable later; MVP can
implement a controlled version.

------------------------------------------------------------------------

# 49. MVP API-Level Business Areas

The API should be organized by business capability rather than by UI
screen.

``` text
/auth
/users
/organizations
/units
/contractors
/contractor-sites
/master-data
/compliance-master
/compliance-imports
/applicability
/compliance-instances
/compliance-workflow
/evidence
/dashboard
/audit
```

------------------------------------------------------------------------

# 50. Excel Import API Flow

``` text
POST /compliance-master/import/validate
        ↓
Validation Result

GET /compliance-master/import/{id}/preview
        ↓
Preview

POST /compliance-master/import/{id}/confirm
        ↓
Commit Import

GET /compliance-master/imports
        ↓
Import History
```

The validate endpoint should not modify active rules.

------------------------------------------------------------------------

# 51. Compliance Generation API Flow

``` text
Entity Created
       ↓
Applicability Evaluation
       ↓
Applicable Rules
       ↓
POST/Background Generation
       ↓
Compliance Instances
```

Generation should be idempotent.

Running the same generation process twice must not create duplicate
compliance instances.

------------------------------------------------------------------------

# 52. Dashboard Calculation Principle

Do not maintain independent manual KPI counters as the primary source.

Use compliance instances as the source of truth.

Example:

``` text
Dashboard Total
=
COUNT(compliance_instances
      WHERE user_can_access(entity)
      AND selected_filters)
```

Status counts use the same base query.

This prevents:

``` text
Dashboard says 100
Table shows 96
```

------------------------------------------------------------------------

# 53. Validation Strategy

Validation must exist at three levels:

## Frontend

For immediate user feedback.

## Backend

For authoritative business validation.

## Database

For integrity constraints and uniqueness.

Never rely only on frontend validation.

------------------------------------------------------------------------

# 54. Error Handling

User-facing errors should be meaningful.

Bad:

``` text
500 Internal Server Error
```

Better:

``` text
Compliance cannot be submitted.

Required evidence is missing:
Monthly Return Filing Proof
```

Excel errors:

``` text
Row 24
Column: Industry Type
Error: Industry Type "Factoryy" is not configured.
```

------------------------------------------------------------------------

# 55. MVP Testing Strategy

## Unit tests

Test:

-   Due-date calculations
-   Applicability rules
-   Status transitions
-   Permission checks
-   Duplicate prevention
-   Excel validation

## API tests

Test:

-   Authentication
-   Authorization
-   CRUD
-   Import
-   Generation
-   Workflow
-   Evidence upload
-   Audit logging

## UI tests

Test:

-   Login
-   Entity creation
-   Excel import
-   Compliance list
-   Detail page
-   Maker submission
-   Checker approval
-   Correction flow

## End-to-end test

The most important test:

``` text
Create Unit
→ Import Rule
→ Generate Compliance
→ Maker Submit
→ Checker Approve
→ Dashboard Updated
→ Audit Trail Complete
```

------------------------------------------------------------------------

# 56. MVP Acceptance Tests

## AC-01 Entity creation

Admin can create:

-   Unit
-   Contractor
-   Contractor Site

with mandatory validations.

## AC-02 Industry applicability

Industry Type is stored and used by applicability matching.

## AC-03 User assignment

A user sees only assigned entities.

## AC-04 Excel import

Admin can upload a predefined template and receive:

-   valid rows
-   errors
-   duplicates
-   inserts
-   updates

before confirmation.

## AC-05 Compliance generation

An active applicable rule generates the correct compliance instance.

## AC-06 Duplicate protection

Repeated generation does not create duplicate instances.

## AC-07 Due date

Generated instances contain the correct calculated due date.

## AC-08 Maker workflow

Maker can:

-   open
-   edit
-   upload
-   save
-   submit

## AC-09 Checker workflow

Checker can:

-   review
-   approve
-   reject
-   request correction

## AC-10 Authorization

Unauthorized users cannot perform restricted actions.

## AC-11 Overdue

Past-due open compliance is displayed as overdue with duration.

## AC-12 Completed late

Compliance approved after due date is identified as completed late.

## AC-13 Audit

All important changes appear in audit history.

## AC-14 Dashboard

Dashboard counts equal the filtered compliance dataset.

------------------------------------------------------------------------

# 57. MVP Development Order

The safest development order is:

## Sprint 1 --- Foundation

-   Project setup
-   Authentication
-   User model
-   RBAC
-   Application shell
-   Navigation
-   Database migrations
-   Error handling
-   Audit framework

## Sprint 2 --- Entity Management

-   Organization
-   Unit
-   Contractor
-   Contractor Site
-   Industry Type
-   State master
-   Entity relationships
-   Entity assignments

## Sprint 3 --- Compliance Master

-   Compliance schema
-   Excel template
-   Upload
-   Validation
-   Preview
-   Import
-   Update
-   Versioning
-   Import history

## Sprint 4 --- Compliance Engine

-   Applicability
-   Due-date engine
-   Recurrence
-   One-time rules
-   Instance generation
-   Duplicate protection
-   Status calculation

## Sprint 5 --- Operations

-   Dashboard
-   Recurring worklist
-   One-time worklist
-   Filters
-   Compliance detail
-   Evidence upload

## Sprint 6 --- Workflow

-   Maker submission
-   Checker review
-   Approve
-   Reject
-   Correction
-   Comments
-   Workflow history

## Sprint 7 --- Governance & QA

-   Audit trail UI
-   Permission hardening
-   Validation
-   End-to-end testing
-   Seed/demo data
-   Performance testing
-   Security review
-   MVP release

------------------------------------------------------------------------

# 58. Recommended MVP Demo Scenario

Use one controlled state and a small rule set for the first
demonstration.

Example:

``` text
Organization
└── MORAX Demo Company

Units
├── Chennai Factory
│   Industry = Factory
│   State = Tamil Nadu
│
└── Chennai Office
    Industry = IT Services
    State = Tamil Nadu

Contractor
└── ABC Facility Services

Contractor Sites
└── Chennai Factory Site
```

Import a small Compliance Master Excel containing:

``` text
Rule 1 → Factory → Tamil Nadu → Monthly
Rule 2 → IT Services → Tamil Nadu → Monthly
Rule 3 → Contractor Site → Tamil Nadu → Quarterly
Rule 4 → Unit → Tamil Nadu → One-Time
```

Then demonstrate:

``` text
Create entities
      ↓
Import rules
      ↓
Applicability
      ↓
Generated obligations
      ↓
Maker
      ↓
Evidence
      ↓
Submit
      ↓
Checker
      ↓
Approve
      ↓
Dashboard
      ↓
Audit
```

This is enough to prove the MVP concept without loading the entire
statutory universe.

------------------------------------------------------------------------

# 59. MVP Data Lifecycle

``` text
MASTER DATA
   ↓
COMPLIANCE RULE
   ↓
APPLICABILITY
   ↓
COMPLIANCE INSTANCE
   ↓
ASSIGNMENT
   ↓
WORK
   ↓
EVIDENCE
   ↓
SUBMISSION
   ↓
REVIEW
   ↓
DECISION
   ↓
STATUS
   ↓
DASHBOARD
   ↓
AUDIT
```

This lifecycle should be treated as the central architecture of MORAX.

------------------------------------------------------------------------

# 60. Critical Design Decisions

## Decision 1 --- Excel is not the runtime database

Use:

``` text
Excel
  ↓
Import
  ↓
Database
  ↓
Application
```

Not:

``` text
Application
  ↓
Read Excel every time
```

## Decision 2 --- Compliance Rule ≠ Compliance Instance

Keep them separate.

## Decision 3 --- Industry Type is a first-class applicability parameter

It belongs in Unit/Branch and Contractor Site configuration and in the
Compliance Master.

## Decision 4 --- Version compliance rules

Never destroy historical regulatory configuration.

## Decision 5 --- Audit every important transition

The system must be able to reconstruct what happened.

## Decision 6 --- Backend authorization is mandatory

Frontend hiding is not security.

## Decision 7 --- Generation must be idempotent

A scheduled/manual regeneration must not duplicate obligations.

------------------------------------------------------------------------

# 61. MVP Product Flow in One Page

``` text
                         MORAX ADMIN
                              │
                              ▼
                    ORGANIZATION SETUP
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
           UNIT          CONTRACTOR       USERS/RBAC
             │                │
             ▼                ▼
      INDUSTRY TYPE     CONTRACTOR SITE
             │                │
             └────────┬───────┘
                      ▼
              COMPLIANCE MASTER
                      ▲
                      │
              Excel Upload/Import
                      │
                      ▼
              VALIDATE + PREVIEW
                      │
                      ▼
                   IMPORT
                      │
                      ▼
              APPLICABILITY ENGINE
                      │
                      ▼
             COMPLIANCE INSTANCES
                      │
              ┌───────┴────────┐
              ▼                ▼
          RECURRING          ONE-TIME
              │                │
              └───────┬────────┘
                      ▼
                  DASHBOARD
                      │
                      ▼
                  WORKLIST
                      │
                      ▼
                    MAKER
                      │
            Details + Evidence
                      │
                    Submit
                      │
                      ▼
                  CHECKER
                      │
           ┌──────────┼──────────┐
           ▼          ▼          ▼
        APPROVE     REJECT    CORRECTION
           │                     │
           ▼                     ▼
       COMPLETED             MAKER EDIT
                                 │
                               RESUBMIT
                                 │
                                 └──→ CHECKER
                      │
                      ▼
                 AUDIT TRAIL
```

------------------------------------------------------------------------

# 62. Definition of MVP Done

The MORAX MVP is ready for pilot use when the following statement is
true:

> A new customer can be onboarded without developer intervention for
> normal master-data setup; a compliance administrator can import a
> predefined Excel Compliance Master; the system can determine
> applicable rules based on entity attributes including Industry Type
> and State; the system can generate recurring and one-time obligations
> with due dates; a Maker can complete and submit evidence; a Checker
> can review and approve/reject/request correction; the dashboard
> reflects the real state of compliance; and the complete lifecycle is
> auditable.

------------------------------------------------------------------------

# 63. Phase 2 Boundary

After MVP is stable, build:

1.  License Management
2.  Notice Management
3.  Document Library
4.  Digital Library
5.  Government Notifications
6.  Advanced Reports
7.  PDF Reporting
8.  Email reminders
9.  Escalation workflows
10. Bulk imports
11. Advanced analytics

------------------------------------------------------------------------

# 64. Phase 3 Boundary

Later:

1.  Government notification ingestion
2.  Regulatory change detection
3.  Rule impact analysis
4.  Advanced analytics
5.  External HR/payroll integrations
6.  Customer integrations
7.  Advanced automation
8.  AI-assisted compliance operations

------------------------------------------------------------------------

# 65. Final MVP Principle

The MVP should not try to solve every labour-law problem.

It should solve one problem extremely well:

> **"For every configured entity, show me what compliance is applicable,
> when it is due, who must complete it, what evidence is required,
> whether it has been submitted/approved, and who changed what."**

If that lifecycle works reliably, MORAX has a strong foundation for the
larger compliance platform.
