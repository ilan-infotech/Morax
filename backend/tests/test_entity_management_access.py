from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import app.services.access as access


def test_require_org_admin_for_entity_management_allows_org_admin(monkeypatch):
    user = SimpleNamespace(id="u-1", platform_role=None)
    db = object()

    monkeypatch.setattr(
        access,
        "scopes_for",
        lambda _db, _user_id: [SimpleNamespace(role="ORGANIZATION_ADMIN", scope_type="ORGANIZATION", scope_id="org-1")],
    )

    access.require_org_admin_for_entity_management(db, user, "org-1")


def test_require_org_admin_for_entity_management_rejects_unit_admin(monkeypatch):
    user = SimpleNamespace(id="u-2", platform_role=None)
    db = object()

    monkeypatch.setattr(
        access,
        "scopes_for",
        lambda _db, _user_id: [SimpleNamespace(role="UNIT_ADMIN", scope_type="UNIT", scope_id="unit-1")],
    )

    with pytest.raises(HTTPException, match="Organization administrator permission is required"):
        access.require_org_admin_for_entity_management(db, user, "org-1")
