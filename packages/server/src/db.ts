import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MAX_CHARACTER_LEVEL, getLevelProgressionTable } from "@mmo/shared";

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
  ensureLevelProgressionTable(db);
  ensureLevelProgressionSeed(db);
  ensureEnemyArchetypeSeeds(db);
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
    220,
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
