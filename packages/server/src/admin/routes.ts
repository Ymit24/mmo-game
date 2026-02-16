import type { Database } from "bun:sqlite";
import {
  type CharacterClass,
  parseWorldMap,
  resolveWeaponAttackConfig,
} from "@mmo/shared";
import { guardAdminRequest } from "./guard";
import {
  deleteMapFile,
  isValidMapId,
  listMapFiles,
  readMapFile,
  writeMapFile,
} from "./mapFileService";

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

async function readJsonBody(request: Request): Promise<unknown | null> {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return null;
  }
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function num(val: unknown, fallback: number): number {
  return typeof val === "number" ? val : fallback;
}

function str(val: unknown, fallback: string): string {
  return typeof val === "string" ? val : fallback;
}

function strOrNull(val: unknown): string | null {
  return typeof val === "string" ? val : null;
}

function numOrNull(val: unknown): number | null {
  return typeof val === "number" ? val : null;
}

function parseAllowedCorsOrigins(): Set<string> {
  const raw = process.env.ADMIN_API_ALLOWED_ORIGINS;
  if (!raw) {
    return new Set();
  }

  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0"
  );
}

function isTrustedLoopbackOrigin(requestOrigin: string, url: URL): boolean {
  try {
    const requestOriginUrl = new URL(requestOrigin);
    return (
      isLoopbackHostname(requestOriginUrl.hostname) &&
      isLoopbackHostname(url.hostname)
    );
  } catch {
    return false;
  }
}

function getAllowedCorsOrigin(
  request: Request,
  url: URL,
  allowedOrigins: Set<string>,
): string | null {
  const requestOrigin = request.headers.get("origin");
  if (!requestOrigin) {
    return null;
  }

  if (requestOrigin === url.origin) {
    return requestOrigin;
  }

  // Local editor/client dev servers commonly run on a different loopback port
  // than the API server (for example 5174 -> 3001). Treat that as trusted.
  if (isTrustedLoopbackOrigin(requestOrigin, url)) {
    return requestOrigin;
  }

  return allowedOrigins.has(requestOrigin) ? requestOrigin : null;
}

function applyCorsHeaders(response: Response, origin: string | null): void {
  if (!origin) {
    return;
  }

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Vary", "Origin");
}

function validateMapIdOrResponse(mapId: string): Response | null {
  if (!isValidMapId(mapId)) {
    return json(400, { error: "Invalid map ID." });
  }
  return null;
}

// ─── Enemy Archetypes ────────────────────────────────────────────────

interface EnemyArchetypeRow {
  id: string;
  name: string;
  level: number;
  xp_reward: number;
  max_health: number;
  damage: number;
  speed: number;
  detection_radius: number;
  leash_radius: number;
  attack_speed_ms: number;
  melee_range: number;
  ranged_range: number;
  can_melee: number;
  can_ranged: number;
  visual_width: number;
  visual_height: number;
  color_hex: string;
}

function mapArchetypeRow(row: EnemyArchetypeRow) {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    xpReward: row.xp_reward,
    maxHealth: row.max_health,
    damage: row.damage,
    speed: row.speed,
    detectionRadius: row.detection_radius,
    leashRadius: row.leash_radius,
    attackSpeedMs: row.attack_speed_ms,
    meleeRange: row.melee_range,
    rangedRange: row.ranged_range,
    canMelee: row.can_melee === 1,
    canRanged: row.can_ranged === 1,
    visualWidth: row.visual_width,
    visualHeight: row.visual_height,
    colorHex: row.color_hex,
  };
}

function handleListEnemies(db: Database): Response {
  const rows = db
    .query<EnemyArchetypeRow, []>(
      `SELECT id, name, level, xp_reward, max_health, damage, speed,
              detection_radius, leash_radius, attack_speed_ms,
              melee_range, ranged_range, can_melee, can_ranged,
              visual_width, visual_height, color_hex
       FROM enemy_archetypes
       ORDER BY level ASC, name ASC`,
    )
    .all();
  return json(200, { enemies: rows.map(mapArchetypeRow) });
}

