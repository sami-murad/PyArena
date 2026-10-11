# Deployment guide

The production setup is the same `docker-compose.yml` you can run locally: nginx (unprivileged, port 8080 inside the container) serves the built frontend and proxies the API and WebSocket; PostgreSQL, Redis and the judge worker sit on internal networks with no route to the internet.

## Where it can run

The judge worker needs a Docker host that allows the capabilities listed in `docker-compose.yml` (SETUID, SETGID, KILL, CHOWN, DAC_OVERRIDE, FOWNER). That rules out many free "deploy a container" platforms, which do not let you set capabilities or run multi-container stacks. A small Linux virtual machine (VPS) where you control Docker is the straightforward choice.

Costs, free tiers and terms change. Check the provider's current pricing page before choosing; nothing in this project depends on a specific provider. Free options that need no hosting at all:

- run it on your own computer for demos (`docker compose up --build`, or `make docker-up`),
- share a temporary public URL from your computer with a tunnelling tool, only while you are watching it.

## Steps on a Linux server

1. Install Docker Engine and the Compose plugin from the official Docker documentation.
2. Clone the repository and create `.env`:
   ```bash
   cp .env.example .env
   python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # run 4 times: SECRET_KEY, WORKER_TOKEN, POSTGRES_PASSWORD, METRICS_TOKEN
   ```
   Set `PUBLIC_URL=https://your-domain`, `ENVIRONMENT=production`, `COOKIE_SECURE=true`.
3. Put HTTPS in front (see TLS below).
4. `docker compose up -d --build`
5. Check: `curl https://your-domain/api/v1/health/ready` returns 200 with `"executor_mode": "uid-isolated"` and `"redis": "ok"`.

With `ENVIRONMENT=production` the API refuses to start with placeholder secrets, insecure cookies, an SQLite `DATABASE_URL` or no `REDIS_URL`.

## Checklist before opening it to the public

### Secrets and configuration
- [ ] `.env` holds real random secrets (step 2) and is not in git (`.gitignore` covers it; CI runs gitleaks on every push).
- [ ] `ENVIRONMENT=production`, `COOKIE_SECURE=true`, `PUBLIC_URL` is the exact public origin (it becomes the CORS and Origin-check allowlist).
- [ ] Focus Mode defaults (`FOCUS_*` in `backend/.env.example`) suit your players; it is off unless a host turns it on per room.
- [ ] Keep the production question bank private if the repository is public.

### TLS
- [ ] Terminate HTTPS in a reverse proxy on the host, for example Caddy (obtains and renews certificates automatically), forwarding to `127.0.0.1:8080`, and publish the frontend on localhost only: `HTTP_PORT=127.0.0.1:8080` in `.env`.
- [ ] Or add a TLS `server` block to `frontend/nginx.conf` and mount the certificates.
- [ ] The proxy forwards WebSocket upgrades for `/socket.io/` (Caddy does by default; with nginx set `Upgrade` and `Connection` headers).
- [ ] After switching on HTTPS, consider adding `Strict-Transport-Security` in `frontend/nginx-security-headers.conf`.

### Healthchecks
- [ ] Every service has one: PostgreSQL (`pg_isready`), Redis (`redis-cli ping`), the worker (`/health`, in its Dockerfile), the API (`/api/v1/health/live`, in its Dockerfile). The API waits for a *healthy* database, Redis and worker before starting.
- [ ] Point your uptime monitor or load balancer at `/api/v1/health/ready`: it answers 503 when the database, worker or Redis is down, so traffic can be routed away. Use `/health/live` only for "restart the container" decisions.

### Resource limits
Set in `docker-compose.yml`; adjust to your machine:

| Service | Memory | CPU | Other |
|---|---|---|---|
| worker | 1 GB | 2 | `pids_limit: 256`, read-only root, tmpfs `/sandbox` 64 MB, 4 concurrent jobs (`WORKER_MAX_CONCURRENT_JOBS`) |
| backend | 768 MB | 1.5 | DB pool 10 + 10 overflow per process |
| db | 1 GB | | |
| redis | 192 MB | | `maxmemory 128mb`, no persistence |
| frontend | 128 MB | | |

- [ ] Keep `processes × (DB_POOL_SIZE + DB_MAX_OVERFLOW)` below PostgreSQL's `max_connections` (100).
- [ ] For untrusted public traffic, add the cgroup override (`docker-compose.cgroup.yml`) or run the worker under gVisor (`docker-compose.gvisor.yml`); see SECURITY.md and ADR 0004.

### Graceful shutdown
- `docker compose stop` (or a deploy) sends SIGTERM. The API and the worker stop accepting new connections and give in-flight requests up to 25 seconds to finish (`--timeout-graceful-shutdown 25`); compose waits 30 seconds (`stop_grace_period`) before SIGKILL. A judge run takes at most about 20 seconds.
- Competitions survive restarts: state lives in PostgreSQL, timers are re-armed from the database by the sweeper, and a submission whose judging was interrupted stays `PENDING` and is judged again when the API is back.
- Socket.IO clients reconnect by themselves and receive the full room state.
- [ ] To update with no lost submissions, deploy outside live rounds or accept a short reconnect.

### Backups and a restore drill
- [ ] Nightly logical backup (cron on the host):
  ```bash
  docker compose exec -T db pg_dump -U pyarena -Fc pyarena > backups/pyarena-$(date +%F).dump
  find backups -name 'pyarena-*.dump' -mtime +14 -delete     # keep two weeks
  ```
  Copy backups off the machine (another provider or your computer).
- [ ] **Restore drill**, at least once before launch and after big changes. Restore into a throwaway database and check it:
  ```bash
  docker compose exec -T db createdb -U pyarena restore_check
  docker compose exec -T db pg_restore -U pyarena -d restore_check --no-owner < backups/pyarena-YYYY-MM-DD.dump
  docker compose exec -T db psql -U pyarena -d restore_check -c "select count(*) from users; select count(*) from submissions; select version_num from alembic_version;"
  docker compose exec -T db dropdb -U pyarena restore_check
  ```
  A backup you have never restored is a hope, not a backup.
- Redis holds nothing that needs a backup (rate-limit counters, presence, locks).

### Logs and metrics
- [ ] Logs are JSON lines with `request_id`, `user_id`, `competition_id`, `submission_id`: `docker compose logs -f backend worker`. Configure Docker log rotation (`max-size`, `max-file`) in `/etc/docker/daemon.json`.
- [ ] Prometheus on the same Docker network scrapes `backend:8000/metrics` with `METRICS_TOKEN` as a bearer token; nginx never proxies `/metrics`. A starter Grafana dashboard is in `docs/observability/`.

### Security
- [ ] Read [SECURITY.md](SECURITY.md), "What is not protected" and "Focus Mode: honest limits".
- [ ] CI (`.github/workflows/ci.yml`) scans dependencies and images (pip-audit, npm audit, Trivy) on every push; re-run it before a release.

## Container images from CI (optional)

Set the repository variable `PUBLISH_IMAGES=true` and every push to `main` publishes `ghcr.io/<owner>/<repo>/backend`, `/worker` and `/frontend` (tags: the short commit SHA and `latest`), after they pass the Trivy image scan. To use them, replace the `build:` entries in `docker-compose.yml` with `image:` entries pinned to a SHA tag.

## Updating

```bash
git pull
docker compose up -d --build     # the backend runs migrations and the seed on start
curl -fsS https://your-domain/api/v1/health/ready
```

To roll back: check out the previous commit and run the same command. If the release added a migration, first run `docker compose exec backend alembic downgrade <previous revision>` (see DATABASE.md, Migrations).
