import asyncio
import json
import logging
from datetime import date, timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api.v1.router import router
from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import (
    ComplianceInstance,
    ComplianceRule,
    ComplianceRuleVersion,
    City,
    Contractor,
    ContractorSite,
    IndustryType,
    Organization,
    RuleApplicabilityCriteria,
    State,
    Unit,
    User,
    UserRoleScope,
)
from app.services.qa_dataset import seed_qa_demo_workspace
from app.services.compliance import generate_for_subject
from app.services.notifications import schedule_compliance_reminders


logger = logging.getLogger("uvicorn.info")
_compliance_scheduler_task: asyncio.Task | None = None


def seed_dashboard_demo_data(db, organization: Organization) -> None:
    """Idempotent non-production data for the MORAX demo workspace only."""
    if organization.code != "MORAX-DEMO":
        return
    states = {
        state.code: state
        for state in db.scalars(select(State).where(State.active.is_(True)))
    }
    industry = db.scalar(select(IndustryType).where(IndustryType.code == "FACTORY"))
    if not industry or not states:
        return

    unit_specs = [
        ("DEMO-CHN", "Chennai Operations", "TN"),
        ("DEMO-BLR", "Bengaluru Operations", "KA"),
        ("DEMO-PUN", "Pune Operations", "MH"),
    ]
    units: list[Unit] = []
    for code, name, state_code in unit_specs:
        unit = db.scalar(
            select(Unit).where(
                Unit.organization_id == organization.id, Unit.code == code
            )
        )
        if not unit:
            unit = Unit(
                organization_id=organization.id,
                name=name,
                code=code,
                unit_type="DEMO_BRANCH",
                industry_type_id=industry.id,
                state_id=states[state_code].id,
                city=name.split()[0],
                male_employees=45,
                female_employees=36,
                compliance_start_date=date(2025, 1, 1),
                status="ACTIVE",
            )
            db.add(unit)
            db.flush()
        units.append(unit)

    contractor_specs = [
        ("DEMO-ALPHA", "Alpha Workforce Services", 0),
        ("DEMO-BRAVO", "Bravo Site Solutions", 0),
        ("DEMO-CREST", "Crest Labour Partners", 1),
        ("DEMO-DELTA", "Delta Facility Services", 1),
        ("DEMO-ECHO", "Echo Industrial Staffing", 2),
    ]
    contractors: list[Contractor] = []
    for code, name, unit_index in contractor_specs:
        contractor = db.scalar(
            select(Contractor).where(
                Contractor.organization_id == organization.id,
                Contractor.code == code,
            )
        )
        if not contractor:
            unit = units[unit_index]
            contractor = Contractor(
                organization_id=organization.id,
                unit_id=unit.id,
                name=name,
                code=code,
                contractor_type="DEMO_CONTRACTOR",
                industry_type_id=industry.id,
                state_id=unit.state_id,
                compliance_start_date=date(2025, 1, 1),
                male_workers=58,
                female_workers=29,
                status="ACTIVE",
            )
            db.add(contractor)
            db.flush()
        contractors.append(contractor)

    sites: list[ContractorSite] = []
    for index, contractor in enumerate(contractors):
        code = f"DEMO-SITE-{index + 1:02d}"
        site = db.scalar(
            select(ContractorSite).where(
                ContractorSite.contractor_id == contractor.id,
                ContractorSite.code == code,
            )
        )
        if not site:
            unit = next(item for item in units if item.id == contractor.unit_id)
            site = ContractorSite(
                organization_id=organization.id,
                contractor_id=contractor.id,
                unit_id=unit.id,
                name=f"{contractor.name} Site",
                code=code,
                unit_type="DEMO_SITE",
                industry_type_id=industry.id,
                state_id=unit.state_id,
                city=unit.city,
                male_workers=31,
                female_workers=19,
                compliance_start_date=date(2025, 1, 1),
                status="ACTIVE",
            )
            db.add(site)
            db.flush()
        sites.append(site)

    rule_specs = [
        ("DEMO-UI-UNIT-MONTHLY", "Demo unit monthly review", "UNIT", "MONTHLY", "HIGH"),
        ("DEMO-UI-UNIT-QUARTER", "Demo unit quarterly review", "UNIT", "QUARTERLY", "MEDIUM"),
        ("DEMO-UI-CONTRACTOR-MONTHLY", "Demo contractor monthly review", "CONTRACTOR", "MONTHLY", "CRITICAL"),
        ("DEMO-UI-CONTRACTOR-ANNUAL", "Demo contractor annual review", "CONTRACTOR", "ANNUAL", "LOW"),
        ("DEMO-UI-SITE-MONTHLY", "Demo site monthly review", "CONTRACTOR_SITE", "MONTHLY", "HIGH"),
        ("DEMO-UI-SITE-ONE-TIME", "Demo site onboarding record", "CONTRACTOR_SITE", "ONE_TIME", "MEDIUM"),
    ]
    versions: dict[str, ComplianceRuleVersion] = {}
    for compliance_id, name, entity_type, frequency, risk_level in rule_specs:
        rule = db.scalar(
            select(ComplianceRule).where(
                ComplianceRule.organization_id == organization.id,
                ComplianceRule.compliance_id == compliance_id,
            )
        )
        if not rule:
            rule = ComplianceRule(
                organization_id=organization.id,
                compliance_id=compliance_id,
            )
            db.add(rule)
            db.flush()
        version = db.scalar(
            select(ComplianceRuleVersion).where(
                ComplianceRuleVersion.rule_id == rule.id,
                ComplianceRuleVersion.version == 1,
            )
        )
        if not version:
            version = ComplianceRuleVersion(
                rule_id=rule.id,
                version=1,
                name=name,
                description="Seeded non-production data for dashboard visual testing.",
                document_type="PROCEDURAL",
                frequency=frequency,
                due_date_rule="MANUAL",
                required_document="Demo supporting evidence",
                risk_level=risk_level,
                effective_from=date(2025, 1, 1),
                active=True,
            )
            db.add(version)
            db.flush()
        if not db.scalar(
            select(RuleApplicabilityCriteria).where(
                RuleApplicabilityCriteria.rule_version_id == version.id
            )
        ):
            db.add(
                RuleApplicabilityCriteria(
                    rule_version_id=version.id,
                    entity_type=entity_type,
                )
            )
        versions[compliance_id] = version

    subject_sets = {
        "UNIT": units,
        "CONTRACTOR": contractors,
        "CONTRACTOR_SITE": sites,
    }
    # Relative dates keep the demo useful regardless of when the MVP is run:
    # overdue, due in a few days, next week, and later in the current cycle.
    offsets = [-18, -7, -2, 2, 5, 9, 13, 21]
    statuses = [
        "PENDING",
        "IN_PROGRESS",
        "APPROVED",
        "SUBMITTED",
        "UNDER_REVIEW",
        "CORRECTION_REQUIRED",
        "REJECTED",
        "APPROVED",
    ]
    sequence = 0
    for compliance_id, name, entity_type, frequency, risk_level in rule_specs:
        version = versions[compliance_id]
        for subject in subject_sets[entity_type]:
            existing = db.scalar(
                select(ComplianceInstance).where(
                    ComplianceInstance.rule_version_id == version.id,
                    ComplianceInstance.subject_type == entity_type,
                    ComplianceInstance.subject_id == subject.id,
                    ComplianceInstance.period_key == "DEMO-2026-09",
                    ComplianceInstance.occurrence_key == "DASHBOARD_DEMO",
                )
            )
            status = statuses[sequence % len(statuses)]
            due_date = date.today() + timedelta(days=offsets[sequence % len(offsets)])
            completed_late = status == "APPROVED" and due_date < date.today()
            if existing:
                # These are explicitly non-production visual-test records. Keep
                # their timeline relative to today so the dashboard always has
                # meaningful upcoming and overdue states to demonstrate.
                existing.status = status
                existing.due_date = due_date
                existing.completed_on = date.today() if status == "APPROVED" else None
                existing.completion_late = completed_late if status == "APPROVED" else None
                sequence += 1
                continue
            db.add(
                ComplianceInstance(
                    organization_id=organization.id,
                    rule_version_id=version.id,
                    subject_type=entity_type,
                    subject_id=subject.id,
                    unit_id=subject.id if entity_type == "UNIT" else None,
                    contractor_id=subject.id if entity_type == "CONTRACTOR" else None,
                    contractor_site_id=subject.id if entity_type == "CONTRACTOR_SITE" else None,
                    period_key="DEMO-2026-09",
                    occurrence_key="DASHBOARD_DEMO",
                    due_date=due_date,
                    status=status,
                    completed_on=date.today() if status == "APPROVED" else None,
                    completion_late=completed_late if status == "APPROVED" else None,
                    rule_snapshot_json=json.dumps(
                        {
                            "compliance_id": compliance_id,
                            "name": name,
                            "version": 1,
                            "frequency": frequency,
                            "required_document": "Demo supporting evidence",
                            "risk_level": risk_level,
                        }
                    ),
                    applicability_snapshot_json=json.dumps(
                        {
                            "seeded_demo": True,
                            "message": "Non-production dashboard visualisation data",
                        }
                    ),
                )
            )
            sequence += 1