function handleGetEnemy(db: Database, id: string): Response {
  const row = db
    .query<EnemyArchetypeRow, [string]>(
      `SELECT id, name, level, xp_reward, max_health, damage, speed,
              detection_radius, leash_radius, attack_speed_ms,
              melee_range, ranged_range, can_melee, can_ranged,
              visual_width, visual_height, color_hex
       FROM enemy_archetypes WHERE id = ?1 LIMIT 1`,
    )
    .get(id);
  if (!row) {
    return json(404, { error: "Enemy archetype not found." });
  }
  return json(200, { enemy: mapArchetypeRow(row) });
}

async function handleCreateEnemy(
  request: Request,
  db: Database,
): Promise<Response> {
  const body = (await readJsonBody(request)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string" || !body.id) {
    return json(400, { error: "Invalid payload." });
  }

  const timestamp = new Date().toISOString();
  try {
    db.query(
      `INSERT INTO enemy_archetypes (
        id, name, level, xp_reward, max_health, damage, speed,
        detection_radius, leash_radius, attack_speed_ms,
        melee_range, ranged_range, can_melee, can_ranged,
        visual_width, visual_height, color_hex, created_at, updated_at
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)`,
    ).run(
      body.id,
      str(body.name, "Unnamed"),
      num(body.level, 1),
      num(body.xpReward, 10),
      num(body.maxHealth, 100),
      num(body.damage, 10),
      num(body.speed, 100),
      num(body.detectionRadius, 280),
      num(body.leashRadius, 420),
      num(body.attackSpeedMs, 1000),
      num(body.meleeRange, 42),
      num(body.rangedRange, 220),
      body.canMelee ? 1 : 0,
      body.canRanged ? 1 : 0,
      num(body.visualWidth, 36),
      num(body.visualHeight, 36),
      str(body.colorHex, "#ffffff"),
      timestamp,
      timestamp,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.toLowerCase().includes("unique") ||
      msg.toLowerCase().includes("constraint")
    ) {
      return json(409, {
        error: "Enemy archetype with this ID already exists.",
      });
    }
    return json(500, { error: msg });
  }

  return handleGetEnemy(db, body.id as string);
}

async function handleUpdateEnemy(
  request: Request,
  db: Database,
  id: string,
): Promise<Response> {
  const body = (await readJsonBody(request)) as Record<string, unknown> | null;
  if (!body) {
    return json(400, { error: "Invalid payload." });
  }

  const existing = db
    .query<{ id: string }, [string]>(
      "SELECT id FROM enemy_archetypes WHERE id = ?1 LIMIT 1",
    )
    .get(id);
  if (!existing) {
    return json(404, { error: "Enemy archetype not found." });
  }

  const timestamp = new Date().toISOString();
  db.query(
    `UPDATE enemy_archetypes SET
      name = ?2, level = ?3, xp_reward = ?4, max_health = ?5,
      damage = ?6, speed = ?7, detection_radius = ?8, leash_radius = ?9,
      attack_speed_ms = ?10, melee_range = ?11, ranged_range = ?12,
      can_melee = ?13, can_ranged = ?14, visual_width = ?15,
      visual_height = ?16, color_hex = ?17, updated_at = ?18
     WHERE id = ?1`,
  ).run(
    id,
    str(body.name, "Unnamed"),
    num(body.level, 1),
    num(body.xpReward, 10),
    num(body.maxHealth, 100),
    num(body.damage, 10),
    num(body.speed, 100),
    num(body.detectionRadius, 280),
    num(body.leashRadius, 420),
    num(body.attackSpeedMs, 1000),
    num(body.meleeRange, 42),
    num(body.rangedRange, 220),
    body.canMelee ? 1 : 0,
    body.canRanged ? 1 : 0,
    num(body.visualWidth, 36),
    num(body.visualHeight, 36),
    str(body.colorHex, "#ffffff"),
    timestamp,
  );

  return handleGetEnemy(db, id);
}

