import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

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
      max_hp REAL NOT NULL CHECK (max_hp > 0),
      base_damage REAL NOT NULL CHECK (base_damage >= 0),
      base_attack_speed_ms INTEGER NOT NULL CHECK (base_attack_speed_ms > 0),
      base_attack_range REAL NOT NULL CHECK (base_attack_range > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, nickname_normalized)
    );
  `);
  ensureCharacterCombatColumns(db);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_characters_user_id
    ON characters (user_id);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_characters_user_updated_at
    ON characters (user_id, updated_at DESC);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS enemy_archetypes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
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

function ensureCharacterCombatColumns(db: Database): void {
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(characters);")
    .all();
  const hasMaxHp = columns.some((column) => column.name === "max_hp");
  const hasBaseDamage = columns.some((column) => column.name === "base_damage");
  const hasBaseAttackSpeedMs = columns.some(
    (column) => column.name === "base_attack_speed_ms",
  );
  const hasBaseAttackRange = columns.some(
    (column) => column.name === "base_attack_range",
  );

  if (!hasMaxHp) {
    db.exec(
      "ALTER TABLE characters ADD COLUMN max_hp REAL NOT NULL DEFAULT 100;",
    );
  }

  if (!hasBaseDamage) {
    db.exec(
      "ALTER TABLE characters ADD COLUMN base_damage REAL NOT NULL DEFAULT 10;",
    );
  }

  if (!hasBaseAttackSpeedMs) {
    db.exec(
      "ALTER TABLE characters ADD COLUMN base_attack_speed_ms INTEGER NOT NULL DEFAULT 900;",
    );
  }

  if (!hasBaseAttackRange) {
    db.exec(
      "ALTER TABLE characters ADD COLUMN base_attack_range REAL NOT NULL DEFAULT 60;",
    );
  }
}

function ensureEnemyArchetypeSeeds(db: Database): void {
  const timestamp = new Date().toISOString();
  const seedStatement = db.query(
    `INSERT OR IGNORE INTO enemy_archetypes (
      id,
      name,
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
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`,
  );

  seedStatement.run(
    "slime_scout",
    "Slime Scout",
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
