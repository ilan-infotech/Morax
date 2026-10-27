from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from fastapi import HTTPException
import pytest

import app.api.v1.router as api
from app.db.base import Base
from app.models import Organization, User
from app.schemas import SupportTicketInput, SupportTicketReplyInput, SupportTicketUpdateInput


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def test_support_ticket_create_assign_reply_close_reopen_and_isolation(db):
    tenant = Organization(name="Demo Customer", code="DEMO", status="ACTIVE")
    other_tenant = Organization(name="Other Customer", code="OTHER", status="ACTIVE")
    platform_admin = User(name="Support Admin", email="support@example.test", password_hash="x", active=True, platform_role="MORAX_ADMIN")
    creator = User(name="Demo User", email="demo.user@example.test", password_hash="x", active=True, organization_id=None)
    outsider = User(name="Other User", email="other.user@example.test", password_hash="x", active=True, organization_id=None)
    db.add_all([tenant, other_tenant]); db.flush()
    creator.organization_id = tenant.id
    outsider.organization_id = other_tenant.id
    db.add_all([platform_admin, creator, outsider]); db.commit()

    created = api.create_support_ticket(
        SupportTicketInput(subject="DEMO TEST — Ticket workflow", category="TECHNICAL", issue_type="PRODUCTION_ISSUE", priority="HIGH", description="Development-only test request"),
        creator,
        db,
    )
    assert created["status"] == "OPEN"
    assert created["issue_type"] == "PRODUCTION_ISSUE"
    ticket_id = created["id"]
    assert api.list_support_tickets(user=creator, db=db)["total"] == 1
    # Dashboard metric groups are server-side filters, not a client-only
    # presentation choice.  The active card must resolve this exact ticket.
    assert api.list_support_tickets(status="ACTIVE", user=creator, db=db)["total"] == 1
    assert api.list_support_tickets(status="URGENT_OPEN", user=creator, db=db)["total"] == 1

    assigned = api.update_support_ticket(ticket_id, SupportTicketUpdateInput(assigned_to_id=platform_admin.id), platform_admin, db)
    assert assigned["assignee_name"] == "Support Admin"
    reclassified = api.update_support_ticket(ticket_id, SupportTicketUpdateInput(issue_type="BUG_FIX"), platform_admin, db)
    assert reclassified["issue_type"] == "BUG_FIX"
    replied = api.reply_support_ticket(ticket_id, SupportTicketReplyInput(body="We are investigating."), platform_admin, db)
    assert len(replied["messages"]) == 2
    resolved = api.update_support_ticket(ticket_id, SupportTicketUpdateInput(status="RESOLVED"), platform_admin, db)
    assert resolved["status"] == "RESOLVED"
    assert api.list_support_tickets(status="RESOLVED_CLOSED", user=creator, db=db)["total"] == 1
    closed = api.update_support_ticket(ticket_id, SupportTicketUpdateInput(status="CLOSED"), platform_admin, db)
    assert closed["status"] == "CLOSED"
    with pytest.raises(HTTPException, match="already closed"):
        api.reply_support_ticket(ticket_id, SupportTicketReplyInput(body="This must be blocked."), creator, db)
    reopened = api.update_support_ticket(ticket_id, SupportTicketUpdateInput(status="OPEN"), creator, db)
    assert reopened["status"] == "OPEN"

    with pytest.raises(HTTPException, match="not found"):
        api.get_support_ticket(ticket_id, outsider, db)
    with pytest.raises(HTTPException, match="active MORAX Admin"):
        api.update_support_ticket(ticket_id, SupportTicketUpdateInput(assigned_to_id=creator.id), platform_admin, db)
