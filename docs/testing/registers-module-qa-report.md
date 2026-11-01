# MORAX Registers Module — QA execution report

**Date:** 2026-10-27  
**Environment:** isolated in-memory SQLite test schemas and temporary upload directories; no production data used.  
**Scope:** existing Registers module only, plus application regression affected by shared routing, access control, notification, audit, and compliance-evidence code.

## Audit inventory

| Area | Implemented and connected | Audit result |
| --- | --- | --- |
| Navigation | `RegistersManager`, role-filtered sidebar group, protected React route | Connected; direct route remains protected by the backend API permissions. |
| Core data | Employee, attendance, payroll, upload batch, mapping, template/version, generated register, workflow history, and compliance-link models | Tenant/entity indexes and unique keys exist in migration `0023`. |
| Excel | XLSX-only upload, header aliases, saved mapping profiles, validation report, source batch import | No arbitrary transformation scripting. Formula source text is neutralized before persistence/export. |
| Generation | R01–R06 data-driven output; R07–R10 deliberately require unavailable additional source datasets | Correctly blocks missing operational data rather than fabricating it. |
| Workflow | submit, Checker review, reject remarks, row-version conflict check, immutable approved output, corrected revision creation | Connected to existing notification and audit services. |
| Evidence | approved register can be linked to same-org, same-entity, same-period compliance evidence without completing compliance | Explicit linking is implemented; automatic Compliance Master mappings are not. |
| Dashboard | authorized summary/status/trend/entity endpoints and derived table filters | Server applies entity authorization; pending-generation/validation rows are represented as non-previewable operational rows. |
| Security | trusted active organization, subject authorization, payroll-detail role restriction, private uploads | Verified by targeted integration tests below. |

## Confirmed defects fixed during this cycle

| ID | Severity | Scenario / root cause | Fix | Retest |
| --- | --- | --- | --- | --- |
| REG-001 | P1 | Every upload failed: audit log was created before `RegisterUploadBatch` had an ID. | Flush batch before audit event. | Passed upload/import integration. |
| REG-002 | P1 | Compliance evidence linking failed: audit log was created before `RegisterComplianceLink` had an ID. | Flush link before audit event. | Passed approved-register link integration. |
| REG-003 | P1 | Corrected datasets could not create a new revision after approval. | Allow a new version after approval; preserve the approved record/status and content. | Passed revision/history integration. |
| REG-004 | P2 | Formula cells were read with `data_only=True`, silently becoming `None` when no cached value existed. | Read formula tokens and neutralize them with a leading apostrophe before storage/export. | Passed formula regression test. |

## Automated tests executed

| Test ID | Module / scenario | Result |
| --- | --- | --- |
| REG-INT-01 | Synthetic employee, attendance, payroll upload → validation → import → R01–R06 generation → XLSX/PDF output | Passed |
| REG-INT-02 | Employee correction, data-derived attendance totals, readiness, dashboard/derived filters | Passed |
| REG-INT-03 | Maker submit → Checker approve; stale concurrent decision rejected | Passed |
| REG-INT-04 | Approved register → same entity/period compliance evidence link; compliance remains pending | Passed |
| REG-INT-05 | Corrected payroll → R04 version 2; previously approved version remains approved | Passed |
| REG-SEC-01 | Invalid/duplicate/unknown attendance blocked; malformed workbook rejected | Passed |
| REG-SEC-02 | Unit A1 Maker denied Unit A2; Organization B denied Organization A | Passed |
| REG-SEC-03 | Auditor denied payroll detail; formula input neutralized | Passed |
| REG-NOT-01 | Seven-day register reminder is idempotent | Passed |
| REG-WF-01 | Derived overdue/generated filters, self-review denial, workflow history | Passed |
| APP-REG-01 | Existing MORAX suite | **28/28 passed** |
| MIG-REG-01 | Isolated Alembic upgrade through `0023_statutory_registers` | Passed |
| PERF-REG-01 | Parse + validate synthetic 1,000-employee workbook | Passed: 1,000 rows, 0 issues, **0.0407 s** baseline |

Commands executed:

```text
python -m pytest tests/test_registers_integration.py tests/test_registers_workflow.py -q --durations=10
python -m pytest -q
npm run build
alembic upgrade head   # isolated database copy
```

Final automated suite result: **28 passed**. The suite emitted 38 OpenPyXL UTC deprecation warnings during register integration tests; they do not indicate a failing test but should be addressed in a dependency/utility maintenance pass.

## Synthetic fixtures

`backend/tests/fixtures/registers/generate_fixtures.py` generates reusable non-production workbooks:

- valid employee, attendance, and payroll inputs;
- duplicate/invalid attendance;
- incorrect payroll totals;
- formula input and headers-only input;
- 1, 10, 100, and 1,000 employee fixtures.

## Coverage blocked or not executed

The following are **not passed** and prevent a production-readiness declaration:

1. Browser-driven E2E role/device checks: no repository Playwright/Cypress test configuration, authenticated browser fixture, or test deployment route is configured.
2. 5,000 and 10,000 employee upload/generation/export load tests: no project performance thresholds or isolated performance database capacity are configured. Only the 1,000-row parser/validator baseline was measured.
3. Real database/file-storage outage, timeout, and restart recovery injection: no controllable fault-injection environment is configured.
4. Full statutory legal-format validation for a jurisdiction/effective period: MORAX templates are operational templates and have not been independently verified as prescribed legal forms.
5. R07–R10 generation: correctly blocked until leave-balance, advance, fine, and damage/loss transaction data sources are implemented/configured.
6. Automatic Compliance Master register mapping and auto-link: not implemented; current evidence link is an explicit authorized action.
7. Full template designer capabilities (clone, column reorder UI, effective-date editing, deactivate flow) are not yet implemented.
8. Complete UI click-through for all metric cards/charts, mobile layout, session expiry, browser history, and screen-reader behavior remains unexecuted.

## Production-readiness decision

**Not production-ready yet.** No unresolved P0/P1 defect was found in the automated scopes executed after fixes, but the blocked E2E, large-volume, fault-recovery, legal-format, automatic mapping, and full template-administration coverage above are required before production approval.

The implementation is suitable for continued isolated development/QA only until those gates are completed.