function handleDeleteEnemy(db: Database, id: string): Response {
  const existing = db
    .query<{ id: string }, [string]>(
      "SELECT id FROM enemy_archetypes WHERE id = ?1 LIMIT 1",
    )
    .get(id);
  if (!existing) {
    return json(404, { error: "Enemy archetype not found." });
  }
  db.query("DELETE FROM enemy_archetypes WHERE id = ?1").run(id);
  return new Response(null, { status: 204 });
}

// ─── Item Definitions ────────────────────────────────────────────────

interface ItemDefinitionRow {
  id: string;
  name: string;
  icon_key: string;
  type: string;
  class_requirement: string | null;
  min_level_to_equip: number | null;
  weapon_damage_flat: number | null;
  weapon_range_flat: number | null;
  weapon_speed_percent: number | null;
  weapon_style: string | null;
  attack_pattern_id: string | null;
  attack_damage_multiplier: number | null;
  attack_projectile_count: number | null;
  attack_spread_degrees: number | null;
  attack_burst_count: number | null;
  attack_burst_interval_ms: number | null;
  attack_aoe_radius: number | null;
  attack_aoe_delay_ms: number | null;
}

function mapItemRow(row: ItemDefinitionRow) {
  return {
    id: row.id,
    name: row.name,
    iconKey: row.icon_key,
    type: row.type,
    classRequirement: row.class_requirement,
    minLevelToEquip: row.min_level_to_equip,
    weaponDamageFlat: row.weapon_damage_flat,
    weaponRangeFlat: row.weapon_range_flat,
    weaponSpeedPercent: row.weapon_speed_percent,
    weaponStyle: row.weapon_style,
    attackPatternId: row.attack_pattern_id,
    attackDamageMultiplier: row.attack_damage_multiplier,
    attackProjectileCount: row.attack_projectile_count,
    attackSpreadDegrees: row.attack_spread_degrees,
    attackBurstCount: row.attack_burst_count,
    attackBurstIntervalMs: row.attack_burst_interval_ms,
    attackAoeRadius: row.attack_aoe_radius,
    attackAoeDelayMs: row.attack_aoe_delay_ms,
  };
}

function normalizeClassRequirement(value: unknown): CharacterClass | null {
  if (value === "knight" || value === "mage") {
    return value;
  }
  return null;
}

function resolveItemAttackColumns(body: Record<string, unknown>): {
  weaponStyle: string | null;
  attackPatternId: string | null;
  attackDamageMultiplier: number | null;
  attackProjectileCount: number | null;
  attackSpreadDegrees: number | null;
  attackBurstCount: number | null;
  attackBurstIntervalMs: number | null;
  attackAoeRadius: number | null;
  attackAoeDelayMs: number | null;
} {
  const type = str(body.type, "misc");
  if (type !== "weapon") {
    return {
      weaponStyle: null,
      attackPatternId: null,
      attackDamageMultiplier: null,
      attackProjectileCount: null,
      attackSpreadDegrees: null,
      attackBurstCount: null,
      attackBurstIntervalMs: null,
      attackAoeRadius: null,
      attackAoeDelayMs: null,
    };
  }

  const classRequirement = normalizeClassRequirement(body.classRequirement);
  const resolved = resolveWeaponAttackConfig(
    {
      id: str(body.id, "weapon"),
      name: str(body.name, "Unnamed"),
      iconKey: str(body.iconKey, str(body.id, "weapon")),
      type: "weapon",
      classRequirement,
      minLevelToEquip: numOrNull(body.minLevelToEquip),
      weaponDamageFlat: numOrNull(body.weaponDamageFlat),
      weaponRangeFlat: numOrNull(body.weaponRangeFlat),
      weaponSpeedPercent: numOrNull(body.weaponSpeedPercent),
      weaponStyle: strOrNull(body.weaponStyle) as
        | "sword"
        | "wand"
        | "staff"
        | null,
      attackPatternId: strOrNull(body.attackPatternId) as
        | "sword_cleave"
        | "sword_spinblade"
        | "sword_whirl"
        | "wand_multishot"
        | "wand_burst"
        | "staff_ground_aoe"
        | null,
      attackDamageMultiplier: numOrNull(body.attackDamageMultiplier),
      attackProjectileCount: numOrNull(body.attackProjectileCount),
      attackSpreadDegrees: numOrNull(body.attackSpreadDegrees),
      attackBurstCount: numOrNull(body.attackBurstCount),
      attackBurstIntervalMs: numOrNull(body.attackBurstIntervalMs),
      attackAoeRadius: numOrNull(body.attackAoeRadius),
      attackAoeDelayMs: numOrNull(body.attackAoeDelayMs),
    },
    classRequirement ?? "knight",
  );

  return {
    weaponStyle: resolved.weaponStyle,
    attackPatternId: resolved.attackPatternId,
    attackDamageMultiplier: resolved.damageMultiplier,
    attackProjectileCount: resolved.projectileCount,
    attackSpreadDegrees: resolved.spreadDegrees,
    attackBurstCount: resolved.burstCount,
    attackBurstIntervalMs: resolved.burstIntervalMs,
    attackAoeRadius: resolved.aoeRadius,
    attackAoeDelayMs: resolved.aoeDelayMs,
  };
}