def seed_baseline() -> None:
    db = SessionLocal()
    try:
        # Databases upgraded by the runtime schema helper can initially have a
        # NULL flag; only the explicit system tenant must ever be hidden.
        db.query(Organization).filter(Organization.is_system.is_(None)).update({Organization.is_system: False})
        for name, code in [
            ("Tamil Nadu", "TN"),
            ("Karnataka", "KA"),
            ("Maharashtra", "MH"),
            ("Delhi", "DL"),
            ("Telangana", "TS"),
            ("Gujarat", "GJ"),
        ]:
            if not db.scalar(select(State).where(State.code == code)): db.add(State(name=name, code=code))
        db.flush()
        for state_code, city_name in [
            ("TN", "Chennai"), ("TN", "Coimbatore"), ("TN", "Madurai"),
            ("KA", "Bengaluru"), ("KA", "Mysuru"),
            ("MH", "Mumbai"), ("MH", "Pune"), ("MH", "Nagpur"),
            ("DL", "New Delhi"), ("TS", "Hyderabad"), ("GJ", "Ahmedabad"), ("GJ", "Surat"),
        ]:
            state = db.scalar(select(State).where(State.code == state_code))
            if state and not db.scalar(select(City).where(City.state_id == state.id, City.name == city_name)):
                db.add(City(state_id=state.id, name=city_name))
        for name, code in [
            ("Air Transport Services", "AIR_TRANSPORT"), ("Any Central Govt. Undertaking", "CENTRAL_GOVT"), ("Any Other Industry", "OTHER"),
            ("Audio-video Production", "AUDIO_VIDEO"), ("Banking / Insurance", "BANKING"), ("Beedi & Cigar", "BEEDI"),
            ("Dock Work", "DOCK_WORK"), ("Factory", "FACTORY"), ("IT Services", "IT_SERVICES"), ("Mines", "MINES"),
            ("Motor Transport Undertaking", "MOTOR_TRANSPORT"), ("Newspapers Establishment", "NEWSPAPER"), ("Plantation", "PLANTATION"),
            ("Telecommunication Services", "TELECOM"), ("Commercial", "COMMERCIAL"),
            ("Manufacturing", "MANUFACTURING"), ("Healthcare Services", "HEALTHCARE"),
            ("Construction", "CONSTRUCTION"), ("Automobile", "AUTOMOBILE"),
        ]:
            if not db.scalar(select(IndustryType).where(IndustryType.code == code)): db.add(IndustryType(name=name, code=code))
        db.flush()
        organization = db.scalar(select(Organization).where(Organization.code == "MORAX-DEMO"))
        if not organization:
            organization = Organization(name="MORAX Platform System", legal_name="MORAX Platform System", code="MORAX-DEMO", compliance_start_date=date.today(), status="CONFIGURED", is_system=True)
            db.add(organization); db.flush()
        else:
            organization.is_system = True
        user = db.scalar(select(User).where(User.email == settings.bootstrap_admin_email.lower()))
        # Seamlessly repair the development account created by pre-release
        # builds that used a reserved `.local` address rejected by EmailStr.
        if not user and settings.bootstrap_admin_email == "admin@morax.example.com":
            user = db.scalar(select(User).where(User.email == "admin@morax.local"))
            if user:
                user.email = settings.bootstrap_admin_email
        if not user:
            user = User(organization_id=organization.id, name="MORAX Administrator", email=settings.bootstrap_admin_email.lower(), password_hash=hash_password(settings.bootstrap_admin_password), must_change_password=True)
            db.add(user); db.flush()
        # The configured bootstrap account is the only initial platform user.
        # Tenant administrators are represented separately as ORGANIZATION_ADMIN.
        user.platform_role = "MORAX_ADMIN"
        # Older deployments may have renamed the original bootstrap tenant.
        # Its association with the Product Admin is authoritative, so keep it
        # internal rather than showing it alongside customer organizations.
        if user.organization_id:
            platform_organization = db.get(Organization, user.organization_id)
            if platform_organization:
                platform_organization.is_system = True
        if not db.scalar(select(UserRoleScope).where(UserRoleScope.user_id == user.id, UserRoleScope.role == "ORGANIZATION_ADMIN", UserRoleScope.scope_id == organization.id)):
            db.add(UserRoleScope(user_id=user.id, role="ORGANIZATION_ADMIN", scope_type="ORGANIZATION", scope_id=organization.id))
        # Normal startup is idempotent. A platform-admin development reset
        # deliberately suppresses automatic QA data recreation for that
        # workspace, so it stays empty for manual scenario testing.
        if not organization.development_reset_at:
            seed_qa_demo_workspace(db, organization, preserve_demo_admin_id=user.id)
        db.commit()
    finally:
        db.close()


