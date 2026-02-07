# MMO Project Notes

- Runtime/tooling: Bun + TypeScript across all packages.
- Monorepo layout: `client`, `server`, and `shared` packages.
- Client: Vite + React app for landing page, auth flow, and account management.
- Server: HTTP REST API for auth/account flows; JWT auth expected.
- Security: keep JWT signing key private (server-only secret management).
- Realtime game: browser 2D game client (Phaser/Pixi/custom canvas TBD) using WebSocket connection.
- Server topology decision pending: single process handling REST + WS vs split services.
- Shared package purpose: common models/protocol contracts/behavior utilities used by both client and server.
