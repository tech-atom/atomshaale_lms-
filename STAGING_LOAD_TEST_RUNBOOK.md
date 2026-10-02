# Staging Load Test Runbook

This runbook targets only a staging deployment. Do not point the load test at production.

## Prepare

1. Copy `.env.staging.example` to `.env.staging` on the staging host.
2. Replace every placeholder through the host secret manager. Generate the Django key with:

   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(64))"
   ```

3. Set `STAGING_ENV_FILE=.env.staging` and configure DNS/TLS for `ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS`.
4. Create authenticated staging students in `staging-users.csv`. The file must contain `email,password` and must not be committed.
5. Set `SCHEDULED_EXAM` to an exam that is active for those students and has a valid start/end window.

## Deploy

```bash
PRODUCTION_ENV_FILE=.env.staging STAGING_ENV_FILE=.env.staging docker compose --env-file .env.staging \
  -f docker-compose.production.yml -f docker-compose.staging.yml build
PRODUCTION_ENV_FILE=.env.staging STAGING_ENV_FILE=.env.staging docker compose --env-file .env.staging \
  -f docker-compose.production.yml -f docker-compose.staging.yml up -d
PRODUCTION_ENV_FILE=.env.staging STAGING_ENV_FILE=.env.staging docker compose --env-file .env.staging \
  -f docker-compose.production.yml -f docker-compose.staging.yml ps
```

Verify `/healthz/` and `/readyz/` through the staging HTTPS endpoint before load testing.

## Progressive tests

Run each stage only after the previous stage is stable. Save each JSON report and metrics snapshot together:

```bash
python scripts/load_test_lms.py --url https://staging.example.com \
  --users-file staging-users.csv --users 100 \
  --scheduled-exam "$SCHEDULED_EXAM" --compile-rate 0.10 \
  --report reports/lms-100.json
```

Repeat with `--users 500`, `--users 1000`, and `--users 3000`. Use a realistic compiler mix by adjusting `--compile-rate` to the observed exam ratio. Capture metrics during each run:

```powershell
./scripts/collect_staging_metrics.ps1 -EnvFile .env.staging -Output reports/metrics-100.json
```

Record application p50/p95/p99 latency, successful and failed students, error rate, compiler accepted/completed/failed jobs, queue depth, worker count, CPU, RAM, PostgreSQL connections/active queries, and Redis memory/clients.

## Acceptance gate

Do not declare capacity from a single passing run. If p95, error rate, queue depth, CPU, RAM, database connections, Redis memory, or worker utilization breaches the agreed SLO, identify the bottleneck, change the relevant deployment setting, and repeat the same 3,000-user test. Attach both the failed and replacement reports to the deployment record.