import calendar
import json
from datetime import UTC, date, datetime, timedelta

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
    User,
)
from app.services.access import can_access_subject, platform_master_organization_id
from app.services.audit import audit


SUBJECTS = {"UNIT": Unit, "CONTRACTOR": Contractor, "CONTRACTOR_SITE": ContractorSite}


def normalize_frequency(frequency: str | None) -> str:
    """Return the canonical frequency used for periods and scheduling.

    Imports from older workbooks use both YEARLY/ANNUAL and HALF-YEARLY/
    HALF_YEARLY.  Keeping that normalization at the scheduling boundary makes
    old master records safe without treating a repeating rule as ONE_TIME.
    """
    value = (frequency or "").strip().upper().replace(" ", "_")
    return {
        "YEARLY": "ANNUAL",
        "HALF-YEARLY": "HALF_YEARLY",
        "HALF_YEARLY": "HALF_YEARLY",
    }.get(value, value)


def period_for(frequency: str, as_of: date) -> str:
    frequency = normalize_frequency(frequency)
    if frequency == "DAILY":
        return as_of.isoformat()
    if frequency == "WEEKLY":
        iso_year, iso_week, _ = as_of.isocalendar()
        return f"{iso_year:04d}-W{iso_week:02d}"
    if frequency == "MONTHLY":
        return f"{as_of.year:04d}-{as_of.month:02d}"
    if frequency == "QUARTERLY":
        return f"{as_of.year:04d}-Q{((as_of.month - 1) // 3) + 1}"
    if frequency == "HALF_YEARLY":
        return f"{as_of.year:04d}-H{1 if as_of.month <= 6 else 2}"
    if frequency == "ANNUAL":
        return str(as_of.year)
    return "ONCE"


def previous_month(as_of: date) -> date:
    """Return a representative date in the previous calendar month."""
    first = as_of.replace(day=1)
    return first - timedelta(days=1)


def obligation_period_date(frequency: str, run_date: date) -> date:
    """Resolve the legal period represented by a generation run.

    Monthly work is created after the wage/compliance month closes. Thus a run
    in October creates September work whose statutory deadline falls in October.
    Other frequencies retain their configured/current-period behavior until an
    approved close-period rule is configured for them.
    """
    return previous_month(run_date) if normalize_frequency(frequency) == "MONTHLY" else run_date


