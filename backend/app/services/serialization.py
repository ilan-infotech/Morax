import json
from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import ComplianceAssignment, ComplianceEvidence, ComplianceInstance, ComplianceRule, ComplianceRuleVersion, Contractor, ContractorSite, IndustryType, State, Unit, User, UserRoleScope
from app.services.compliance import compliance_display_status


def value(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def model_dict(model: Any, fields: list[str]) -> dict[str, Any]:
    return {field: value(getattr(model, field)) for field in fields}


def entity_dict(db: Session, entity: Any, kind: str) -> dict[str, Any]:
    fields = [field.name for field in entity.__table__.columns]
    result = model_dict(entity, fields)
    result["entity_type"] = kind
    if kind == "UNIT":
        result["total_employees"] = entity.total_employees
        try:
            result["compliance_types"] = json.loads(entity.compliance_types_json or "[]")
        except (TypeError, ValueError):
            result["compliance_types"] = []
    if kind in {"CONTRACTOR", "CONTRACTOR_SITE"}:
        result["total_workers"] = entity.total_workers
    if kind == "CONTRACTOR":
        contractor_makers = (
            db.query(User)
            .join(UserRoleScope, UserRoleScope.user_id == User.id)
            .filter(
                UserRoleScope.role == "CONTRACTOR_MAKER",
                UserRoleScope.scope_type == "CONTRACTOR",
                UserRoleScope.scope_id == entity.id,
            )
            .order_by(User.name, User.id)
            .all()
        )
        result["contractor_makers"] = [
            {"id": maker.id, "name": maker.name, "email": maker.email, "active": maker.active}
            for maker in contractor_makers
        ]
    if getattr(entity, "state_id", None):
        state = db.get(State, entity.state_id)
        result["state_name"] = state.name if state else None
    if getattr(entity, "industry_type_id", None):
        industry = db.get(IndustryType, entity.industry_type_id)
        result["industry_master_name"] = industry.name if industry else None
        result["industry_name"] = getattr(entity, "other_industry_name", None) or (industry.name if industry else None)
    return result


def subject_name(db: Session, instance: ComplianceInstance, cache: dict | None = None) -> str:
    cache = cache or {}
    subject = cache.get(instance.subject_type, {}).get(instance.subject_id)
    if not subject:
        model = {"UNIT": Unit, "CONTRACTOR": Contractor, "CONTRACTOR_SITE": ContractorSite}[instance.subject_type]
        subject = db.get(model, instance.subject_id)
    return subject.name if subject else "Deleted subject"


def subject_context(db: Session, instance: ComplianceInstance, cache: dict | None = None) -> dict[str, str | None]:
    """Return presentation details for a single authorized compliance subject.

    The compliance instance stores the source subject id.  Detail popups also
    need its related unit, contractor, and state labels, but those values must
    remain derived from the actual subject records rather than duplicated into
    a compliance snapshot.
    """
    cache = cache or {}
    unit: Unit | None = None
    contractor: Contractor | None = None
    site: ContractorSite | None = None
    if instance.subject_type == "UNIT":
        unit = cache.get("UNIT", {}).get(instance.subject_id) or db.get(Unit, instance.subject_id)
    elif instance.subject_type == "CONTRACTOR":
        contractor = cache.get("CONTRACTOR", {}).get(instance.subject_id) or db.get(Contractor, instance.subject_id)
        if contractor and contractor.unit_id:
            unit = cache.get("UNIT", {}).get(contractor.unit_id) or db.get(Unit, contractor.unit_id)
    elif instance.subject_type == "CONTRACTOR_SITE":
        site = cache.get("CONTRACTOR_SITE", {}).get(instance.subject_id) or db.get(ContractorSite, instance.subject_id)
        if site:
            contractor = cache.get("CONTRACTOR", {}).get(site.contractor_id) or db.get(Contractor, site.contractor_id)
            if site.unit_id:
                unit = cache.get("UNIT", {}).get(site.unit_id) or db.get(Unit, site.unit_id)
            elif contractor and contractor.unit_id:
                unit = cache.get("UNIT", {}).get(contractor.unit_id) or db.get(Unit, contractor.unit_id)
    state_id = (
        getattr(site, "state_id", None)
        or getattr(contractor, "state_id", None)
        or getattr(unit, "state_id", None)
    )
    state = db.get(State, state_id) if state_id else None
    return {
        "unit_name": unit.name if unit else None,
        "contractor_name": contractor.name if contractor else None,
        "site_name": site.name if site else None,
        "state_name": state.name if state else None,
    }


def instance_dict(db: Session, instance: ComplianceInstance, detail: bool = False, cache: dict | None = None) -> dict[str, Any]:
    cache = cache or {}
    version = cache.get("versions", {}).get(instance.rule_version_id) or db.get(ComplianceRuleVersion, instance.rule_version_id)
    rule = cache.get("rules", {}).get(version.rule_id if version else None) or (db.get(ComplianceRule, version.rule_id) if version else None)
    try:
        snapshot = json.loads(instance.rule_snapshot_json or "{}")
    except (TypeError, json.JSONDecodeError):
        snapshot = {}

    # Compliance Master is the current authority; the period snapshot protects
    # historical details if a linked version is no longer available.  Do not
    # turn a genuinely blank master field into made-up legal content.
    def master_value(field: str, fallback: Any = None) -> Any:
        current = getattr(version, field, None) if version else None
        return current if current not in (None, "") else snapshot.get(field, fallback)

    result = model_dict(instance, [field.name for field in instance.__table__.columns])
    
    display_status = compliance_display_status(instance)
    result.update({
        "rule_id": rule.id if rule else None,
        "rule_name": master_value("name"),
        "compliance_id": rule.compliance_id if rule else snapshot.get("compliance_id"),
        "compliance_name": master_value("name"),
        "act": master_value("act"),
        "rule_reference": master_value("rule_reference"),
        "compliance_type": master_value("compliance_type"),
        "document_type": master_value("document_type", "PROCEDURAL") or "PROCEDURAL",
        "form_number": master_value("form_number"),
        "frequency": master_value("frequency"),
        "risk_level": master_value("risk_level"),
        "required_document": master_value("required_document"),
        "subject_name": subject_name(db, instance, cache),
        "is_overdue": display_status == "OVERDUE",
        "days_overdue": max(0, (date.today() - instance.due_date).days) if display_status == "OVERDUE" else 0,
        "display_status": display_status,
    })
    if detail:
        assignments = db.query(ComplianceAssignment).filter_by(instance_id=instance.id, active=True).all()
        evidence = db.query(ComplianceEvidence).filter_by(instance_id=instance.id).all()
        result["assignments"] = [model_dict(item, [field.name for field in item.__table__.columns]) for item in assignments]
        result["evidence"] = [model_dict(item, [field.name for field in item.__table__.columns]) for item in evidence]
        result["rule_snapshot"] = snapshot
        result["applicability"] = json.loads(instance.applicability_snapshot_json or "{}")
        result["subject_context"] = subject_context(db, instance, cache)
        result.update({
            "description": master_value("description"),
            "section": master_value("section"),
            "legal_description": master_value("legal_description"),
            "consequence_or_penalty": master_value("consequence_or_penalty"),
            "version": master_value("version"),
            "due_date_rule": master_value("due_date_rule"),
            "due_date_offset": master_value("due_date_offset"),
            "due_date_anchor": master_value("due_date_anchor"),
            "grace_days": master_value("grace_days"),
        })
        result["missing_legal_fields"] = [
            label for label, field in (
                ("Act", "act"),
                ("Section", "section"),
                ("Rule / legal reference", "rule_reference"),
                ("Rule description", "description"),
            ) if not result.get(field)
        ]
    return result
