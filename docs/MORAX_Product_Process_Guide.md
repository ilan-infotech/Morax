# MORAX Labour Compliance MVP - Product Process Guide

## Purpose

This guide explains how a team uses MORAX from initial company setup through compliance completion. It is intended for a new customer, operations team, implementation partner, or internal administrator.

MORAX is a labour-compliance workflow and auditability product. It helps a company configure its entities, define approved compliance requirements, assign responsibility, collect evidence, review work, and report outcomes.

MORAX does not decide legal applicability or invent due dates. The configured Compliance Master is the source of truth for the rules, versions, timing, risk level, and evidence requirements used by the product.

## The product in one view

~~~
Set up company and entities
        |
Create users and grant limited access
        |
Configure or import Compliance Master rules
        |
Generate compliance obligations
        |
Assign a Maker and Checker
        |
Maker prepares filing details and evidence
        |
Checker verifies and decides
        |
Dashboard, reports, documents, and audit trail update
~~~

## Who uses MORAX

| Role | Main responsibility |
| --- | --- |
| MORAX Admin / Super Admin | Owns the company workspace, users, entities, rule setup, obligation generation, and governance. |
| Unit Admin / Contractor Admin | Manages permitted entities and supervises compliance within the assigned scope. |
| Maker | Prepares filing details, uploads evidence, and submits work for review. |
| Checker | Verifies evidence and approves, rejects, or requests correction for assigned work. |
| Viewer | Views information in the assigned scope but cannot change operational data. |

Every user also has an entity scope. A role alone is not enough.

- Organization scope grants access across the company.
- Unit scope limits access to a Unit.
- Contractor scope limits access to a Contractor and its associated Sites.
- Contractor Site scope limits access to a specific Site.

For a compliance item to be submitted or reviewed, a non-administrator must also be assigned to that specific item as its Maker or Checker.

## Main navigation

| Screen | Use it for |
| --- | --- |
| Dashboard | Daily overview of due, overdue, in-progress, and completed work. |
| Recurring | Recurring worklists, such as monthly, quarterly, and annual work. |
| One-time | One-time compliance worklists. |
| Units | Employer, establishment, factory, branch, or other Unit records. |
| Contractors | Contractor records, including their parent Unit where relevant. |
| Sites | Contractor work-site records. |
| Users & access | User accounts, roles, and Organization/Unit/Contractor/Site scopes. |
| Compliance Master | Rule versions, Excel import, and obligation generation. |
| Document library | Search, download, and manage uploaded evidence. |
| Notifications | Workflow alerts for the signed-in user. |
| Reports | Summaries and CSV downloads. |
| Audit trail | Material product activity. |
| Settings | Organization profile and password change. |

## Process 1 - Initial company setup

This process is normally completed by a MORAX Admin before the operational team begins work.

### Review the organization profile

1. Sign in as an administrator.
2. Open Settings.
3. Complete organization name, legal name, company code, contact details, identifiers, address, compliance-start date, and status.
4. Select Save organization.

The organization is the company boundary in MORAX. Users, entities, rules, documents, and audit records belong to this organization.

### Create Units

A Unit represents the employer or establishment for which compliance may apply. It can be a factory, branch, office, establishment, or project unit.

1. Open Units.
2. Leave Existing record as New record.
3. Enter the Unit name and code.
4. Select State and Industry type.
5. Enter the compliance-start date.
6. Add location, registration, identifier, employee-count, and applicable-regulation details as needed.
7. Select Add entity. 

To edit a Unit, select it in Existing record, make changes, and choose Save changes.

### Create Contractors and Sites

Use Contractors for external labour providers. Use Sites for locations operated by a Contractor.

1. Open Contractors and add the contractor details.
2. Choose a Parent Unit where applicable.
3. Add contact, location, registration, worker-count, and compliance-start information.
4. Open Sites.
5. Select the Contractor and, where relevant, the linked Unit.
6. Enter the Site information and select Add entity.

The normal hierarchy is:

~~~
Organization
  -> Unit
       -> Contractor
            -> Contractor Site
~~~

Not every organization needs every level. A Compliance Master rule specifies its entity type.

## Process 2 - Create users and control access

### Create a user account

1. Open Users & access.
2. In Create user, enter the name, email, optional mobile number, and initial password.
3. Select Create user.

### Give the user a role and scope

1. In Role scopes, choose the user.
2. Select Add role scope.
3. Choose the role.
4. Choose the scope type: Organization, Unit, Contractor, or Contractor Site.
5. Select the matching scope record.
6. Add more scope rows if the user needs more responsibilities.
7. Select Save all scopes.

Important: Save all scopes replaces the selected user's complete existing scope list. Review all rows before saving.

### Recommended separation of duties