def generate_scheduled_unit_compliance(run_date: date | None = None) -> int:
    """Idempotently create due obligations for every active compliance subject.

    The function name is retained for compatibility with existing scripts.  A
    contractor or contractor-site rule must receive the same recurring cycle
    as a unit rule; otherwise those users could receive reminders only for
    manually generated records.
    """
    db = SessionLocal()
    created = []
    try:
        run_date = run_date or date.today()
        organizations = db.scalars(
            select(Organization).where(
                Organization.status == "ACTIVE",
                Organization.is_system.is_(False),
            )
        )
        for organization in organizations:
            subjects = (
                ("UNIT", Unit),
                ("CONTRACTOR", Contractor),
                ("CONTRACTOR_SITE", ContractorSite),
            )
            for subject_type, model in subjects:
                for subject in db.scalars(
                    select(model).where(
                        model.organization_id == organization.id,
                        model.status == "ACTIVE",
                    )
                ):
                    created.extend(
                        generate_for_subject(db, organization.id, subject_type, subject.id, run_date)
                    )
        db.commit()
        return len(created)
    except Exception:
        db.rollback()
        logger.exception("Scheduled Unit compliance generation failed")
        return 0
    finally:
        db.close()


def generate_scheduled_compliance_notifications(run_date: date | None = None) -> int:
    """Create idempotent deadline and pending-review notifications.

    This reuses the application's existing six-hour scheduler.  Each reminder
    has a stable event key, so an application restart or retry cannot duplicate
    the same day's notification.
    """
    db = SessionLocal()
    try:
        created = schedule_compliance_reminders(db, run_date)
        db.commit()
        return created
    except Exception:
        db.rollback()
        logger.exception("Scheduled compliance notification generation failed")
        return 0
    finally:
        db.close()


