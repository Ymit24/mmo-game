import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MAX_CHARACTER_LEVEL, getLevelProgressionTable } from "@mmo/shared";

const ENEMY_ARCHETYPE_PROGRESSION_SEEDS = [
  { id: "slime_scout", level: 1, xpReward: 16 },
  { id: "stone_golem", level: 6, xpReward: 70 },
  { id: "briar_wolf", level: 4, xpReward: 42 },
  { id: "ember_mantis", level: 5, xpReward: 54 },
  { id: "iron_reaver", level: 9, xpReward: 120 },
  { id: "dusk_harrier", level: 10, xpReward: 148 },
  { id: "void_acolyte", level: 12, xpReward: 210 },
  { id: "rune_guardian", level: 13, xpReward: 248 },
  { id: "warden_colossus", level: 14, xpReward: 292 },
  { id: "storm_archon", level: 15, xpReward: 340 },
] as const;

function ensureDatabaseDirectory(dbPath: string): void {
  if (dbPath === ":memory:" || dbPath.startsWith("file:")) {
    return;
  }

  const directory = dirname(dbPath);
  if (directory === ".") {
    return;
  }

  mkdirSync(directory, { recursive: true });
}

export function createDatabase(dbPath: string): Database {
  ensureDatabaseDirectory(dbPath);
  const db = new Database(dbPath, { create: true, strict: true });
  bootstrapDatabase(db);
  return db;
}

export function bootstrapDatabase(db: Database): void {
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      last_used_character_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  ensureUsersLastUsedCharacterColumn(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nickname TEXT NOT NULL,
      nickname_normalized TEXT NOT NULL,
      class TEXT NOT NULL CHECK (class IN ('knight', 'mage')),
      level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= ${MAX_CHARACTER_LEVEL}),
      xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
      max_hp REAL NOT NULL CHECK (max_hp > 0),
      base_damage REAL NOT NULL CHECK (base_damage >= 0),
      base_attack_speed_ms INTEGER NOT NULL CHECK (base_attack_speed_ms > 0),
      base_attack_range REAL NOT NULL CHECK (base_attack_range > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, nickname_normalized)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_characters_user_id
    ON characters (user_id);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_characters_user_updated_at
    ON characters (user_id, updated_at DESC);
  `);
  ensureCharacterProgressionColumns(db);
  ensureItemDefinitionsTable(db);
  ensureCharacterInventoryTable(db);
  ensureItemDefinitionSeeds(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS enemy_archetypes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
      xp_reward INTEGER NOT NULL DEFAULT 10 CHECK (xp_reward >= 0),
      max_health REAL NOT NULL CHECK (max_health > 0),
      damage REAL NOT NULL CHECK (damage >= 0),
      speed REAL NOT NULL CHECK (speed > 0),
      detection_radius REAL NOT NULL CHECK (detection_radius > 0),
      leash_radius REAL NOT NULL CHECK (leash_radius > 0),
      attack_speed_ms INTEGER NOT NULL CHECK (attack_speed_ms > 0),
      melee_range REAL NOT NULL CHECK (melee_range > 0),
      ranged_range REAL NOT NULL CHECK (ranged_range > 0),
      can_melee INTEGER NOT NULL CHECK (can_melee IN (0, 1)),
      can_ranged INTEGER NOT NULL CHECK (can_ranged IN (0, 1)),
      visual_width REAL NOT NULL CHECK (visual_width > 0),
      visual_height REAL NOT NULL CHECK (visual_height > 0),
      color_hex TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (can_melee = 1 OR can_ranged = 1)
    );
  `);
  ensureEnemyArchetypeRangeColumns(db);
  ensureEnemyArchetypeProgressionColumns(db);
  backfillLegacyEnemyArchetypeProgression(db);
  ensureLevelProgressionTable(db);
  ensureLevelProgressionSeed(db);
  ensureEnemyArchetypeSeeds(db);
  ensureEnemyLootTables(db);
  ensureEnemyLootSeed(db);
}