| Person | Role | Scope |
| --- | --- | --- |
| Compliance Manager | MORAX Admin or Unit Admin | Organization or relevant Unit |
| Compliance Maker | Unit Maker or Contractor Maker | Relevant Unit, Contractor, or Site |
| Compliance Checker | Unit Checker or Contractor Checker | Same relevant scope as the Maker |

The Maker and Checker should be different people. MORAX prevents a user from approving or rejecting their own submission.

## Process 3 - Configure the Compliance Master

The Compliance Master defines what MORAX should manage. Rule content should be prepared and approved by the team responsible for the company's compliance requirements.

### What a rule contains

A rule version can include:

- Compliance ID and name
- Version number and effective dates
- Entity type: Unit, Contractor, or Contractor Site
- State and Industry applicability
- Frequency
- Due-date method, due-day/offset, anchor, and grace days
- Risk level
- Required evidence
- Act, rule reference, section, form number, legal description, and consequence notes

### Create a rule manually

1. Open Compliance Master.
2. Complete Add rule version.
3. Use a stable Compliance ID for the requirement.
4. Increase the version for a changed rule instead of overwriting an old version.
5. Set Effective from and, when superseded, Effective to.
6. Select Save rule version.

### Choose a due-date method carefully

| Method | Use when |
| --- | --- |
| FIXED_DAY_OF_MONTH | A regular period is due on a fixed calendar day. |
| DAYS_AFTER_PERIOD_END | The due date is a configured number of days after a period ends. |
| FIXED_ANNUAL_DATE | An annual obligation has a configured month/day anchor. |
| ONE_TIME_CONFIGURED_DATE | A one-time obligation has an explicit configured ISO date anchor. |
| MANUAL | The requirement is retained for reference but has no automatic schedule. |

Only configure approved legal timing. A MANUAL rule is intentionally not generated into operational work because MORAX must not create an assumed legal due date.

### Import the master from Excel

1. Open Compliance Master.
2. Select Download Excel template if a template is needed.
3. Choose the completed xlsx workbook.
4. Select Validate workbook.
5. Review valid rows, errors, and warnings.
6. Correct the workbook when there are errors.
7. Select Confirm import only after review.

The import stores versions. Re-importing an already confirmed version is skipped rather than duplicated.

## Process 4 - Generate compliance obligations

After entity and rule setup, generate the operational work.

1. Open Compliance Master.
2. In Generate obligations, optionally select a subject type and a specific Unit, Contractor, or Site.
3. Select the as-of date.
4. Select Run generation.

MORAX evaluates:

~~~
Active rule version
  + effective date
  + entity type
  + State and Industry criteria
  + entity compliance-start date
  + configured schedule
  = generated compliance obligation
~~~

The result appears in Recurring or One-time, depending on the configured frequency.

Generation is safe to run again. MORAX avoids duplicates for the same rule version, entity, period, and occurrence.

## Process 5 - Assign responsibility

An administrator or manager assigns responsibility at the individual compliance-item level.

1. Open Recurring or One-time.
2. Use search and filters to locate the obligation.
3. Select Open.
4. In Assignments, select the Maker and choose Save Maker.
5. Select the Checker and choose Save Checker.
6. Confirm both names appear as the current assignments.

Assignment changes are recorded in the compliance history and audit trail.

## Process 6 - Maker prepares and submits

The Maker performs the operational work.

1. Sign in as the assigned Maker.
2. Open Recurring or One-time and select the assigned item.
3. In Maker activity, enter the filing/reference number, completion date, amount where relevant, and remarks.
4. Select Save draft.
5. In Evidence, select an evidence category and upload the required file.
6. Review the uploaded file name and version.
7. Select Submit for review.

When required evidence is configured, MORAX blocks submission until active evidence exists. MORAX also requires a filing/reference number before submission.

After submission:

- The item becomes pending approval.
- The assigned Checker receives a notification.
- The Maker cannot edit activity or evidence until the item is returned for correction or rejected.
- The action is added to history and audit records.

## Process 7 - Checker verifies and decides

The Checker reviews the Maker's submission independently.

1. Sign in as the assigned Checker.
2. Open Notifications and select Open on the pending-approval item, or locate it in the worklist.
3. In Evidence, download and inspect the uploaded document.
4. Select Verify when evidence is acceptable.
5. If evidence is not acceptable, enter a reason and select Reject evidence.
6. In Workflow, enter a decision comment.
7. Select Begin review.
8. Choose Approve, Request correction, or Reject.

Approval is blocked if the rule requires evidence and no evidence has been verified.

