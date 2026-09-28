# MORAX MVP User Guide and Validation Script

This guide describes the features currently available in the MORAX Labour Compliance MVP and provides a repeatable end-to-end validation flow.

The MVP is a compliance workflow system. It does not decide labour-law applicability by itself: compliance requirements, frequencies, due dates, and evidence requirements must be configured in the Compliance Master.

## 1. Start the application

Open two PowerShell terminals.

### Backend

```powershell
cd E:\mora\morax
.\.venv\Scripts\Activate.ps1
cd backend
python -m alembic upgrade head
python seed.py
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If port `8000` is unavailable, choose a free port such as `8010` and set the frontend API URL to match it. Do not run two backend servers on the same port.

The API documentation is available at:

`http://127.0.0.1:8000/docs`

### Frontend

```powershell
cd E:\mora\morax\frontend
npm install
npm run dev
```

Open the URL Vite prints, normally `http://localhost:5173`.

If you use `http://127.0.0.1:5173` instead, it is also allowed by the default backend CORS configuration. If the frontend runs on a different host or port, add that exact origin to `CORS_ORIGINS` in `backend/.env`, then restart the backend.

## 2. Sign in

After running `seed.py`, use the bootstrap administrator account:

| Field | Value |
| --- | --- |
| Email | `admin@morax.example.com` |
| Password | `Admin@123` |

Use this account only for local MVP validation. Change the bootstrap password before any non-local deployment.

An initial `GET /api/v1/auth/me` returning `401 Unauthorized` before sign-in is normal. It means the browser has not yet sent a valid access token.

## 3. What each area does

| Menu | Purpose |
| --- | --- |
| Dashboard | Due, overdue, pending-approval, and completed compliance summary. |
| Recurring | Worklist for recurring compliance obligations. |
| One-time | Worklist for one-time obligations. |
| Units | Employer / establishment master records. |
| Contractors | Contractor master records. |
| Sites | Contractor-site master records. |
| Users | User creation and role + Unit-scope assignment. |
| Compliance Master | Rule creation, Excel import, and obligation generation. |
| Document library | Evidence search, download, and administrator deletion. |
| Reports | Summary cards and CSV export. |
| Audit | Immutable activity trail for the currently accessible scope. |

## 4. Recommended end-to-end validation

Run the following in order. It proves the main MVP path from setup through review and reporting.

### Step 1 — Create operational entities

1. Sign in as the administrator.
2. Open **Units** and create a unit, for example:
   - Name: `MORAX Chennai Unit`
   - Code: `CHN-001`
   - State: `Tamil Nadu`
   - Industry: choose a relevant configured industry
   - Compliance start: today or an earlier date
3. Open **Contractors** and create a contractor, for example `ABC Labour Services`.
4. Open **Sites** and create a site, selecting the contractor created above.

Open each record again in its respective list to confirm that it appears. The state, industry, and compliance-start date determine whether a rule applies and can be generated.

### Step 2 — Create workflow users and give them access

1. Open **Users**.
2. Create a Maker, for example:
   - Name: `Unit Maker`
   - Email: `maker@example.com`
   - Password: a temporary local test password
3. Use **Assign role and Unit scope** to select that user, select `UNIT_MAKER`, select `MORAX Chennai Unit`, and save.
4. Create a Checker, for example `checker@example.com`.
5. Assign `CONTRACTOR_CHECKER` (or `UNIT_CHECKER` where shown in your role list) and the same Unit scope.

The scope assignment screen replaces that user's existing scopes. If a user needs multiple scopes, use the API documentation endpoint described in [Step 5](#step-5--assign-the-maker-and-checker-to-the-obligation) with the complete desired list.

### Step 3 — Create a compliance rule

1. Open **Compliance Master**.
2. In **Create rule version**, create a test rule such as:
   - Compliance ID: `TEST-MONTHLY-001`
   - Compliance name: `Monthly test return`
   - Entity type: `UNIT`
   - State and industry: match the Unit
   - Frequency: `MONTHLY`
   - Due-date method: fixed day of month
   - Due day: `15`
   - Effective date: today or an earlier date
   - Required evidence: enabled
3. Save the rule.

For an immediate test, set the **as-of date** in the past or use a due day that falls in the selected period. The resulting due date must be supplied by the rule configuration; do not treat a test rule as legal compliance advice.

### Step 4 — Generate obligations

1. In **Compliance Master**, choose the Unit as the subject.
2. Set an as-of date in the applicable period.
3. Select **Run generation**.
4. Open **Recurring** and locate `TEST-MONTHLY-001`.
5. Open its detail page and confirm the rule version, due date, entity, evidence requirement, and initial status.

Generation is safe to run again. It avoids creating duplicate obligations for the same rule, entity, and period.

### Step 5 — Assign the Maker and Checker to the obligation

1. As the administrator, open the newly generated obligation in **Recurring**.
2. In the **Assignments** panel, select the Maker and choose **Save Maker**.
3. Select the Checker and choose **Save Checker**.
4. Confirm that both names appear below the controls.

The assignment is recorded in the audit trail. An administrator may complete the workflow directly for smoke testing, but using separate Maker and Checker accounts validates the intended segregation of duties.

### Step 6 — Maker submits evidence

1. Sign out and sign in as the Maker.
2. Open **Recurring**, then the assigned obligation.
3. Add an activity update and save it. The status becomes in progress where appropriate.
4. Upload a small non-sensitive test document in the evidence area. Allowed types and size are controlled by backend configuration.
5. Enter the filing/reference number requested by the form.
6. Select **Submit for review**.

Expected result: the instance becomes **Pending for approval**, an evidence record is stored with a checksum, the Checker receives an in-app notification through the API, and audit entries are created.

If submission is blocked, check that:

