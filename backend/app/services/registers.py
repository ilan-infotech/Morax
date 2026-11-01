"""Declarative statutory-register import, validation and rendering helpers.

The module accepts source spreadsheets as data only.  No client supplied
formula, transformation expression or template script is ever evaluated.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import date, datetime
from typing import Any

from openpyxl import load_workbook


DATASET_FIELDS: dict[str, list[str]] = {
    "EMPLOYEE": ["employee_id", "employee_name", "father_spouse_name", "date_of_birth", "gender", "date_of_joining", "employment_status", "employment_type", "department", "designation", "category", "work_location", "uan", "esic_number", "wage_category", "date_of_exit"],
    "ATTENDANCE": ["employee_id", "attendance_date", "attendance_status", "in_time", "out_time", "working_hours", "overtime_hours", "shift", "leave_type", "holiday_indicator", "weekly_off_indicator"],
    "PAYROLL": ["employee_id", "payroll_month", "payroll_year", "basic_salary", "dearness_allowance", "house_rent_allowance", "other_allowances", "overtime_wages", "incentives", "bonus", "gross_earnings", "employee_pf", "employee_esi", "professional_tax", "tds", "salary_advance_recovery", "other_deductions", "total_deductions", "net_pay", "payment_date", "payment_mode", "payment_reference"],
}

REQUIRED_FIELDS = {
    "EMPLOYEE": {"employee_id", "employee_name"},
    "ATTENDANCE": {"employee_id", "attendance_date", "attendance_status"},
    "PAYROLL": {"employee_id", "payroll_month", "payroll_year", "gross_earnings", "total_deductions", "net_pay"},
}

HEADER_ALIASES = {
    "emp id": "employee_id", "employee id": "employee_id", "emp code": "employee_id", "employee code": "employee_id",
    "employee name": "employee_name", "staff name": "employee_name", "name": "employee_name",
    "joining date": "date_of_joining", "date of joining": "date_of_joining", "exit date": "date_of_exit", "date of exit": "date_of_exit",
    "attendance date": "attendance_date", "date": "attendance_date", "attendance status": "attendance_status", "status": "attendance_status",
    "working hours": "working_hours", "overtime hours": "overtime_hours", "ot hours": "overtime_hours",
    "payroll month": "payroll_month", "payroll year": "payroll_year", "basic pay": "basic_salary", "basic salary": "basic_salary",
    "pf amount": "employee_pf", "employee pf": "employee_pf", "esi amount": "employee_esi", "employee esi": "employee_esi",
    "gross earnings": "gross_earnings", "total deductions": "total_deductions", "net pay": "net_pay",
}

REGISTER_CATALOGUE: list[dict[str, Any]] = [
    {"code": "R01", "name": "Employee Register", "sources": ["EMPLOYEE"], "columns": [("Employee ID", "employee_id"), ("Employee Name", "employee_name"), ("Department", "department"), ("Designation", "designation"), ("Date of Joining", "date_of_joining")]},
    {"code": "R02", "name": "Muster Roll / Attendance Register", "sources": ["EMPLOYEE", "ATTENDANCE"], "columns": [("Employee ID", "employee_id"), ("Employee Name", "employee_name"), ("Present Days", "days_present"), ("Absent Days", "days_absent"), ("Working Hours", "working_hours")]},
    {"code": "R03", "name": "Register of Wages", "sources": ["EMPLOYEE", "PAYROLL"], "columns": [("Employee ID", "employee_id"), ("Employee Name", "employee_name"), ("Gross Earnings", "gross_earnings"), ("Deductions", "total_deductions"), ("Net Pay", "net_pay")]},
    {"code": "R04", "name": "Combined Muster Roll cum Wage Register", "sources": ["EMPLOYEE", "ATTENDANCE", "PAYROLL"], "columns": [("Employee ID", "employee_id"), ("Employee Name", "employee_name"), ("Paid Days", "paid_days"), ("Gross Earnings", "gross_earnings"), ("Net Pay", "net_pay")]},
    {"code": "R05", "name": "Overtime Register", "sources": ["EMPLOYEE", "ATTENDANCE", "PAYROLL"], "columns": [("Employee ID", "employee_id"), ("Employee Name", "employee_name"), ("Overtime Hours", "overtime_hours"), ("Overtime Wages", "overtime_wages")]},
    {"code": "R06", "name": "Wage Deductions Register", "sources": ["EMPLOYEE", "PAYROLL"], "columns": [("Employee ID", "employee_id"), ("Employee Name", "employee_name"), ("PF", "employee_pf"), ("ESI", "employee_esi"), ("Other Deductions", "other_deductions"), ("Total Deductions", "total_deductions")]},
    {"code": "R07", "name": "Leave Register", "sources": ["EMPLOYEE", "ATTENDANCE", "LEAVE_BALANCE"], "columns": []},
    {"code": "R08", "name": "Register of Advances", "sources": ["EMPLOYEE", "ADVANCE"], "columns": []},
    {"code": "R09", "name": "Register of Fines", "sources": ["EMPLOYEE", "FINE"], "columns": []},
    {"code": "R10", "name": "Register of Damage or Loss Deductions", "sources": ["EMPLOYEE", "DAMAGE_LOSS"], "columns": []},
]


def clean_cell(value: Any) -> Any:
    """Neutralise formula injection when source data is rendered/exported."""
    if isinstance(value, str):
        value = value.strip()
        return "'" + value if value.startswith(("=", "+", "-", "@")) else value
    return value


def normalise_header(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower().replace("_", " "))


def suggest_mapping(headers: list[Any], dataset_type: str) -> dict[str, str]:
    valid = set(DATASET_FIELDS[dataset_type])
    mapping: dict[str, str] = {}
    for header in headers:
        source = str(header or "").strip()
        normalized = normalise_header(header)
        candidate = HEADER_ALIASES.get(normalized, normalized.replace(" ", "_"))
        if source and candidate in valid and candidate not in mapping.values():
            mapping[source] = candidate
    return mapping


def parse_workbook(content: bytes, dataset_type: str, mapping: dict[str, str] | None = None) -> tuple[list[dict[str, Any]], dict[str, str]]:
    try:
        # Read formula tokens as source text.  ``data_only=True`` turns a
        # formula with no cached Excel result into None, losing the value
        # before we can protect it. ``clean_cell`` safely prefixes formula
        # tokens, so they are never executed when re-exported.
        workbook = load_workbook(filename=__import__("io").BytesIO(content), read_only=True, data_only=False)
        sheet = workbook.active
        raw_headers = [cell.value for cell in next(sheet.iter_rows(min_row=1, max_row=1))]
    except Exception as exc:  # Workbook parser errors must be safe API messages.
        raise ValueError("The uploaded file is not a valid Excel workbook") from exc
    headers = [str(header or "").strip() for header in raw_headers]
    resolved_mapping = mapping or suggest_mapping(headers, dataset_type)
    rows: list[dict[str, Any]] = []
    for row_number, values in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2):
        if not any(value not in (None, "") for value in values):
            continue
        transformed = {target: clean_cell(values[index]) for index, source in enumerate(headers) if source in resolved_mapping for target in [resolved_mapping[source]]}
        transformed["_row_number"] = row_number
        rows.append(transformed)
    return rows, resolved_mapping


def parse_date(value: Any) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(str(value), fmt).date()
        except ValueError:
            pass
    return None


def number(value: Any) -> float | None:
    if value in (None, ""):
        return 0.0
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def validate_rows(dataset_type: str, rows: list[dict[str, Any]], known_employee_ids: set[str] | None = None, period_key: str | None = None) -> list[dict[str, Any]]:
    known_employee_ids = known_employee_ids or set()
    errors: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    for row in rows:
        row_number = row["_row_number"]
        for field in REQUIRED_FIELDS[dataset_type]:
            if row.get(field) in (None, ""):
                errors.append({"severity": "ERROR", "row_number": row_number, "field": field, "message": "Value is required"})
        employee_id = str(row.get("employee_id") or "").strip()
        if dataset_type == "EMPLOYEE":
            key = (employee_id,)
            joining, exit = parse_date(row.get("date_of_joining")), parse_date(row.get("date_of_exit"))
            if row.get("date_of_joining") and not joining:
                errors.append({"severity": "ERROR", "row_number": row_number, "field": "date_of_joining", "message": "Use a valid date"})
            if row.get("date_of_exit") and not exit:
                errors.append({"severity": "ERROR", "row_number": row_number, "field": "date_of_exit", "message": "Use a valid date"})
            if joining and exit and exit < joining:
                errors.append({"severity": "ERROR", "row_number": row_number, "field": "date_of_exit", "message": "Exit date cannot be before joining date"})
        elif dataset_type == "ATTENDANCE":
            attendance_date = parse_date(row.get("attendance_date"))
            key = (employee_id, attendance_date)
            if not attendance_date:
                errors.append({"severity": "ERROR", "row_number": row_number, "field": "attendance_date", "message": "Use a valid attendance date"})
            if employee_id not in known_employee_ids:
                errors.append({"severity": "ERROR", "row_number": row_number, "field": "employee_id", "message": "Employee ID is not available in Employee Master"})
            for field in ("working_hours", "overtime_hours"):
                amount = number(row.get(field))
                if amount is None or amount < 0:
                    errors.append({"severity": "ERROR", "row_number": row_number, "field": field, "message": "Hours must be a non-negative number"})
        else:
            month, year = str(row.get("payroll_month") or ""), str(row.get("payroll_year") or "")
            key = (employee_id, f"{year}-{month.zfill(2)}")
            if employee_id not in known_employee_ids:
                errors.append({"severity": "ERROR", "row_number": row_number, "field": "employee_id", "message": "Employee ID is not available in Employee Master"})
            if not re.fullmatch(r"\d{4}", year) or not month.isdigit() or not 1 <= int(month) <= 12:
                errors.append({"severity": "ERROR", "row_number": row_number, "field": "payroll_month", "message": "Payroll month and year are invalid"})
            elif period_key and f"{year}-{month.zfill(2)}" != period_key:
                errors.append({"severity": "ERROR", "row_number": row_number, "field": "payroll_month", "message": "Payroll period differs from the selected period"})
            values = {field: number(row.get(field)) for field in ("gross_earnings", "total_deductions", "net_pay")}
            if any(value is None or value < 0 for value in values.values()):
                errors.append({"severity": "ERROR", "row_number": row_number, "field": "payroll", "message": "Payroll amounts must be non-negative numbers"})
            elif round(values["gross_earnings"] - values["total_deductions"], 2) != round(values["net_pay"], 2):
                errors.append({"severity": "ERROR", "row_number": row_number, "field": "net_pay", "message": "Net pay must equal gross earnings minus total deductions"})
        if key in seen:
            errors.append({"severity": "ERROR", "row_number": row_number, "field": "employee_id", "message": "Duplicate record in uploaded workbook"})
        seen.add(key)
    return errors


def register_rows(template_config: dict[str, Any], employees: list[Any], attendance: list[Any], payroll: list[Any]) -> list[dict[str, Any]]:
    attendance_by_employee: dict[str, list[Any]] = defaultdict(list)
    for item in attendance:
        attendance_by_employee[item.employee_id].append(item)
    payroll_by_employee = {item.employee_id: item for item in payroll}
    rows: list[dict[str, Any]] = []
    for employee in employees:
        source = json.loads(employee.data_json or "{}")
        records = attendance_by_employee.get(employee.employee_id, [])
        payment = payroll_by_employee.get(employee.employee_id)
        present = sum(1 for item in records if item.status == "PRESENT")
        paid = sum(1 for item in records if item.status in {"PRESENT", "PAID_LEAVE", "HOLIDAY", "WEEKLY_OFF"})
        row = {
            **source,
            "employee_id": employee.employee_id,
            "employee_name": employee.employee_name,
            "date_of_joining": str(employee.date_of_joining) if employee.date_of_joining else None,
            "days_present": present,
            "days_absent": sum(1 for item in records if item.status == "ABSENT"),
            "paid_days": paid,
            "working_hours": round(sum(item.working_hours for item in records), 2),
            "overtime_hours": round(sum(item.overtime_hours for item in records), 2),
        }
        if payment:
            row.update(json.loads(payment.data_json or "{}"))
            row.update({"gross_earnings": payment.gross_earnings, "total_deductions": payment.total_deductions, "net_pay": payment.net_pay})
        rows.append(row)
    return rows
