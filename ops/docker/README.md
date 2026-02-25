# Dokploy Deployment

This project deploys via Dokploy using the root Docker Compose stack (`docker-compose.yml`).

## Stack

- `web`: Nginx serving the built client and reverse-proxying API + WebSocket traffic
- `server`: Bun HTTP + WebSocket server
- `mmo_data`: persistent Docker volume mounted at `/app/data` for SQLite

## Required Environment Variables

- `JWT_SECRET` (minimum 32 characters)

## Optional Environment Variables

- `JWT_EXPIRES_IN_SECONDS` (default `86400`)
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `ADMIN_API_ENABLED`
- `ADMIN_API_BEARER_TOKEN`
- `ADMIN_API_ALLOWED_ORIGINS`

Use `.env.docker.example` as the template.

Important:

- Leave `JWT_ISSUER` / `JWT_AUDIENCE` unset unless you explicitly want issuer/audience claim enforcement.

## Routing

- `/` -> SPA
- `/api/*` -> Bun REST API
- `/api/ws` -> Bun WebSocket endpoint

## Dokploy Setup

1. Create a `Compose` service from this repository.
2. Set compose file path to `docker-compose.yml`.
3. Add required environment variables.
4. Attach your domain to the `web` service on port `80`.
5. Deploy.

## Verification

- `GET /api/health` returns `{ "ok": true }`.
- Sign-up/sign-in works.
- Character list/create works.
- Entering world establishes WS connection at `/api/ws`.
