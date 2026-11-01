"""Integration and tenant-security coverage for License Management."""
import asyncio
import io
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi import HTTPException, UploadFile
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.api.v1 import licenses as api
from app.core.config import settings
from app.db.base import Base
from app.models import ComplianceInstance, ComplianceRule, ComplianceRuleVersion, InAppNotification, IndustryType, LicenseComplianceLink, LicenseDocument, LicenseRenewal, Organization, State, Unit, User, UserRoleScope
from app.schemas import LicenseArchiveInput, LicenseComplianceMappingInput, LicenseInput, LicenseRenewalInput
from app.services.notifications import schedule_license_reminders


def active(user, org_id):
    setattr(user, "_morax_active_organization_id", org_id)
    return user


def seed(db):
    org_a, org_b = Organization(name="License Org A", code="LIC-A", status="ACTIVE"), Organization(name="License Org B", code="LIC-B", status="ACTIVE")
    state, industry = State(name="Karnataka", code="KA"), IndustryType(name="Factory", code="FAC")
    db.add_all([org_a, org_b, state, industry]); db.flush()
    unit_a1 = Unit(organization_id=org_a.id, name="A1", code="A1", state_id=state.id, industry_type_id=industry.id, employer_name="A", compliance_start_date=date(2020, 1, 1), status="ACTIVE")
    unit_a2 = Unit(organization_id=org_a.id, name="A2", code="A2", state_id=state.id, industry_type_id=industry.id, employer_name="A", compliance_start_date=date(2020, 1, 1), status="ACTIVE")
    unit_b1 = Unit(organization_id=org_b.id, name="B1", code="B1", state_id=state.id, industry_type_id=industry.id, employer_name="B", compliance_start_date=date(2020, 1, 1), status="ACTIVE")
    admin = User(organization_id=org_a.id, name="Admin", email="license-admin@test.local", password_hash="x", active=True)
    maker = User(organization_id=org_a.id, name="Maker", email="license-maker@test.local", password_hash="x", active=True)
    auditor = User(organization_id=org_a.id, name="Auditor", email="license-auditor@test.local", password_hash="x", active=True)
    outsider = User(organization_id=org_b.id, name="Outsider", email="license-outsider@test.local", password_hash="x", active=True)
    db.add_all([unit_a1, unit_a2, unit_b1, admin, maker, auditor, outsider]); db.flush()
    db.add_all([
        UserRoleScope(user_id=admin.id, role="ORGANIZATION_ADMIN", scope_type="ORGANIZATION", scope_id=org_a.id),
        UserRoleScope(user_id=maker.id, role="UNIT_MAKER", scope_type="UNIT", scope_id=unit_a1.id),
        UserRoleScope(user_id=auditor.id, role="AUDITOR", scope_type="UNIT", scope_id=unit_a1.id),
        UserRoleScope(user_id=outsider.id, role="UNIT_MAKER", scope_type="UNIT", scope_id=unit_b1.id),
    ]); db.commit()
    return org_a, org_b, unit_a1, unit_a2, unit_b1, active(admin, org_a.id), active(maker, org_a.id), active(auditor, org_a.id), active(outsider, org_b.id)


def payload(unit_id, type_id, **updates):
    base = dict(entity_type="UNIT", entity_id=unit_id, license_type_id=type_id, license_name="Factory License", license_number="FL-001", valid_from=date.today() - timedelta(days=10), valid_until=date.today() + timedelta(days=20), never_expires=False, renewal_required=True, reminder_days=30)
    base.update(updates)
    return LicenseInput(**base)