- The user has a Maker role and a scope covering the entity.
- The user has an active `MAKER` assignment for that instance.
- A filing/reference number was entered.
- Each required evidence category has an uploaded document.

### Step 7 — Checker verifies evidence and approves

Evidence must be verified before approval when the rule requires documents.

1. Sign in as the Checker.
2. Open **Notifications**, select the pending-approval notification, then choose **Open**; or locate the obligation in **Recurring**.
3. In the **Evidence** panel, download and inspect the test document.
4. Select **Verify**. If rejecting evidence, enter the reason first and select **Reject evidence**.
5. In **Workflow**, select **Begin review**.
6. Select **Approve** and provide a review remark.

Expected result: the instance is completed, its completion state is evaluated against the configured due date, the approval is audit logged, and the document remains downloadable in **Document library**.

To test the exception path instead, choose **Send for correction** or **Reject**. A rejection/correction reason is required and the active Maker receives a notification through the API.

The same user cannot submit and approve/reject the same submission.

### Step 8 — Validate dashboards, reports, documents, and audit trail

1. Sign back in as the administrator.
2. Open **Dashboard** and confirm the count has moved to completed (or completed late, depending on the due date).
3. Open **Reports**:
   - Confirm status, frequency, and entity summaries.
   - Download the compliance-status CSV.
4. Open **Document library**:
   - Search for the rule, Unit, or file name.
   - Download the uploaded test evidence.
   - As an administrator, confirm delete is available. Do not delete the evidence until you have reviewed the audit trail.
5. Open **Audit** and confirm events for entity creation, rule creation, generation, assignment, upload, submission, verification, and approval.

## 5. Compliance Master Excel validation

The supplied file, `docs/construction_industry_compliance_sample.xlsx`, can be used to test the import process.

1. Open **Compliance Master**.
2. Select the Excel file and choose **Validate import**.
3. Review the preview, errors, and warnings.
4. Select **Confirm import** only after review.

The construction sample contains records whose periodicity/due-date information is not sufficiently configured to calculate dates. MORAX imports them as `MANUAL` schedule records for governance and history, but deliberately does **not** generate obligations from them. Configure an approved due-date method, timing, and effective version before using those records operationally.

The import process preserves rule identity and versions. Re-importing an already confirmed rule version is skipped rather than duplicated.

## 6. RBAC validation matrix

Use separate browser profiles, incognito windows, or sign out between checks.

| Test | Expected result |
| --- | --- |
| Administrator creates entities, users, rules, and runs generation | Allowed within the organization. |
| Unit Maker updates and submits an assigned Unit obligation | Allowed when scope and assignment both match. |
| Unit Maker tries to approve | Denied. |
| Checker begins review and approves an assigned submission | Allowed after required evidence is verified. |
| Checker tries to approve their own submission | Denied. |
| Viewer attempts to create a rule, edit an entity, or upload evidence | Denied. |
| User outside the Unit scope requests the obligation | Denied or absent from results. |
| Inactive user attempts sign-in | Denied. |
| Administrator marks an instance not applicable | Allowed only with a reason; an approved item cannot be changed this way. |

For direct API checks, a `403` response usually means a role, scope, workflow assignment, or workflow-state restriction is working as intended. A `401` response means the token is absent, expired, or invalid.

## 7. Current MVP boundaries

These are known product/UI boundaries, not workarounds for legal compliance:

- Compliance applicability and due dates come only from configured Compliance Master records. MORAX does not infer legal rules.
- The web UI currently exposes Unit-scoped role assignment. Broader organization, contractor, and site scopes are available through the user role-scope API.
- Maker/Checker assignment, evidence verification, comments, and notifications are available in the compliance workflow screens. API documentation remains available for technical diagnostics only.
- The MVP has protected uploads and audit events, but it is not a replacement for a formal records-retention, e-signature, or legal-advice system.
- SQLite is suitable for this local MVP. A shared production deployment needs an operational database, backups, secret management, HTTPS, and a reviewed retention policy.

## 8. Quick pass/fail checklist

| # | Validation | Pass criteria |
| --- | --- | --- |
| 1 | Administrator login | Dashboard loads. |
| 2 | Unit, contractor, and site creation | Records appear in their lists. |
| 3 | Maker and Checker setup | Users have the correct role and Unit scope. |
| 4 | Rule creation | Versioned rule appears in Compliance Master. |
| 5 | Generation | One matching obligation appears; rerun does not duplicate it. |
| 6 | Assignment | Maker and Checker assignments save through API. |
| 7 | Maker submission | Required evidence and filing reference are enforced. |
| 8 | Checker verification/approval | Evidence is verified; approval completes the obligation. |
| 9 | Reporting | Dashboard and CSV reflect resulting status. |
| 10 | Audit | Every material action is visible in Audit. |
| 11 | Authorization | Maker/Viewer/self-approval restrictions are denied. |

## 9. Troubleshooting

| Symptom | Check |
| --- | --- |
| `WinError 10013` when starting Uvicorn | Port is reserved/blocked or already used. Try `--port 8010`; update the frontend API URL if required. |
| Browser says `Failed to fetch` or shows a CORS error | Confirm backend is running, API port matches frontend configuration, and the browser origin is included in `CORS_ORIGINS`. Restart backend after editing `.env`. |
| Repeated `401 /auth/me` before login | Expected until a valid login token exists. |
| No generated obligation | Check entity type, state/industry match, active/effective rule version, compliance start date, as-of date, and that due-date method is not `MANUAL`. |
| Maker cannot submit | Check role scope, active Maker assignment, filing reference, and required evidence. |
| Checker cannot approve | Verify evidence first and confirm a different user submitted the latest submission. |
| Rule import does not generate work | Complete its approved scheduling configuration; manual rules intentionally do not generate due dates. |
