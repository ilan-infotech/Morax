from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import City, State
from app.services import location_master


def test_lgd_location_master_persists_states_and_state_districts(monkeypatch):
    """The public service is read once, then MORAX serves persisted masters."""
    responses = {
        "/v1/states": [
            {"code": "27", "name": "Maharashtra"},
            {"code": "33", "name": "Tamil Nadu"},
        ],
        "/v1/districts?state=27": [
            {"code": "500", "name": "Mumbai", "state_code": "27"},
            {"code": "501", "name": "Pune", "state_code": "27"},
        ],
    }
    calls: list[str] = []

    def fake_fetch(path: str):
        calls.append(path)
        return responses[path]

    monkeypatch.setattr(location_master, "_fetch", fake_fetch)
    monkeypatch.setattr(location_master, "_states", None)
    monkeypatch.setattr(location_master, "_states_loaded_at", 0.0)
    monkeypatch.setattr(location_master, "_synced_state_ids", set())

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        assert location_master.ensure_states(db) is True
        assert location_master.ensure_states(db) is False
        maharashtra = db.scalar(select(State).where(State.name == "Maharashtra"))
        assert maharashtra is not None
        assert maharashtra.code == "27"

        assert location_master.ensure_cities_for_state(db, maharashtra) is True
        assert location_master.ensure_cities_for_state(db, maharashtra) is False
        assert [city.name for city in db.scalars(select(City).where(City.state_id == maharashtra.id)).all()] == ["Mumbai", "Pune"]
        assert calls == ["/v1/states", "/v1/districts?state=27"]
    engine.dispose()


def test_lgd_master_maps_a_legacy_state_code_to_its_lgd_code(monkeypatch):
    """Existing deployments retain TN/KA-style codes while receiving districts."""
    responses = {
        "/v1/states": [{"code": "33", "name": "Tamil Nadu"}],
        "/v1/districts?state=33": [{"code": "600", "name": "Chennai", "state_code": "33"}],
    }
    monkeypatch.setattr(location_master, "_fetch", lambda path: responses[path])
    monkeypatch.setattr(location_master, "_states", None)
    monkeypatch.setattr(location_master, "_states_loaded_at", 0.0)
    monkeypatch.setattr(location_master, "_synced_state_ids", set())

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        legacy_state = State(name="Tamil Nadu", code="TN")
        db.add(legacy_state)
        db.flush()
        assert location_master.ensure_cities_for_state(db, legacy_state) is True
        assert db.scalar(select(City.name).where(City.state_id == legacy_state.id)) == "Chennai"
        assert legacy_state.code == "TN"
    engine.dispose()
