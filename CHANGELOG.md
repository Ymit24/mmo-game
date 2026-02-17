# Changelog

All notable changes to this project will be documented in this file.

## 0.1.2 - 2026-02-17

### Added
- Admin item icon catalog management API (`/api/admin/item-icons`) with create/read/update/delete operations and usage counts.
- New editor `Icons` page for item icon search, create/edit/delete workflows, and missing-asset visibility.
- Shared item icon contracts and reusable icon asset resolver in `@mmo/shared`.
- Editor test setup and new tests covering icon page behavior and item icon selection.

### Changed
- Editor item forms now select icons from managed icon definitions instead of free-text entry.
- Server item create/update routes now enforce valid existing icon keys.
- Item icon persistence moved to `item_icons` with DB seeding/backfill and foreign-key enforcement from `item_definitions.icon_key`.
- Client icon URL lookup now resolves through shared icon asset mapping.
- Root `test` script now includes `@mmo/editor` tests.
- UI version badge updated to `v0.1.2`.

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