function ensureUsersLastUsedCharacterColumn(db: Database): void {
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(users);")
    .all();
  const hasColumn = columns.some(
    (column) => column.name === "last_used_character_id",
  );
  if (!hasColumn) {
    db.exec("ALTER TABLE users ADD COLUMN last_used_character_id TEXT;");
  }
}

function ensureEnemyArchetypeSeeds(db: Database): void {
  const timestamp = new Date().toISOString();
  const seedStatement = db.query(
    `INSERT OR IGNORE INTO enemy_archetypes (
      id,
      name,
      level,
      xp_reward,
      max_health,
      damage,
      speed,
      detection_radius,
      leash_radius,
      attack_speed_ms,
      melee_range,
      ranged_range,
      can_melee,
      can_ranged,
      visual_width,
      visual_height,
      color_hex,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`,
  );

  seedStatement.run(
    "slime_scout",
    "Slime Scout",
    1,
    16,
    60,
    8,
    130,
    280,
    420,
    900,
    42,
    220,
    1,
    0,
    34,
    24,
    "#22d3ee",
    timestamp,
    timestamp,
  );

  seedStatement.run(
    "stone_golem",
    "Stone Golem",
    6,
    70,
    250,
    18,
    95,
    240,
    380,
    1400,
    42,
    220,
    1,
    0,
    46,
    46,
    "#a3a3a3",
    timestamp,
    timestamp,
  );

  seedStatement.run(
    "briar_wolf",
    "Briar Wolf",
    4,
    42,
    130,
    14,
    155,
    310,
    460,
    980,
    52,
    220,
    1,
    0,
    42,
    28,
    "#84cc16",
    timestamp,
    timestamp,
  );

  seedStatement.run(
    "ember_mantis",
    "Ember Mantis",
    5,
    54,
    180,
    16,
    170,
    320,
    470,
    920,
    58,
    220,
    1,
    0,
    40,
    30,
    "#f97316",
    timestamp,
    timestamp,
  );

  seedStatement.run(
    "iron_reaver",
    "Iron Reaver",
    9,
    120,
    320,
    24,
    120,
    300,
    450,
    1_120,
    50,
    220,
    1,
    0,
    52,
    48,
    "#71717a",
    timestamp,
    timestamp,
  );

  seedStatement.run(
    "dusk_harrier",
    "Dusk Harrier",
    10,
    148,
    400,
    26,
    195,
    380,
    520,
    1_040,
    42,
    260,
    0,
    1,
    36,
    28,
    "#4338ca",
    timestamp,
    timestamp,
  );

  seedStatement.run(
    "void_acolyte",
    "Void Acolyte",
    12,
    210,
    480,
    32,
    150,
    340,
    500,
    920,
    48,
    250,
    1,
    1,
    44,
    34,
    "#a855f7",
    timestamp,
    timestamp,
  );

  seedStatement.run(
    "rune_guardian",
    "Rune Guardian",
    13,
    248,
    550,
    34,
    128,
    320,
    480,
    1_050,
    52,
    220,
    1,
    0,
    56,
    52,
    "#0ea5e9",
    timestamp,
    timestamp,
  );

  seedStatement.run(
    "warden_colossus",
    "Warden Colossus",
    14,
    292,
    650,
    38,
    112,
    320,
    470,
    1_200,
    54,
    220,
    1,
    0,
    64,
    60,
    "#64748b",
    timestamp,
    timestamp,
  );

  seedStatement.run(
    "storm_archon",
    "Storm Archon",
    15,
    340,
    800,
    42,
    178,
    420,
    560,
    980,
    46,
    290,
    0,
    1,
    42,
    36,
    "#facc15",
    timestamp,
    timestamp,
  );
}

function ensureEnemyArchetypeRangeColumns(db: Database): void {
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(enemy_archetypes);")
    .all();
  const hasMeleeRange = columns.some((column) => column.name === "melee_range");
  const hasRangedRange = columns.some(
    (column) => column.name === "ranged_range",
  );

  if (!hasMeleeRange) {
    db.exec(
      "ALTER TABLE enemy_archetypes ADD COLUMN melee_range REAL NOT NULL DEFAULT 42;",
    );
  }

  if (!hasRangedRange) {
    db.exec(
      "ALTER TABLE enemy_archetypes ADD COLUMN ranged_range REAL NOT NULL DEFAULT 220;",
    );
  }
}