def test_license_lifecycle_documents_renewals_dashboard_and_mapping(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "private-files"))
    engine = create_engine("sqlite:///:memory:"); Base.metadata.create_all(engine)
    with Session(engine) as db:
        org, _, unit, _, _, admin, maker, _, _ = seed(db)
        types = api.list_types(False, admin, db)
        factory = next(item for item in types if item["name"] == "Factory License")
        created = api.create_license(payload(unit.id, factory["id"]), maker, db)
        assert created["status"] == "EXPIRING_SOON"
        assert api.list_licenses(1, 25, None, "EXPIRING_30", "UNIT", unit.id, None, maker, db)["total"] == 1
        dashboard = api.dashboard("UNIT", unit.id, maker, db)
        assert dashboard["summary"]["expiring_30"] == 1

        doc = asyncio.run(api.upload_document(created["id"], UploadFile(filename="license.pdf", file=io.BytesIO(b"%PDF-1.4 synthetic")), maker, db))
        assert doc["version"] == 1
        assert db.get(LicenseDocument, doc["id"]).size_bytes > 0
        detail = api.license_detail(created["id"], maker, db)
        assert detail["documents"][0]["original_filename"] == "license.pdf"
        assert api.list_licenses(1, 25, None, None, "UNIT", unit.id, None, maker, db)["items"][0]["document_count"] == 1

        started = api.initiate_renewal(created["id"], LicenseRenewalInput(), maker, db)
        completed = api.complete_renewal(created["id"], started["id"], LicenseRenewalInput(new_valid_from=date.today(), new_valid_until=date.today() + timedelta(days=365), row_version=started["row_version"]), maker, db)
        assert completed["renewal_status"] == "RENEWED"
        assert completed["valid_until"] == (date.today() + timedelta(days=365)).isoformat()
        assert db.scalar(select(LicenseRenewal).where(LicenseRenewal.license_id == created["id"])).previous_valid_until == date.today() + timedelta(days=20)

        archived = api.archive_license(created["id"], LicenseArchiveInput(reason="Replaced by current certificate", row_version=completed["row_version"]), maker, db)
        assert archived["status"] == "ARCHIVED"
        restored = api.restore_license(created["id"], archived["row_version"], maker, db)
        assert restored["archived"] is False

        rule = ComplianceRule(organization_id=org.id, compliance_id="LIC-FACTORY"); db.add(rule); db.flush()
        version = ComplianceRuleVersion(rule_id=rule.id, version=1, name="Maintain factory license", frequency="ANNUAL", due_date_rule="FIXED_DAY_OF_MONTH", due_date_offset=1, effective_from=date(2020, 1, 1)); db.add(version); db.flush()
        instance = ComplianceInstance(organization_id=org.id, rule_version_id=version.id, subject_type="UNIT", subject_id=unit.id, unit_id=unit.id, period_key="2026", due_date=date.today() + timedelta(days=10), rule_snapshot_json="{}", applicability_snapshot_json="{}", status="PENDING"); db.add(instance); db.commit()
        mapped = api.create_compliance_mapping(LicenseComplianceMappingInput(license_type_id=factory["id"], compliance_rule_version_id=version.id, entity_type="UNIT"), admin, db)
        assert mapped["license_type_id"] == factory["id"]
        # Editing triggers the explicit mapping link; neither path completes the compliance.
        updated = api.update_license(created["id"], payload(unit.id, factory["id"], license_number="FL-001", valid_until=date.today() + timedelta(days=365)), restored["row_version"], maker, db)
        assert db.scalar(select(LicenseComplianceLink).where(LicenseComplianceLink.license_id == updated["id"])).compliance_instance_id == instance.id
        assert db.get(ComplianceInstance, instance.id).status == "PENDING"
    engine.dispose()


def test_license_authorization_validation_and_notification_idempotency(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "private-files"))
    engine = create_engine("sqlite:///:memory:"); Base.metadata.create_all(engine)
    with Session(engine) as db:
        _, _, unit_a1, unit_a2, _, admin, maker, auditor, outsider = seed(db)
        kind = next(item for item in api.list_types(False, admin, db) if item["name"] == "Factory License")
        item = api.create_license(payload(unit_a1.id, kind["id"], valid_until=date.today() + timedelta(days=7)), maker, db)
        # The genuine Unit A1 maker cannot target Unit A2 either.
        with pytest.raises(HTTPException) as denied_entity:
            api.create_license(payload(unit_a2.id, kind["id"], license_number="A2-1"), maker, db)
        with pytest.raises(HTTPException) as tenant_escape:
            api.license_detail(item["id"], outsider, db)
        assert tenant_escape.value.status_code == 404
        with pytest.raises(HTTPException) as audit_cannot_upload:
            asyncio.run(api.upload_document(item["id"], UploadFile(filename="license.pdf", file=io.BytesIO(b"%PDF-1.4 x")), auditor, db))
        assert audit_cannot_upload.value.status_code == 403
        with pytest.raises(HTTPException) as unsafe_file:
            asyncio.run(api.upload_document(item["id"], UploadFile(filename="license.jpg", file=io.BytesIO(b"%PDF-1.4 masquerade")), maker, db))
        assert unsafe_file.value.status_code == 422
        assert schedule_license_reminders(db, date.today()) >= 1
        db.commit()
        assert schedule_license_reminders(db, date.today()) == 0
        assert db.scalar(select(InAppNotification).where(InAppNotification.reference_id == item["id"])) is not None
    engine.dispose()


