# mmo-game

Bun/TypeScript monorepo scaffold for a browser-based 2D MMO.

## Packages

- `packages/client`: Vite + React app for landing/auth/account flows
- `packages/server`: Bun HTTP + WebSocket backend scaffold
- `packages/shared`: shared contracts/models/helpers used by client and server

## Scripts

```bash
bun run dev:client
bun run dev:server
bun run build
bun run typecheck
bun run lint
bun run test
bun run ci
```

## CI

GitHub Actions runs `bun run ci` on pull requests and merge queue events to enforce lint, typecheck, and server test pass status before merge.

## Deployment

Dokploy deployment documentation is in `ops/docker/README.md`.

## Docker + Dokploy Deployment

This repository includes a Docker Compose stack for Dokploy in `docker-compose.yml`.

### Services

- `web`: Nginx serving the built client and proxying `/api/*` + `/api/ws` to `server`
- `server`: Bun API + WebSocket server with SQLite persistence

### Environment

Use `.env.docker.example` as a template for Dokploy environment variables.

Required:

- `JWT_SECRET` (32+ characters)

Important defaults:

- `PORT=3001` (internal container port)
- `AUTH_DB_PATH=/app/data/auth.sqlite`
- SQLite data persisted in Docker volume `mmo_data`

### Dokploy notes

- Deploy as a Docker Compose app from this repository.
- Expose the `web` service (port `80`) through Dokploy ingress/domain.
- The admin editor is intentionally not deployed in production.