def period_start(frequency: str, as_of: date) -> date:
    frequency = normalize_frequency(frequency)
    if frequency == "DAILY":
        return as_of
    if frequency == "WEEKLY":
        return as_of - timedelta(days=as_of.weekday())
    if frequency == "MONTHLY":
        return as_of.replace(day=1)
    if frequency == "QUARTERLY":
        month = ((as_of.month - 1) // 3) * 3 + 1
        return date(as_of.year, month, 1)
    if frequency == "HALF_YEARLY":
        return date(as_of.year, 1 if as_of.month <= 6 else 7, 1)
    if frequency == "ANNUAL":
        return date(as_of.year, 1, 1)
    return as_of


def period_end(frequency: str, as_of: date) -> date:
    frequency = normalize_frequency(frequency)
    if frequency == "DAILY":
        return as_of
    if frequency == "WEEKLY":
        return as_of + timedelta(days=6 - as_of.weekday())
    if frequency == "MONTHLY":
        return date(as_of.year, as_of.month, calendar.monthrange(as_of.year, as_of.month)[1])
    if frequency == "QUARTERLY":
        month = ((as_of.month - 1) // 3 + 1) * 3
        return date(as_of.year, month, calendar.monthrange(as_of.year, month)[1])
    if frequency == "HALF_YEARLY":
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
        month = target.month + 1 if normalize_frequency(version.frequency) == "MONTHLY" else target.month
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


def _json_string_set(value: str | None, *, invalid_marker: str | None = None) -> set[str]:
    """Read controlled list fields without making malformed historical data match."""
    if not value:
        return set()
    try:
        decoded = json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return {invalid_marker} if invalid_marker else set()
    if not isinstance(decoded, list):
        return {invalid_marker} if invalid_marker else set()
    return {item.strip() for item in decoded if isinstance(item, str) and item.strip()}


def evaluate(
    version: ComplianceRuleVersion,
    criteria: RuleApplicabilityCriteria,
    subject: object,
    *,
    include_unit_compliance_type: bool = True,
) -> tuple[bool, dict]:
    worker_count = getattr(subject, "total_employees", None)
    if worker_count is None:
        worker_count = getattr(subject, "total_workers", None)
    required_types = _json_string_set(
        getattr(criteria, "unit_compliance_types_json", None),
        invalid_marker="__INVALID_MASTER_VALUE__",
    )
    selected_types: set[str] = set()
    if (
        getattr(subject, "entity_type", None) == "UNIT"
        or getattr(subject, "__subject_type__", None) == "UNIT"
    ):
        selected_types = _json_string_set(getattr(subject, "compliance_types_json", None))
    matches = {
        # Unit Compliance Type is deliberately excluded from the main Unit
        # applicability pass.  It is used only to find optional add-on rules
        # before candidates are merged in generate_for_subject.
        "unit_compliance_type": (
            not include_unit_compliance_type
            or not required_types
            or bool(required_types & selected_types)
        ),
        "entity_type": getattr(subject, "entity_type", None) == criteria.entity_type if criteria.entity_type == "UNIT" else criteria.entity_type == getattr(subject, "__subject_type__", None),
        "state": criteria.state_id is None or criteria.state_id == getattr(subject, "state_id", None),
        "industry_type": criteria.industry_type_id is None or criteria.industry_type_id == getattr(subject, "industry_type_id", None),
        "employee_threshold": criteria.employee_threshold is None or (worker_count is not None and worker_count >= criteria.employee_threshold),
        "applicability_flag": criteria.applicability_flag,
    }
    return all(matches.values()), {
        "rule_version_id": version.id,
        "matched": matches,
        "criteria_notes": criteria.notes,
        "unit_compliance_type_mode": "MATCH" if include_unit_compliance_type else "IGNORED_FOR_MAIN",
    }


def applies_in_month(version: ComplianceRuleVersion, as_of: date) -> bool:
    """Apply optional Compliance Master month restrictions deterministically."""
    if not version.applicable_months_json:
        return True
    try:
        months = {int(item) for item in json.loads(version.applicable_months_json)}
    except (TypeError, ValueError, json.JSONDecodeError):
        # A malformed historic value must not silently generate obligations.
        return False
    # An empty configured list means the rule applies in every normal period.
    # Pydantic serializes the default as the truthy string "[]", so checking
    # only the raw JSON value would incorrectly suppress every occurrence.
    return not months or as_of.month in months


def active_versions(db: Session, organization_id: str, as_of: date):
    master_org = platform_master_organization_id(db)
    earliest_period_date = previous_month(as_of).replace(day=1)
    return db.query(ComplianceRuleVersion, ComplianceRule, RuleApplicabilityCriteria).join(
        ComplianceRule, ComplianceRule.id == ComplianceRuleVersion.rule_id
    ).join(
        RuleApplicabilityCriteria, RuleApplicabilityCriteria.rule_version_id == ComplianceRuleVersion.id
    ).filter(
        ComplianceRule.organization_id == master_org,
        ComplianceRuleVersion.active.is_(True),
        ComplianceRuleVersion.effective_from <= as_of,
        (ComplianceRuleVersion.effective_to.is_(None)) | (ComplianceRuleVersion.effective_to >= earliest_period_date),
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
    setattr(subject, "__subject_type__", subject_type)
    created: list[ComplianceInstance] = []
    existing_keys = set(
        db.execute(
            select(ComplianceInstance.rule_version_id, ComplianceInstance.period_key).where(
                ComplianceInstance.subject_type == subject_type,
                ComplianceInstance.subject_id == subject_id,
                ComplianceInstance.occurrence_key == "STANDARD",
            )
        ).all()
    )
    active_rules = active_versions(db, organization_id, as_of)
    if subject_type == "UNIT":
        # Main compliance is selected without any Unit Compliance Type gate.
        # Rules that declare one or more Unit Compliance Types are optional
        # add-ons: matching selected types add them to the baseline rather
        # than narrowing it.
        selected_types = _json_string_set(getattr(subject, "compliance_types_json", None))
        candidates: dict[tuple[str, str], tuple[ComplianceRuleVersion, ComplianceRule, RuleApplicabilityCriteria, bool]] = {
            (rule.id, version.id): (version, rule, criteria, False)
            for version, rule, criteria in active_rules
            if not _json_string_set(
                criteria.unit_compliance_types_json,
                invalid_marker="__INVALID_MASTER_VALUE__",
            )
        }
        if selected_types:
            for version, rule, criteria in active_rules:
                configured_types = _json_string_set(
                    criteria.unit_compliance_types_json,
                    invalid_marker="__INVALID_MASTER_VALUE__",
                )
                if configured_types & selected_types:
                    candidates.setdefault((rule.id, version.id), (version, rule, criteria, True))
        rule_candidates = list(candidates.values())
    else:
        # Contractor and Contractor Site applicability remains unchanged.
        rule_candidates = [(*row, True) for row in active_rules]

    for version, rule, criteria, match_unit_compliance_type in rule_candidates:
        # Checklist imports without a configured scheduling rule are retained
        # in the Master but must not produce an invented legal due date.
        if version.due_date_rule.upper() == "MANUAL":
            continue
        period_date = obligation_period_date(version.frequency, as_of)
        period_first = period_start(version.frequency, period_date)
        period_last = period_end(version.frequency, period_date)
        if version.effective_from > period_last or (version.effective_to and version.effective_to < period_first):
            continue
        if compliance_start and compliance_start > period_last:
            continue
        if not applies_in_month(version, period_date):
            continue
        applicable, explanation = evaluate(
            version,
            criteria,
            subject,
            include_unit_compliance_type=match_unit_compliance_type,
        )
        db.add(ApplicabilityEvaluation(
            organization_id=organization_id, subject_type=subject_type, subject_id=subject_id,
            rule_version_id=version.id, applicable=applicable, explanation_json=json.dumps(explanation),
        ))
        if not applicable:
            continue
        key = period_for(version.frequency, period_date)
        if (version.id, key) in existing_keys:
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
            due_date=calculate_due_date(version, period_date),
            # Preserve the legal content used to create this period.  The Eye
            # dialog must be able to show a historical compliance accurately
            # even when a later Compliance Master version is edited or retired.
            rule_snapshot_json=json.dumps({
                "compliance_id": rule.compliance_id,
                "name": version.name,
                "version": version.version,
                "description": version.description,
                "act": version.act,
                "rule_reference": version.rule_reference,
                "section": version.section,
                "legal_description": version.legal_description,
                "consequence_or_penalty": version.consequence_or_penalty,
                "compliance_type": version.compliance_type,
                "document_type": version.document_type,
                "form_number": version.form_number,
                "frequency": version.frequency,
                "required_document": version.required_document,
                "risk_level": version.risk_level,
            }),
            applicability_snapshot_json=json.dumps(explanation),
        )
        db.add(instance)
        db.flush()
        db.add(ComplianceWorkflowHistory(instance_id=instance.id, actor_id=actor_id, action="GENERATED", to_status="PENDING"))
        audit(db, organization_id=organization_id, actor_id=actor_id, action="GENERATE_COMPLIANCE", module="COMPLIANCE", entity_type="ComplianceInstance", entity_id=instance.id, new={"rule": rule.compliance_id, "period": key})
        existing_keys.add((version.id, key))
        created.append(instance)
    return created


def generate_history_for_subject(
    db: Session,
    organization_id: str,
    subject_type: str,
    subject_id: str,
    as_of: date,
    actor_id: str | None = None,
) -> list[ComplianceInstance]:
    """Backfill applicable periods from an entity's compliance start date.

    Entity creation and later edits must not discard obligations that became
    due before the current scheduler run.  We generate only relevant calendar
    boundaries for each active frequency and rely on the stable
    rule-version/period key in ``generate_for_subject`` for idempotency.
    The scheduled job intentionally continues to call the current-period
    function directly.
    """
    model = SUBJECTS.get(subject_type)
    if not model:
        raise HTTPException(422, "Unsupported compliance subject type")
    subject = db.get(model, subject_id)
    if not subject or subject.organization_id != organization_id:
        raise HTTPException(404, "Compliance subject not found")
    if subject.status != "ACTIVE":
        return []
    start = getattr(subject, "compliance_start_date", None) or getattr(subject, "effective_date", None)
    if not start or start > as_of:
        return generate_for_subject(db, organization_id, subject_type, subject_id, as_of, actor_id)

    frequencies = {
        normalize_frequency(version.frequency)
        for version, _rule, _criteria in active_versions(db, organization_id, as_of)
    }
    run_dates = {start, as_of}

    def add_days(step: timedelta) -> None:
        cursor = start
        while cursor <= as_of:
            run_dates.add(cursor)
            cursor += step

    if "DAILY" in frequencies:
        add_days(timedelta(days=1))
    if "WEEKLY" in frequencies:
        cursor = start + timedelta(days=(7 - start.weekday()) % 7)
        while cursor <= as_of:
            run_dates.add(cursor)
            cursor += timedelta(days=7)
    if "MONTHLY" in frequencies:
        cursor = start.replace(day=1)
        while cursor <= as_of:
            run_dates.add(cursor)
            cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
    if "QUARTERLY" in frequencies:
        cursor = date(start.year, ((start.month - 1) // 3) * 3 + 1, 1)
        while cursor <= as_of:
            run_dates.add(cursor)
            month = cursor.month + 3
            cursor = date(cursor.year + (month > 12), ((month - 1) % 12) + 1, 1)
    if "HALF_YEARLY" in frequencies:
        cursor = date(start.year, 1 if start.month <= 6 else 7, 1)
        while cursor <= as_of:
            run_dates.add(cursor)
            month = cursor.month + 6
            cursor = date(cursor.year + (month > 12), ((month - 1) % 12) + 1, 1)
    if "ANNUAL" in frequencies:
        for year in range(start.year, as_of.year + 1):
            run_dates.add(date(year, 1, 1))

    created: list[ComplianceInstance] = []
    for run_date in sorted(run_dates):
        created.extend(generate_for_subject(db, organization_id, subject_type, subject_id, run_date, actor_id))
    return created


def compliance_display_status(instance: ComplianceInstance, today_value: date | None = None) -> str:
    """Return one date-aware status used by every compliance projection."""
    today_value = today_value or date.today()
    if instance.status == "APPROVED":
        return "COMPLETED_LATE" if instance.completion_late else "COMPLETED"
    if instance.status == "NOT_APPLICABLE":
        return "NOT_APPLICABLE"
    if instance.due_date < today_value:
        return "OVERDUE"
    if instance.due_date == today_value:
        return "DUE_TODAY"
    if instance.due_date <= today_value + timedelta(days=7):
        return "DUE_SOON"
    return "UPCOMING"


def instance_assignments(db: Session, instance_id: str, assignment_type: str | None = None):
    query = db.query(ComplianceAssignment).filter_by(instance_id=instance_id, active=True)
    if assignment_type:
        query = query.filter_by(assignment_type=assignment_type)
    return query.all()


def assert_assignment_or_admin(db: Session, instance: ComplianceInstance, user_id: str, roles: set[str], assignment_type: str) -> None:
    required_roles = (
        {"ORGANIZATION_ADMIN", "UNIT_ADMIN", "UNIT_MAKER", "CONTRACTOR_ADMIN", "CONTRACTOR_MAKER"}
        if assignment_type == "MAKER"
        else {"ORGANIZATION_ADMIN", "UNIT_ADMIN", "UNIT_CHECKER", "CONTRACTOR_ADMIN", "CONTRACTOR_CHECKER"}
    )
    user = db.get(User, user_id)
    if user and roles & required_roles and can_access_subject(
        db, user, instance.organization_id, instance.subject_type, instance.subject_id
    ):
        return
    if not any(item.user_id == user_id for item in instance_assignments(db, instance.id, assignment_type)):
        raise HTTPException(403, f"This compliance is not assigned to you as {assignment_type.lower()}")


def transition(
    db: Session,
    instance: ComplianceInstance,
    actor_id: str,
    action: str,
    target: str,
    comment: str | None = None,
    submission_revision: int | None = None,
) -> None:
    old = instance.status
    instance.status = target
    instance.row_version += 1
    db.add(ComplianceWorkflowHistory(
        instance_id=instance.id,
        actor_id=actor_id,
        action=action,
        from_status=old,
        to_status=target,
        comment=comment,
        submission_revision=submission_revision,
    ))
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
    instance.submitted_at = datetime.now(UTC)
    transition(db, instance, actor_id, "SUBMIT", "SUBMITTED", submission_revision=revision)
