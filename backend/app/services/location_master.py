"""Local, persistent cache for the India LGD State/District master data."""

from __future__ import annotations

import json
import threading
from time import monotonic
from urllib.error import URLError
from urllib.request import urlopen

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import City, State


_lock = threading.RLock()
_states: list[dict] | None = None
_states_loaded_at = 0.0
_synced_state_ids: set[str] = set()
_CACHE_SECONDS = 60 * 60 * 12


def _normalise(value: str) -> str:
    return " ".join(value.casefold().replace("&", "and").split())


def _fetch(path: str) -> list[dict]:
    url = f"{settings.india_lgd_api_base_url.rstrip('/')}{path}"
    try:
        with urlopen(url, timeout=settings.india_lgd_api_timeout_seconds) as response:  # noqa: S310 - configured HTTPS public data source
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, URLError, ValueError) as exc:
        raise HTTPException(503, "India location master is temporarily unavailable. Please try again.") from exc
    if not payload.get("success") or not isinstance(payload.get("data"), list):
        raise HTTPException(503, "India location master returned an invalid response. Please try again.")
    return payload["data"]


def _remote_states() -> list[dict]:
    global _states, _states_loaded_at
    with _lock:
        if _states is None or monotonic() - _states_loaded_at > _CACHE_SECONDS:
            _states = _fetch("/v1/states")
            _states_loaded_at = monotonic()
        return _states


def ensure_states(db: Session) -> bool:
    """Persist all LGD States/UTs while retaining legacy State IDs/codes."""
    remote = _remote_states()
    existing_by_name = {_normalise(row.name): row for row in db.scalars(select(State)).all()}
    changed = False
    for item in remote:
        name = str(item.get("name") or "").strip()
        code = str(item.get("code") or "").strip()
        if not name or not code or _normalise(name) in existing_by_name:
            continue
        # Numeric LGD code is stored in the existing State.code field for new
        # records; legacy codes (TN, KA, ...) are preserved untouched.
        state = State(name=name, code=code, active=True)
        db.add(state)
        existing_by_name[_normalise(name)] = state
        changed = True
    if changed:
        db.flush()
    return changed


def _lgd_code_for(state: State) -> str:
    if state.code.isdigit():
        return state.code
    matches = [item for item in _remote_states() if _normalise(str(item.get("name") or "")) == _normalise(state.name)]
    if not matches:
        raise HTTPException(422, f"No India LGD State code is available for {state.name}")
    return str(matches[0]["code"])


def ensure_cities_for_state(db: Session, state: State) -> bool:
    """Fetch a State's LGD districts once per process and persist them locally."""
    if state.id in _synced_state_ids:
        return False
    with _lock:
        if state.id in _synced_state_ids:
            return False
        districts = _fetch(f"/v1/districts?state={_lgd_code_for(state)}")
        existing = {_normalise(row.name) for row in db.scalars(select(City).where(City.state_id == state.id)).all()}
        changed = False
        for item in districts:
            name = str(item.get("name") or "").strip()
            if name and _normalise(name) not in existing:
                db.add(City(state_id=state.id, name=name, active=True))
                existing.add(_normalise(name))
                changed = True
        if changed:
            db.flush()
        _synced_state_ids.add(state.id)
        return changed
