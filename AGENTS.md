# MMO Project Notes

- Runtime/tooling: Bun + TypeScript across all packages.
- Monorepo layout: `client`, `editor`, `server`, and `shared` packages.
- Client: Vite + React app for landing page, auth flow, account management, and character/world entry.
- Editor: Vite + React admin content editor for enemies/items/loot/progression/maps.
- Server: HTTP REST API for auth/account + character flows; JWT auth expected.
- Security: keep JWT signing key private (server-only secret management).
- Realtime game: browser 2D game client built with Phaser 3 using WebSocket connection.
- Server topology (phase 1): single Bun process handling REST + WS.
- Shared package purpose: common models/protocol contracts/behavior utilities used by client/editor/server.
- Shared code policy: when logic/types/utilities are needed by more than one package, place them in `shared` instead of duplicating; if duplication appears during feature work, refactor it, and do a quick duplicate-code pass before considering the feature done.

## Game runtime decisions (phase 1)

- Engine: Phaser 3.
- UI architecture: React overlay for HUD/inventory/minimap/shop + Phaser world renderer via typed bridge events.
- Networking: server-authoritative movement with client prediction/reconciliation.
- World model: instance-per-worldId (starting with hub world), low-pop room broadcast in phase 1.
- Protocol: JSON WebSocket message envelopes with shared discriminated unions in `@mmo/shared`.
- Maps/content: handcrafted typed JSON only for phase 1.

## Combat and weapon attack snapshot (implemented)

- Shared (`packages/shared`):
  - Weapon attack typing/default resolution lives in `packages/shared/src/combat/attacks.ts`.
  - Supported attack patterns: `sword_cleave`, `sword_spinblade`, `sword_whirl`, `wand_multishot`, `wand_burst`, `staff_ground_aoe`.
  - `ItemDefinition` includes weapon attack tuning fields (`weaponStyle`, `attackPatternId`, multiplier/projectile/spread/burst/AOE tuning) in `packages/shared/src/items.ts`.
  - WS contracts include richer combat payloads:
    - `combat.attackPerformed` includes `attackPatternId`, `weaponStyle`, `target?`, `aoeRadius?`, and `impactDelayMs?`.
    - Projectile snapshots include optional `style` (`orb` | `blade_spin`).
- Server (`packages/server`):
  - `item_definitions` schema stores weapon attack metadata and enforces bounds/checks; bootstrap performs migration + backfill normalization for legacy rows.
  - Realtime session captures both weapon stat modifiers and resolved attack config from equipped weapon loadout.
  - World combat flow is pattern-driven (melee/ranged/aoe), including spinblade projectile behavior, burst projectile scheduling, and delayed ground-AOE impact.
- Client (`packages/client`):
  - Phaser runtime renders pattern-specific attack effects and supports delayed AOE telegraph/impact timing.
  - Game item tooltip surfaces attack pattern metadata for equipped/inspected weapons.

## Armor system snapshot (implemented)

- Shared (`packages/shared`):
  - `ItemDefinition` now includes armor tuning fields in `packages/shared/src/items.ts`:
    - `armorMaxHpFlat`
    - `armorDamageReductionPercent`
  - Armor helpers are centralized in shared:
    - `itemDefinitionToArmorModifiers`
    - `normalizeArmorStatModifiers`
    - `applyArmorModifiersToMaxHealth`
    - `applyArmorDamageReduction`
  - Phase 1 mitigation cap is `50%` (`MAX_ARMOR_DAMAGE_REDUCTION_PERCENT`).
- Server (`packages/server`):
  - `item_definitions` schema includes armor columns and migration/backfill normalization:
    - `armor_max_hp_flat`
    - `armor_damage_reduction_percent`
  - Realtime/equipment updates are now full equipment recalculations (weapon + armor), not weapon-only updates.
  - World runtime applies armor effects in combat:
    - max health scaling includes armor HP bonus
    - incoming player damage (PvE and PvP) applies percent mitigation
    - max-health changes from equipment preserve current-health ratio
  - Starter loadouts now include equipped starter armor and bag armor progression items.
  - Loot seeds include armor drops (class-affinity weighted) for `stone_golem`.