function handleListItems(db: Database): Response {
  const rows = db
    .query<ItemDefinitionRow, []>(
      `SELECT id, name, icon_key, type, class_requirement,
              min_level_to_equip, weapon_damage_flat, weapon_range_flat,
              weapon_speed_percent, weapon_style, attack_pattern_id,
              attack_damage_multiplier, attack_projectile_count,
              attack_spread_degrees, attack_burst_count,
              attack_burst_interval_ms, attack_aoe_radius, attack_aoe_delay_ms
       FROM item_definitions ORDER BY type ASC, name ASC`,
    )
    .all();
  return json(200, { items: rows.map(mapItemRow) });
}

function handleGetItem(db: Database, id: string): Response {
  const row = db
    .query<ItemDefinitionRow, [string]>(
      `SELECT id, name, icon_key, type, class_requirement,
              min_level_to_equip, weapon_damage_flat, weapon_range_flat,
              weapon_speed_percent, weapon_style, attack_pattern_id,
              attack_damage_multiplier, attack_projectile_count,
              attack_spread_degrees, attack_burst_count,
              attack_burst_interval_ms, attack_aoe_radius, attack_aoe_delay_ms
       FROM item_definitions WHERE id = ?1 LIMIT 1`,
    )
    .get(id);
  if (!row) {
    return json(404, { error: "Item not found." });
  }
  return json(200, { item: mapItemRow(row) });
}

async function handleCreateItem(
  request: Request,
  db: Database,
): Promise<Response> {
  const body = (await readJsonBody(request)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string" || !body.id) {
    return json(400, { error: "Invalid payload." });
  }

  const timestamp = new Date().toISOString();
  const attack = resolveItemAttackColumns(body);
  try {
    db.query(
      `INSERT INTO item_definitions (
        id, name, icon_key, type, class_requirement,
        min_level_to_equip, weapon_damage_flat, weapon_range_flat,
        weapon_speed_percent, weapon_style, attack_pattern_id,
        attack_damage_multiplier, attack_projectile_count,
        attack_spread_degrees, attack_burst_count, attack_burst_interval_ms,
        attack_aoe_radius, attack_aoe_delay_ms, created_at, updated_at
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)`,
    ).run(
      body.id,
      str(body.name, "Unnamed"),
      str(body.iconKey, body.id as string),
      str(body.type, "misc"),
      strOrNull(body.classRequirement),
      numOrNull(body.minLevelToEquip),
      numOrNull(body.weaponDamageFlat),
      numOrNull(body.weaponRangeFlat),
      numOrNull(body.weaponSpeedPercent),
      attack.weaponStyle,
      attack.attackPatternId,
      attack.attackDamageMultiplier,
      attack.attackProjectileCount,
      attack.attackSpreadDegrees,
      attack.attackBurstCount,
      attack.attackBurstIntervalMs,
      attack.attackAoeRadius,
      attack.attackAoeDelayMs,
      timestamp,
      timestamp,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.toLowerCase().includes("unique") ||
      msg.toLowerCase().includes("constraint")
    ) {
      return json(409, { error: "Item with this ID already exists." });
    }
    return json(500, { error: msg });
  }

  return handleGetItem(db, body.id as string);
}

