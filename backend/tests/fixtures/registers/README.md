# Registers synthetic fixtures

`generate_fixtures.py` produces isolated, synthetic `.xlsx` workbooks for
repeatable manual and automated regression checks. It includes valid employee,
attendance and payroll imports; duplicate/invalid attendance; incorrect payroll
totals; a formula cell; headers-only input; and 1/10/100/1,000-employee sets.

The generated files are not production data and are intentionally not committed
as binary source artifacts.
