import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog


def audit(
    db: Session,
    *,
    organization_id: str | None,
    actor_id: str | None,
    action: str,
    module: str,
    entity_type: str,
    entity_id: str,
    old: Any = None,
    new: Any = None,
    reason: str | None = None,
) -> None:
    db.add(AuditLog(
        organization_id=organization_id,
        actor_id=actor_id,
        action=action,
        module=module,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value_json=json.dumps(old, default=str) if old is not None else None,
        new_value_json=json.dumps(new, default=str) if new is not None else None,
        reason=reason,
    ))
