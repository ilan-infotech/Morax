"""Tenant-scoped Statutory Registers API.

All register data uses the trusted authenticated organization and subject
authorization.  Client-supplied organization identifiers are intentionally
absent from operational requests.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
from collections import Counter, defaultdict
from datetime import UTC, date, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models import (
    ComplianceEvidence, ComplianceInstance, GeneratedRegister, RegisterAttendance,
    RegisterColumnMapping, RegisterComplianceLink, RegisterEmployee, RegisterPayroll,
    RegisterTemplate, RegisterTemplateVersion, RegisterUploadBatch,
    RegisterWorkflowHistory, Unit, Contractor, ContractorSite, User,
)
from app.schemas import (
    RegisterComplianceLinkInput, RegisterDecisionInput, RegisterGenerationInput,
    RegisterMappingInput, RegisterTemplateInput,
)
from app.services.access import CHECKER_ROLES, MAKER_ROLES, can_access_subject, current_user, has_permission, is_org_admin, roles_for
from app.services.audit import audit
from app.services.notifications import emit_notification
from app.services.registers import DATASET_FIELDS, REGISTER_CATALOGUE, number, parse_date, parse_workbook, register_rows, validate_rows
from app.services.serialization import model_dict
from app.storage.files import delete_stored_file, file_path, save_upload


router = APIRouter(prefix="/registers", tags=["registers"])
REGISTER_DATASETS = {"EMPLOYEE", "ATTENDANCE", "PAYROLL"}
REGISTER_STATUSES = {"GENERATED", "SUBMITTED", "APPROVED", "REJECTED", "SUPERSEDED"}


def org_for(user: User) -> str:
    organization_id = getattr(user, "_morax_active_organization_id", user.organization_id)
    if not organization_id:
        raise HTTPException(409, "User is not assigned to an organization")
    return organization_id


def require_register_permission(db: Session, user: User, permission: str) -> None:
    if not has_permission(db, user, permission):
        raise HTTPException(403, "You do not have permission to access Registers")


def require_subject(db: Session, user: User, entity_type: str, entity_id: str) -> str:
    organization_id = org_for(user)
    if entity_type not in {"UNIT", "CONTRACTOR", "CONTRACTOR_SITE"}:
        raise HTTPException(422, "Entity type must be UNIT, CONTRACTOR, or CONTRACTOR_SITE")
    if not can_access_subject(db, user, organization_id, entity_type, entity_id):
        raise HTTPException(403, "You are not authorized for this register entity")
    return organization_id


def entity_name(db: Session, entity_type: str, entity_id: str) -> str:
    model = {"UNIT": Unit, "CONTRACTOR": Contractor, "CONTRACTOR_SITE": ContractorSite}[entity_type]
    row = db.get(model, entity_id)
    return row.name if row else "Unknown entity"


def template_config(catalogue: dict) -> dict:
    return {
        "source_datasets": catalogue["sources"],
        "columns": [{"label": label, "field": field, "required": True} for label, field in catalogue["columns"]],
        "approval_required": True,
        "safe_transformations": ["TRIM", "DATE_PARSE", "NUMERIC_NORMALIZE"],
    }


def ensure_catalogue(db: Session, organization_id: str, user_id: str) -> None:
    """Create tenant-owned operational templates once, never legal claims."""
    existing_codes = set(db.scalars(select(RegisterTemplate.code).where(RegisterTemplate.organization_id == organization_id)))
    for item in REGISTER_CATALOGUE:
        if item["code"] in existing_codes:
            continue
        template = RegisterTemplate(
            organization_id=organization_id, code=item["code"], name=item["name"],
            description="Configurable operational register template. Verify legal applicability before statutory use.",
            created_by_id=user_id,
        )
        db.add(template); db.flush()
        db.add(RegisterTemplateVersion(
            template_id=template.id, version=1, status="PUBLISHED", config_json=json.dumps(template_config(item)),
            published_by_id=user_id, published_at=datetime.now(UTC),
        ))
        existing_codes.add(item["code"])
    db.commit()


def template_dict(db: Session, template: RegisterTemplate, version: RegisterTemplateVersion) -> dict:
    result = model_dict(template, [field.name for field in template.__table__.columns])
    result["version"] = model_dict(version, [field.name for field in version.__table__.columns])
    result["config"] = json.loads(version.config_json or "{}")
    return result


def register_dict(db: Session, item: GeneratedRegister, detail: bool = False, cache: dict | None = None) -> dict:
    cache = cache or {}
    versions_cache = cache.get("versions", {})
    templates_cache = cache.get("templates", {})
    result = model_dict(item, [field.name for field in item.__table__.columns])
    result["entity_name"] = cache.get("entity_names", {}).get((item.entity_type, item.entity_id)) or entity_name(db, item.entity_type, item.entity_id)
    result["validation_summary"] = json.loads(item.validation_summary_json or "{}")
    version = versions_cache.get(item.template_version_id) or db.get(RegisterTemplateVersion, item.template_version_id)
    template = templates_cache.get(version.template_id) if version else None
    if not template and version:
        template = db.get(RegisterTemplate, version.template_id)
    result["template_version"] = version.version if version else None
    result["template_name"] = template.name if template else item.register_name
    result["is_overdue"] = bool(item.due_date and item.due_date < date.today() and item.status != "APPROVED")
    if detail:
        result["content"] = json.loads(item.content_json or "{}")
        histories = list(db.scalars(select(RegisterWorkflowHistory).where(RegisterWorkflowHistory.register_id == item.id).order_by(RegisterWorkflowHistory.created_at)))
        actor_ids = {h.actor_id for h in histories if h.actor_id}
        actors = {u.id: u for u in db.scalars(select(User).where(User.id.in_(actor_ids)))} if actor_ids else {}
        result["history"] = [
            {**model_dict(history, [field.name for field in history.__table__.columns]), "actor_name": (actors.get(history.actor_id).name if actors.get(history.actor_id) else "Unknown")}
            for history in histories
        ]
        result["compliance_links"] = [model_dict(link, [field.name for field in link.__table__.columns]) for link in db.scalars(select(RegisterComplianceLink).where(RegisterComplianceLink.register_id == item.id))]
    return result


def register_list_cache(db: Session, items: list[GeneratedRegister]) -> dict:
    """Batch the presentation lookups needed for register collection views."""
    version_ids = {item.template_version_id for item in items if item.template_version_id}
    versions = {
        item.id: item
        for item in db.scalars(select(RegisterTemplateVersion).where(RegisterTemplateVersion.id.in_(version_ids)))
    } if version_ids else {}
    template_ids = {item.template_id for item in versions.values() if item.template_id}
    templates = {
        item.id: item
        for item in db.scalars(select(RegisterTemplate).where(RegisterTemplate.id.in_(template_ids)))
    } if template_ids else {}
    entity_names: dict[tuple[str, str], str] = {}
    for entity_type, model in {"UNIT": Unit, "CONTRACTOR": Contractor, "CONTRACTOR_SITE": ContractorSite}.items():
        entity_ids = {item.entity_id for item in items if item.entity_type == entity_type}
        if entity_ids:
            entity_names.update({
                (entity_type, item.id): item.name
                for item in db.scalars(select(model).where(model.id.in_(entity_ids)))
            })
    return {"versions": versions, "templates": templates, "entity_names": entity_names}


def get_register_or_404(db: Session, user: User, register_id: str) -> GeneratedRegister:
    item = db.get(GeneratedRegister, register_id)
    if not item or item.organization_id != org_for(user):
        raise HTTPException(404, "Register not found")
    require_subject(db, user, item.entity_type, item.entity_id)
    return item


def checker_recipients(db: Session, organization_id: str, entity_type: str, entity_id: str) -> list[str]:
    ids = []
    for user in db.scalars(select(User).where(User.organization_id == organization_id, User.active.is_(True))):
        roles = roles_for(db, user.id)
        if roles & CHECKER_ROLES and can_access_subject(db, user, organization_id, entity_type, entity_id):
            ids.append(user.id)
    return ids


def maker_recipients(db: Session, organization_id: str, entity_type: str, entity_id: str) -> list[str]:
    ids = []
    for user in db.scalars(select(User).where(User.organization_id == organization_id, User.active.is_(True))):
        roles = roles_for(db, user.id)
        if roles & MAKER_ROLES and can_access_subject(db, user, organization_id, entity_type, entity_id):
            ids.append(user.id)
    return ids


def notify(db: Session, register: GeneratedRegister, recipients: list[str], event: str, title: str, body: str | None = None, priority: str = "NORMAL") -> None:
    for recipient_id in set(recipients):
        emit_notification(
            db, organization_id=register.organization_id, recipient_id=recipient_id,
            notification_type=f"REGISTER_{event}", category="REGISTER", event_type=event,
            title=title, body=body, priority=priority, entity_type=register.entity_type,
            entity_id=register.entity_id, reference_type="GeneratedRegister", reference_id=register.id,
            event_key=f"register:{register.id}:v{register.version}:{event}:{recipient_id}",
        )


def xlsx_for_register(item: GeneratedRegister) -> bytes:
    content = json.loads(item.content_json or "{}")
    workbook = Workbook(); sheet = workbook.active; sheet.title = item.register_code[:31]
    sheet.append([item.register_name]); sheet.append(["Period", item.period_key]); sheet.append([])
    headers = [column.get("label", column.get("field")) for column in content.get("columns", [])]
    sheet.append(headers)
    fill = PatternFill("solid", fgColor="234332")
    for cell in sheet[sheet.max_row]:
        cell.font = Font(color="FFFFFF", bold=True); cell.fill = fill
    for row in content.get("rows", []):
        sheet.append([row.get(column.get("field"), "") for column in content.get("columns", [])])
    for column in sheet.columns:
        sheet.column_dimensions[column[0].column_letter].width = min(36, max(12, max(len(str(cell.value or "")) for cell in column) + 2))
    output = io.BytesIO(); workbook.save(output); return output.getvalue()


def basic_pdf(item: GeneratedRegister) -> bytes:
    """Small safe PDF export without a code-execution/rendering dependency."""
    content = json.loads(item.content_json or "{}")
    lines = [item.register_name, f"Period: {item.period_key}", f"Entity: {content.get('entity_name', '')}", f"Employees: {item.employee_count}"]
    lines += [" | ".join(str(row.get(column.get("field"), ""))[:36] for column in content.get("columns", [])) for row in content.get("rows", [])[:35]]
    safe = [re.sub(r"[()\\]", lambda match: "\\" + match.group(0), str(line)) for line in lines]
    stream = "BT /F1 10 Tf 50 780 Td " + " Tj 0 -16 Td ".join(f"({line})" for line in safe) + " Tj ET"
    objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", f"<< /Length {len(stream.encode('latin-1', 'replace'))} >>\nstream\n{stream}\nendstream"]
    pdf = "%PDF-1.4\n"; offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(pdf.encode("latin-1", "replace"))); pdf += f"{index} 0 obj\n{obj}\nendobj\n"
    xref = len(pdf.encode("latin-1", "replace")); pdf += f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n" + "".join(f"{offset:010d} 00000 n \n" for offset in offsets[1:]) + f"trailer << /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF"
    return pdf.encode("latin-1", "replace")


@router.get("/templates")
def list_templates(user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.read")
    organization_id = org_for(user); ensure_catalogue(db, organization_id, user.id)
    # Managers must be able to see drafts to publish them; operational
    # readiness independently selects published versions only.
    rows = db.execute(select(RegisterTemplate, RegisterTemplateVersion).join(RegisterTemplateVersion, RegisterTemplateVersion.template_id == RegisterTemplate.id).where(RegisterTemplate.organization_id == organization_id, RegisterTemplate.active.is_(True)).order_by(RegisterTemplate.code, RegisterTemplateVersion.version.desc())).all()
    return [template_dict(db, template, version) for template, version in rows]


@router.post("/templates")
def create_template(payload: RegisterTemplateInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.template.manage")
    organization_id = org_for(user)
    if db.scalar(select(RegisterTemplate.id).where(RegisterTemplate.organization_id == organization_id, RegisterTemplate.code == payload.code.upper())):
        raise HTTPException(409, "A template with this code already exists")
    template = RegisterTemplate(organization_id=organization_id, code=payload.code.upper(), name=payload.name.strip(), category=payload.category, description=payload.description, entity_scope=payload.entity_scope, frequency=payload.frequency.upper(), created_by_id=user.id)
    db.add(template); db.flush()
    version = RegisterTemplateVersion(template_id=template.id, version=1, status="DRAFT", applicable_legislation=payload.applicable_legislation, applicable_rule=payload.applicable_rule, form_number=payload.form_number, jurisdiction=payload.jurisdiction, effective_from=payload.effective_from, effective_to=payload.effective_to, config_json=json.dumps(payload.config))
    db.add(version); audit(db, organization_id=organization_id, actor_id=user.id, action="CREATE_REGISTER_TEMPLATE", module="REGISTERS", entity_type="RegisterTemplate", entity_id=template.id, new={"code": template.code})
    db.commit(); return template_dict(db, template, version)


@router.post("/templates/{template_id}/publish")
def publish_template(template_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.template.manage")
    template = db.get(RegisterTemplate, template_id)
    if not template or template.organization_id != org_for(user): raise HTTPException(404, "Template not found")
    version = db.scalar(select(RegisterTemplateVersion).where(RegisterTemplateVersion.template_id == template.id).order_by(RegisterTemplateVersion.version.desc()))
    if not version: raise HTTPException(409, "Template has no draft version")
    version.status = "PUBLISHED"; version.published_at = datetime.now(UTC); version.published_by_id = user.id
    audit(db, organization_id=template.organization_id, actor_id=user.id, action="PUBLISH_REGISTER_TEMPLATE", module="REGISTERS", entity_type="RegisterTemplateVersion", entity_id=version.id, new={"version": version.version})
    db.commit(); return template_dict(db, template, version)


@router.get("/datasets/{dataset_type}/template")
def download_dataset_template(dataset_type: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.upload")
    dataset_type = dataset_type.upper()
    if dataset_type not in REGISTER_DATASETS: raise HTTPException(422, "Unsupported dataset type")
    workbook = Workbook(); sheet = workbook.active; sheet.title = dataset_type.title()
    headers = [field.replace("_", " ").title() for field in DATASET_FIELDS[dataset_type]]
    sheet.append(headers); sheet.freeze_panes = "A2"; output = io.BytesIO(); workbook.save(output); output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="morax-{dataset_type.lower()}-template.xlsx"'})


@router.post("/uploads/{dataset_type}/validate")
async def validate_upload(dataset_type: str, entity_type: str = Form(...), entity_id: str = Form(...), period_key: str | None = Form(None), mapping_json: str | None = Form(None), file: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.upload")
    dataset_type = dataset_type.upper()
    if dataset_type not in REGISTER_DATASETS: raise HTTPException(422, "Unsupported dataset type")
    organization_id = require_subject(db, user, entity_type, entity_id)
    if not (file.filename or "").lower().endswith(".xlsx"): raise HTTPException(422, "Registers uploads must be .xlsx files")
    try: supplied_mapping = json.loads(mapping_json) if mapping_json else None
    except json.JSONDecodeError as exc: raise HTTPException(422, "Column mapping must be valid JSON") from exc
    stored_name, _, checksum = await save_upload(file)
    try:
        content = file_path(stored_name).read_bytes(); rows, mapping = parse_workbook(content, dataset_type, supplied_mapping)
    except ValueError as exc:
        delete_stored_file(stored_name); raise HTTPException(422, str(exc)) from exc
    known = set(db.scalars(select(RegisterEmployee.employee_id).where(RegisterEmployee.organization_id == organization_id, RegisterEmployee.entity_type == entity_type, RegisterEmployee.entity_id == entity_id)))
    issues = validate_rows(dataset_type, rows, known, period_key)
    errors = [issue for issue in issues if issue["severity"] == "ERROR"]
    batch = RegisterUploadBatch(organization_id=organization_id, entity_type=entity_type, entity_id=entity_id, dataset_type=dataset_type, period_key=period_key, original_filename=file.filename or "upload.xlsx", stored_filename=stored_name, checksum_sha256=checksum, mapping_json=json.dumps(mapping), status="VALIDATION_FAILED" if errors else "VALIDATED", total_rows=len(rows), valid_rows=len(rows) - len({issue["row_number"] for issue in errors}), error_rows=len(errors), warning_rows=0, validation_json=json.dumps(issues), uploaded_by_id=user.id)
    db.add(batch); db.flush()
    audit(db, organization_id=organization_id, actor_id=user.id, action="VALIDATE_REGISTER_UPLOAD", module="REGISTERS", entity_type="RegisterUploadBatch", entity_id=batch.id, new={"dataset_type": dataset_type, "errors": len(errors), "rows": len(rows)})
    db.commit()
    return {"batch": model_dict(batch, [field.name for field in batch.__table__.columns]), "mapping": mapping, "fields": DATASET_FIELDS[dataset_type], "preview": rows[:50], "issues": issues}


@router.post("/mappings")
def save_mapping(payload: RegisterMappingInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.upload")
    organization_id = org_for(user)
    version = (db.scalar(select(func.max(RegisterColumnMapping.version)).where(RegisterColumnMapping.organization_id == organization_id, RegisterColumnMapping.dataset_type == payload.dataset_type, RegisterColumnMapping.name == payload.name)) or 0) + 1
    item = RegisterColumnMapping(organization_id=organization_id, dataset_type=payload.dataset_type, name=payload.name.strip(), version=version, mapping_json=json.dumps(payload.mapping), created_by_id=user.id)
    db.add(item); db.commit(); return model_dict(item, [field.name for field in item.__table__.columns])


@router.get("/mappings")
def list_mappings(dataset_type: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.read"); query = select(RegisterColumnMapping).where(RegisterColumnMapping.organization_id == org_for(user), RegisterColumnMapping.active.is_(True))
    if dataset_type: query = query.where(RegisterColumnMapping.dataset_type == dataset_type.upper())
    return [{**model_dict(item, [field.name for field in item.__table__.columns]), "mapping": json.loads(item.mapping_json)} for item in db.scalars(query.order_by(RegisterColumnMapping.created_at.desc()))]


@router.post("/uploads/{batch_id}/import")
def import_upload(batch_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.upload")
    batch = db.get(RegisterUploadBatch, batch_id)
    if not batch or batch.organization_id != org_for(user): raise HTTPException(404, "Upload batch not found")
    require_subject(db, user, batch.entity_type, batch.entity_id)
    if batch.status != "VALIDATED": raise HTTPException(422, "Correct all blocking validation errors before importing")
    mapping = json.loads(batch.mapping_json); rows, _ = parse_workbook(file_path(batch.stored_filename).read_bytes(), batch.dataset_type, mapping)
    imported = 0
    for row in rows:
        employee_id = str(row.get("employee_id") or "").strip()
        if batch.dataset_type == "EMPLOYEE":
            item = db.scalar(select(RegisterEmployee).where(RegisterEmployee.organization_id == batch.organization_id, RegisterEmployee.entity_type == batch.entity_type, RegisterEmployee.entity_id == batch.entity_id, RegisterEmployee.employee_id == employee_id))
            if not item:
                item = RegisterEmployee(organization_id=batch.organization_id, entity_type=batch.entity_type, entity_id=batch.entity_id, employee_id=employee_id, employee_name=str(row.get("employee_name") or "").strip()); db.add(item)
            item.employee_name = str(row.get("employee_name") or item.employee_name).strip(); item.date_of_joining = parse_date(row.get("date_of_joining")); item.date_of_exit = parse_date(row.get("date_of_exit")); item.active = not bool(item.date_of_exit); item.data_json = json.dumps({key: value for key, value in row.items() if key != "_row_number"}, default=str); item.source_batch_id = batch.id
        elif batch.dataset_type == "ATTENDANCE":
            attendance_date = parse_date(row.get("attendance_date")); item = db.scalar(select(RegisterAttendance).where(RegisterAttendance.organization_id == batch.organization_id, RegisterAttendance.entity_type == batch.entity_type, RegisterAttendance.entity_id == batch.entity_id, RegisterAttendance.employee_id == employee_id, RegisterAttendance.attendance_date == attendance_date))
            if not item: item = RegisterAttendance(organization_id=batch.organization_id, entity_type=batch.entity_type, entity_id=batch.entity_id, employee_id=employee_id, attendance_date=attendance_date, status="PRESENT"); db.add(item)
            item.status = str(row.get("attendance_status") or "PRESENT").strip().upper().replace(" ", "_"); item.working_hours = number(row.get("working_hours")) or 0; item.overtime_hours = number(row.get("overtime_hours")) or 0; item.data_json = json.dumps({key: value for key, value in row.items() if key != "_row_number"}, default=str); item.source_batch_id = batch.id
        else:
            period = f"{str(row['payroll_year'])}-{str(row['payroll_month']).zfill(2)}"; item = db.scalar(select(RegisterPayroll).where(RegisterPayroll.organization_id == batch.organization_id, RegisterPayroll.entity_type == batch.entity_type, RegisterPayroll.entity_id == batch.entity_id, RegisterPayroll.employee_id == employee_id, RegisterPayroll.period_key == period))
            if not item: item = RegisterPayroll(organization_id=batch.organization_id, entity_type=batch.entity_type, entity_id=batch.entity_id, employee_id=employee_id, period_key=period); db.add(item)
            item.gross_earnings = number(row.get("gross_earnings")) or 0; item.total_deductions = number(row.get("total_deductions")) or 0; item.net_pay = number(row.get("net_pay")) or 0; item.data_json = json.dumps({key: value for key, value in row.items() if key != "_row_number"}, default=str); item.source_batch_id = batch.id
        imported += 1
    batch.status = "IMPORTED"; batch.imported_at = datetime.now(UTC); audit(db, organization_id=batch.organization_id, actor_id=user.id, action="IMPORT_REGISTER_DATASET", module="REGISTERS", entity_type="RegisterUploadBatch", entity_id=batch.id, new={"rows": imported})
    db.commit(); return {"id": batch.id, "status": batch.status, "imported_rows": imported}


@router.get("/uploads")
def list_uploads(dataset_type: str | None = None, entity_type: str | None = None, entity_id: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.read"); org = org_for(user); query = select(RegisterUploadBatch).where(RegisterUploadBatch.organization_id == org)
    if dataset_type: query = query.where(RegisterUploadBatch.dataset_type == dataset_type.upper())
    if entity_type and entity_id: require_subject(db, user, entity_type, entity_id); query = query.where(RegisterUploadBatch.entity_type == entity_type, RegisterUploadBatch.entity_id == entity_id)
    rows = [item for item in db.scalars(query.order_by(RegisterUploadBatch.created_at.desc())) if can_access_subject(db, user, org, item.entity_type, item.entity_id)]
    return [model_dict(item, [field.name for field in item.__table__.columns]) for item in rows]


@router.get("/uploads/{batch_id}/validation-report.xlsx")
def validation_report(batch_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.read")
    batch = db.get(RegisterUploadBatch, batch_id)
    if not batch or batch.organization_id != org_for(user):
        raise HTTPException(404, "Upload batch not found")
    require_subject(db, user, batch.entity_type, batch.entity_id)
    workbook = Workbook(); sheet = workbook.active; sheet.title = "Validation report"
    sheet.append(["Severity", "Row", "Field", "Message"])
    for cell in sheet[1]:
        cell.font = Font(color="FFFFFF", bold=True); cell.fill = PatternFill("solid", fgColor="234332")
    for issue in json.loads(batch.validation_json or "[]"):
        sheet.append([issue.get("severity"), issue.get("row_number"), issue.get("field"), issue.get("message")])
    output = io.BytesIO(); workbook.save(output); output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="register-validation-{batch.id}.xlsx"'})


@router.get("/employees")
def list_employees(entity_type: str, entity_id: str, q: str = "", page: int = 1, page_size: int = 25, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.read"); org = require_subject(db, user, entity_type, entity_id); query = select(RegisterEmployee).where(RegisterEmployee.organization_id == org, RegisterEmployee.entity_type == entity_type, RegisterEmployee.entity_id == entity_id)
    if q: query = query.where((RegisterEmployee.employee_id.ilike(f"%{q}%")) | (RegisterEmployee.employee_name.ilike(f"%{q}%")))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0; items = list(db.scalars(query.order_by(RegisterEmployee.employee_name).offset((max(page, 1)-1)*min(max(page_size, 1), 100)).limit(min(max(page_size, 1), 100))))
    return {"items": [{**model_dict(item, [field.name for field in item.__table__.columns]), "data": json.loads(item.data_json)} for item in items], "total": total, "page": page, "page_size": page_size}


@router.patch("/employees/{employee_id}")
def update_employee(employee_id: str, payload: dict, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.upload")
    item = db.get(RegisterEmployee, employee_id)
    if not item or item.organization_id != org_for(user):
        raise HTTPException(404, "Employee not found")
    require_subject(db, user, item.entity_type, item.entity_id)
    allowed = {"employee_name", "date_of_joining", "date_of_exit", "employment_status", "employment_type", "department", "designation", "category", "work_location", "uan", "esic_number", "wage_category"}
    data = json.loads(item.data_json or "{}")
    for key, value in payload.items():
        if key not in allowed:
            continue
        if key in {"date_of_joining", "date_of_exit"}:
            value = parse_date(value)
            setattr(item, key, value)
            data[key] = value.isoformat() if value else None
        elif key == "employee_name":
            if not str(value or "").strip():
                raise HTTPException(422, "Employee name cannot be empty")
            item.employee_name = str(value).strip(); data[key] = item.employee_name
        else:
            data[key] = str(value).strip() if value is not None else None
    if item.date_of_joining and item.date_of_exit and item.date_of_exit < item.date_of_joining:
        raise HTTPException(422, "Date of exit cannot be before date of joining")
    item.active = not bool(item.date_of_exit); item.data_json = json.dumps(data); audit(db, organization_id=item.organization_id, actor_id=user.id, action="UPDATE_REGISTER_EMPLOYEE", module="REGISTERS", entity_type="RegisterEmployee", entity_id=item.id); db.commit()
    return {**model_dict(item, [field.name for field in item.__table__.columns]), "data": data}


def _list_dataset(dataset_type: str, entity_type: str, entity_id: str, period_key: str | None, page: int, page_size: int, user: User, db: Session):
    require_register_permission(db, user, "registers.read")
    organization_id = require_subject(db, user, entity_type, entity_id)
    if dataset_type == "PAYROLL" and not (has_permission(db, user, "registers.upload") or has_permission(db, user, "registers.review")):
        raise HTTPException(403, "Payroll detail is not available for this role")
    model = RegisterAttendance if dataset_type == "ATTENDANCE" else RegisterPayroll
    query = select(model).where(model.organization_id == organization_id, model.entity_type == entity_type, model.entity_id == entity_id)
    if period_key:
        query = query.where(func.strftime("%Y-%m", model.attendance_date) == period_key) if dataset_type == "ATTENDANCE" else query.where(model.period_key == period_key)
    size = min(max(page_size, 1), 100); total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(query.order_by(model.created_at.desc()).offset((max(page, 1) - 1) * size).limit(size))
    return {"items": [{**model_dict(item, [field.name for field in item.__table__.columns]), "data": json.loads(item.data_json or "{}") } for item in items], "total": total, "page": max(page, 1), "page_size": size}


@router.get("/attendance")
def list_attendance(entity_type: str, entity_id: str, period_key: str | None = None, page: int = 1, page_size: int = 25, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _list_dataset("ATTENDANCE", entity_type, entity_id, period_key, page, page_size, user, db)


@router.get("/payroll")
def list_payroll(entity_type: str, entity_id: str, period_key: str | None = None, page: int = 1, page_size: int = 25, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _list_dataset("PAYROLL", entity_type, entity_id, period_key, page, page_size, user, db)


@router.get("/readiness")
def register_readiness(entity_type: str, entity_id: str, period_key: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.read"); org = require_subject(db, user, entity_type, entity_id); ensure_catalogue(db, org, user.id)
    templates = db.execute(select(RegisterTemplate, RegisterTemplateVersion).join(RegisterTemplateVersion, RegisterTemplateVersion.template_id == RegisterTemplate.id).where(RegisterTemplate.organization_id == org, RegisterTemplateVersion.status == "PUBLISHED")).all()
    employee_count = db.scalar(select(func.count()).select_from(RegisterEmployee).where(RegisterEmployee.organization_id == org, RegisterEmployee.entity_type == entity_type, RegisterEmployee.entity_id == entity_id)) or 0
    attendance_count = db.scalar(select(func.count()).select_from(RegisterAttendance).where(RegisterAttendance.organization_id == org, RegisterAttendance.entity_type == entity_type, RegisterAttendance.entity_id == entity_id, func.strftime("%Y-%m", RegisterAttendance.attendance_date) == period_key)) or 0
    payroll_count = db.scalar(select(func.count()).select_from(RegisterPayroll).where(RegisterPayroll.organization_id == org, RegisterPayroll.entity_type == entity_type, RegisterPayroll.entity_id == entity_id, RegisterPayroll.period_key == period_key)) or 0
    available = {"EMPLOYEE": employee_count, "ATTENDANCE": attendance_count, "PAYROLL": payroll_count}
    existing = {
        item.template_version_id: item.status
        for item in db.scalars(select(GeneratedRegister).where(GeneratedRegister.organization_id == org, GeneratedRegister.entity_type == entity_type, GeneratedRegister.entity_id == entity_id, GeneratedRegister.period_key == period_key))
        if item.status not in {"REJECTED", "SUPERSEDED"}
    }
    result = []
    for template, version in templates:
        config = json.loads(version.config_json or "{}"); missing = [source for source in config.get("source_datasets", []) if not available.get(source)]
        workflow_status = existing.get(version.id)
        result.append({"template": template_dict(db, template, version), "status": (workflow_status or ("READY_TO_GENERATE" if not missing else "MISSING_DATA")), "missing_datasets": missing, "available_counts": available})
    return result


@router.post("/generate")
def generate_registers(payload: RegisterGenerationInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.generate"); org = require_subject(db, user, payload.entity_type, payload.entity_id)
    employees = list(db.scalars(select(RegisterEmployee).where(RegisterEmployee.organization_id == org, RegisterEmployee.entity_type == payload.entity_type, RegisterEmployee.entity_id == payload.entity_id)))
    attendance = list(db.scalars(select(RegisterAttendance).where(RegisterAttendance.organization_id == org, RegisterAttendance.entity_type == payload.entity_type, RegisterAttendance.entity_id == payload.entity_id, func.strftime("%Y-%m", RegisterAttendance.attendance_date) == payload.period_key)))
    payroll = list(db.scalars(select(RegisterPayroll).where(RegisterPayroll.organization_id == org, RegisterPayroll.entity_type == payload.entity_type, RegisterPayroll.entity_id == payload.entity_id, RegisterPayroll.period_key == payload.period_key)))
    available = {"EMPLOYEE": bool(employees), "ATTENDANCE": bool(attendance), "PAYROLL": bool(payroll)}; created = []
    for version_id in payload.template_version_ids:
        version = db.get(RegisterTemplateVersion, version_id); template = db.get(RegisterTemplate, version.template_id) if version else None
        if not version or not template or template.organization_id != org or version.status != "PUBLISHED": raise HTTPException(422, "Select active templates from your organization")
        config = json.loads(version.config_json or "{}"); missing = [source for source in config.get("source_datasets", []) if not available.get(source)]
        if missing: raise HTTPException(422, f"Additional Data Required for {template.code}: {', '.join(missing)}")
        prior = db.scalar(select(GeneratedRegister).where(GeneratedRegister.organization_id == org, GeneratedRegister.entity_type == payload.entity_type, GeneratedRegister.entity_id == payload.entity_id, GeneratedRegister.template_version_id == version.id, GeneratedRegister.period_key == payload.period_key).order_by(GeneratedRegister.version.desc()))
        # A corrected source dataset may legitimately create a new revision
        # after rejection *or approval*.  The approved output stays immutable
        # and traceable; only a mutable generated/submitted version blocks a
        # duplicate retry for the same template and period.
        if prior and prior.status in {"GENERATED", "SUBMITTED"}:
            raise HTTPException(409, f"{template.code} is already generated for this period")
        rows = register_rows(config, employees, attendance, payroll); revision = (prior.version + 1) if prior else 1
        content = {"columns": config.get("columns", []), "rows": rows, "entity_name": entity_name(db, payload.entity_type, payload.entity_id), "period_key": payload.period_key}
        generated = GeneratedRegister(organization_id=org, entity_type=payload.entity_type, entity_id=payload.entity_id, template_version_id=version.id, register_code=template.code, register_name=template.name, period_key=payload.period_key, due_date=payload.due_date, version=revision, status="GENERATED", employee_count=len(rows), validation_summary_json=json.dumps({"employee_count": len(employees), "attendance_count": len(attendance), "payroll_count": len(payroll)}), content_json=json.dumps(content, default=str), generated_by_id=user.id, supersedes_id=prior.id if prior else None)
        if prior and prior.status != "APPROVED":
            prior.status = "SUPERSEDED"
        db.add(generated); db.flush(); db.add(RegisterWorkflowHistory(register_id=generated.id, actor_id=user.id, action="GENERATE", from_status=None, to_status="GENERATED")); audit(db, organization_id=org, actor_id=user.id, action="GENERATE_REGISTER", module="REGISTERS", entity_type="GeneratedRegister", entity_id=generated.id, new={"code": template.code, "period": payload.period_key, "version": revision}); created.append(generated)
    db.commit(); return [register_dict(db, item, True) for item in created]


@router.get("")
def list_registers(entity_type: str | None = None, entity_id: str | None = None, status: str | None = None, period_key: str | None = None, q: str = "", page: int = 1, page_size: int = 25, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.read"); org = org_for(user); query = select(GeneratedRegister).where(GeneratedRegister.organization_id == org)
    if entity_type and entity_id: require_subject(db, user, entity_type, entity_id); query = query.where(GeneratedRegister.entity_type == entity_type, GeneratedRegister.entity_id == entity_id)
    # Dashboard metrics use a couple of explicit derived filters.  Keeping
    # those definitions here (rather than in the browser) guarantees that a
    # metric count and its table result are evaluated with the same tenant and
    # entity scope.
    normalized_status = (status or "").upper()
    if normalized_status == "PENDING_GENERATION":
        if not entity_type or not entity_id or not period_key:
            return {"items": [], "total": 0, "page": page, "page_size": page_size}
        readiness = register_readiness(entity_type, entity_id, period_key, user, db)
        items = [{"id": f"readiness:{item['template']['version']['id']}", "register_code": item["template"]["code"], "register_name": item["template"]["name"], "entity_type": entity_type, "entity_id": entity_id, "entity_name": entity_name(db, entity_type, entity_id), "period_key": period_key, "employee_count": 0, "generated_at": None, "due_date": None, "status": "PENDING_GENERATION", "row_version": 0, "is_overdue": False, "template_version": item["template"]["version"]["version"]} for item in readiness if item["status"] == "READY_TO_GENERATE"]
        return {"items": items, "total": len(items), "page": 1, "page_size": len(items) or page_size}
    if normalized_status == "VALIDATION_FAILED":
        uploads = select(RegisterUploadBatch).where(RegisterUploadBatch.organization_id == org, RegisterUploadBatch.status == "VALIDATION_FAILED")
        if entity_type and entity_id: uploads = uploads.where(RegisterUploadBatch.entity_type == entity_type, RegisterUploadBatch.entity_id == entity_id)
        if period_key: uploads = uploads.where(RegisterUploadBatch.period_key == period_key)
        batches = list(db.scalars(uploads.order_by(RegisterUploadBatch.created_at.desc())))
        items = [{"id": f"upload:{batch.id}", "register_code": batch.dataset_type, "register_name": f"{batch.dataset_type.title()} validation", "entity_type": batch.entity_type, "entity_id": batch.entity_id, "entity_name": entity_name(db, batch.entity_type, batch.entity_id), "period_key": batch.period_key or "—", "employee_count": batch.total_rows, "generated_at": batch.created_at, "due_date": None, "status": "VALIDATION_FAILED", "row_version": 0, "is_overdue": False, "template_version": None} for batch in batches]
        return {"items": items, "total": len(items), "page": 1, "page_size": len(items) or page_size}
    if normalized_status == "GENERATED_ANY":
        query = query.where(GeneratedRegister.status != "SUPERSEDED")
    elif normalized_status == "OVERDUE":
        query = query.where(GeneratedRegister.due_date.is_not(None), GeneratedRegister.due_date < date.today(), GeneratedRegister.status != "APPROVED")
    elif normalized_status:
        query = query.where(GeneratedRegister.status == normalized_status)
    if period_key: query = query.where(GeneratedRegister.period_key == period_key)
    if q: query = query.where((GeneratedRegister.register_name.ilike(f"%{q}%")) | (GeneratedRegister.register_code.ilike(f"%{q}%")))
    permitted = [item for item in db.scalars(query.order_by(GeneratedRegister.updated_at.desc())) if can_access_subject(db, user, org, item.entity_type, item.entity_id)]
    size = min(max(page_size, 1), 100); start = (max(page, 1)-1)*size
    page_items = permitted[start:start+size]
    reg_cache = register_list_cache(db, page_items)
    return {"items": [register_dict(db, item, cache=reg_cache) for item in page_items], "total": len(permitted), "page": page, "page_size": size}


@router.get("/dashboard")
def registers_dashboard(entity_type: str | None = None, entity_id: str | None = None, period_key: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.read"); org = org_for(user)
    if entity_type and entity_id: require_subject(db, user, entity_type, entity_id)
    ready = register_readiness(entity_type or "UNIT", entity_id or "", period_key or date.today().strftime("%Y-%m"), user, db) if entity_type and entity_id else []
    rows = [item for item in db.scalars(select(GeneratedRegister).where(GeneratedRegister.organization_id == org)) if can_access_subject(db, user, org, item.entity_type, item.entity_id)]
    if entity_type and entity_id: rows = [item for item in rows if item.entity_type == entity_type and item.entity_id == entity_id]
    if period_key: rows = [item for item in rows if item.period_key == period_key]
    presentation_cache = register_list_cache(db, rows)
    status = Counter(item.status for item in rows); overdue = sum(1 for item in rows if item.due_date and item.due_date < date.today() and item.status != "APPROVED")
    monthly: dict[str, dict[str, int]] = {}
    for item in rows:
        month = item.generated_at.strftime("%Y-%m")
        bucket = monthly.setdefault(month, {"month": month, "generated": 0, "approved": 0})
        if item.status != "SUPERSEDED":
            bucket["generated"] += 1
        if item.status == "APPROVED":
            bucket["approved"] += 1
    entities: dict[tuple[str, str], list[GeneratedRegister]] = defaultdict(list)
    for row in rows: entities[(row.entity_type, row.entity_id)].append(row)
    performance = [{"id": entity_id, "entity_type": entity_type, "name": presentation_cache["entity_names"].get((entity_type, entity_id), "Unknown entity"), "applicable": len(items), "generated": sum(item.status != "SUPERSEDED" for item in items), "approved": sum(item.status == "APPROVED" for item in items), "overdue": sum(bool(item.due_date and item.due_date < date.today() and item.status != "APPROVED") for item in items), "rate": round(100 * sum(item.status == "APPROVED" for item in items) / len(items), 1) if items else 0} for (entity_type, entity_id), items in entities.items()]
    return {"summary": {"total_applicable": len(ready) if ready else len(rows), "generated": sum(item.status not in {"SUPERSEDED"} for item in rows), "pending_generation": sum(item["status"] == "READY_TO_GENERATE" for item in ready), "validation_failed": db.scalar(select(func.count()).select_from(RegisterUploadBatch).where(RegisterUploadBatch.organization_id == org, RegisterUploadBatch.status == "VALIDATION_FAILED")) or 0, "pending_approval": status["SUBMITTED"], "approved": status["APPROVED"], "rejected": status["REJECTED"], "overdue": overdue}, "status_distribution": [{"name": key, "value": value} for key, value in sorted(status.items())], "generation_trend": [monthly[key] for key in sorted(monthly)[-12:]], "entity_performance": performance, "readiness": ready}


@router.get("/library/{register_id}")
def get_register(register_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.read"); return register_dict(db, get_register_or_404(db, user, register_id), True)


@router.get("/library/{register_id}/download.xlsx")
def download_register_xlsx(register_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.read"); item = get_register_or_404(db, user, register_id); output = io.BytesIO(xlsx_for_register(item)); output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{item.register_code}-{item.period_key}-v{item.version}.xlsx"'})


@router.get("/library/{register_id}/download.pdf")
def download_register_pdf(register_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.read"); item = get_register_or_404(db, user, register_id); output = io.BytesIO(basic_pdf(item)); output.seek(0)
    return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{item.register_code}-{item.period_key}-v{item.version}.pdf"'})


@router.post("/library/{register_id}/submit")
def submit_register(register_id: str, payload: RegisterDecisionInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.generate"); item = get_register_or_404(db, user, register_id)
    if item.row_version != payload.row_version: raise HTTPException(409, "This register changed; refresh and try again")
    if item.status not in {"GENERATED", "REJECTED"}: raise HTTPException(409, "Only generated or rejected registers can be submitted")
    old = item.status; item.status = "SUBMITTED"; item.submitted_at = datetime.now(UTC); item.row_version += 1; db.add(RegisterWorkflowHistory(register_id=item.id, actor_id=user.id, action="RESUBMIT" if old == "REJECTED" else "SUBMIT", from_status=old, to_status="SUBMITTED", remarks=payload.remarks)); notify(db, item, checker_recipients(db, item.organization_id, item.entity_type, item.entity_id), "RESUBMITTED" if old == "REJECTED" else "SUBMITTED", "Register awaiting your review", item.register_name, "HIGH"); audit(db, organization_id=item.organization_id, actor_id=user.id, action="SUBMIT_REGISTER", module="REGISTERS", entity_type="GeneratedRegister", entity_id=item.id, old={"status": old}, new={"status": item.status}); db.commit(); return register_dict(db, item, True)


@router.get("/reviews/pending")
def pending_register_reviews(user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.review"); org = org_for(user); rows = [item for item in db.scalars(select(GeneratedRegister).where(GeneratedRegister.organization_id == org, GeneratedRegister.status == "SUBMITTED").order_by(GeneratedRegister.submitted_at)) if can_access_subject(db, user, org, item.entity_type, item.entity_id)]
    cache = register_list_cache(db, rows)
    return {"items": [register_dict(db, item, cache=cache) for item in rows], "total": len(rows)}


def review_register(register_id: str, payload: RegisterDecisionInput, decision: str, user: User, db: Session) -> dict:
    require_register_permission(db, user, "registers.review"); item = get_register_or_404(db, user, register_id)
    if item.status != "SUBMITTED": raise HTTPException(409, "Only submitted registers can be reviewed")
    if item.row_version != payload.row_version: raise HTTPException(409, "This register changed; refresh and try again")
    if decision == "REJECTED" and not (payload.remarks or "").strip(): raise HTTPException(422, "Remarks are required when rejecting a register")
    if item.generated_by_id == user.id: raise HTTPException(403, "A Maker cannot approve or reject their own register")
    old = item.status; item.status = decision; item.row_version += 1; item.approved_at = datetime.now(UTC) if decision == "APPROVED" else None; item.approved_by_id = user.id if decision == "APPROVED" else None; db.add(RegisterWorkflowHistory(register_id=item.id, actor_id=user.id, action=decision, from_status=old, to_status=decision, remarks=payload.remarks)); notify(db, item, [item.generated_by_id], decision, "Register approved" if decision == "APPROVED" else "Register requires correction", payload.remarks, "HIGH" if decision == "REJECTED" else "NORMAL"); audit(db, organization_id=item.organization_id, actor_id=user.id, action=f"{decision}_REGISTER", module="REGISTERS", entity_type="GeneratedRegister", entity_id=item.id, old={"status": old}, new={"status": decision}, reason=payload.remarks); db.commit(); return register_dict(db, item, True)


@router.post("/library/{register_id}/approve")
def approve_register(register_id: str, payload: RegisterDecisionInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return review_register(register_id, payload, "APPROVED", user, db)


@router.post("/library/{register_id}/reject")
def reject_register(register_id: str, payload: RegisterDecisionInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return review_register(register_id, payload, "REJECTED", user, db)


@router.post("/library/{register_id}/compliance-links")
def link_register_to_compliance(register_id: str, payload: RegisterComplianceLinkInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_register_permission(db, user, "registers.generate"); item = get_register_or_404(db, user, register_id)
    if item.status != "APPROVED": raise HTTPException(422, "Only an approved register can be linked as compliance evidence")
    instance = db.get(ComplianceInstance, payload.compliance_instance_id)
    if not instance or instance.organization_id != item.organization_id or instance.subject_type != item.entity_type or instance.subject_id != item.entity_id: raise HTTPException(422, "Compliance obligation must belong to the same authorized entity")
    if getattr(instance, "period_key", None) and instance.period_key != item.period_key: raise HTTPException(422, "Compliance period must match the register period")
    prior = db.scalar(select(RegisterComplianceLink).where(RegisterComplianceLink.register_id == item.id, RegisterComplianceLink.compliance_instance_id == instance.id))
    if prior: return model_dict(prior, [field.name for field in prior.__table__.columns])
    contents = xlsx_for_register(item); stored_name = f"register-{uuid4()}.xlsx"; settings.upload_path.mkdir(parents=True, exist_ok=True); (settings.upload_path / stored_name).write_bytes(contents)
    evidence = ComplianceEvidence(instance_id=instance.id, category="APPROVED_REGISTER", version=(db.scalar(select(func.max(ComplianceEvidence.version)).where(ComplianceEvidence.instance_id == instance.id, ComplianceEvidence.category == "APPROVED_REGISTER")) or 0) + 1, original_filename=f"{item.register_code}-{item.period_key}-approved.xlsx", stored_filename=stored_name, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size_bytes=len(contents), checksum_sha256=hashlib.sha256(contents).hexdigest(), uploaded_by_id=user.id, verification_state="VERIFIED", verified_by_id=item.approved_by_id, verified_at=item.approved_at)
    db.add(evidence); db.flush()
    link = RegisterComplianceLink(register_id=item.id, compliance_instance_id=instance.id, linked_by_id=user.id, evidence_id=evidence.id)
    db.add(link); db.flush()
    audit(db, organization_id=item.organization_id, actor_id=user.id, action="LINK_REGISTER_TO_COMPLIANCE", module="REGISTERS", entity_type="RegisterComplianceLink", entity_id=link.id, new={"register_id": item.id, "compliance_instance_id": instance.id})
    db.commit(); return model_dict(link, [field.name for field in link.__table__.columns])
