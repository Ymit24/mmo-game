# Production Deployment

This repository includes:

- Docker Compose deployment for Dokploy (`docker-compose.yml`)
- Legacy VM release-based scripts under `ops/deploy/*`

## Dokploy (Docker Compose)

Use Dokploy's Docker Compose app type and point it at this repository.

### Compose topology

- `web`: Nginx SPA/static host + reverse proxy to API/WS
- `server`: Bun API and WebSocket runtime
- `mmo_data` named volume: persistent SQLite storage mounted at `/app/data`

### Required environment variables

- `JWT_SECRET` (minimum 32 chars)

### Optional environment variables

- `JWT_EXPIRES_IN_SECONDS` (default `86400`)
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `ADMIN_API_ENABLED`
- `ADMIN_API_BEARER_TOKEN`
- `ADMIN_API_ALLOWED_ORIGINS`

See `.env.docker.example` for a template.

### Runtime routing

- `/` -> client SPA
- `/api/*` -> Bun REST API
- `/api/ws` -> Bun WebSocket endpoint

The editor package is a local/dev tool and is intentionally excluded from production Docker deployment.

## Legacy VM deployment flow

The sections below document the existing release artifact + systemd/nginx workflow for `mmo.christiansmith.live`.

## Files

- `ops/deploy/build-release.sh`: build client/server and package `dist/mmo-release.tgz`
- `ops/deploy/remote-install.sh`: one-time VM bootstrap (user, systemd, nginx)
- `ops/deploy/remote-deploy.sh`: deploy one release artifact on the VM with rollback on health failure
- `ops/deploy/deploy-vm.sh`: local helper that builds, uploads, and deploys over SSH
- `.github/workflows/deploy-prod.yml`: CD deploy on merge/push to `main`

## One-Time VM Bootstrap

Run from repo root:

```bash
ssh vm 'CERTBOT_EMAIL="you@example.com" bash -s' < ops/deploy/remote-install.sh
```

If you want to skip certificate issuance for now:

```bash
ssh vm 'bash -s' < ops/deploy/remote-install.sh
```

Then set the production env file:

```bash
ssh vm 'editor /etc/mmo/mmo.env'
```

Required values:

- `JWT_SECRET` (32+ chars)
- `PORT` (defaults to `3101`)
- `AUTH_DB_PATH` (defaults to `/var/lib/mmo/auth.sqlite`)

## Promote Admin Account

After your account exists, promote it from the VM shell:

```bash
ssh vm 'set -a && source /etc/mmo/mmo.env && set +a && /usr/local/bin/bun /opt/mmo/current/server/index.js admin promote --email you@example.com'
```

The command uses the server DB path from `AUTH_DB_PATH` (or server default), only promotes existing accounts, and is safe to run repeatedly.

## Manual Deploy

From repo root:

```bash
./ops/deploy/deploy-vm.sh --host vm --install --certbot-email you@example.com
```

After the first bootstrap, deploy without `--install`:

```bash
./ops/deploy/deploy-vm.sh --host vm
```

## GitHub CD Setup

Set these repository secrets:

- `PROD_SSH_HOST`
- `PROD_SSH_USER`
- `PROD_SSH_PORT` (optional, defaults to `22`)
- `PROD_SSH_PRIVATE_KEY`

CD will run on `main` pushes and execute the same artifact deploy flow.
