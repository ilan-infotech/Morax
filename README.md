# MORAX Labour Compliance MVP

## Run locally.

1. Create/activate a Python 3.12 virtual environment and install `backend/requirements.txt`.
2. From `backend`, copy `.env.example` to `.env`, set a strong `JWT_SECRET_KEY`, then run:

   ```powershell
   python -m alembic upgrade head
   python seed.py
   python -m uvicorn app.main:app --reload --port 8000
   ```

3. From `frontend`, run `npm.cmd run dev` and open `http://localhost:5173`.

The development bootstrap account is `admin@morax.example.com` with password `Admin@123`. Change it immediately through the API/UI before using any non-local environment.

## MVP capabilities

- Tenant entities: organization, units, contractors, and contractor sites.
- Scoped users and controlled MVP roles.
- Versioned Compliance Master, direct rule entry, and staged Excel validation/import.
- Deterministic applicability, idempotent generation, recurring and one-time worklists.
- Evidence versioning, maker submission, checker review/approval/rejection/correction.
- Derived dashboard metrics and immutable audit records.

SQLite data and uploaded files are intentionally local for the MVP and excluded from source control.

Run `pip install -r requirements-dev.txt` followed by `pytest` when the optional development test dependencies are installed.
