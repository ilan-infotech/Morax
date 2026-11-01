"""Tenant-isolated License Management API.

License validity, renewal state and compliance workflow state are deliberately
separate.  Requests obtain the tenant from the authenticated session only.
"""
from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import (
    ComplianceInstance, ComplianceRuleVersion, Contractor, ContractorSite,
    LicenseComplianceLink, LicenseComplianceMapping, LicenseDocument,
    LicenseRecord, LicenseRenewal, LicenseType, Unit, User,
)
from app.schemas import LicenseArchiveInput, LicenseComplianceMappingInput, LicenseInput, LicenseRenewalInput, LicenseTypeInput
from app.services.access import can_access_subject, current_user, has_permission, is_org_admin
from app.services.audit import audit
from app.services.notifications import emit_notification, organization_admin_recipients
from app.services.serialization import model_dict
from app.storage.files import delete_stored_file, file_path, save_upload

router = APIRouter(prefix="/licenses", tags=["licenses"])
ENTITY_MODELS = {"UNIT": Unit, "CONTRACTOR": Contractor, "CONTRACTOR_SITE": ContractorSite}
ALLOWED_DOCUMENT_EXTENSIONS = {".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"}
DEFAULT_LICENSE_TYPES = (
    ("Contract Labour License", "LABOUR_LICENSE", "CONTRACTOR"),
    ("Contract Labour Registration", "REGISTRATION", "UNIT"),
    ("BOCW Registration", "REGISTRATION", "UNIT"),
    ("Factory License", "LABOUR_LICENSE", "UNIT"),
    ("Shops and Establishments Registration", "REGISTRATION", "UNIT"),
    ("Trade License", "LICENSE", "UNIT"),
    ("Labour Welfare Registration", "REGISTRATION", "ALL"),
    ("Other Statutory Registration", "REGISTRATION", "ALL"),
    ("Other License / Permit", "LICENSE", "ALL"),
)


def org_for(user: User) -> str:
    organization_id = getattr(user, "_morax_active_organization_id", user.organization_id)
    if not organization_id:
        raise HTTPException(409, "An organization context is required")
    return organization_id


def require_license(db: Session, user: User, permission: str = "licenses.read") -> None:
    if not has_permission(db, user, permission):
        raise HTTPException(403, "You do not have permission to access License Management")


def require_subject(db: Session, user: User, entity_type: str, entity_id: str) -> str:
    if entity_type not in ENTITY_MODELS:
        raise HTTPException(422, "Entity Type must be UNIT, CONTRACTOR, or CONTRACTOR_SITE")
    organization_id = org_for(user)
    row = db.get(ENTITY_MODELS[entity_type], entity_id)
    if not row or row.organization_id != organization_id:
        raise HTTPException(404, "Entity not found in the active organization")
    if not can_access_subject(db, user, organization_id, entity_type, entity_id):
        raise HTTPException(403, "You are not authorized for this entity")
    return organization_id


def entity_name(db: Session, entity_type: str, entity_id: str) -> str:
    row = db.get(ENTITY_MODELS[entity_type], entity_id)
    return row.name if row else "Unknown entity"


def validity_status(item: LicenseRecord, today: date | None = None) -> str:
    today = today or datetime.now(UTC).date()
    if item.archived:
        return "ARCHIVED"
    if item.never_expires:
        return "ACTIVE"
    if not item.valid_until or item.valid_until < today:
        return "EXPIRED"
    if (item.valid_until - today).days <= item.reminder_days:
        return "EXPIRING_SOON"
    return "ACTIVE"


