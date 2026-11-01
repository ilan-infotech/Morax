# Contractor import and logo improvements — test evidence

Date: 1 November 2026

## Delivered

- Added a direct **Import Contractors** action beside the existing manual **Add contractor** action.
- Added a tenant-scoped contractor-import batch and row staging model with Alembic migration `0025_contractor_excel_import`.
- Added an Excel template, validation/preview, error-report download, and confirmation endpoints. The import resolves Principal Employer Codes and Maker Emails only inside the active organization.
- Added validation for required columns, duplicate codes in the workbook and tenant, active principal employer and maker, configured state/industry codes, dates, worker counts, worker capacity, contact email uniqueness, and status.
- Reused the normal contractor creation service for confirmed rows, preserving audit records, Maker assignment, compliance generation, and the existing manual creation path.
- Replaced animated sidebar logo rendering with a static, larger, square MORAX logo container and added the matching static logo treatment to the login page.

## Executed checks

| Check | Result |
|---|---|
| `python -m pytest tests\\test_contractor_import.py -q` | 1 passed |
| `python -m pytest -q` | 32 passed; 54 third-party `openpyxl` deprecation warnings |
| `python -m compileall app` | passed |
| Alembic upgrade of `migration-validation.db` to `0025_contractor_excel_import` | passed; both import tables verified |
| `npm run build` | passed |

The dedicated test imports an in-memory `.xlsx` with one valid contractor and two invalid rows (duplicate code and unknown principal employer). It verifies preview data, a tenant-denied preview attempt, validation-report generation, spreadsheet formula escaping in the report, successful persistence of only the valid contractor, repeat-import protection, and the downloadable template.

## Not executed

No browser/E2E runner or test credentials are configured in this repository. Desktop/tablet/mobile visual click-through checks, including logo rendering, remain manual verification items rather than passed automated tests.
