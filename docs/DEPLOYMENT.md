# Deployment guide

The production setup is the same `docker-compose.yml` you can run locally: nginx serves the built frontend and proxies the API and WebSocket; PostgreSQL and the judge worker sit on internal networks.

## Where it can run

The judge worker needs a Docker host that allows the capabilities listed in `docker-compose.yml` (SETUID, SETGID, KILL, CHOWN, DAC_OVERRIDE, FOWNER). That rules out many free "deploy a container" platforms, which do not let you set capabilities or run multi-container stacks. A small Linux virtual machine (VPS) where you control Docker is the straightforward choice.

Costs, free tiers and terms change. Check the provider's current pricing page before choosing; nothing in this project depends on a specific provider. Free options that need no hosting at all:

- run it on your own computer for demos (`docker compose up --build`),
- share a temporary public URL from your computer with a tunnelling tool, only while you are watching it.

## Steps on a Linux server

1. Install Docker Engine and the Compose plugin from the official Docker documentation.
2. Clone the repository and create `.env`:
   ```bash
   cp .env.example .env
   python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # use for SECRET_KEY, WORKER_TOKEN, POSTGRES_PASSWORD
   ```
   Set `PUBLIC_URL=https://your-domain`, `ENVIRONMENT=production`, `COOKIE_SECURE=true`.
3. Put HTTPS in front. Either terminate TLS in a reverse proxy on the host (for example Caddy, which obtains certificates automatically) forwarding to `127.0.0.1:8080`, or add a TLS server block to `frontend/nginx.conf`. With `ENVIRONMENT=production` the API refuses to start unless `COOKIE_SECURE=true`.
   If you use a host proxy, bind the frontend to localhost only: `HTTP_PORT=127.0.0.1:8080`.
4. `docker compose up -d --build`
5. Check: `curl https://your-domain/api/health` should show `"executor_mode": "uid-isolated"`.

## Before opening it to the public

- Read [SECURITY.md](SECURITY.md), "What is not protected". Strongly consider running the worker with gVisor (`runtime: runsc` on the worker service) or on a separate machine.
- Keep the production question bank private if the repository is public.
- Set up PostgreSQL backups (`docker compose exec db pg_dump -U pyarena pyarena > backup.sql`) and test restoring one.
- Keep one backend process (see ARCHITECTURE.md, Scaling) unless you add Redis.
- Watch logs: `docker compose logs -f backend worker`.

## Updating

```bash
git pull
docker compose up -d --build     # the backend runs migrations and the seed on start
```