async function handleUpdateItem(
  request: Request,
  db: Database,
  id: string,
): Promise<Response> {
  const body = (await readJsonBody(request)) as Record<string, unknown> | null;
  if (!body) {
    return json(400, { error: "Invalid payload." });
  }

  const existing = db
    .query<{ id: string }, [string]>(
      "SELECT id FROM item_definitions WHERE id = ?1 LIMIT 1",
    )
    .get(id);
  if (!existing) {
    return json(404, { error: "Item not found." });
  }

  const timestamp = new Date().toISOString();
  const attack = resolveItemAttackColumns({ ...body, id });
  db.query(
    `UPDATE item_definitions SET
      name = ?2, icon_key = ?3, type = ?4, class_requirement = ?5,
      min_level_to_equip = ?6, weapon_damage_flat = ?7,
      weapon_range_flat = ?8, weapon_speed_percent = ?9, weapon_style = ?10,
      attack_pattern_id = ?11, attack_damage_multiplier = ?12,
      attack_projectile_count = ?13, attack_spread_degrees = ?14,
      attack_burst_count = ?15, attack_burst_interval_ms = ?16,
      attack_aoe_radius = ?17, attack_aoe_delay_ms = ?18, updated_at = ?19
     WHERE id = ?1`,
  ).run(
    id,
    str(body.name, "Unnamed"),
    str(body.iconKey, id),
    str(body.type, "misc"),
    strOrNull(body.classRequirement),
    numOrNull(body.minLevelToEquip),
    numOrNull(body.weaponDamageFlat),
    numOrNull(body.weaponRangeFlat),
    numOrNull(body.weaponSpeedPercent),
    attack.weaponStyle,
    attack.attackPatternId,
    attack.attackDamageMultiplier,
    attack.attackProjectileCount,
    attack.attackSpreadDegrees,
    attack.attackBurstCount,
    attack.attackBurstIntervalMs,
    attack.attackAoeRadius,
    attack.attackAoeDelayMs,
    timestamp,
  );

  return handleGetItem(db, id);
}

function handleDeleteItem(db: Database, id: string): Response {
  const existing = db
    .query<{ id: string }, [string]>(
      "SELECT id FROM item_definitions WHERE id = ?1 LIMIT 1",
    )
    .get(id);
  if (!existing) {
    return json(404, { error: "Item not found." });
  }
  db.query("DELETE FROM item_definitions WHERE id = ?1").run(id);
  return new Response(null, { status: 204 });
}

// ─── Loot Tables ─────────────────────────────────────────────────────

interface LootTableRow {
  enemy_archetype_id: string;
  drop_chance: number;
}

interface LootEntryRow {
  id: string;
  enemy_archetype_id: string;
  item_definition_id: string;
  weight: number;
  class_affinity: CharacterClass | null;
}

function handleListLootTables(db: Database): Response {
  const tables = db
    .query<LootTableRow, []>(
      "SELECT enemy_archetype_id, drop_chance FROM enemy_loot_tables ORDER BY enemy_archetype_id ASC",
    )
    .all();

  const entries = db
    .query<LootEntryRow, []>(
      `SELECT id, enemy_archetype_id, item_definition_id, weight, class_affinity
       FROM enemy_loot_table_entries ORDER BY enemy_archetype_id ASC`,
    )
    .all();

  const entriesByArchetype = new Map<string, typeof entries>();
  for (const entry of entries) {
    const list = entriesByArchetype.get(entry.enemy_archetype_id) ?? [];
    list.push(entry);
    entriesByArchetype.set(entry.enemy_archetype_id, list);
  }

  const lootTables = tables.map((table) => ({
    enemyArchetypeId: table.enemy_archetype_id,
    dropChance: table.drop_chance,
    entries: (entriesByArchetype.get(table.enemy_archetype_id) ?? []).map(
      (e) => ({
        id: e.id,
        itemDefinitionId: e.item_definition_id,
        weight: e.weight,
        classAffinity: e.class_affinity,
      }),
    ),
  }));

  return json(200, { lootTables });
}

