import calendar
import json
from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    ApplicabilityEvaluation,
    ComplianceAssignment,
    ComplianceEvidence,
    ComplianceInstance,
    ComplianceRule,
    ComplianceRuleVersion,
    ComplianceSubmission,
    ComplianceWorkflowHistory,
    Contractor,
    ContractorSite,
    RuleApplicabilityCriteria,
    Unit,
)
from app.services.audit import audit


SUBJECTS = {"UNIT": Unit, "CONTRACTOR": Contractor, "CONTRACTOR_SITE": ContractorSite}


def period_for(frequency: str, as_of: date) -> str:
    frequency = frequency.upper()
    if frequency == "MONTHLY":
        return f"{as_of.year:04d}-{as_of.month:02d}"
    if frequency == "QUARTERLY":
        return f"{as_of.year:04d}-Q{((as_of.month - 1) // 3) + 1}"
    if frequency in {"HALF_YEARLY", "HALF-YEARLY"}:
        return f"{as_of.year:04d}-H{1 if as_of.month <= 6 else 2}"
    if frequency == "ANNUAL":
        return str(as_of.year)
    return "ONCE"


def period_end(frequency: str, as_of: date) -> date:
    frequency = frequency.upper()
    if frequency == "MONTHLY":
        return date(as_of.year, as_of.month, calendar.monthrange(as_of.year, as_of.month)[1])
    if frequency == "QUARTERLY":
        month = ((as_of.month - 1) // 3 + 1) * 3
        return date(as_of.year, month, calendar.monthrange(as_of.year, month)[1])
    if frequency in {"HALF_YEARLY", "HALF-YEARLY"}:
        month = 6 if as_of.month <= 6 else 12
        return date(as_of.year, month, calendar.monthrange(as_of.year, month)[1])
    if frequency == "ANNUAL":
        return date(as_of.year, 12, 31)
    return as_of


def calculate_due_date(version: ComplianceRuleVersion, as_of: date) -> date:
    rule = version.due_date_rule.upper()
    offset = version.due_date_offset or 0
    if rule == "FIXED_DAY_OF_MONTH":
        target = period_end(version.frequency, as_of)
        month = target.month + 1 if version.frequency.upper() == "MONTHLY" else target.month
        year = target.year + (1 if month == 13 else 0)
        month = 1 if month == 13 else month
        return date(year, month, min(max(offset, 1), calendar.monthrange(year, month)[1]))
    if rule == "DAYS_AFTER_PERIOD_END":
        return period_end(version.frequency, as_of) + timedelta(days=offset)
    if rule == "FIXED_ANNUAL_DATE":
        month = int((version.due_date_anchor or "01-01").split("-")[0])
        day = int((version.due_date_anchor or "01-01").split("-")[1])
        return date(as_of.year, month, min(day, calendar.monthrange(as_of.year, month)[1]))
    if rule == "ONE_TIME_CONFIGURED_DATE":
        if not version.due_date_anchor:
            raise HTTPException(422, "One-time configured date requires an ISO date anchor")
        return date.fromisoformat(version.due_date_anchor)
    raise HTTPException(422, f"Unsupported due-date rule: {version.due_date_rule}")


def evaluate(version: ComplianceRuleVersion, criteria: RuleApplicabilityCriteria, subject: object) -> tuple[bool, dict]:
    matches = {
        "entity_type": getattr(subject, "entity_type", None) == criteria.entity_type if criteria.entity_type == "UNIT" else criteria.entity_type == getattr(subject, "__subject_type__", None),
        "state": criteria.state_id is None or criteria.state_id == getattr(subject, "state_id", None),
        "industry_type": criteria.industry_type_id is None or criteria.industry_type_id == getattr(subject, "industry_type_id", None),
        "applicability_flag": criteria.applicability_flag,
    }
    return all(matches.values()), {"rule_version_id": version.id, "matched": matches, "criteria_notes": criteria.notes}


def active_versions(db: Session, organization_id: str, as_of: date):
    return db.query(ComplianceRuleVersion, ComplianceRule, RuleApplicabilityCriteria).join(
        ComplianceRule, ComplianceRule.id == ComplianceRuleVersion.rule_id
    ).join(
        RuleApplicabilityCriteria, RuleApplicabilityCriteria.rule_version_id == ComplianceRuleVersion.id
    ).filter(
        ComplianceRule.organization_id == organization_id,
        ComplianceRuleVersion.active.is_(True),
        ComplianceRuleVersion.effective_from <= as_of,
        (ComplianceRuleVersion.effective_to.is_(None)) | (ComplianceRuleVersion.effective_to >= as_of),
    ).all()


def generate_for_subject(db: Session, organization_id: str, subject_type: str, subject_id: str, as_of: date, actor_id: str | None = None) -> list[ComplianceInstance]:
    model = SUBJECTS.get(subject_type)
    if not model:
        raise HTTPException(422, "Unsupported compliance subject type")
    subject = db.get(model, subject_id)
    if not subject or subject.organization_id != organization_id:
        raise HTTPException(404, "Compliance subject not found")
    if subject.status != "ACTIVE":
        return []
    compliance_start = getattr(subject, "compliance_start_date", None) or getattr(subject, "effective_date", None)
    if compliance_start and as_of < compliance_start:
        return []
    setattr(subject, "__subject_type__", subject_type)
    created: list[ComplianceInstance] = []
    for version, rule, criteria in active_versions(db, organization_id, as_of):
        # Checklist imports without a configured scheduling rule are retained
        # in the Master but must not produce an invented legal due date.
        if version.due_date_rule.upper() == "MANUAL":
            continue
        applicable, explanation = evaluate(version, criteria, subject)
        db.add(ApplicabilityEvaluation(
            organization_id=organization_id, subject_type=subject_type, subject_id=subject_id,
            rule_version_id=version.id, applicable=applicable, explanation_json=json.dumps(explanation),
        ))
        if not applicable:
            continue
        key = period_for(version.frequency, as_of)
        existing = db.scalar(select(ComplianceInstance).where(
            ComplianceInstance.rule_version_id == version.id,
            ComplianceInstance.subject_type == subject_type,
            ComplianceInstance.subject_id == subject_id,
            ComplianceInstance.period_key == key,
            ComplianceInstance.occurrence_key == "STANDARD",
        ))
        if existing:
            continue
        instance = ComplianceInstance(
            organization_id=organization_id,
            rule_version_id=version.id,
            subject_type=subject_type,
            subject_id=subject_id,
            unit_id=subject_id if subject_type == "UNIT" else None,
            contractor_id=subject_id if subject_type == "CONTRACTOR" else None,
            contractor_site_id=subject_id if subject_type == "CONTRACTOR_SITE" else None,
            period_key=key,
            due_date=calculate_due_date(version, as_of),
            rule_snapshot_json=json.dumps({"compliance_id": rule.compliance_id, "name": version.name, "version": version.version, "frequency": version.frequency, "required_document": version.required_document, "risk_level": version.risk_level}),
            applicability_snapshot_json=json.dumps(explanation),
        )
        db.add(instance)
        db.flush()
        db.add(ComplianceWorkflowHistory(instance_id=instance.id, actor_id=actor_id, action="GENERATED", to_status="PENDING"))
        audit(db, organization_id=organization_id, actor_id=actor_id, action="GENERATE_COMPLIANCE", module="COMPLIANCE", entity_type="ComplianceInstance", entity_id=instance.id, new={"rule": rule.compliance_id, "period": key})
        created.append(instance)
    return created


def instance_assignments(db: Session, instance_id: str, assignment_type: str | None = None):
    query = db.query(ComplianceAssignment).filter_by(instance_id=instance_id, active=True)
    if assignment_type:
        query = query.filter_by(assignment_type=assignment_type)
    return query.all()


def assert_assignment_or_admin(db: Session, instance: ComplianceInstance, user_id: str, roles: set[str], assignment_type: str) -> None:
    if "ORGANIZATION_ADMIN" in roles or "UNIT_ADMIN" in roles or "CONTRACTOR_ADMIN" in roles:
        return
    if not any(item.user_id == user_id for item in instance_assignments(db, instance.id, assignment_type)):
        raise HTTPException(403, f"This compliance is not assigned to you as {assignment_type.lower()}")


def transition(db: Session, instance: ComplianceInstance, actor_id: str, action: str, target: str, comment: str | None = None) -> None:
    old = instance.status
    instance.status = target
    instance.row_version += 1
    db.add(ComplianceWorkflowHistory(instance_id=instance.id, actor_id=actor_id, action=action, from_status=old, to_status=target, comment=comment))
    audit(db, organization_id=instance.organization_id, actor_id=actor_id, action=action, module="COMPLIANCE", entity_type="ComplianceInstance", entity_id=instance.id, old={"status": old}, new={"status": target}, reason=comment)


def submit(db: Session, instance: ComplianceInstance, actor_id: str) -> None:
    if instance.status not in {"PENDING", "IN_PROGRESS", "CORRECTION_REQUIRED", "REJECTED"}:
        raise HTTPException(409, f"Cannot submit compliance in {instance.status} state")
    version = db.get(ComplianceRuleVersion, instance.rule_version_id)
    if not instance.activity_reference:
        raise HTTPException(422, "Filing/return reference is required before submission")
    if version.required_document and not db.query(ComplianceEvidence).filter_by(instance_id=instance.id, status="ACTIVE").first():
        raise HTTPException(422, f"Required evidence is missing: {version.required_document}")
    revision = (db.scalar(select(func.max(ComplianceSubmission.revision)).where(ComplianceSubmission.instance_id == instance.id)) or 0) + 1
    db.add(ComplianceSubmission(instance_id=instance.id, revision=revision, submitted_by_id=actor_id, activity_snapshot_json=json.dumps({"filing_reference": instance.activity_reference, "completed_on": str(instance.completed_on) if instance.completed_on else None, "amount": instance.amount, "remarks": instance.remarks})))
    instance.submitted_at = datetime.utcnow()
    transition(db, instance, actor_id, "SUBMIT", "SUBMITTED")
