# Hosted performance configuration

The largest source of perceived latency in this topology is a Render cold
start, not Netlify. A free Render web service spins down after 15 minutes of
no inbound traffic. Its next request has to start the service before FastAPI
can answer it. Use a paid, always-on Render web service for production
response-time expectations.

## Render API service

Use the same region for the Render service and the Turso primary database.
Configure these environment variables on Render:

```text
TURSO_DATABASE_URL=libsql://<database>-<organization>.turso.io
TURSO_AUTH_TOKEN=<Turso auth token>
CORS_ORIGINS=https://<your-netlify-site>.netlify.app,https://<custom-domain>
FRONTEND_BASE_URL=https://<your-netlify-site>.netlify.app/morax
STARTUP_SCHEMA_BOOTSTRAP=false
STARTUP_SEED_BASELINE=false
```

Before the first deploy with the two startup flags disabled, run the schema
migrations against Turso as a Render pre-deploy/release command:

```text
cd backend && alembic upgrade head
```

Use this start command:

```text
cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

The `/health` endpoint is intentionally shallow, so it is suitable for a
Render health check and a keep-warm monitor.

## Netlify frontend

Set the production build environment variable to the public Render API URL:

```text
VITE_API_URL=https://<your-render-service>.onrender.com/api/v1
```

Build with `cd frontend && npm run build` and publish `frontend/dist`.

## Keep-warm monitor

Point cron-job.org at:

```text
https://<your-render-service>.onrender.com/health
```

Run it every 10 minutes, not every 15 minutes. Render starts a free service
after 15 consecutive idle minutes, so a 15-minute schedule can race the
idle timeout. Keep-warm checks reduce cold starts but do not replace an
always-on instance for production traffic.
