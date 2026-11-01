"""Integration coverage for the tenant-isolated contractor Excel import flow."""
import asyncio
import io
from datetime import date

import pytest
from fastapi import HTTPException, UploadFile
from openpyxl import Workbook, load_workbook
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.api.v1 import router as api
from app.db.base import Base
from app.models import Contractor, IndustryType, Organization, State, Unit, User, UserRoleScope


def active(user: User, organization_id: str) -> User:
    setattr(user, "_morax_active_organization_id", organization_id)
    return user


def workbook_bytes(rows: list[list[object]]) -> bytes:
    workbook = Workbook(); sheet = workbook.active; sheet.title = "Contractors"
    sheet.append(api.CONTRACTOR_IMPORT_HEADERS)
    for row in rows:
        sheet.append(row)
    output = io.BytesIO(); workbook.save(output)
    return output.getvalue()


def test_contractor_import_validates_previews_reports_imports_and_isolates_tenants():
    engine = create_engine("sqlite:///:memory:"); Base.metadata.create_all(engine)
    with Session(engine) as db:
        master = Organization(name="MORAX Master", code="MORAX-MASTER", status="ACTIVE", is_system=True)
        org_a = Organization(name="Import Org A", code="IMP-A", status="ACTIVE")
        org_b = Organization(name="Import Org B", code="IMP-B", status="ACTIVE")
        state, industry = State(name="Karnataka", code="KA"), IndustryType(name="Construction", code="CON")
        db.add_all([master, org_a, org_b, state, industry]); db.flush()
        unit = Unit(organization_id=org_a.id, name="Principal Employer", code="PE-001", state_id=state.id, industry_type_id=industry.id, employer_name="Import Org A", compliance_start_date=date(2026, 1, 1), status="ACTIVE", worker_limit=30)
        admin = User(organization_id=org_a.id, name="Import Admin", email="admin@import.test", password_hash="x", active=True)
        maker = User(organization_id=org_a.id, name="Existing Maker", email="maker@import.test", password_hash="x", active=True)
        outsider = User(organization_id=org_b.id, name="Other Admin", email="admin@other.test", password_hash="x", active=True)
        db.add_all([unit, admin, maker, outsider]); db.flush()
        db.add_all([
            UserRoleScope(user_id=admin.id, role="ORGANIZATION_ADMIN", scope_type="ORGANIZATION", scope_id=org_a.id),
            UserRoleScope(user_id=outsider.id, role="ORGANIZATION_ADMIN", scope_type="ORGANIZATION", scope_id=org_b.id),
        ]); db.commit(); active(admin, org_a.id); active(outsider, org_b.id)

        valid = ["Acme Workforce Pvt Ltd", "ACME-001", "PE-001", "maker@import.test", "KA", "Bengaluru", "Manpower", "CON", "", "9876543210", "", "560001", "", "ABCDE1234F", "", 10, 5, "2026-04-01", "2027-03-31", "2026-04-01", "", "ACTIVE"]
        duplicate = ["Duplicate Code", "ACME-001", "PE-001", "maker@import.test", "KA", "Bengaluru", "", "", "", "", "", "", "", "", "", 1, 1, "", "", "", "", "ACTIVE"]
        unknown_unit = ["+UNSAFE", "BAD-001", "UNKNOWN", "maker@import.test", "KA", "", "", "", "", "", "", "", "", "", "", 1, 1, "", "", "", "", "ACTIVE"]
        upload = UploadFile(filename="contractors.xlsx", file=io.BytesIO(workbook_bytes([valid, duplicate, unknown_unit])))
        staged = asyncio.run(api.validate_contractor_import(upload, admin, db))
        assert staged["total_rows"] == 3 and staged["valid_rows"] == 1 and staged["error_rows"] == 2
        preview = api.contractor_import_preview(staged["id"], admin, db)
        assert [row["valid"] for row in preview["rows"]] == [True, False, False]
        assert any(error["field"] == "Contractor Code" for error in preview["rows"][1]["errors"])
        with pytest.raises(HTTPException) as denied:
            api.contractor_import_preview(staged["id"], outsider, db)
        assert denied.value.status_code == 404

        report = api.contractor_import_validation_report(staged["id"], admin, db)
        report_bytes = asyncio.run(_stream_bytes(report))
        report_book = load_workbook(io.BytesIO(report_bytes), data_only=False)
        assert report_book["Validation report"].max_row >= 4
        assert report.headers["content-disposition"].endswith(".xlsx")
        assert any(str(row[4].value).startswith("'+") for row in report_book["Validation report"].iter_rows(min_row=2))

        result = api.confirm_contractor_import(staged["id"], admin, db)
        assert result["imported"] == 1 and result["invalid"] == 2
        created = db.scalar(select(Contractor).where(Contractor.organization_id == org_a.id, Contractor.code == "ACME-001"))
        assert created and created.unit_id == unit.id and created.total_workers == 15
        assert db.scalar(select(Contractor).where(Contractor.code == "BAD-001")) is None
        with pytest.raises(HTTPException) as repeat:
            api.confirm_contractor_import(staged["id"], admin, db)
        assert repeat.value.status_code == 409

        template = api.contractor_import_template(admin, db)
        template_book = load_workbook(io.BytesIO(asyncio.run(_stream_bytes(template))))
        assert template_book["Contractors"]["A1"].value == "Contractor Name"
        assert "Instructions" in template_book.sheetnames
    engine.dispose()


async def _stream_bytes(response) -> bytes:
    return b"".join([chunk async for chunk in response.body_iterator])