async def compliance_scheduler() -> None:
    """Run on startup and periodically; database uniqueness keeps it idempotent."""
    while True:
        created = await asyncio.to_thread(generate_scheduled_unit_compliance)
        notifications_created = await asyncio.to_thread(generate_scheduled_compliance_notifications)
        if created:
            logger.info("Scheduled compliance generation created %s obligations", created)
        if notifications_created:
            logger.info("Scheduled compliance reminder generation created %s notifications", notifications_created)
        await asyncio.sleep(6 * 60 * 60)


app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(router, prefix=settings.api_v1_prefix)


def ensure_database_schema() -> None:
    """Ensure all required database tables and columns exist in SQLite/Turso before running baseline seeding."""
    import logging
    from sqlalchemy import inspect, text
    from app.db.base import Base
    from app.db.session import engine
    import app.models  # noqa: F401 - registers all SQLAlchemy models

    logger = logging.getLogger("uvicorn.info")
    logger.info("Ensuring database tables exist...")
    Base.metadata.create_all(bind=engine)

    # Inspect and dynamically add any columns defined in models but missing in the database
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table_name, table in Base.metadata.tables.items():
            if inspector.has_table(table_name):
                existing_cols = {col["name"] for col in inspector.get_columns(table_name)}
                for col in table.columns:
                    if col.name not in existing_cols:
                        col_type = col.type.compile(engine.dialect)
                        logger.info(f"Adding missing column {table_name}.{col.name} ({col_type})...")
                        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col.name} {col_type}"))

        try:
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_active_compliance_assignment "
                    "ON compliance_assignments(instance_id, assignment_type) WHERE active = 1"
                )
            )
        except Exception:
            pass

        # The application supports runtime schema repair for existing local
        # installs as well as Alembic-managed production deployments.
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_organizations_is_system ON organizations (is_system)"))
        except Exception:
            pass

        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_auth_sessions_active_contractor_id ON auth_sessions (active_contractor_id)"))
        except Exception:
            pass

        # Runtime repair mirrors migration 0016 for local installs that use the
        # application's idempotent schema bootstrap instead of `alembic upgrade`.
        try:
            conn.execute(text(
                "UPDATE units SET effective_date = compliance_start_date "
                "WHERE effective_date IS NULL"
            ))
            conn.execute(text("""
                UPDATE units
                SET city_id = (
                    SELECT cities.id FROM cities
                    WHERE cities.state_id = units.state_id
                      AND LOWER(TRIM(cities.name)) = LOWER(TRIM(units.city))
                    LIMIT 1
                )
                WHERE city_id IS NULL AND city IS NOT NULL
            """))
        except Exception as e:
            logger.warning(f"Could not backfill Unit edit fields: {e}")

        # Synchronize alembic_version table to latest head
        try:
            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS alembic_version "
                    "(version_num VARCHAR(32) NOT NULL, PRIMARY KEY (version_num))"
                )
            )
            conn.execute(text("DELETE FROM alembic_version"))
            conn.execute(
                text("INSERT INTO alembic_version (version_num) VALUES ('0016_unit_edit_fields')")
            )
        except Exception as e:
            logger.warning(f"Could not synchronize alembic_version: {e}")

    logger.info("Database tables and columns verified.")


@app.on_event("startup")
async def startup() -> None:
    import sys, traceback
    try:
        settings.upload_path.mkdir(parents=True, exist_ok=True)
        ensure_database_schema()
        seed_baseline()
        global _compliance_scheduler_task
        _compliance_scheduler_task = asyncio.create_task(compliance_scheduler())
    except Exception as exc:
        sys.stderr.write(f"\nFATAL STARTUP EXCEPTION: {exc}\n")
        traceback.print_exc()
        sys.stderr.flush()
        raise


@app.on_event("shutdown")
async def shutdown() -> None:
    global _compliance_scheduler_task
    if _compliance_scheduler_task:
        _compliance_scheduler_task.cancel()
        try:
            await _compliance_scheduler_task
        except asyncio.CancelledError:
            pass
        _compliance_scheduler_task = None


@app.get("/health")
def health():
    return {"status": "ok", "service": "morax-api"}
