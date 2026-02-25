# Changelog

All notable changes to this project will be documented in this file.

## 0.1.4 - 2026-02-25

### Added
- Dockerized production build/runtime flow with a multi-stage root `Dockerfile` for Bun server and Nginx client hosting.
- Dokploy-ready `docker-compose.yml` stack with `web` (Nginx) and `server` (Bun) services.
- Dedicated Nginx reverse proxy config for `/api/*` and `/api/ws` with SPA static serving (`ops/docker/nginx.conf`).
- Docker deployment environment template (`.env.docker.example`) and `.dockerignore`.

### Changed
- Deployment docs now include first-class Docker + Dokploy instructions and mark VM script flow as legacy/manual.

## 0.1.3 - 2026-02-17

### Added
- Stackable item support across inventory and loot containers with per-item metadata (`isStackable`, `maxStackSize`) and quantity-aware item instances.
- Alt-drag stack splitting UX in the in-world inventory HUD with quick quantity controls (`1`, `Half`, `All`) and Enter/Escape shortcuts.

### Changed
- Starter loadouts now grant one stack of 3 basic health potions instead of three separate potion instances.
- Inventory/container move logic now supports partial stack moves, automatic stack merging, and partial stack drops.
- Potion consume flow now decrements stack quantity before removing the slot.
- Loot bag item counts now reflect total item quantity, not only occupied slots.
- DB schema includes `character_inventory.stack_count` and stack metadata on `item_definitions`, with startup normalization and legacy stack merge pass.
- Admin/editor item contracts now include stack metadata fields.

### Fixed
- Legacy characters with duplicate stackable bag items are auto-merged on server startup.

## 0.1.2 - 2026-02-17

### Added
- Admin item icon catalog management API (`/api/admin/item-icons`) with create/read/update/delete operations and usage counts.
- New editor `Icons` page for item icon search, create/edit/delete workflows, and missing-asset visibility.
- Shared item icon contracts and reusable icon asset resolver in `@mmo/shared`.
- Editor test setup and new tests covering icon page behavior and item icon selection.
- Consumable potion item support with server-authoritative use flow (`inventory.consume` / `inventory.consumed`).
- Two health potion definitions: `basic_health_potion` (50 HP) and `greater_health_potion` (150 HP).
- Right-click potion consumption in the client inventory UI and potion effect display in item tooltips.
- Admin/editor item support for potion heal tuning (`potionHealFlat`) with type-aware coercion.
- Shared parsing tests for consumable inventory WebSocket messages.

### Changed
- Editor item forms now select icons from managed icon definitions instead of free-text entry.
- Server item create/update routes now enforce valid existing icon keys.
- Item icon persistence moved to `item_icons` with DB seeding/backfill and foreign-key enforcement from `item_definitions.icon_key`.
- Client icon URL lookup now resolves through shared icon asset mapping.
- Root `test` script now includes `@mmo/editor` tests.
- UI version badge updated to `v0.1.2`.
- Starter character loadouts now include 3 basic health potions in bag slots 6-8 (0-based slots 5-7).
- Enemy loot seeds now include potion progression by enemy tier:
  - level 1-9 enemies seed basic potion drops
  - level 10+ enemies seed greater potion drops
- Item definition schema and normalization now include `potion_heal_flat`.

### Fixed
- Inventory consume attempts at full health are rejected without consuming the potion item.

## 0.1.1 - 2026-02-17

### Fixed
- Added missing armor item icons in the game client inventory/equipment UI by registering armor `iconKey` mappings and adding armor SVG assets.

## 0.1.0 - 2026-02-17

### Added
- Armor as a fully functional gear system with two combat effects: flat max HP bonus and percentage damage reduction.
- Armor combat stat helpers and normalization utilities in `@mmo/shared`.
- Armor DB schema support (`armor_max_hp_flat`, `armor_damage_reduction_percent`) with migration/backfill behavior.
- Starter armor loadouts for both classes and armor progression seeds.
- Armor-aware equipment resolution in inventory/realtime world state.
- Server combat mitigation application for incoming PvE and PvP damage.
- Admin item API support for armor stats including coercion and clamping.
- Editor item UX for armor stat authoring and armor summary visibility.
- Client tooltip support for armor stats and equipped-armor comparisons.
- Additional tests covering armor math, DB seeds/migrations, loadouts, and runtime recalculation.

### Changed
- Item/equipment runtime updates now recalculate full equipment effects (weapon + armor), not weapon-only effects.
- Right-side in-world UI now includes a visible version footer below inventory.
- Landing page version badge updated for `v0.1.0`.