| Decision | Result |
| --- | --- |
| Approve | The obligation is completed. MORAX evaluates whether it was completed late using the configured due date. |
| Request correction | The item returns to the Maker. The Maker receives a notification. |
| Reject | The item is rejected. The Maker receives the decision comment in a notification. |
| Reject evidence | The evidence stays visible with its rejection state and reason. The Maker corrects the evidence before successful approval. |

## Process 8 - Correction and resubmission

When a Checker requests correction or rejects an item:

1. The Maker signs in and opens Notifications.
2. The Maker opens the referenced compliance item.
3. The Maker updates activity details, filing reference, remarks, or evidence.
4. The Maker submits again.
5. The Checker reviews the revised submission and makes a new decision.

Every workflow transition is stored in History. A new upload in the same evidence category becomes a new evidence version; it does not silently replace an earlier file.

## Process 9 - Monitor, report, and audit

### Daily work monitoring

Use Dashboard for an overview of:

- Total accessible obligations
- Pending work
- Work in progress
- Work under review
- Overdue work
- Completed-late work

Use Recurring and One-time for daily queues. Filter by status, risk, entity type, or search text.

### Document Library

Use Document library to:

- Search evidence by file name
- Filter by entity type
- Download files
- Open the related workflow item
- Delete a document when authorized

Document deletion is restricted to managers and is audit logged.

### Reports

Reports provides:

- Status summary
- Frequency summary
- Entity compliance summary
- Compliance-status CSV
- Overdue-compliance CSV
- Completion CSV
- Entity-compliance CSV

Reports only contain data within the signed-in user's authorized scope.

### Audit trail

Audit trail records material actions such as:

- Entity creation and updates
- User, role, and scope changes
- Rule creation and import confirmation
- Obligation generation
- Maker/Checker assignment
- Evidence upload, verification, and deletion
- Submission, review, approval, rejection, and correction

## Status lifecycle

~~~
PENDING
  -> Maker starts work
IN_PROGRESS
  -> Maker submits
SUBMITTED
  -> Checker begins review
UNDER_REVIEW
  -> Approve             -> APPROVED
  -> Request correction  -> CORRECTION_REQUIRED -> Maker updates and resubmits
  -> Reject              -> REJECTED -> Maker updates and resubmits

Manager can mark an eligible unfinished item as NOT_APPLICABLE with a reason.
~~~

In worklists, MORAX presents practical labels such as Due, Overdue, Pending for Approval, Completed, Completed Late, Not Applicable, and Rejected by Checker.

## Controls that protect the process

| Control | Why it matters |
| --- | --- |
| Organization boundary | A user cannot access another company's data. |
| Role and entity scope | A user sees and acts only within authorized entities. |
| Maker/Checker assignment | A non-administrator must be assigned to the specific item. |
| Segregation of duties | A Maker cannot approve or reject their own submission. |
| Required-evidence verification | Approval is blocked until required evidence is verified. |
| Rule versioning | Older obligations retain the rule snapshot that applied when generated. |
| Duplicate prevention | Re-running generation does not create the same operational item twice. |
| File checksum and evidence versions | Uploaded evidence is traceable and versioned. |
| Audit trail | Material changes are recorded with actor, action, and timing. |

## Recommended operating rhythm

| Frequency | Team activity |
| --- | --- |
| Daily | Makers review due work; Checkers review submissions and notifications. |
| Weekly | Managers review overdue and correction-required items. |
| Monthly | Review dashboard, exports, unresolved obligations, and rule changes. |
| When law or process changes | Create a new Compliance Master version with approved effective dates. |
| Before access changes | Review roles and scopes; remove access no longer required. |

## New-team quick-start checklist

1. Sign in as the administrator.
2. Complete organization settings.
3. Create a Unit.
4. Create a Maker and Checker.
5. Give both the correct role and Unit scope.
6. Create a test Compliance Master rule with a configured schedule and required evidence.
7. Generate an obligation.
8. Assign the Maker and Checker from the compliance detail screen.
9. Complete the Maker submission.
10. Verify and approve it as the Checker.
11. Confirm the result in Dashboard, Reports, Document library, Notifications, and Audit trail.

## Important MVP boundaries

- MORAX is not legal advice and does not infer labour-law requirements without approved Compliance Master configuration.
- SQLite is appropriate for the local MVP. A production rollout requires an operational database, backups, secret management, HTTPS, and retention-policy review.
- The customer remains responsible for approved Compliance Master content, evidence quality, and business decisions.
- The audit trail supports traceability; it does not replace a formal records-retention, e-signature, or statutory filing system.

## How to report a validation issue

When reporting an issue, capture:

1. Signed-in user and assigned role.
2. Screen name and compliance ID.
3. Action attempted.
4. Exact error message or screenshot.
5. Expected result and actual result.

This allows the support or implementation team to quickly distinguish a configuration issue, permission restriction, workflow-state restriction, or application defect.