def test_license_status_matrix_document_versions_and_scoped_dashboard(tmp_path, monkeypatch):
    """Synthetic register data covers every dashboard state without using live data."""
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "private-files"))
    engine = create_engine("sqlite:///:memory:"); Base.metadata.create_all(engine)
    with Session(engine) as db:
        _, _, unit_a1, unit_a2, _, admin, maker, _, _ = seed(db)
        factory = next(item for item in api.list_types(False, admin, db) if item["name"] == "Factory License")
        active_license = api.create_license(payload(unit_a1.id, factory["id"], license_number="ACTIVE-001", valid_until=date.today() + timedelta(days=90)), maker, db)
        expiring_license = api.create_license(payload(unit_a1.id, factory["id"], license_number="EXP-001", valid_until=date.today() + timedelta(days=14)), maker, db)
        expired_license = api.create_license(payload(unit_a1.id, factory["id"], license_number="OLD-001", valid_until=date.today() - timedelta(days=1)), maker, db)
        perpetual_license = api.create_license(payload(unit_a1.id, factory["id"], license_number="PERPETUAL-001", valid_until=None, never_expires=True), maker, db)
        archived_license = api.create_license(payload(unit_a1.id, factory["id"], license_number="ARCHIVED-001", valid_until=date.today() + timedelta(days=120)), maker, db)
        api.archive_license(archived_license["id"], LicenseArchiveInput(reason="Superseded certificate", row_version=archived_license["row_version"]), maker, db)

        # A Unit A2 item exists in the same tenant but must not affect the A1 maker's summary.
        other_entity_license = api.create_license(payload(unit_a2.id, factory["id"], license_number="A2-HIDDEN-001"), admin, db)
        scoped_dashboard = api.dashboard(None, None, maker, db)
        assert scoped_dashboard["summary"] == {"all": 5, "active": 2, "expiring_30": 1, "expired": 1, "archived": 1, "renewal_in_progress": 0}
        assert {row["entity_id"] for row in scoped_dashboard["entity_summary"]} == {unit_a1.id}
        assert api.dashboard("UNIT", unit_a2.id, admin, db)["summary"]["all"] == 1
        assert api.list_licenses(1, 25, None, "ACTIVE", "UNIT", unit_a1.id, None, maker, db)["total"] == 2
        assert api.list_licenses(1, 25, None, "EXPIRING_30", "UNIT", unit_a1.id, None, maker, db)["total"] == 1
        assert api.list_licenses(1, 25, None, "EXPIRED", "UNIT", unit_a1.id, None, maker, db)["total"] == 1
        assert api.list_licenses(1, 25, None, "ARCHIVED", "UNIT", unit_a1.id, None, maker, db)["total"] == 1

        first = asyncio.run(api.upload_document(active_license["id"], UploadFile(filename="license-v1.pdf", file=io.BytesIO(b"%PDF-1.4 v1")), maker, db))
        second = asyncio.run(api.upload_document(active_license["id"], UploadFile(filename="license-v2.pdf", file=io.BytesIO(b"%PDF-1.4 v2")), maker, db))
        detail = api.license_detail(active_license["id"], maker, db)
        assert [document["version"] for document in detail["documents"]] == [2, 1]
        assert {first["id"], second["id"]} == {document["id"] for document in detail["documents"]}

        renewal = api.initiate_renewal(expiring_license["id"], LicenseRenewalInput(), maker, db)
        renewed = api.complete_renewal(expiring_license["id"], renewal["id"], LicenseRenewalInput(new_valid_from=date.today(), never_expires=True, row_version=renewal["row_version"]), maker, db)
        assert renewed["never_expires"] is True
        assert renewed["valid_until"] is None
        assert renewed["status"] == "ACTIVE"
        assert other_entity_license["entity_id"] == unit_a2.id
    engine.dispose()
