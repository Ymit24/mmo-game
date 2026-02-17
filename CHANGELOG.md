# Changelog

All notable changes to this project will be documented in this file.

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