def license_dict(db: Session, item: LicenseRecord, detail: bool = False) -> dict:
    result = model_dict(item, [column.name for column in item.__table__.columns])
    kind = db.get(LicenseType, item.license_type_id)
    result.update({
        "status": validity_status(item), "entity_name": entity_name(db, item.entity_type, item.entity_id),
        "license_type": model_dict(kind, [column.name for column in kind.__table__.columns]) if kind else None,
        "days_remaining": None if item.never_expires or not item.valid_until else (item.valid_until - datetime.now(UTC).date()).days,
        "document_count": int(db.scalar(select(func.count()).select_from(LicenseDocument).where(LicenseDocument.license_id == item.id)) or 0),
    })
    if detail:
        documents = db.scalars(select(LicenseDocument).where(LicenseDocument.license_id == item.id).order_by(LicenseDocument.version.desc())).all()
        renewals = db.scalars(select(LicenseRenewal).where(LicenseRenewal.license_id == item.id).order_by(LicenseRenewal.sequence.desc())).all()
        links = db.scalars(select(LicenseComplianceLink).where(LicenseComplianceLink.license_id == item.id)).all()
        result["documents"] = [model_dict(row, [column.name for column in row.__table__.columns]) for row in documents]
        result["renewals"] = [model_dict(row, [column.name for column in row.__table__.columns]) for row in renewals]
        result["compliance_links"] = [model_dict(row, [column.name for column in row.__table__.columns]) for row in links]
    return result


def get_license(db: Session, user: User, license_id: str) -> LicenseRecord:
    item = db.get(LicenseRecord, license_id)
    if not item or item.organization_id != org_for(user):
        raise HTTPException(404, "License not found")
    require_subject(db, user, item.entity_type, item.entity_id)
    return item


def ensure_default_types(db: Session, organization_id: str, user_id: str) -> None:
    existing = set(db.scalars(select(LicenseType.name).where(LicenseType.organization_id == organization_id)))
    for name, category, scope in DEFAULT_LICENSE_TYPES:
        if name not in existing:
            db.add(LicenseType(organization_id=organization_id, name=name, category=category, applicable_entity_type=scope, created_by_id=user_id))
    db.flush()


def assert_type(db: Session, organization_id: str, entity_type: str, license_type_id: str) -> LicenseType:
    item = db.get(LicenseType, license_type_id)
    if not item or item.organization_id != organization_id or not item.active:
        raise HTTPException(422, "License Type is unavailable in the active organization")
    if item.applicable_entity_type not in {"ALL", entity_type}:
        raise HTTPException(422, "License Type is not applicable to this entity type")
    return item


def auto_link(db: Session, item: LicenseRecord, actor_id: str) -> int:
    """Link explicitly configured matching instances; never complete them."""
    mappings = list(db.scalars(select(LicenseComplianceMapping).where(
        LicenseComplianceMapping.organization_id == item.organization_id,
        LicenseComplianceMapping.license_type_id == item.license_type_id,
        LicenseComplianceMapping.entity_type == item.entity_type,
        LicenseComplianceMapping.evidence_linking_enabled.is_(True),
    )))
    if not mappings:
        return 0
    version_ids = [m.compliance_rule_version_id for m in mappings]
    instances = list(db.scalars(select(ComplianceInstance).where(
        ComplianceInstance.organization_id == item.organization_id,
        ComplianceInstance.rule_version_id.in_(version_ids),
        ComplianceInstance.subject_type == item.entity_type,
        ComplianceInstance.subject_id == item.entity_id,
    ).order_by(ComplianceInstance.due_date.desc())))
    latest_by_version: dict[str, ComplianceInstance] = {}
    for inst in instances:
        if inst.rule_version_id not in latest_by_version:
            latest_by_version[inst.rule_version_id] = inst

    existing_links = set(db.scalars(select(LicenseComplianceLink.compliance_instance_id).where(LicenseComplianceLink.license_id == item.id)))
    made = 0
    for mapping in mappings:
        instance = latest_by_version.get(mapping.compliance_rule_version_id)
        if instance and instance.id not in existing_links:
            db.add(LicenseComplianceLink(license_id=item.id, compliance_instance_id=instance.id, linked_by_id=actor_id))
            existing_links.add(instance.id)
            made += 1
    return made


