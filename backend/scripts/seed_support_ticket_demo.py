"""Seed clearly-labelled support-ticket examples into a local development DB.

Safe by default: it only prints what it would do.  It refuses non-SQLite
targets and requires both --development and --apply before writing records.

Run from backend:
    python scripts/seed_support_ticket_demo.py --development --apply
"""

from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.db.session import SessionLocal
from app.models import Organization, SupportTicket, SupportTicketActivity, SupportTicketMessage, User

PREFIX = "DEMO TEST — "


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--development", action="store_true", help="Confirms this is a local development database")
    parser.add_argument("--apply", action="store_true", help="Write demo records; otherwise preview only")
    args = parser.parse_args()
    if not args.development or not args.apply:
        print("Preview only. Use --development --apply to create clearly-labelled local demo tickets.")
        return
    if not settings.database_url.startswith("sqlite"):
        raise SystemExit("Refusing to seed support tickets into a non-local SQLite database.")

    db = SessionLocal()
    try:
        admins = list(db.scalars(select(User).where(User.platform_role == "MORAX_ADMIN", User.active.is_(True))))
        creator = db.scalar(select(User).where(User.active.is_(True), User.platform_role.is_(None)).order_by(User.created_at))
        organization = db.scalar(select(Organization).where(Organization.is_system.is_(False)).order_by(Organization.created_at))
        if not admins or not creator or not organization:
            raise SystemExit("Need an active MORAX Admin, an active organization user, and a customer organization before seeding.")
        admin = admins[0]
        existing = list(db.scalars(select(SupportTicket).where(SupportTicket.subject.like(f"{PREFIX}%"))))
        if existing:
            print(f"{len(existing)} demo ticket(s) already exist; no records added.")
            return
        now = datetime.now(UTC)
        examples = [
            ("Unable to upload PF return evidence", "COMPLIANCE", "HIGH", "OPEN", "Upload fails after choosing a valid CSV evidence file."),
            ("City list is not loading for a unit", "TECHNICAL", "URGENT", "IN_PROGRESS", "The City / District dropdown remains empty after selecting Tamil Nadu."),
            ("Need clarification on invoice access", "BILLING", "MEDIUM", "WAITING_ON_CUSTOMER", "Please confirm which Organization should receive billing access."),
            ("Password reset confirmation", "ACCOUNT", "LOW", "RESOLVED", "Password was reset and the user can sign in successfully."),
            ("Old demo issue closed", "GENERAL", "LOW", "CLOSED", "This sample ticket is retained only to demonstrate closed-ticket filtering."),
        ]
        for index, (subject, category, priority, status, description) in enumerate(examples, start=1):
            ticket = SupportTicket(
                organization_id=organization.id,
                ticket_number=f"DEMO-SUP-{index:03d}",
                subject=PREFIX + subject,
                category=category,
                priority=priority,
                status=status,
                creator_id=creator.id,
                assigned_to_id=admin.id,
                last_activity_at=now - timedelta(hours=index),
            )
            db.add(ticket); db.flush()
            db.add(SupportTicketMessage(ticket_id=ticket.id, author_id=creator.id, body=description))
            db.add(SupportTicketActivity(ticket_id=ticket.id, actor_id=creator.id, action="CREATED", detail="Development-only demo ticket"))
            if status != "OPEN":
                db.add(SupportTicketMessage(ticket_id=ticket.id, author_id=admin.id, body="DEMO TEST — Support response for workflow demonstration."))
                db.add(SupportTicketActivity(ticket_id=ticket.id, actor_id=admin.id, action="UPDATED", detail=f"Demo status set to {status}"))
        db.commit()
        print(f"Created {len(examples)} clearly-labelled support-ticket demo records in the local development database.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
