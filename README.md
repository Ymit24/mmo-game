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

Production deployment scripts and workflow are documented in `ops/deploy/README.md`.
