"""Create non-production Excel fixtures for Registers regression testing.

Run from ``backend`` with ``python tests/fixtures/registers/generate_fixtures.py``.
Files are deliberately generated rather than committed as opaque binaries.
"""

from pathlib import Path
from openpyxl import Workbook


ROOT = Path(__file__).parent


def write(name: str, headers: list[str], rows: list[list[object]]) -> None:
    workbook = Workbook(); sheet = workbook.active; sheet.append(headers)
    for row in rows:
        sheet.append(row)
    workbook.save(ROOT / name)


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    write("employee-valid.xlsx", ["Emp Code", "Staff Name", "Date of Joining", "Department"], [["E001", "Synthetic Employee 1", "2026-01-01", "Operations"], ["E002", "Synthetic Employee 2", "2026-02-01", "Safety"]])
    write("attendance-valid.xlsx", ["Employee ID", "Attendance Date", "Attendance Status", "Working Hours", "Overtime Hours"], [["E001", "2026-09-01", "Present", 8, 2], ["E002", "2026-09-01", "Paid Leave", 0, 0]])
    write("payroll-valid.xlsx", ["Employee ID", "Payroll Month", "Payroll Year", "Gross Earnings", "Total Deductions", "Net Pay"], [["E001", 9, 2026, 10000, 1000, 9000], ["E002", 9, 2026, 12000, 1200, 10800]])
    write("attendance-duplicates-invalid.xlsx", ["Employee ID", "Attendance Date", "Attendance Status", "Working Hours"], [["UNKNOWN", "invalid", "Present", -8], ["UNKNOWN", "invalid", "Present", 8]])
    write("payroll-incorrect-total.xlsx", ["Employee ID", "Payroll Month", "Payroll Year", "Gross Earnings", "Total Deductions", "Net Pay"], [["E001", 9, 2026, 10000, 1000, 9500]])
    write("employee-formula.xlsx", ["Employee ID", "Employee Name"], [["=1+1", "Synthetic Formula Input"]])
    write("headers-only.xlsx", ["Employee ID", "Employee Name"], [])
    for size in (1, 10, 100, 1000):
        write(f"employee-{size}.xlsx", ["Employee ID", "Employee Name"], [[f"S{index:05d}", f"Synthetic {index}"] for index in range(1, size + 1)])


if __name__ == "__main__":
    main()
