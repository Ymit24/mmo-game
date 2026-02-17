import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  type AttackPatternId,
  type CharacterClass,
  DEFAULT_ITEM_ICONS,
  MAX_ARMOR_DAMAGE_REDUCTION_PERCENT,
  MAX_CHARACTER_LEVEL,
  USER_ROLES,
  type WeaponStyle,
  getLevelProgressionTable,
  resolveWeaponAttackConfig,
} from "@mmo/shared";

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
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      last_used_character_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  ensureUsersRoleColumn(db);
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
  ensureItemIconsTable(db);
  ensureItemDefinitionsTable(db);
  ensureItemDefinitionAttackColumns(db);
  ensureItemIconSeeds(db);
  backfillItemIconsFromDefinitions(db);
  ensureItemDefinitionIconForeignKey(db);
  ensureCharacterInventoryTable(db);
  ensureItemDefinitionSeeds(db);
  backfillItemDefinitionAttackDefaults(db);
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

function ensureUsersRoleColumn(db: Database): void {
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(users);")
    .all();
  const hasColumn = columns.some((column) => column.name === "role");
  if (!hasColumn) {
    db.exec(
      "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));",
    );
  }
  db.query(
    `UPDATE users
     SET role = ?1
     WHERE role IS NULL OR role NOT IN (?1, ?2)`,
  ).run(USER_ROLES.user, USER_ROLES.admin);
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

function ensureItemIconsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS item_icons (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function ensureItemDefinitionsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS item_definitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon_key TEXT NOT NULL REFERENCES item_icons(key) ON DELETE RESTRICT ON UPDATE RESTRICT,
      type TEXT NOT NULL CHECK (type IN ('weapon', 'armor', 'potion', 'misc')),
      class_requirement TEXT CHECK (class_requirement IS NULL OR class_requirement IN ('knight', 'mage')),
      min_level_to_equip INTEGER CHECK (min_level_to_equip IS NULL OR min_level_to_equip >= 1),
      armor_max_hp_flat REAL CHECK (armor_max_hp_flat IS NULL OR armor_max_hp_flat >= 0),
      armor_damage_reduction_percent REAL CHECK (
        armor_damage_reduction_percent IS NULL OR
        (armor_damage_reduction_percent >= 0 AND armor_damage_reduction_percent <= ${MAX_ARMOR_DAMAGE_REDUCTION_PERCENT})
      ),
      weapon_damage_flat REAL,
      weapon_range_flat REAL,
      weapon_speed_percent REAL,
      weapon_style TEXT CHECK (weapon_style IS NULL OR weapon_style IN ('sword', 'wand', 'staff')),
      attack_pattern_id TEXT CHECK (
        attack_pattern_id IS NULL OR attack_pattern_id IN (
          'sword_cleave',
          'sword_spinblade',
          'sword_whirl',
          'wand_multishot',
          'wand_burst',
          'staff_ground_aoe'
        )
      ),
      attack_damage_multiplier REAL CHECK (
        attack_damage_multiplier IS NULL OR
        (attack_damage_multiplier >= 0 AND attack_damage_multiplier <= 10)
      ),
      attack_projectile_count INTEGER CHECK (
        attack_projectile_count IS NULL OR
        (attack_projectile_count >= 1 AND attack_projectile_count <= 12)
      ),
      attack_spread_degrees REAL CHECK (
        attack_spread_degrees IS NULL OR
        (attack_spread_degrees >= 0 AND attack_spread_degrees <= 180)
      ),
      attack_burst_count INTEGER CHECK (
        attack_burst_count IS NULL OR
        (attack_burst_count >= 1 AND attack_burst_count <= 12)
      ),
      attack_burst_interval_ms INTEGER CHECK (
        attack_burst_interval_ms IS NULL OR
        (attack_burst_interval_ms >= 0 AND attack_burst_interval_ms <= 5000)
      ),
      attack_aoe_radius REAL CHECK (
        attack_aoe_radius IS NULL OR
        (attack_aoe_radius >= 0 AND attack_aoe_radius <= 1200)
      ),
      attack_aoe_delay_ms INTEGER CHECK (
        attack_aoe_delay_ms IS NULL OR
        (attack_aoe_delay_ms >= 0 AND attack_aoe_delay_ms <= 10000)
      ),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function ensureItemIconSeeds(db: Database): void {
  const timestamp = new Date().toISOString();
  const statement = db.query(
    `INSERT OR IGNORE INTO item_icons (key, name, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4)`,
  );

  for (const icon of DEFAULT_ITEM_ICONS) {
    statement.run(icon.key, icon.name, timestamp, timestamp);
  }
}

function inferItemIconName(iconKey: string): string {
  return iconKey
    .split("_")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function backfillItemIconsFromDefinitions(db: Database): void {
  const timestamp = new Date().toISOString();
  const insert = db.query(
    `INSERT OR IGNORE INTO item_icons (key, name, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4)`,
  );

  const keys = db
    .query<{ icon_key: string }, []>(
      "SELECT DISTINCT icon_key FROM item_definitions WHERE icon_key IS NOT NULL",
    )
    .all();

  for (const row of keys) {
    const name = inferItemIconName(row.icon_key);
    insert.run(row.icon_key, name, timestamp, timestamp);
  }
}

function ensureItemDefinitionIconForeignKey(db: Database): void {
  const hasForeignKey = db
    .query<{ table: string; from: string; to: string }, []>(
      "PRAGMA foreign_key_list(item_definitions);",
    )
    .all()
    .some(
      (foreignKey) =>
        foreignKey.table === "item_icons" &&
        foreignKey.from === "icon_key" &&
        foreignKey.to === "key",
    );

  if (hasForeignKey) {
    return;
  }

  db.exec("PRAGMA foreign_keys = OFF;");
  let committed = false;

  try {
    db.exec("BEGIN IMMEDIATE;");
    db.exec(`
      CREATE TABLE item_definitions_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon_key TEXT NOT NULL REFERENCES item_icons(key) ON DELETE RESTRICT ON UPDATE RESTRICT,
        type TEXT NOT NULL CHECK (type IN ('weapon', 'armor', 'potion', 'misc')),
        class_requirement TEXT CHECK (class_requirement IS NULL OR class_requirement IN ('knight', 'mage')),
        min_level_to_equip INTEGER CHECK (min_level_to_equip IS NULL OR min_level_to_equip >= 1),
        armor_max_hp_flat REAL CHECK (armor_max_hp_flat IS NULL OR armor_max_hp_flat >= 0),
        armor_damage_reduction_percent REAL CHECK (
          armor_damage_reduction_percent IS NULL OR
          (armor_damage_reduction_percent >= 0 AND armor_damage_reduction_percent <= ${MAX_ARMOR_DAMAGE_REDUCTION_PERCENT})
        ),
        weapon_damage_flat REAL,
        weapon_range_flat REAL,
        weapon_speed_percent REAL,
        weapon_style TEXT CHECK (weapon_style IS NULL OR weapon_style IN ('sword', 'wand', 'staff')),
        attack_pattern_id TEXT CHECK (
          attack_pattern_id IS NULL OR attack_pattern_id IN (
            'sword_cleave',
            'sword_spinblade',
            'sword_whirl',
            'wand_multishot',
            'wand_burst',
            'staff_ground_aoe'
          )
        ),
        attack_damage_multiplier REAL CHECK (
          attack_damage_multiplier IS NULL OR
          (attack_damage_multiplier >= 0 AND attack_damage_multiplier <= 10)
        ),
        attack_projectile_count INTEGER CHECK (
          attack_projectile_count IS NULL OR
          (attack_projectile_count >= 1 AND attack_projectile_count <= 12)
        ),
        attack_spread_degrees REAL CHECK (
          attack_spread_degrees IS NULL OR
          (attack_spread_degrees >= 0 AND attack_spread_degrees <= 180)
        ),
        attack_burst_count INTEGER CHECK (
          attack_burst_count IS NULL OR
          (attack_burst_count >= 1 AND attack_burst_count <= 12)
        ),
        attack_burst_interval_ms INTEGER CHECK (
          attack_burst_interval_ms IS NULL OR
          (attack_burst_interval_ms >= 0 AND attack_burst_interval_ms <= 5000)
        ),
        attack_aoe_radius REAL CHECK (
          attack_aoe_radius IS NULL OR
          (attack_aoe_radius >= 0 AND attack_aoe_radius <= 1200)
        ),
        attack_aoe_delay_ms INTEGER CHECK (
          attack_aoe_delay_ms IS NULL OR
          (attack_aoe_delay_ms >= 0 AND attack_aoe_delay_ms <= 10000)
        ),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    db.exec(`
      INSERT INTO item_definitions_new (
        id, name, icon_key, type, class_requirement,
        min_level_to_equip, armor_max_hp_flat, armor_damage_reduction_percent,
        weapon_damage_flat, weapon_range_flat,
        weapon_speed_percent, weapon_style, attack_pattern_id,
        attack_damage_multiplier, attack_projectile_count,
        attack_spread_degrees, attack_burst_count, attack_burst_interval_ms,
        attack_aoe_radius, attack_aoe_delay_ms, created_at, updated_at
      )
      SELECT
        id, name, icon_key, type, class_requirement,
        min_level_to_equip, armor_max_hp_flat, armor_damage_reduction_percent,
        weapon_damage_flat, weapon_range_flat,
        weapon_speed_percent, weapon_style, attack_pattern_id,
        attack_damage_multiplier, attack_projectile_count,
        attack_spread_degrees, attack_burst_count, attack_burst_interval_ms,
        attack_aoe_radius, attack_aoe_delay_ms, created_at, updated_at
      FROM item_definitions;
    `);
    db.exec("DROP TABLE item_definitions;");
    db.exec("ALTER TABLE item_definitions_new RENAME TO item_definitions;");
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
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

function ensureItemDefinitionAttackColumns(db: Database): void {
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(item_definitions);")
    .all();
  const hasColumn = (name: string) =>
    columns.some((column) => column.name === name);

  if (!hasColumn("weapon_style")) {
    db.exec(
      "ALTER TABLE item_definitions ADD COLUMN weapon_style TEXT CHECK (weapon_style IS NULL OR weapon_style IN ('sword', 'wand', 'staff'));",
    );
  }
  if (!hasColumn("armor_max_hp_flat")) {
    db.exec(
      "ALTER TABLE item_definitions ADD COLUMN armor_max_hp_flat REAL CHECK (armor_max_hp_flat IS NULL OR armor_max_hp_flat >= 0);",
    );
  }
  if (!hasColumn("armor_damage_reduction_percent")) {
    db.exec(
      `ALTER TABLE item_definitions ADD COLUMN armor_damage_reduction_percent REAL CHECK (armor_damage_reduction_percent IS NULL OR (armor_damage_reduction_percent >= 0 AND armor_damage_reduction_percent <= ${MAX_ARMOR_DAMAGE_REDUCTION_PERCENT}));`,
    );
  }
  if (!hasColumn("attack_pattern_id")) {
    db.exec(
      "ALTER TABLE item_definitions ADD COLUMN attack_pattern_id TEXT CHECK (attack_pattern_id IS NULL OR attack_pattern_id IN ('sword_cleave', 'sword_spinblade', 'sword_whirl', 'wand_multishot', 'wand_burst', 'staff_ground_aoe'));",
    );
  }
  if (!hasColumn("attack_damage_multiplier")) {
    db.exec(
      "ALTER TABLE item_definitions ADD COLUMN attack_damage_multiplier REAL CHECK (attack_damage_multiplier IS NULL OR (attack_damage_multiplier >= 0 AND attack_damage_multiplier <= 10));",
    );
  }
  if (!hasColumn("attack_projectile_count")) {
    db.exec(
      "ALTER TABLE item_definitions ADD COLUMN attack_projectile_count INTEGER CHECK (attack_projectile_count IS NULL OR (attack_projectile_count >= 1 AND attack_projectile_count <= 12));",
    );
  }
  if (!hasColumn("attack_spread_degrees")) {
    db.exec(
      "ALTER TABLE item_definitions ADD COLUMN attack_spread_degrees REAL CHECK (attack_spread_degrees IS NULL OR (attack_spread_degrees >= 0 AND attack_spread_degrees <= 180));",
    );
  }
  if (!hasColumn("attack_burst_count")) {
    db.exec(
      "ALTER TABLE item_definitions ADD COLUMN attack_burst_count INTEGER CHECK (attack_burst_count IS NULL OR (attack_burst_count >= 1 AND attack_burst_count <= 12));",
    );
  }
  if (!hasColumn("attack_burst_interval_ms")) {
    db.exec(
      "ALTER TABLE item_definitions ADD COLUMN attack_burst_interval_ms INTEGER CHECK (attack_burst_interval_ms IS NULL OR (attack_burst_interval_ms >= 0 AND attack_burst_interval_ms <= 5000));",
    );
  }
  if (!hasColumn("attack_aoe_radius")) {
    db.exec(
      "ALTER TABLE item_definitions ADD COLUMN attack_aoe_radius REAL CHECK (attack_aoe_radius IS NULL OR (attack_aoe_radius >= 0 AND attack_aoe_radius <= 1200));",
    );
  }
  if (!hasColumn("attack_aoe_delay_ms")) {
    db.exec(
      "ALTER TABLE item_definitions ADD COLUMN attack_aoe_delay_ms INTEGER CHECK (attack_aoe_delay_ms IS NULL OR (attack_aoe_delay_ms >= 0 AND attack_aoe_delay_ms <= 10000));",
    );
  }
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
      weapon_style,
      attack_pattern_id,
      attack_damage_multiplier,
      attack_projectile_count,
      attack_spread_degrees,
      attack_burst_count,
      attack_burst_interval_ms,
      attack_aoe_radius,
      attack_aoe_delay_ms,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)`,
  );
  const armorStatement = db.query(
    `INSERT OR IGNORE INTO item_definitions (
      id,
      name,
      icon_key,
      type,
      class_requirement,
      min_level_to_equip,
      armor_max_hp_flat,
      armor_damage_reduction_percent,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
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
    "sword",
    "sword_cleave",
    1,
    1,
    0,
    1,
    0,
    0,
    0,
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
    "wand",
    "wand_multishot",
    1,
    3,
    22,
    1,
    0,
    0,
    0,
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
    "sword",
    "sword_whirl",
    0.9,
    1,
    0,
    1,
    0,
    88,
    0,
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
    "sword",
    "sword_spinblade",
    0.55,
    1,
    0,
    1,
    0,
    0,
    0,
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
    "wand",
    "wand_burst",
    0.36,
    1,
    0,
    3,
    70,
    0,
    0,
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
    "staff",
    "staff_ground_aoe",
    0.95,
    1,
    0,
    1,
    0,
    72,
    180,
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
    "staff",
    "staff_ground_aoe",
    0.95,
    1,
    0,
    1,
    0,
    84,
    180,
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
    "sword",
    "sword_spinblade",
    0.55,
    1,
    0,
    1,
    0,
    0,
    0,
    timestamp,
    timestamp,
  );

  statement.run(
    "splitfire_wand",
    "Splitfire Wand",
    "adept_focus_wand",
    "weapon",
    "mage",
    12,
    36,
    58,
    11,
    "wand",
    "wand_multishot",
    1,
    3,
    26,
    1,
    0,
    0,
    0,
    timestamp,
    timestamp,
  );

  statement.run(
    "emberbranch_staff",
    "Emberbranch Staff",
    "stormweave_rod",
    "weapon",
    "mage",
    8,
    34,
    62,
    8,
    "staff",
    "staff_ground_aoe",
    0.95,
    1,
    0,
    1,
    0,
    74,
    180,
    timestamp,
    timestamp,
  );

  statement.run(
    "starcall_staff",
    "Starcall Staff",
    "arcane_scepter",
    "weapon",
    "mage",
    18,
    72,
    98,
    13,
    "staff",
    "staff_ground_aoe",
    0.95,
    1,
    0,
    1,
    0,
    90,
    180,
    timestamp,
    timestamp,
  );

  statement.run(
    "vanguard_pike",
    "Vanguard Pike",
    "runed_greatsword",
    "weapon",
    "knight",
    12,
    66,
    24,
    11,
    "sword",
    "sword_spinblade",
    0.55,
    1,
    0,
    1,
    0,
    0,
    0,
    timestamp,
    timestamp,
  );

  armorStatement.run(
    "training_hauberk",
    "Training Hauberk",
    "training_hauberk",
    "armor",
    "knight",
    1,
    24,
    8,
    timestamp,
    timestamp,
  );

  armorStatement.run(
    "steel_bulwark_armor",
    "Steel Bulwark Armor",
    "steel_bulwark_armor",
    "armor",
    "knight",
    8,
    56,
    26,
    timestamp,
    timestamp,
  );

  armorStatement.run(
    "aegis_plate",
    "Aegis Plate",
    "aegis_plate",
    "armor",
    "knight",
    15,
    84,
    45,
    timestamp,
    timestamp,
  );

  armorStatement.run(
    "training_robe",
    "Training Robe",
    "training_robe",
    "armor",
    "mage",
    1,
    16,
    6,
    timestamp,
    timestamp,
  );

  armorStatement.run(
    "glyphweave_robe",
    "Glyphweave Robe",
    "glyphweave_robe",
    "armor",
    "mage",
    8,
    44,
    24,
    timestamp,
    timestamp,
  );

  armorStatement.run(
    "astral_ward_raiment",
    "Astral Ward Raiment",
    "astral_ward_raiment",
    "armor",
    "mage",
    15,
    72,
    42,
    timestamp,
    timestamp,
  );
}

function backfillItemDefinitionAttackDefaults(db: Database): void {
  db.query(
    `UPDATE item_definitions
     SET weapon_style = NULL,
         attack_pattern_id = NULL,
         attack_damage_multiplier = NULL,
         attack_projectile_count = NULL,
         attack_spread_degrees = NULL,
         attack_burst_count = NULL,
         attack_burst_interval_ms = NULL,
         attack_aoe_radius = NULL,
         attack_aoe_delay_ms = NULL
     WHERE type <> 'weapon'`,
  ).run();
  db.query(
    `UPDATE item_definitions
     SET armor_max_hp_flat = NULL,
         armor_damage_reduction_percent = NULL
     WHERE type <> 'armor'`,
  ).run();
  db.query(
    `UPDATE item_definitions
     SET armor_max_hp_flat = CASE
           WHEN armor_max_hp_flat IS NULL THEN NULL
           WHEN armor_max_hp_flat < 0 THEN 0
           ELSE armor_max_hp_flat
         END,
         armor_damage_reduction_percent = CASE
           WHEN armor_damage_reduction_percent IS NULL THEN NULL
           WHEN armor_damage_reduction_percent < 0 THEN 0
           WHEN armor_damage_reduction_percent > ${MAX_ARMOR_DAMAGE_REDUCTION_PERCENT}
             THEN ${MAX_ARMOR_DAMAGE_REDUCTION_PERCENT}
           ELSE armor_damage_reduction_percent
         END
     WHERE type = 'armor'`,
  ).run();

  const weaponRows = db
    .query<
      {
        id: string;
        class_requirement: CharacterClass | null;
        weapon_style: WeaponStyle | null;
        attack_pattern_id: AttackPatternId | null;
        attack_damage_multiplier: number | null;
        attack_projectile_count: number | null;
        attack_spread_degrees: number | null;
        attack_burst_count: number | null;
        attack_burst_interval_ms: number | null;
        attack_aoe_radius: number | null;
        attack_aoe_delay_ms: number | null;
      },
      []
    >(
      `SELECT id, class_requirement, weapon_style, attack_pattern_id,
              attack_damage_multiplier, attack_projectile_count,
              attack_spread_degrees, attack_burst_count,
              attack_burst_interval_ms, attack_aoe_radius, attack_aoe_delay_ms
       FROM item_definitions
       WHERE type = 'weapon'`,
    )
    .all();

  const apply = db.query(
    `UPDATE item_definitions
     SET weapon_style = ?2,
         attack_pattern_id = ?3,
         attack_damage_multiplier = ?4,
         attack_projectile_count = ?5,
         attack_spread_degrees = ?6,
         attack_burst_count = ?7,
         attack_burst_interval_ms = ?8,
         attack_aoe_radius = ?9,
         attack_aoe_delay_ms = ?10
     WHERE id = ?1`,
  );

  for (const row of weaponRows) {
    const resolved = resolveWeaponAttackConfig(
      {
        id: row.id,
        name: row.id,
        iconKey: row.id,
        type: "weapon",
        classRequirement: row.class_requirement,
        minLevelToEquip: null,
        armorMaxHpFlat: 0,
        armorDamageReductionPercent: 0,
        weaponDamageFlat: 0,
        weaponRangeFlat: 0,
        weaponSpeedPercent: 0,
        weaponStyle: row.weapon_style,
        attackPatternId: row.attack_pattern_id,
        attackDamageMultiplier: row.attack_damage_multiplier,
        attackProjectileCount: row.attack_projectile_count,
        attackSpreadDegrees: row.attack_spread_degrees,
        attackBurstCount: row.attack_burst_count,
        attackBurstIntervalMs: row.attack_burst_interval_ms,
        attackAoeRadius: row.attack_aoe_radius,
        attackAoeDelayMs: row.attack_aoe_delay_ms,
      },
      row.class_requirement ?? "knight",
    );

    apply.run(
      row.id,
      resolved.weaponStyle,
      resolved.attackPatternId,
      resolved.damageMultiplier,
      resolved.projectileCount,
      resolved.spreadDegrees,
      resolved.burstCount,
      resolved.burstIntervalMs,
      resolved.aoeRadius,
      resolved.aoeDelayMs,
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
    `INSERT OR IGNORE INTO enemy_loot_tables (
      enemy_archetype_id,
      drop_chance,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4)`,
  ).run("stone_golem", 0.4, timestamp, timestamp);

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
    "seed-stone-golem-steel-bulwark",
    "stone_golem",
    "steel_bulwark_armor",
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
    "seed-stone-golem-glyphweave",
    "stone_golem",
    "glyphweave_robe",
    1,
    "mage",
    timestamp,
    timestamp,
  );
}
