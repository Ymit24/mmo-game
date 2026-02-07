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
```
