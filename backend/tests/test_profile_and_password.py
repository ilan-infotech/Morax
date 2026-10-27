from datetime import date, datetime, UTC

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

import app.api.v1.router as api
from app.core.security import hash_password, verify_password
from app.db.base import Base
from app.models import AuthSession, IndustryType, Organization, State, Unit, User, UserRoleScope
from app.schemas import PasswordChangeRequest, ProfileUpdateInput


def test_profile_is_scope_aware_and_password_change_is_secure():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        org = Organization(name="Profile Customer", code="PROFILE", status="ACTIVE")
        state = State(name="Tamil Nadu", code="TN")
        industry = IndustryType(name="Services", code="SERVICES")
        db.add_all([org, state, industry]); db.flush()
        permitted = Unit(organization_id=org.id, name="Permitted Unit", code="PERMITTED", state_id=state.id, industry_type_id=industry.id, employer_name="Customer", compliance_start_date=date(2020, 1, 1), status="ACTIVE")
        other = Unit(organization_id=org.id, name="Other Unit", code="OTHER", state_id=state.id, industry_type_id=industry.id, employer_name="Customer", compliance_start_date=date(2020, 1, 1), status="ACTIVE")
        user = User(organization_id=org.id, name="Profile Maker", email="profile.maker@example.test", mobile="9876543210", password_hash=hash_password("Old-Password-1"), active=True)
        db.add_all([permitted, other, user]); db.flush()
        db.add(UserRoleScope(user_id=user.id, role="UNIT_MAKER", scope_type="UNIT", scope_id=permitted.id))
        current = AuthSession(user_id=user.id, active_organization_id=org.id, expires_at=datetime.now(UTC))
        other_session = AuthSession(user_id=user.id, active_organization_id=org.id, expires_at=datetime.now(UTC))
        db.add_all([current, other_session]); db.commit()
        setattr(user, "_morax_session_id", current.id)

        profile = api.get_my_profile(user, db)
        assert [entity["id"] for entity in profile["entities"]] == [permitted.id]
        assert profile["account"]["mobile"] == "9876543210"
        updated = api.update_my_profile(ProfileUpdateInput(name="Updated Maker", mobile="9123456789"), user, db)
        assert updated["name"] == "Updated Maker"

        with pytest.raises(HTTPException, match="Current password is incorrect"):
            api.change_password(PasswordChangeRequest(current_password="Wrong-Password-1", new_password="Strong-New-Password-1"), user, db)
        with pytest.raises(HTTPException, match="different from the current"):
            api.change_password(PasswordChangeRequest(current_password="Old-Password-1", new_password="Old-Password-1"), user, db)
        with pytest.raises(HTTPException, match="character types"):
            api.change_password(PasswordChangeRequest(current_password="Old-Password-1", new_password="alllowercase"), user, db)
        result = api.change_password(PasswordChangeRequest(current_password="Old-Password-1", new_password="Strong-New-Password-1"), user, db)
        assert result == {"ok": True, "sessions_revoked": 1}
        assert verify_password("Strong-New-Password-1", user.password_hash)
        assert db.get(AuthSession, current.id).revoked_at is None
        assert db.get(AuthSession, other_session.id).revoked_at is not None
    engine.dispose()