function handleGetLootTable(db: Database, enemyId: string): Response {
  const table = db
    .query<LootTableRow, [string]>(
      "SELECT enemy_archetype_id, drop_chance FROM enemy_loot_tables WHERE enemy_archetype_id = ?1 LIMIT 1",
    )
    .get(enemyId);

  if (!table) {
    return json(200, {
      lootTable: {
        enemyArchetypeId: enemyId,
        dropChance: 0,
        entries: [],
      },
    });
  }

  const entries = db
    .query<LootEntryRow, [string]>(
      `SELECT id, enemy_archetype_id, item_definition_id, weight, class_affinity
       FROM enemy_loot_table_entries WHERE enemy_archetype_id = ?1`,
    )
    .all(enemyId);

  return json(200, {
    lootTable: {
      enemyArchetypeId: table.enemy_archetype_id,
      dropChance: table.drop_chance,
      entries: entries.map((e) => ({
        id: e.id,
        itemDefinitionId: e.item_definition_id,
        weight: e.weight,
        classAffinity: e.class_affinity,
      })),
    },
  });
}

async function handleUpsertLootTable(
  request: Request,
  db: Database,
  enemyId: string,
): Promise<Response> {
  const body = (await readJsonBody(request)) as Record<string, unknown> | null;
  if (!body) {
    return json(400, { error: "Invalid payload." });
  }

  const dropChance = typeof body.dropChance === "number" ? body.dropChance : 0;
  const entries = Array.isArray(body.entries) ? body.entries : [];
  const timestamp = new Date().toISOString();

  let committed = false;
  try {
    db.exec("BEGIN IMMEDIATE;");

    // Upsert table
    db.query(
      `INSERT INTO enemy_loot_tables (enemy_archetype_id, drop_chance, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(enemy_archetype_id) DO UPDATE SET drop_chance = ?2, updated_at = ?4`,
    ).run(enemyId, dropChance, timestamp, timestamp);

    // Replace all entries
    db.query(
      "DELETE FROM enemy_loot_table_entries WHERE enemy_archetype_id = ?1",
    ).run(enemyId);

    const insertEntry = db.query(
      `INSERT INTO enemy_loot_table_entries (
        id, enemy_archetype_id, item_definition_id, weight, class_affinity, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    );

    for (const entry of entries) {
      const e = entry as Record<string, unknown>;
      if (typeof e.itemDefinitionId !== "string" || !e.itemDefinitionId) {
        continue;
      }
      insertEntry.run(
        str(e.id, crypto.randomUUID()),
        enemyId,
        e.itemDefinitionId,
        num(e.weight, 1),
        strOrNull(e.classAffinity),
        timestamp,
        timestamp,
      );
    }

    db.exec("COMMIT;");
    committed = true;
  } finally {
    if (!committed) {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // SQLite may auto-close transaction
      }
    }
  }

  return handleGetLootTable(db, enemyId);
}

function handleDeleteLootTable(db: Database, enemyId: string): Response {
  db.query(
    "DELETE FROM enemy_loot_table_entries WHERE enemy_archetype_id = ?1",
  ).run(enemyId);
  db.query("DELETE FROM enemy_loot_tables WHERE enemy_archetype_id = ?1").run(
    enemyId,
  );
  return new Response(null, { status: 204 });
}

// ─── Level Progression ───────────────────────────────────────────────

interface LevelProgressionRow {
  level: number;
  xp_to_next_level: number | null;
  hp_multiplier: number;
  damage_multiplier: number;
}

function handleGetLevelProgression(db: Database): Response {
  const rows = db
    .query<LevelProgressionRow, []>(
      "SELECT level, xp_to_next_level, hp_multiplier, damage_multiplier FROM level_progression ORDER BY level ASC",
    )
    .all();

  return json(200, {
    progression: rows.map((r) => ({
      level: r.level,
      xpToNextLevel: r.xp_to_next_level,
      hpMultiplier: r.hp_multiplier,
      damageMultiplier: r.damage_multiplier,
    })),
  });
}

async function handleUpdateLevelProgression(
  request: Request,
  db: Database,
): Promise<Response> {
  const body = (await readJsonBody(request)) as Record<string, unknown> | null;
  if (!body || !Array.isArray(body.progression)) {
    return json(400, {
      error: "Invalid payload. Expected { progression: [...] }.",
    });
  }

  const rows = body.progression as Array<Record<string, unknown>>;
  let committed = false;

  try {
    db.exec("BEGIN IMMEDIATE;");

    const upsert = db.query(
      `INSERT INTO level_progression (level, xp_to_next_level, hp_multiplier, damage_multiplier)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(level) DO UPDATE SET
         xp_to_next_level = ?2,
         hp_multiplier = ?3,
         damage_multiplier = ?4`,
    );

    for (const row of rows) {
      if (typeof row.level !== "number") {
        continue;
      }
      upsert.run(
        row.level,
        numOrNull(row.xpToNextLevel),
        num(row.hpMultiplier, 1),
        num(row.damageMultiplier, 1),
      );
    }

    db.exec("COMMIT;");
    committed = true;
  } finally {
    if (!committed) {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // SQLite may auto-close transaction
      }
    }
  }

  return handleGetLevelProgression(db);
}

// ─── Maps (JSON file I/O) ───────────────────────────────────────────

function handleListMaps(): Response {
  const maps = listMapFiles();
  return json(200, { maps });
}

function handleGetMap(mapId: string): Response {
  const invalidMapId = validateMapIdOrResponse(mapId);
  if (invalidMapId) {
    return invalidMapId;
  }

  const data = readMapFile(mapId);
  if (!data) {
    return json(404, { error: "Map not found." });
  }
  return json(200, { map: data });
}

async function handleSaveMap(
  request: Request,
  mapId: string,
): Promise<Response> {
  const invalidMapId = validateMapIdOrResponse(mapId);
  if (invalidMapId) {
    return invalidMapId;
  }

  const body = (await readJsonBody(request)) as Record<string, unknown> | null;
  if (!body) {
    return json(400, { error: "Invalid payload." });
  }

  // Ensure the id in the body matches the route param and validate schema
  let mapData: unknown;
  try {
    mapData = parseWorldMap({ ...body, id: mapId }, `admin:${mapId}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid world map payload.";
    return json(400, { error: message });
  }

  const success = writeMapFile(mapId, mapData);
  if (!success) {
    return json(500, { error: "Failed to write map file." });
  }
  return json(200, { map: mapData });
}

async function handleCreateMap(request: Request): Promise<Response> {
  const body = (await readJsonBody(request)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string" || !body.id) {
    return json(400, { error: "Invalid payload. Map ID required." });
  }

  const mapId = body.id as string;
  const invalidMapId = validateMapIdOrResponse(mapId);
  if (invalidMapId) {
    return invalidMapId;
  }

  const existing = readMapFile(mapId);
  if (existing) {
    return json(409, { error: "Map with this ID already exists." });
  }

  let mapData: unknown;
  try {
    mapData = parseWorldMap(body, `admin:${mapId}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid world map payload.";
    return json(400, { error: message });
  }

  const success = writeMapFile(mapId, mapData);
  if (!success) {
    return json(500, { error: "Failed to write map file." });
  }
  return json(201, { map: mapData });
}

function handleDeleteMap(mapId: string): Response {
  const invalidMapId = validateMapIdOrResponse(mapId);
  if (invalidMapId) {
    return invalidMapId;
  }

  const success = deleteMapFile(mapId);
  if (!success) {
    return json(404, { error: "Map not found." });
  }
  return new Response(null, { status: 204 });
}

// ─── Router ──────────────────────────────────────────────────────────

export async function handleAdminRequest(
  request: Request,
  url: URL,
  db: Database,
): Promise<Response | null> {
  // Strip /admin prefix
  const path = url.pathname.slice("/admin".length);
  const method = request.method;
  const allowedOrigins = parseAllowedCorsOrigins();
  const allowedOrigin = getAllowedCorsOrigin(request, url, allowedOrigins);
  const requestOrigin = request.headers.get("origin");
  const isCrossOriginRequest = !!requestOrigin && requestOrigin !== url.origin;

  // Defense-in-depth: reject if disabled/unauthorized even if routes are accidentally wired
  const blocked = guardAdminRequest(request);
  if (blocked) {
    applyCorsHeaders(blocked, allowedOrigin);
    return blocked;
  }

  if (method === "OPTIONS") {
    if (isCrossOriginRequest && !allowedOrigin) {
      return json(403, { error: "Origin not allowed." });
    }

    const preflightResponse = new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
    applyCorsHeaders(preflightResponse, allowedOrigin);
    return preflightResponse;
  }

  if (isCrossOriginRequest && !allowedOrigin) {
    return new Response(null, {
      status: 403,
    });
  }

  try {
    let response: Response | null = null;

    // ── Enemies
    if (path === "/enemies" && method === "GET") {
      response = handleListEnemies(db);
    } else if (path.startsWith("/enemies/") && method === "GET") {
      response = handleGetEnemy(
        db,
        decodeURIComponent(path.slice("/enemies/".length)),
      );
    } else if (path === "/enemies" && method === "POST") {
      response = await handleCreateEnemy(request, db);
    } else if (path.startsWith("/enemies/") && method === "PUT") {
      response = await handleUpdateEnemy(
        request,
        db,
        decodeURIComponent(path.slice("/enemies/".length)),
      );
    } else if (path.startsWith("/enemies/") && method === "DELETE") {
      response = handleDeleteEnemy(
        db,
        decodeURIComponent(path.slice("/enemies/".length)),
      );
    }

    // ── Items
    else if (path === "/items" && method === "GET") {
      response = handleListItems(db);
    } else if (path.startsWith("/items/") && method === "GET") {
      response = handleGetItem(
        db,
        decodeURIComponent(path.slice("/items/".length)),
      );
    } else if (path === "/items" && method === "POST") {
      response = await handleCreateItem(request, db);
    } else if (path.startsWith("/items/") && method === "PUT") {
      response = await handleUpdateItem(
        request,
        db,
        decodeURIComponent(path.slice("/items/".length)),
      );
    } else if (path.startsWith("/items/") && method === "DELETE") {
      response = handleDeleteItem(
        db,
        decodeURIComponent(path.slice("/items/".length)),
      );
    }

    // ── Loot Tables
    else if (path === "/loot-tables" && method === "GET") {
      response = handleListLootTables(db);
    } else if (path.startsWith("/loot-tables/") && method === "GET") {
      response = handleGetLootTable(
        db,
        decodeURIComponent(path.slice("/loot-tables/".length)),
      );
    } else if (path.startsWith("/loot-tables/") && method === "PUT") {
      response = await handleUpsertLootTable(
        request,
        db,
        decodeURIComponent(path.slice("/loot-tables/".length)),
      );
    } else if (path.startsWith("/loot-tables/") && method === "DELETE") {
      response = handleDeleteLootTable(
        db,
        decodeURIComponent(path.slice("/loot-tables/".length)),
      );
    }

    // ── Level Progression
    else if (path === "/level-progression" && method === "GET") {
      response = handleGetLevelProgression(db);
    } else if (path === "/level-progression" && method === "PUT") {
      response = await handleUpdateLevelProgression(request, db);
    }

    // ── Maps
    else if (path === "/maps" && method === "GET") {
      response = handleListMaps();
    } else if (path === "/maps" && method === "POST") {
      response = await handleCreateMap(request);
    } else if (path.startsWith("/maps/") && method === "GET") {
      response = handleGetMap(decodeURIComponent(path.slice("/maps/".length)));
    } else if (path.startsWith("/maps/") && method === "PUT") {
      response = await handleSaveMap(
        request,
        decodeURIComponent(path.slice("/maps/".length)),
      );
    } else if (path.startsWith("/maps/") && method === "DELETE") {
      response = handleDeleteMap(
        decodeURIComponent(path.slice("/maps/".length)),
      );
    }

    if (response) {
      applyCorsHeaders(response, allowedOrigin);
    }

    return response;
  } catch {
    const response = json(500, { error: "Unexpected admin API error." });
    applyCorsHeaders(response, allowedOrigin);
    return response;
  }
}
