# MMO Project Notes

- Runtime/tooling: Bun + TypeScript across all packages.
- Monorepo layout: `client`, `server`, and `shared` packages.
- Client: Vite + React app for landing page, auth flow, account management, and character/world entry.
- Server: HTTP REST API for auth/account + character flows; JWT auth expected.
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
  - `users` table: `id`, `email` (unique), `password_hash`, `last_used_character_id`, timestamps.
  - Password hashes use Argon2id (`Bun.password.hash/verify`).
- Not implemented yet:
  - Refresh/session rotation, password reset, email verification.

## Character system snapshot (implemented)

- Shared (`packages/shared`):
  - Character contracts/utilities are centralized in `packages/shared/src/characters.ts`.
  - Defines classes (`knight`, `mage`), nickname validation/normalization, max characters per account (`6`), and typed error codes.
  - WS protocol now includes authenticated session and character-aware join semantics (`auth.hello`, `session.conflict`, `session.kicked`, `world.join` with `characterId`).
- Server (`packages/server`):
  - Character REST routes are wired in `packages/server/src/app.ts`:
    - `GET /characters` -> `200` with `{ characters, maxCharacters, lastUsedCharacterId }`.
    - `POST /characters` -> `201` with `{ character }`.
    - `DELETE /characters/:id` -> `204` on success.
  - Character routes require bearer JWT and return typed character error codes.
  - DB schema includes:
    - `characters` table with per-user normalized nickname uniqueness (`UNIQUE (user_id, nickname_normalized)`).
    - `users.last_used_character_id` column used for default selection and reassignment after deletion.
  - Realtime gateway now enforces WS auth handshake with JWT (`auth.hello`) before world messages and handles:
    - token expiry disconnect (`auth.error`),
    - one active connection per account with takeover flow (`session.conflict` / `session.kicked`),
    - server-side character ownership validation before `world.join`.
- Client (`packages/client`):
  - New protected routes:
    - `/characters/new` -> create character flow.
    - `/characters` -> compatibility redirect to `/play`.
    - `/play` -> character hub (list/select/delete).
    - `/world` -> realtime world shell (requires `characterId` query param).
  - Character API client lives in `packages/client/src/lib/api/characterApi.ts` for list/create/delete calls.
  - Character hub now chooses `isLastUsed` character by default and supports guarded delete UX.
  - Realtime client sends `auth.hello` then joins world with `characterId`; conflict/takeover UI is handled via bridge modal state.

## Client auth snapshot (implemented)

- Package scope: `packages/client`.
- Routing:
  - `/` -> landing page.
  - `/signin` -> signin form.
  - `/signup` -> signup form.
  - `/characters/new` -> protected character creation page.
  - `/play` -> protected character hub page (list/select/delete).
  - `/world` -> protected realtime game page.
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
  - `packages/client/src/auth/authFlow.vitest.tsx`.
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

## Deployment snapshot (implemented)

- Deployment model:
  - VM-hosted deploy on DigitalOcean droplet via `nginx` + `systemd` (no container platform).
  - Client is served as static files; API + WebSocket are reverse-proxied to Bun server.
  - Production host: `mmo.christiansmith.live`.
- Runtime topology:
  - `mmo.service` runs Bun server on internal port `3101`.
  - Nginx routes:
    - `/` -> SPA static assets.
    - `/api/*` -> proxied to Bun HTTP API.
    - `/api/ws` -> proxied WebSocket upgrade endpoint.
  - HTTPS managed by Certbot/Let’s Encrypt on VM.
- Release/deploy scripts:
  - `ops/deploy/build-release.sh` -> builds client/server and creates release tarball.
  - `ops/deploy/remote-install.sh` -> idempotent VM bootstrap (user/dirs/systemd/nginx).
  - `ops/deploy/remote-deploy.sh` -> atomic release deploy with health-check rollback.
  - `ops/deploy/deploy-vm.sh` -> local manual deploy orchestrator over SSH/SCP.
  - `ops/deploy/README.md` documents setup and usage.
- CD:
  - `.github/workflows/deploy-prod.yml` deploys on push to `main` (and `workflow_dispatch`).
  - Required repo secrets: `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_PRIVATE_KEY`, optional `PROD_SSH_PORT`.

## Commit conventions

- Always use Conventional Commits for commit messages.
