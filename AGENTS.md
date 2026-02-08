# MMO Project Notes

- Runtime/tooling: Bun + TypeScript across all packages.
- Monorepo layout: `client`, `server`, and `shared` packages.
- Client: Vite + React app for landing page, auth flow, and account management.
- Server: HTTP REST API for auth/account flows; JWT auth expected.
- Security: keep JWT signing key private (server-only secret management).
- Realtime game: browser 2D game client built with Phaser 3 using WebSocket connection.
- Server topology (phase 1): single Bun process handling REST + WS.
- Shared package purpose: common models/protocol contracts/behavior utilities used by both client and server.
- Shared code policy: when logic/types/utilities are needed by both `client` and `server`, place them in `shared` instead of duplicating; if duplication appears during feature work, refactor it, and do a quick duplicate-code pass before considering the feature done.

## Game runtime decisions (phase 1)

- Engine: Phaser 3.
- UI architecture: React overlay for HUD/inventory/minimap/shop + Phaser world renderer via typed bridge events.
- Networking: server-authoritative movement with client prediction/reconciliation.
- World model: instance-per-worldId (starting with hub world), low-pop room broadcast in phase 1.
- Protocol: JSON WebSocket message envelopes with shared discriminated unions in `@mmo/shared`.
- Maps/content: handcrafted typed JSON only for phase 1.

## Server auth snapshot (implemented)

- Package scope: `packages/server` only.
- Entrypoint: `packages/server/src/index.ts` (uses app factory in `packages/server/src/app.ts`).
- Routes:
  - `POST /auth/signup` with JSON `{ email, password }` -> `201` with `{ token, expiresInSeconds, user: { id, email } }`.
  - `POST /auth/signin` with JSON `{ email, password }` -> `200` with same response shape.
- Validation:
  - Email is normalized to lowercase/trimmed.
  - Password minimum length is 8.
  - Invalid JSON/content type returns `415`; invalid payload returns `400`.
  - Invalid signin credentials return `401` with a generic message (no user-enumeration details).
  - Duplicate signup email returns `409`.
- JWT:
  - Access-token only (no refresh token yet).
  - HS256 via `jose`.
  - Claims include `sub` (user id) and `email`, with `iat/exp`.
  - Default expiry is 24h (`86400` seconds).
- Required/important env:
  - `JWT_SECRET` (must be at least 32 chars).
  - Optional: `JWT_EXPIRES_IN_SECONDS`, `AUTH_DB_PATH`, `JWT_ISSUER`, `JWT_AUDIENCE`.
- DB:
  - SQLite via `bun:sqlite`.
  - `users` table: `id`, `email` (unique), `password_hash`, timestamps.
  - Password hashes use Argon2id (`Bun.password.hash/verify`).
- Not implemented yet:
  - WS JWT auth handshake (planned as first game milestone), refresh/session rotation, password reset, email verification.

## Client auth snapshot (implemented)

- Package scope: `packages/client`.
- Routing:
  - `/` -> landing page.
  - `/signin` -> signin form.
  - `/signup` -> signup form.
  - `/play` -> protected placeholder page (requires auth).
- Auth state:
  - `AuthProvider` + `useAuth()` in `packages/client/src/auth/AuthContext.tsx`.
  - Route protection via `packages/client/src/auth/RequireAuth.tsx`.
- Session persistence:
  - JWT session stored in `localStorage` key `mmo.auth.session.v1`.
  - Stored payload: `{ token, user, expiresAtEpochMs }`.
  - Expired/malformed sessions are cleared on load.
- API integration:
  - Client calls `POST /auth/signin` and `POST /auth/signup` through `packages/client/src/lib/api/authApi.ts`.
  - Base URL: `VITE_API_BASE_URL` fallback to `/api`.
  - Dev proxy in `packages/client/vite.config.ts`: `/api` -> `http://localhost:3001`.
- Reusable auth UI:
  - Components under `packages/client/src/components/auth`.
  - Shared credential validation enforces email format and min password length 8.
- Tests:
  - `packages/client/src/auth/authFlow.test.tsx`.
  - `packages/client/src/lib/auth/sessionStorage.test.ts`.

## CI and quality gates (implemented)

- GitHub Actions workflow: `.github/workflows/ci.yml` (`CI` / `quality` job).
- CI runs on `pull_request`, `merge_group`, and `workflow_dispatch`.
- CI command sequence:
  - `bun install --frozen-lockfile`
  - `bun run lint`
  - `bun run typecheck`
  - `bun run test`
- Linting/format/import-order checks are enforced via Biome (`biome.json`).
- Root scripts for local parity with CI:
  - `bun run lint`
  - `bun run lint:fix`
  - `bun run typecheck`
  - `bun run test`
  - `bun run ci`
- Merge policy expectation: branch protection should require `CI / quality` to pass before merge.

## Commit conventions

- Always use Conventional Commits for commit messages.