- Editor/client:
  - Admin/editor item flows persist, clamp, and display armor stats.
  - In-game tooltip supports armor stat display and equipped-armor comparison.

## Admin content editor snapshot (implemented)

- Package scope:
  - Editor UI in `packages/editor`.
  - Server admin API handlers in `packages/server/src/admin/routes.ts`.
- Local dev:
  - Root script `bun run dev:editor` runs server + editor together.
- Admin API/auth:
  - Base path: `/api/admin`.
  - Guarded by bearer token (`ADMIN_API_ENABLED` + `ADMIN_API_BEARER_TOKEN`).
  - Browser-based admin calls should use `ADMIN_API_ALLOWED_ORIGINS` when cross-origin.
  - Editor uses `VITE_ADMIN_API_BEARER_TOKEN` for authenticated requests.
- Item admin behavior:
  - Item routes return and persist weapon + armor metadata fields.
  - Server normalizes/clamps weapon attack configuration with shared `resolveWeaponAttackConfig`.
  - Non-weapon items coerce attack metadata fields to `null`.
  - Non-armor items coerce armor metadata fields to `null`.

## Server auth snapshot (implemented)

- Package scope: `packages/server` only.
- Entrypoint: `packages/server/src/index.ts` (uses app factory in `packages/server/src/app.ts`).
- Routes:
  - `POST /auth/signup` with JSON `{ email, password }` -> `201` with `{ token, expiresInSeconds, user: { id, email, role } }`.
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
  - Claims include `sub` (user id) and `role` (`user` | `admin`), with `iat/exp`.
  - Default expiry is 24h (`86400` seconds).
- Required/important env:
  - `JWT_SECRET` (must be at least 32 chars).
  - Optional: `JWT_EXPIRES_IN_SECONDS`, `AUTH_DB_PATH`, `JWT_ISSUER`, `JWT_AUDIENCE`.
- DB:
  - SQLite via `bun:sqlite`.
  - `users` table: `id`, `email` (unique), `password_hash`, `role` (`user` default), `last_used_character_id`, timestamps.
  - Password hashes use Argon2id (`Bun.password.hash/verify`).
- Admin role management:
  - Signup always creates `role=user`; no self-service admin path.
  - Admin promotion is server-local CLI only: `admin promote --email <existing-account-email>`.
  - Promotion CLI resolves DB from server env (`AUTH_DB_PATH`) or default server DB path.
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
  - Stored payload: `{ token, user: { id, email, role }, expiresAtEpochMs }`.
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
  - Dokploy-managed Docker Compose deployment from this repository.
  - Client is served by Nginx container; API + WebSocket are reverse-proxied to Bun server container.
  - Production host: `mmo.christiansmith.live`.
- Runtime topology:
  - `web` service (Nginx) exposes HTTP on port `80` through Dokploy ingress/domain.
  - `server` service runs Bun server on internal port `3001`.
  - Nginx container routes:
    - `/` -> SPA static assets.
    - `/api/*` -> proxied to Bun HTTP API.
    - `/api/ws` -> proxied WebSocket upgrade endpoint.
  - HTTPS/TLS is managed by Dokploy domain/certificate integration.
- Deployment assets:
  - Root `docker-compose.yml` defines production services and persistent `mmo_data` volume.
  - Root `Dockerfile` builds Bun server runtime and Nginx web runtime images.
  - `ops/docker/nginx.conf` contains SPA + API + WS reverse-proxy rules.
  - `ops/docker/README.md` documents Dokploy setup and verification.

## Commit conventions

- Always use Conventional Commits for commit messages.

## Changelog discipline

- Keep `CHANGELOG.md` up to date for every merged user-visible feature/fix/change.
- Use zero-based semantic versioning for releases (for example: `0.1.0`, `0.1.1`, `0.2.0`).
- Record release entries with date, version heading, and concise Added/Changed/Fixes notes.
