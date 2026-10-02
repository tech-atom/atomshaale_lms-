# Production deployment handoff

## Capacity statement

This repository is prepared for a production deployment review, but the code alone cannot guarantee 10,000 students. The deployer must provide load-test evidence for the selected machine sizes, PostgreSQL limits, Redis limits, and web-worker counts.

The LMS request tier and compiler tier must be separate. Student exam traffic must never share CPU, memory, or process limits with untrusted compiler jobs.

## Required topology

- TLS reverse proxy/load balancer with health checks to `/healthz/` and `/readyz/`.
- Multiple Django web processes running the WSGI application from `atomm_lms.wsgi:application`.
- PostgreSQL with backups, connection limits, statement timeouts, and monitoring.
- Redis for shared cache, cached database sessions, rate limits, and Celery broker/result storage.
- Celery workers for email and other asynchronous work.
- A separate compiler service using isolated containers or microVMs. Do not expose `compile_code_exam` as unrestricted host execution in the web tier.
- Nginx/CDN/object storage for static and media files. Do not serve large media through Django in production.

## Environment

Copy `.env.example` to `.env.production` in the deployment environment. Do not use the repository `.env` with Docker Compose: it contains development values and its secret can be interpreted as Compose variable syntax. Do not commit `.env.production` or any secrets. Set an explicit production hostname in `ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS`.

For a local configuration-only check, run `docker compose --env-file .env.production.example -f docker-compose.production.yml config`. For deployment, copy the example to `.env.production` and remove the `PRODUCTION_ENV_FILE` line so Compose uses the production file by default.

The `COMPILER_MAX_CONCURRENT` setting is a per-web-process emergency admission ceiling. It protects the web process but does not turn synchronous compilation into a 3,000-job system. For that target, the compiler service must queue jobs and run a bounded number of sandbox workers. The client contract should be job ID plus polling or WebSocket updates; the current synchronous endpoint is only a compatibility fallback.

## First deployment commands

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py check --deploy
.\.venv\Scripts\python.exe manage.py migrate --noinput
.\.venv\Scripts\python.exe manage.py collectstatic --noinput
```

On Linux, run Django behind a process manager and reverse proxy, for example:

```text
gunicorn atomm_lms.wsgi:application --bind 127.0.0.1:8000 --workers <measured-value> --timeout 60
celery -A atomm_lms worker --loglevel=INFO --queues=email_queue
celery -A atomm_lms worker --loglevel=INFO --queues=compiler_queue --concurrency=<measured-value> --max-tasks-per-child=100
```

Do not choose worker counts by guesswork. Keep total PostgreSQL connections below the database limit, including admin jobs, Celery, monitoring, and migrations.

The compiler worker pool must run on separate hosts or containers from the web tier. Set its concurrency from load-test results; do not set it to 3,000. Celery task time limits stop jobs that exceed the configured wall-clock budget, but the compiler host still needs OS/container isolation and resource limits.

## Build and run the compiler sandbox

Build the image from the repository root:

```bash
docker build -t atomm-lms-compiler-sandbox:latest -f Compiler/sandbox/Dockerfile Compiler/sandbox
```

The sandbox runner enforces the following Docker boundary for every job: no network, read-only root filesystem, non-root UID 1000, dropped Linux capabilities, `no-new-privileges`, 256 MB memory, 0.5 CPU, 64 processes, 1 MB file size, 64 MB temporary filesystems, and a 25-second wall-clock timeout. The runner also caps stdout/stderr at 256 KB and kills the complete process group on timeout or output overflow.

The Celery compiler worker must have access to the Docker daemon and only the sandbox image. It must not mount the LMS source, `.env`, media, database socket, or host filesystem into containers. If Docker is unavailable or the image is missing, compiler jobs fail with an error; the system never falls back to host execution.

The image currently supports Python, JavaScript, C, C++, and Java. Add another language only by updating the image and its allowlisted runner command. Do not reintroduce host compiler fallback.

## Compiler safety gate

Before enabling compiler access, replace direct host execution with a dedicated sandbox that enforces all of the following per job:

- non-root identity and read-only image
- no network access
- isolated temporary workspace
- CPU quota and wall-clock timeout
- memory quota
- process/thread count limit
- stdout/stderr byte limit
- compiler and runtime allowlist
- cleanup of the complete process tree
- no access to application environment variables, source, media, database, or host filesystem

A rate limit is not a sandbox. A semaphore is not a queue. Both are included as overload protection for the current compatibility path, not as proof that 3,000 concurrent executions are safe.

## Required load and failure tests

The repository now includes runnable checks:

```bash
python scripts/sandbox_smoke_test.py
python scripts/load_test_compiler.py --url https://lms.example.com/exam/api/compile-code/ --users 100 --cookie 'sessionid=REDACTED'
```

Run the load test in stages: `100`, `500`, `1000`, then `3000`. Use authenticated test accounts and a staging database. Do not run it against production. The script reports accepted/completed jobs, errors, elapsed time, and submission latency percentiles. Add infrastructure metrics from PostgreSQL, Redis, Celery, Docker, and the reverse proxy to the test report.

Run these before production approval:

1. 10,000 authenticated students loading the home, exam, question, heartbeat, answer-save, and submit paths with realistic think time.
2. 3,000 compiler jobs using the expected language mix, including compilation errors, timeouts, large output, and client disconnects.
3. Compiler load while exam heartbeat and submit traffic continues; exam traffic must keep its latency SLO.
4. Duplicate submit requests, browser retries, multiple tabs, and database failover.
5. Malicious code attempting filesystem reads, environment reads, network access, child-process creation, memory exhaustion, and unbounded output.
6. PostgreSQL connection saturation, Redis failure, worker restarts, and queue backlog.

Record p50/p95/p99 latency, error rate, queue depth, CPU, memory, process count, database connections, Redis memory, disk usage, and orphaned processes. Do not approve the target until the results are attached to the deployment ticket.

## Current safeguards in this repository

- Configurable login/password-reset limits that avoid a hard-coded ten-login shared-IP ceiling.
- Shared-cache support for multi-process rate limiting and sessions when `REDIS_URL` is configured.
- Compiler per-user/IP rate limiting and bounded admission control with HTTP 429 backpressure.
- Liveness/readiness endpoints.
- Database connection health checks and result-query indexes.
- CSRF is no longer disabled on the main exam compiler endpoint.

The standalone `Compiler/jango_compiler` project remains unsafe for direct production exposure and must stay private or be rebuilt behind the sandbox contract above.