@router.get("/types")
def list_types(include_inactive: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_license(db, user); organization_id = org_for(user); ensure_default_types(db, organization_id, user.id); db.commit()
    query = select(LicenseType).where(LicenseType.organization_id == organization_id)
    if not include_inactive: query = query.where(LicenseType.active.is_(True))
    return [model_dict(item, [column.name for column in item.__table__.columns]) for item in db.scalars(query.order_by(LicenseType.name))]


@router.post("/types", status_code=201)
def create_type(payload: LicenseTypeInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_license(db, user, "licenses.config.manage"); organization_id = org_for(user)
    if db.scalar(select(LicenseType.id).where(LicenseType.organization_id == organization_id, LicenseType.name == payload.name.strip())):
        raise HTTPException(409, "A License Type with this name already exists")
    item = LicenseType(organization_id=organization_id, created_by_id=user.id, **payload.model_dump()); db.add(item); db.flush()
    audit(db, organization_id=organization_id, actor_id=user.id, action="CREATE", module="LICENSE", entity_type="LicenseType", entity_id=item.id, new={"name": item.name}); db.commit()
    return model_dict(item, [column.name for column in item.__table__.columns])


@router.patch("/types/{license_type_id}")
def update_type(license_type_id: str, payload: LicenseTypeInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_license(db, user, "licenses.config.manage"); organization_id = org_for(user); item = db.get(LicenseType, license_type_id)
    if not item or item.organization_id != organization_id: raise HTTPException(404, "License Type not found")
    old = {"name": item.name, "active": item.active}
    for field, value in payload.model_dump().items(): setattr(item, field, value)
    audit(db, organization_id=organization_id, actor_id=user.id, action="UPDATE", module="LICENSE", entity_type="LicenseType", entity_id=item.id, old=old, new={"name": item.name, "active": item.active}); db.commit()
    return model_dict(item, [column.name for column in item.__table__.columns])


@router.get("/dashboard")
def dashboard(entity_type: str | None = None, entity_id: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_license(db, user); organization_id = org_for(user)
    if bool(entity_type) != bool(entity_id): raise HTTPException(422, "Entity Type and Entity ID must be supplied together")
    if entity_type: require_subject(db, user, entity_type, entity_id or "")
    records = [
        item for item in db.scalars(select(LicenseRecord).where(LicenseRecord.organization_id == organization_id))
        if can_access_subject(db, user, organization_id, item.entity_type, item.entity_id)
    ]
    if entity_type: records = [item for item in records if item.entity_type == entity_type and item.entity_id == entity_id]
    counts = {"all": len(records), "active": 0, "expiring_30": 0, "expired": 0, "archived": 0, "renewal_in_progress": 0}
    entities: dict[str, dict] = {}
    today = datetime.now(UTC).date()
    for item in records:
        status = validity_status(item, today)
        if status == "ACTIVE": counts["active"] += 1
        if status == "EXPIRED": counts["expired"] += 1
        if status == "ARCHIVED": counts["archived"] += 1
        if not item.archived and not item.never_expires and item.valid_until and 0 <= (item.valid_until - today).days <= 30: counts["expiring_30"] += 1
        if item.renewal_status == "IN_PROGRESS": counts["renewal_in_progress"] += 1
        key = f"{item.entity_type}:{item.entity_id}"; summary = entities.setdefault(key, {"entity_type": item.entity_type, "entity_id": item.entity_id, "entity_name": entity_name(db, item.entity_type, item.entity_id), "total": 0, "active": 0, "expired": 0, "expiring": 0})
        summary["total"] += 1; summary["active"] += int(status == "ACTIVE"); summary["expired"] += int(status == "EXPIRED"); summary["expiring"] += int(status == "EXPIRING_SOON")
    return {"summary": counts, "entity_summary": list(entities.values())}


@router.get("")
def list_licenses(page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), search: str | None = None, status: str | None = None, entity_type: str | None = None, entity_id: str | None = None, license_type_id: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_license(db, user); organization_id = org_for(user)
    if bool(entity_type) != bool(entity_id): raise HTTPException(422, "Entity Type and Entity ID must be supplied together")
    if entity_type: require_subject(db, user, entity_type, entity_id or "")
    query = select(LicenseRecord).where(LicenseRecord.organization_id == organization_id)
    if entity_type: query = query.where(LicenseRecord.entity_type == entity_type, LicenseRecord.entity_id == entity_id)
    if license_type_id: query = query.where(LicenseRecord.license_type_id == license_type_id)
    if search:
        term = f"%{search.strip()}%"; query = query.where(or_(LicenseRecord.license_name.ilike(term), LicenseRecord.license_number.ilike(term), LicenseRecord.issuing_department.ilike(term)))
    scoped = [item for item in db.scalars(query.order_by(LicenseRecord.valid_until.asc().nulls_last(), LicenseRecord.created_at.desc())) if can_access_subject(db, user, organization_id, item.entity_type, item.entity_id)]
    if status:
        wanted = status.upper(); scoped = [item for item in scoped if validity_status(item) == wanted or (wanted == "EXPIRING_30" and not item.archived and not item.never_expires and item.valid_until and 0 <= (item.valid_until - datetime.now(UTC).date()).days <= 30)]
    total = len(scoped); start = (page - 1) * page_size
    return {"items": [license_dict(db, item) for item in scoped[start:start + page_size]], "total": total, "page": page, "page_size": page_size}


@router.post("", status_code=201)
def create_license(payload: LicenseInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_license(db, user, "licenses.manage"); organization_id = require_subject(db, user, payload.entity_type, payload.entity_id); kind = assert_type(db, organization_id, payload.entity_type, payload.license_type_id)
    if payload.license_number and db.scalar(select(LicenseRecord.id).where(LicenseRecord.organization_id == organization_id, LicenseRecord.entity_type == payload.entity_type, LicenseRecord.entity_id == payload.entity_id, LicenseRecord.license_type_id == payload.license_type_id, LicenseRecord.license_number == payload.license_number, LicenseRecord.archived.is_(False))):
        raise HTTPException(409, "An active license with this type and number already exists for the entity")
    data = payload.model_dump(); data["license_name"] = data["license_name"].strip(); data["renewal_required"] = data["renewal_required"] and kind.renewal_required
    item = LicenseRecord(organization_id=organization_id, created_by_id=user.id, updated_by_id=user.id, **data); db.add(item); db.flush(); linked = auto_link(db, item, user.id)
    audit(db, organization_id=organization_id, actor_id=user.id, action="CREATE", module="LICENSE", entity_type="LicenseRecord", entity_id=item.id, new={"name": item.license_name, "linked_instances": linked}); db.commit()
    return license_dict(db, item, True)


@router.get("/{license_id}")
def license_detail(license_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_license(db, user); return license_dict(db, get_license(db, user, license_id), True)


@router.patch("/{license_id}")
def update_license(license_id: str, payload: LicenseInput, row_version: int = Query(..., ge=1), user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_license(db, user, "licenses.manage"); item = get_license(db, user, license_id); organization_id = org_for(user)
    if item.row_version != row_version: raise HTTPException(409, "This license was updated by another user. Refresh and try again.")
    require_subject(db, user, payload.entity_type, payload.entity_id); assert_type(db, organization_id, payload.entity_type, payload.license_type_id)
    old = {"valid_from": item.valid_from, "valid_until": item.valid_until, "license_number": item.license_number}
    for field, value in payload.model_dump().items(): setattr(item, field, value)
    item.updated_by_id = user.id; item.row_version += 1; auto_link(db, item, user.id)
    audit(db, organization_id=organization_id, actor_id=user.id, action="UPDATE", module="LICENSE", entity_type="LicenseRecord", entity_id=item.id, old=old, new={"valid_from": item.valid_from, "valid_until": item.valid_until, "license_number": item.license_number}); db.commit()
    return license_dict(db, item, True)


@router.post("/{license_id}/archive")
def archive_license(license_id: str, payload: LicenseArchiveInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_license(db, user, "licenses.manage"); item = get_license(db, user, license_id)
    if item.row_version != payload.row_version: raise HTTPException(409, "This license was updated by another user")
    item.archived = True; item.archived_at = datetime.now(UTC); item.archived_by_id = user.id; item.archive_reason = payload.reason; item.row_version += 1
    audit(db, organization_id=item.organization_id, actor_id=user.id, action="ARCHIVE", module="LICENSE", entity_type="LicenseRecord", entity_id=item.id, reason=payload.reason); db.commit(); return license_dict(db, item)


@router.post("/{license_id}/restore")
def restore_license(license_id: str, row_version: int = Query(..., ge=1), user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_license(db, user, "licenses.manage"); item = get_license(db, user, license_id)
    if item.row_version != row_version: raise HTTPException(409, "This license was updated by another user")
    item.archived = False; item.archived_at = None; item.archived_by_id = None; item.archive_reason = None; item.row_version += 1
    audit(db, organization_id=item.organization_id, actor_id=user.id, action="RESTORE", module="LICENSE", entity_type="LicenseRecord", entity_id=item.id); db.commit(); return license_dict(db, item)


def document_looks_safe(filename: str, content: bytes) -> bool:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_DOCUMENT_EXTENSIONS or not content: return False
    if suffix == ".pdf": return content.startswith(b"%PDF-")
    if suffix == ".png": return content.startswith(b"\x89PNG\r\n\x1a\n")
    if suffix in {".jpg", ".jpeg"}: return content.startswith(b"\xff\xd8\xff")
    if suffix == ".doc": return content.startswith(b"\xd0\xcf\x11\xe0")
    if suffix == ".docx": return content.startswith(b"PK\x03\x04")
    return False


@router.post("/{license_id}/documents", status_code=201)
async def upload_document(license_id: str, file: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_license(db, user, "licenses.manage"); item = get_license(db, user, license_id)
    raw = await file.read(); await file.seek(0)
    if not document_looks_safe(file.filename or "", raw): raise HTTPException(422, "The uploaded document type or content is invalid")
    stored, size, checksum = await save_upload(file)
    try:
        version = int(db.scalar(select(func.max(LicenseDocument.version)).where(LicenseDocument.license_id == item.id)) or 0) + 1
        doc = LicenseDocument(license_id=item.id, version=version, original_filename=file.filename or "document", stored_filename=stored, content_type=file.content_type, size_bytes=size, checksum_sha256=checksum, uploaded_by_id=user.id)
        db.add(doc); db.flush(); audit(db, organization_id=item.organization_id, actor_id=user.id, action="UPLOAD_DOCUMENT", module="LICENSE", entity_type="LicenseDocument", entity_id=doc.id, new={"license_id": item.id, "version": version}); db.commit()
        return model_dict(doc, [column.name for column in doc.__table__.columns])
    except Exception:
        delete_stored_file(stored); raise


@router.get("/{license_id}/documents/{document_id}/download")
def download_document(license_id: str, document_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_license(db, user); item = get_license(db, user, license_id); doc = db.get(LicenseDocument, document_id)
    if not doc or doc.license_id != item.id: raise HTTPException(404, "License document not found")
    return FileResponse(file_path(doc.stored_filename), filename=doc.original_filename, media_type=doc.content_type or "application/octet-stream")


@router.get("/{license_id}/renewals")
def list_renewals(license_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_license(db, user); item = get_license(db, user, license_id)
    return [model_dict(row, [column.name for column in row.__table__.columns]) for row in db.scalars(select(LicenseRenewal).where(LicenseRenewal.license_id == item.id).order_by(LicenseRenewal.sequence.desc()))]


@router.post("/{license_id}/renewals", status_code=201)
def initiate_renewal(license_id: str, payload: LicenseRenewalInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_license(db, user, "licenses.manage"); item = get_license(db, user, license_id)
    if item.archived or not item.renewal_required: raise HTTPException(422, "This license is not eligible for renewal")
    active = db.scalar(select(LicenseRenewal).where(LicenseRenewal.license_id == item.id, LicenseRenewal.status == "IN_PROGRESS"))
    if active: raise HTTPException(409, "A renewal is already in progress")
    sequence = int(db.scalar(select(func.max(LicenseRenewal.sequence)).where(LicenseRenewal.license_id == item.id)) or 0) + 1
    renewal = LicenseRenewal(license_id=item.id, sequence=sequence, previous_valid_from=item.valid_from, previous_valid_until=item.valid_until, application_number=payload.application_number, submitted_on=payload.submitted_on, new_license_number=payload.new_license_number, new_valid_from=payload.new_valid_from, new_valid_until=payload.new_valid_until, remarks=payload.remarks, created_by_id=user.id)
    item.renewal_status = "IN_PROGRESS"; item.row_version += 1; db.add(renewal); db.flush(); audit(db, organization_id=item.organization_id, actor_id=user.id, action="INITIATE_RENEWAL", module="LICENSE", entity_type="LicenseRenewal", entity_id=renewal.id, new={"license_id": item.id, "sequence": sequence}); db.commit(); return model_dict(renewal, [column.name for column in renewal.__table__.columns])


@router.post("/{license_id}/renewals/{renewal_id}/complete")
def complete_renewal(license_id: str, renewal_id: str, payload: LicenseRenewalInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_license(db, user, "licenses.manage"); item = get_license(db, user, license_id); renewal = db.get(LicenseRenewal, renewal_id)
    if not renewal or renewal.license_id != item.id: raise HTTPException(404, "Renewal not found")
    if renewal.status != "IN_PROGRESS": raise HTTPException(409, "This renewal has already been completed or closed")
    if not payload.new_valid_from or (not payload.new_valid_until and not payload.never_expires): raise HTTPException(422, "New Valid Until is required unless Does Not Expire is selected")
    if payload.row_version is not None and renewal.row_version != payload.row_version: raise HTTPException(409, "This renewal was updated by another user")
    renewal.new_license_number = payload.new_license_number or renewal.new_license_number; renewal.new_valid_from = payload.new_valid_from; renewal.new_valid_until = payload.new_valid_until; renewal.remarks = payload.remarks or renewal.remarks; renewal.status = "COMPLETED"; renewal.completed_at = datetime.now(UTC); renewal.completed_by_id = user.id; renewal.row_version += 1
    item.license_number = renewal.new_license_number or item.license_number; item.valid_from = renewal.new_valid_from; item.valid_until = None if payload.never_expires else renewal.new_valid_until; item.never_expires = payload.never_expires; item.renewal_status = "RENEWED"; item.updated_by_id = user.id; item.row_version += 1
    audit(db, organization_id=item.organization_id, actor_id=user.id, action="COMPLETE_RENEWAL", module="LICENSE", entity_type="LicenseRenewal", entity_id=renewal.id, new={"license_id": item.id, "valid_until": item.valid_until}); db.commit(); return license_dict(db, item, True)


@router.post("/compliance-mappings", status_code=201)
def create_compliance_mapping(payload: LicenseComplianceMappingInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_license(db, user, "licenses.config.manage"); organization_id = org_for(user); kind = assert_type(db, organization_id, payload.entity_type, payload.license_type_id); rule = db.get(ComplianceRuleVersion, payload.compliance_rule_version_id)
    if not rule: raise HTTPException(404, "Compliance Rule Version not found")
    if db.scalar(select(LicenseComplianceMapping.id).where(LicenseComplianceMapping.license_type_id == kind.id, LicenseComplianceMapping.compliance_rule_version_id == rule.id, LicenseComplianceMapping.entity_type == payload.entity_type)): raise HTTPException(409, "This license-to-compliance mapping already exists")
    item = LicenseComplianceMapping(organization_id=organization_id, **payload.model_dump()); db.add(item); db.flush(); audit(db, organization_id=organization_id, actor_id=user.id, action="CREATE_COMPLIANCE_MAPPING", module="LICENSE", entity_type="LicenseComplianceMapping", entity_id=item.id); db.commit(); return model_dict(item, [column.name for column in item.__table__.columns])
