# License Management Module — implementation evidence

Date: 31 October 2026

## Delivered

- Tenant-scoped License Management data model and Alembic migration `0024_license_management`.
- License Type master seeded per organization with configurable entity applicability, reminder defaults, activation, and API support for create/update.
- License register APIs for filtered, paginated listing; dashboard totals; create, update, archive, restore, and details.
- Backend-derived validity states: `ACTIVE`, `EXPIRING_SOON`, `EXPIRED`, and `ARCHIVED`. Renewal state remains separate (`NOT_STARTED`, `IN_PROGRESS`, `RENEWED`).
- Private, versioned document upload/download. The endpoint enforces permitted extensions, 10 MB configured storage limit, and basic PDF/PNG/JPEG/DOC/DOCX file-signature validation before storage.
- Renewal initiation/completion with optimistic row versions and immutable renewal history.
- Explicit License Type → Compliance Rule Version mapping. Matching licenses link to matching entity compliance instances without changing the compliance workflow status.
- Idempotent expiry reminders at 90, 60, 30, 15, 7, 1, 0, and overdue days through the existing notification service.
- One direct **Licenses** sidebar item (no expandable License Management group), dashboard cards, status filters, entity performance, add/edit form, compact details dialog, document controls, renewal controls, and archive/restore.
- Role permissions and trusted entity authorization for API operations. Payroll/register permissions were not reused for license writes.

## Defects resolved

| ID | Severity | Finding | Resolution |
|---|---:|---|---|
| LIC-001 | P1 | Fresh SQLite upgrades could not pass existing migration `0018_support_ticket_assignee` because SQLite cannot alter a table to add an inline foreign key. | Made the nullable column migration portable; application relationship remains modeled and indexed. |
| LIC-002 | P2 | Register list UI could only infer document counts after opening details. | Added server-provided `document_count` to License Register list results. |
| LIC-003 | P0 | A scoped user could receive organization-wide dashboard counts and entity summaries even though the License Register list correctly hid unauthorized entities. | Applied the existing server-side subject authorization filter before all dashboard calculations and added a regression test. |

## Tests executed

| Check | Result |
|---|---|
| `python -m pytest tests\test_license_management.py -q` | 3 passed |
| `python -m pytest -q` | 31 passed (42 third-party `openpyxl` deprecation warnings) |
| `python -m compileall app` | passed |
| Alembic upgrade to `0024_license_management` on `migration-validation.db` | passed; all six license tables verified |
| `npm run build` | passed |

The dedicated test uses isolated synthetic tenant data. It covers an Active licence, a licence expiring within 30 days, an Expired licence, a never-expiring licence, an Archived licence, document versions 1 and 2, expiry filtering, a never-expiring renewal, tenant/entity authorization, content-type spoof rejection, idempotent reminders, and dashboard/list count consistency. It also verifies that a Unit A1 maker cannot see Unit A2 counts in the same organization.

## Limitations / release notes

- No browser-driven E2E test runner or deployed non-production credentials were available, so visual/mobile/manual click-through tests are not marked as executed.
- File signature checks are intentionally conservative and not an antivirus scan; production storage should additionally use malware scanning where required.
- The UI exposes the seeded License Type catalogue and configuration view. Full visual Type create/edit forms and document preview rendering are not included; type APIs and document download are implemented.
- License-to-compliance links are evidence references only. A linked license never marks an obligation complete automatically.
- Legal applicability and statutory form conformity require organization/jurisdiction configuration and legal review; this implementation does not assert legal certification.