function ensureCharacterProgressionColumns(db: Database): void {
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(characters);")
    .all();
  const hasLevel = columns.some((column) => column.name === "level");
  const hasXp = columns.some((column) => column.name === "xp");

  if (!hasLevel) {
    db.exec(
      `ALTER TABLE characters ADD COLUMN level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= ${MAX_CHARACTER_LEVEL});`,
    );
  }

  if (!hasXp) {
    db.exec(
      "ALTER TABLE characters ADD COLUMN xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0);",
    );
  }
}

function ensureItemDefinitionsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS item_definitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon_key TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('weapon', 'armor', 'potion', 'misc')),
      class_requirement TEXT CHECK (class_requirement IS NULL OR class_requirement IN ('knight', 'mage')),
      min_level_to_equip INTEGER CHECK (min_level_to_equip IS NULL OR min_level_to_equip >= 1),
      weapon_damage_flat REAL,
      weapon_range_flat REAL,
      weapon_speed_percent REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function ensureCharacterInventoryTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS character_inventory (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      item_definition_id TEXT NOT NULL REFERENCES item_definitions(id),
      slot_kind TEXT NOT NULL CHECK (slot_kind IN ('bag', 'weapon', 'armor')),
      slot_index INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        (slot_kind = 'bag' AND slot_index IS NOT NULL AND slot_index >= 0 AND slot_index < 9)
        OR
        (slot_kind IN ('weapon', 'armor') AND slot_index IS NULL)
      )
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_character_inventory_character_id
    ON character_inventory (character_id);
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_character_inventory_bag_slot_unique
    ON character_inventory (character_id, slot_index)
    WHERE slot_kind = 'bag';
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_character_inventory_weapon_slot_unique
    ON character_inventory (character_id)
    WHERE slot_kind = 'weapon';
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_character_inventory_armor_slot_unique
    ON character_inventory (character_id)
    WHERE slot_kind = 'armor';
  `);
}

function ensureItemDefinitionSeeds(db: Database): void {
  const timestamp = new Date().toISOString();
  const statement = db.query(
    `INSERT OR IGNORE INTO item_definitions (
      id,
      name,
      icon_key,
      type,
      class_requirement,
      min_level_to_equip,
      weapon_damage_flat,
      weapon_range_flat,
      weapon_speed_percent,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
  );

  statement.run(
    "training_sword",
    "Training Sword",
    "training_sword",
    "weapon",
    "knight",
    1,
    10,
    8,
    5,
    timestamp,
    timestamp,
  );

  statement.run(
    "training_wand",
    "Training Wand",
    "training_wand",
    "weapon",
    "mage",
    1,
    8,
    24,
    7,
    timestamp,
    timestamp,
  );

  statement.run(
    "iron_broadsword",
    "Iron Broadsword",
    "iron_broadsword",
    "weapon",
    "knight",
    5,
    28,
    12,
    8,
    timestamp,
    timestamp,
  );

  statement.run(
    "runed_greatsword",
    "Runed Greatsword",
    "runed_greatsword",
    "weapon",
    "knight",
    10,
    55,
    18,
    12,
    timestamp,
    timestamp,
  );

  statement.run(
    "adept_focus_wand",
    "Adept Focus Wand",
    "adept_focus_wand",
    "weapon",
    "mage",
    5,
    22,
    42,
    10,
    timestamp,
    timestamp,
  );

  statement.run(
    "stormweave_rod",
    "Stormweave Rod",
    "stormweave_rod",
    "weapon",
    "mage",
    10,
    45,
    70,
    14,
    timestamp,
    timestamp,
  );

  statement.run(
    "arcane_scepter",
    "Arcane Scepter",
    "arcane_scepter",
    "weapon",
    "mage",
    15,
    65,
    85,
    12,
    timestamp,
    timestamp,
  );

  statement.run(
    "dragonbone_blade",
    "Dragonbone Blade",
    "dragonbone_blade",
    "weapon",
    "knight",
    15,
    80,
    22,
    10,
    timestamp,
    timestamp,
  );
}

