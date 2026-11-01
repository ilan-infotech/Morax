"""Central, idempotent in-app notification helpers.

Notifications are inserted in the caller's database transaction.  Therefore a
failed submission, review decision, or ticket operation rolls its notification
back with the business record.  Callers supply a stable event key whenever an
event may be retried or scheduled repeatedly.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ComplianceAssignment, ComplianceInstance, ContractorSite, GeneratedRegister, InAppNotification, LicenseRecord, User, UserRoleScope


def emit_notification(
    db: Session,
    *,
    organization_id: str,
    recipient_id: str,
    notification_type: str,
    category: str,
    event_type: str,
    priority: str,
    title: str,
    body: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    reference_type: str | None = None,
    reference_id: str | None = None,
    compliance_period_key: str | None = None,
    submission_revision: int | None = None,
    event_key: str | None = None,
) -> InAppNotification | None:
    """Queue one notification unless its recipient has already seen the event."""
    recipient = db.get(User, recipient_id)
    if not recipient or not recipient.active:
        return None
    if event_key and db.scalar(
        select(InAppNotification.id).where(
            InAppNotification.recipient_id == recipient_id,
            InAppNotification.event_key == event_key,
        ).limit(1)
    ):
        return None
    notification = InAppNotification(
        organization_id=organization_id,
        recipient_id=recipient_id,
        notification_type=notification_type,
        category=category,
        event_type=event_type,
        priority=priority,
        title=title[:250],
        body=body,
        entity_type=entity_type,
        entity_id=entity_id,
        reference_type=reference_type,
        reference_id=reference_id,
        compliance_period_key=compliance_period_key,
        submission_revision=submission_revision,
        event_key=event_key,
    )
    db.add(notification)
    return notification


def assignment_recipients(db: Session, instance_id: str, assignment_type: str) -> set[str]:
    """Resolve recipients from explicit work assignments and entity RBAC.

    Unit/Contractor forms persist Maker and Checker selections as
    ``UserRoleScope`` records, while the worklist can also have a specific
    ``ComplianceAssignment`` override.  Both are legitimate assignment paths;
    omitting the first one made normal form-created users miss workflow
    notifications despite being allowed to submit or review the compliance.
    """
    recipient_ids = set(
        db.scalars(
            select(ComplianceAssignment.user_id).where(
                ComplianceAssignment.instance_id == instance_id,
                ComplianceAssignment.assignment_type == assignment_type,
                ComplianceAssignment.active.is_(True),
            )
        )
    )
    instance = db.get(ComplianceInstance, instance_id)
    if not instance:
        return recipient_ids
    role_by_subject = {
        ("UNIT", "MAKER"): "UNIT_MAKER",
        ("UNIT", "CHECKER"): "UNIT_CHECKER",
        ("CONTRACTOR", "MAKER"): "CONTRACTOR_MAKER",
        ("CONTRACTOR", "CHECKER"): "CONTRACTOR_CHECKER",
    }
    scope_type = instance.subject_type
    scope_id = instance.subject_id
    if instance.subject_type == "CONTRACTOR_SITE":
        site = db.get(ContractorSite, instance.subject_id)
        if not site:
            return recipient_ids
        scope_type, scope_id = "CONTRACTOR", site.contractor_id
    role = role_by_subject.get((scope_type, assignment_type))
    if not role:
        return recipient_ids
    recipient_ids.update(db.scalars(
        select(UserRoleScope.user_id)
        .join(User, User.id == UserRoleScope.user_id)
        .where(
            UserRoleScope.scope_type == scope_type,
            UserRoleScope.scope_id == scope_id,
            UserRoleScope.role == role,
            User.active.is_(True),
        )
    ))
    return recipient_ids


def organization_admin_recipients(db: Session, organization_id: str) -> set[str]:
    return set(
        db.scalars(
            select(UserRoleScope.user_id)
            .join(User, User.id == UserRoleScope.user_id)
            .where(
                UserRoleScope.role == "ORGANIZATION_ADMIN",
                UserRoleScope.scope_type == "ORGANIZATION",
                UserRoleScope.scope_id == organization_id,
                User.active.is_(True),
            )
        )
    )


def compliance_label(instance: ComplianceInstance) -> str:
    return instance.activity_reference or f"Compliance due {instance.due_date.isoformat()}"


def notify_compliance_event(
    db: Session,
    instance: ComplianceInstance,
    *,
    recipient_ids: set[str],
    notification_type: str,
    event_type: str,
    title: str,
    body: str | None,
    priority: str = "NORMAL",
    submission_revision: int | None = None,
    event_suffix: str = "",
) -> int:
    base_key = f"compliance:{instance.id}:{event_type}:{submission_revision or 0}:{event_suffix}"
    created = 0
    for recipient_id in recipient_ids:
        if emit_notification(
            db,
            organization_id=instance.organization_id,
            recipient_id=recipient_id,
            notification_type=notification_type,
            category="COMPLIANCE" if "REVIEW" not in event_type and "SUBMIT" not in event_type else "SUBMISSION",
            event_type=event_type,
            priority=priority,
            title=title,
            body=body,
            entity_type=instance.subject_type,
            entity_id=instance.subject_id,
            reference_type="ComplianceInstance",
            reference_id=instance.id,
            compliance_period_key=instance.period_key,
            submission_revision=submission_revision,
            event_key=f"{base_key}:recipient:{recipient_id}",
        ):
            created += 1
    return created


def schedule_compliance_reminders(db: Session, run_date: date | None = None) -> int:
    """Create deadline/review reminders once per logical period and stage.

    The caller owns commit/rollback.  Overdue and review reminders run daily;
    retries on the same day share the same event key and are harmless.
    """
    run_date = run_date or datetime.now(UTC).date()
    created = 0
    instances = db.scalars(
        select(ComplianceInstance).where(
            ComplianceInstance.status.not_in(["APPROVED", "NOT_APPLICABLE", "CANCELLED"]),
        )
    )
    for instance in instances:
        maker_ids = assignment_recipients(db, instance.id, "MAKER")
        checker_ids = assignment_recipients(db, instance.id, "CHECKER")
        days_until_due = (instance.due_date - run_date).days
        reference = compliance_label(instance)
        if instance.status in {"PENDING", "IN_PROGRESS"}:
            stages = {
                7: ("DUE_IN_7_DAYS", "Compliance due in 7 days", "NORMAL"),
                3: ("DUE_IN_3_DAYS", "Compliance due in 3 days", "HIGH"),
                1: ("DUE_TOMORROW", "Compliance due tomorrow", "HIGH"),
                0: ("DUE_TODAY", "Compliance is due today", "HIGH"),
            }
            if days_until_due in stages:
                stage, title, priority = stages[days_until_due]
                created += notify_compliance_event(db, instance, recipient_ids=maker_ids, notification_type=stage, event_type=stage, title=title, body=reference, priority=priority, event_suffix=run_date.isoformat())
            elif days_until_due < 0:
                overdue_recipients = maker_ids | organization_admin_recipients(db, instance.organization_id)
                created += notify_compliance_event(db, instance, recipient_ids=overdue_recipients, notification_type="COMPLIANCE_OVERDUE", event_type="OVERDUE", title="Compliance is overdue", body=reference, priority="CRITICAL", event_suffix=run_date.isoformat())
        elif instance.status in {"SUBMITTED", "UNDER_REVIEW"}:
            created += notify_compliance_event(db, instance, recipient_ids=checker_ids, notification_type="PENDING_REVIEW", event_type="REVIEW_REMINDER", title="Compliance is awaiting your review", body=reference, priority="HIGH" if days_until_due <= 0 else "NORMAL", event_suffix=run_date.isoformat())
    return created


def schedule_register_reminders(db: Session, run_date: date | None = None) -> int:
    """Create idempotent due/overdue alerts for generated registers.

    Register workflow status deliberately remains independent of due-date
    state.  These notifications therefore do not mutate the register record
    and cannot turn a pending approval into a different workflow status.
    """
    run_date = run_date or datetime.now(UTC).date()
    created = 0
    role_map = {
        "UNIT": ("UNIT_MAKER", "UNIT_CHECKER"),
        "CONTRACTOR": ("CONTRACTOR_MAKER", "CONTRACTOR_CHECKER"),
    }
    all_sites = {s.id: s for s in db.scalars(select(ContractorSite))}
    all_scopes = list(
        db.scalars(
            select(UserRoleScope)
            .join(User, User.id == UserRoleScope.user_id)
            .where(
                UserRoleScope.scope_type.in_(["UNIT", "CONTRACTOR"]),
                UserRoleScope.role.in_(["UNIT_MAKER", "UNIT_CHECKER", "CONTRACTOR_MAKER", "CONTRACTOR_CHECKER"]),
                User.active.is_(True),
            )
        )
    )
    role_user_map: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for s in all_scopes:
        role_user_map[(s.scope_type, s.scope_id, s.role)].add(s.user_id)

    for register in db.scalars(select(GeneratedRegister).where(GeneratedRegister.status.not_in(["APPROVED", "SUPERSEDED"]))):
        if not register.due_date:
            continue
        scope_type, scope_id = register.entity_type, register.entity_id
        if scope_type == "CONTRACTOR_SITE":
            site = all_sites.get(scope_id)
            if not site:
                continue
            scope_type, scope_id = "CONTRACTOR", site.contractor_id
        roles = role_map.get(scope_type)
        if not roles:
            continue
        maker_ids = role_user_map.get((scope_type, scope_id, roles[0]), set())
        checker_ids = role_user_map.get((scope_type, scope_id, roles[1]), set())
        days_until_due = (register.due_date - run_date).days
        if register.status in {"GENERATED", "REJECTED"} and days_until_due in {7, 3, 1, 0}:
            stage = {7: "DUE_IN_7_DAYS", 3: "DUE_IN_3_DAYS", 1: "DUE_TOMORROW", 0: "DUE_TODAY"}[days_until_due]
            for recipient_id in maker_ids:
                created += int(emit_notification(db, organization_id=register.organization_id, recipient_id=recipient_id, notification_type=f"REGISTER_{stage}", category="REGISTER", event_type=stage, priority="HIGH" if days_until_due <= 1 else "NORMAL", title="Register generation is due", body=f"{register.register_name} ({register.period_key})", entity_type=register.entity_type, entity_id=register.entity_id, reference_type="GeneratedRegister", reference_id=register.id, event_key=f"register:{register.id}:v{register.version}:{stage}:{run_date}:{recipient_id}") is not None)
        elif days_until_due < 0:
            recipients = maker_ids | checker_ids | organization_admin_recipients(db, register.organization_id)
            for recipient_id in recipients:
                created += int(emit_notification(db, organization_id=register.organization_id, recipient_id=recipient_id, notification_type="REGISTER_OVERDUE", category="REGISTER", event_type="OVERDUE", priority="CRITICAL", title="Register is overdue", body=f"{register.register_name} ({register.period_key})", entity_type=register.entity_type, entity_id=register.entity_id, reference_type="GeneratedRegister", reference_id=register.id, event_key=f"register:{register.id}:v{register.version}:OVERDUE:{run_date}:{recipient_id}") is not None)
        elif register.status == "SUBMITTED":
            for recipient_id in checker_ids:
                created += int(emit_notification(db, organization_id=register.organization_id, recipient_id=recipient_id, notification_type="REGISTER_PENDING_REVIEW", category="REGISTER", event_type="REVIEW_REMINDER", priority="HIGH", title="Register is awaiting review", body=f"{register.register_name} ({register.period_key})", entity_type=register.entity_type, entity_id=register.entity_id, reference_type="GeneratedRegister", reference_id=register.id, event_key=f"register:{register.id}:v{register.version}:REVIEW:{run_date}:{recipient_id}") is not None)
    return created


def schedule_license_reminders(db: Session, run_date: date | None = None) -> int:
    """Create idempotent expiry reminders for expiring, non-archived licenses.

    A completed renewal changes the current validity dates, so future reminder
    stages use the new expiry and historical events remain audit evidence.
    """
    run_date = run_date or datetime.now(UTC).date()
    created = 0
    stages = {90: "DUE_IN_90_DAYS", 60: "DUE_IN_60_DAYS", 30: "DUE_IN_30_DAYS", 15: "DUE_IN_15_DAYS", 7: "DUE_IN_7_DAYS", 1: "DUE_TOMORROW", 0: "DUE_TODAY"}
    all_license_scopes = list(
        db.scalars(
            select(UserRoleScope)
            .join(User, User.id == UserRoleScope.user_id)
            .where(
                UserRoleScope.scope_type.in_(["UNIT", "CONTRACTOR"]),
                UserRoleScope.role.in_(["UNIT_MAKER", "CONTRACTOR_MAKER"]),
                User.active.is_(True),
            )
        )
    )
    license_scope_map: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for s in all_license_scopes:
        license_scope_map[(s.scope_type, s.scope_id, s.role)].add(s.user_id)

    for license_item in db.scalars(select(LicenseRecord).where(LicenseRecord.archived.is_(False), LicenseRecord.never_expires.is_(False), LicenseRecord.valid_until.is_not(None))):
        if not license_item.valid_until:
            continue
        days = (license_item.valid_until - run_date).days
        if days not in stages and days >= 0:
            continue
        recipients = organization_admin_recipients(db, license_item.organization_id)
        role = "UNIT_MAKER" if license_item.entity_type == "UNIT" else "CONTRACTOR_MAKER" if license_item.entity_type == "CONTRACTOR" else None
        if role:
            recipients.update(license_scope_map.get((license_item.entity_type, license_item.entity_id, role), set()))
        stage = stages.get(days, "OVERDUE")
        for recipient_id in recipients:
            created += int(emit_notification(
                db, organization_id=license_item.organization_id, recipient_id=recipient_id,
                notification_type=f"LICENSE_{stage}", category="LICENSE", event_type=stage,
                priority="CRITICAL" if days < 0 else "HIGH" if days <= 7 else "NORMAL",
                title="License is overdue" if days < 0 else "License expiry reminder",
                body=f"{license_item.license_name} expires {license_item.valid_until.isoformat()}",
                entity_type=license_item.entity_type, entity_id=license_item.entity_id,
                reference_type="LicenseRecord", reference_id=license_item.id,
                event_key=f"license:{license_item.id}:v{license_item.row_version}:{stage}:{run_date}:{recipient_id}",
            ) is not None)
    return created