function ensureEnemyArchetypeProgressionColumns(db: Database): void {
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(enemy_archetypes);")
    .all();
  const hasLevel = columns.some((column) => column.name === "level");
  const hasXpReward = columns.some((column) => column.name === "xp_reward");

  if (!hasLevel) {
    db.exec(
      "ALTER TABLE enemy_archetypes ADD COLUMN level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1);",
    );
  }

  if (!hasXpReward) {
    db.exec(
      "ALTER TABLE enemy_archetypes ADD COLUMN xp_reward INTEGER NOT NULL DEFAULT 10 CHECK (xp_reward >= 0);",
    );
  }
}

function backfillLegacyEnemyArchetypeProgression(db: Database): void {
  const statement = db.query(
    `UPDATE enemy_archetypes
     SET level = ?2,
         xp_reward = ?3
     WHERE id = ?1
       AND level = 1
       AND xp_reward = 10`,
  );

  for (const row of ENEMY_ARCHETYPE_PROGRESSION_SEEDS) {
    statement.run(row.id, row.level, row.xpReward);
  }
}

function ensureLevelProgressionTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS level_progression (
      level INTEGER PRIMARY KEY,
      xp_to_next_level INTEGER,
      hp_multiplier REAL NOT NULL CHECK (hp_multiplier > 0),
      damage_multiplier REAL NOT NULL CHECK (damage_multiplier > 0)
    );
  `);
}

function ensureLevelProgressionSeed(db: Database): void {
  const statement = db.query(
    `INSERT OR IGNORE INTO level_progression (
      level,
      xp_to_next_level,
      hp_multiplier,
      damage_multiplier
    ) VALUES (?1, ?2, ?3, ?4)`,
  );

  for (const row of getLevelProgressionTable()) {
    statement.run(
      row.level,
      row.xpToNextLevel,
      row.hpMultiplier,
      row.damageMultiplier,
    );
  }
}

function ensureEnemyLootTables(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS enemy_loot_tables (
      enemy_archetype_id TEXT PRIMARY KEY REFERENCES enemy_archetypes(id) ON DELETE CASCADE,
      drop_chance REAL NOT NULL CHECK (drop_chance >= 0 AND drop_chance <= 1),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS enemy_loot_table_entries (
      id TEXT PRIMARY KEY,
      enemy_archetype_id TEXT NOT NULL REFERENCES enemy_loot_tables(enemy_archetype_id) ON DELETE CASCADE,
      item_definition_id TEXT NOT NULL REFERENCES item_definitions(id),
      weight REAL NOT NULL CHECK (weight > 0),
      class_affinity TEXT CHECK (class_affinity IS NULL OR class_affinity IN ('knight', 'mage')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_enemy_loot_entries_archetype
    ON enemy_loot_table_entries (enemy_archetype_id);
  `);
}

function ensureEnemyLootSeed(db: Database): void {
  const timestamp = new Date().toISOString();

  db.query(
    `INSERT OR IGNORE INTO enemy_loot_tables (
      enemy_archetype_id,
      drop_chance,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4)`,
  ).run("slime_scout", 0.3, timestamp, timestamp);

  db.query(
    `INSERT OR IGNORE INTO enemy_loot_table_entries (
      id,
      enemy_archetype_id,
      item_definition_id,
      weight,
      class_affinity,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  ).run(
    "seed-slime-scout-iron-broadsword",
    "slime_scout",
    "iron_broadsword",
    1,
    "knight",
    timestamp,
    timestamp,
  );

  db.query(
    `INSERT OR IGNORE INTO enemy_loot_table_entries (
      id,
      enemy_archetype_id,
      item_definition_id,
      weight,
      class_affinity,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  ).run(
    "seed-slime-scout-adept-focus-wand",
    "slime_scout",
    "adept_focus_wand",
    1,
    "mage",
    timestamp,
    timestamp,
  );
}
