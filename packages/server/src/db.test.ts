import { describe, expect, test } from "bun:test";

import { bootstrapDatabase, createDatabase } from "./db";

describe("database bootstrap", () => {
  test("enemy archetype table exposes configurable melee/ranged attack ranges", () => {
    const db = createDatabase(":memory:");

    const slime = db
      .query<{ melee_range: number; ranged_range: number }, []>(
        `SELECT melee_range, ranged_range
         FROM enemy_archetypes
         WHERE id = 'e_001_slime'
         LIMIT 1`,
      )
      .get();

    expect(slime).toBeDefined();
    expect(slime?.melee_range).toBeGreaterThan(0);
    expect(slime?.ranged_range).toBeGreaterThan(0);
    db.close();
  });

  test("creates and upserts enemy archetypes to latest seed values", () => {
    const db = createDatabase(":memory:");

    const seeded = db
      .query<{ id: string; visual_width: number }, []>(
        `SELECT id, visual_width
         FROM enemy_archetypes
         WHERE id IN ('e_001_slime', 'e_012_scorpion')
         ORDER BY id ASC`,
      )
      .all();
    expect(seeded).toHaveLength(2);

    db.query(
      `UPDATE enemy_archetypes
       SET visual_width = ?1,
           updated_at = ?2
       WHERE id = ?3`,
    ).run(99, new Date().toISOString(), "e_001_slime");

    bootstrapDatabase(db);

    const slime = db
      .query<{ visual_width: number }, []>(
        `SELECT visual_width
         FROM enemy_archetypes
         WHERE id = 'e_001_slime'
         LIMIT 1`,
      )
      .get();

    expect(slime?.visual_width).toBe(20);
    db.close();
  });

  test("character table exposes base combat stat columns", () => {
    const db = createDatabase(":memory:");

    const columns = db
      .query<{ name: string }, []>("PRAGMA table_info(characters);")
      .all()
      .map((column) => column.name);

    expect(columns).toContain("max_hp");
    expect(columns).toContain("base_damage");
    expect(columns).toContain("base_attack_speed_ms");
    expect(columns).toContain("base_attack_range");
    expect(columns).toContain("level");
    expect(columns).toContain("xp");
    db.close();
  });

  test("creates item definition and character inventory tables", () => {
    const db = createDatabase(":memory:");

    const itemColumns = db
      .query<{ name: string }, []>("PRAGMA table_info(item_definitions);")
      .all()
      .map((column) => column.name);
    expect(itemColumns).toContain("id");
    expect(itemColumns).toContain("icon_key");
    expect(itemColumns).toContain("class_requirement");
    expect(itemColumns).toContain("weapon_speed_percent");

    const inventoryColumns = db
      .query<{ name: string }, []>("PRAGMA table_info(character_inventory);")
      .all()
      .map((column) => column.name);
    expect(inventoryColumns).toContain("character_id");
    expect(inventoryColumns).toContain("item_definition_id");
    expect(inventoryColumns).toContain("slot_kind");
    expect(inventoryColumns).toContain("slot_index");
    db.close();
  });

  test("creates and seeds enemy loot table data", () => {
    const db = createDatabase(":memory:");

    const lootTable = db
      .query<{ enemy_archetype_id: string; drop_chance: number }, []>(
        `SELECT enemy_archetype_id, drop_chance
         FROM enemy_loot_tables
         WHERE enemy_archetype_id = 'e_010_forest_ogre'
         LIMIT 1`,
      )
      .get();
    expect(lootTable?.enemy_archetype_id).toBe("e_010_forest_ogre");
    expect(lootTable?.drop_chance).toBe(1);

    const entries = db
      .query<{ item_definition_id: string; class_affinity: string | null }, []>(
        `SELECT item_definition_id, class_affinity
         FROM enemy_loot_table_entries
         WHERE enemy_archetype_id = 'e_010_forest_ogre'
         ORDER BY item_definition_id ASC`,
      )
      .all();
    expect(entries).toEqual([
      {
        item_definition_id: "w_kn_006_iron_sword",
        class_affinity: "knight",
      },
      {
        item_definition_id: "w_mg_006_oak_wand",
        class_affinity: "mage",
      },
    ]);

    db.close();
  });

  test("seeds starter and progression weapons", () => {
    const db = createDatabase(":memory:");

    const items = db
      .query<
        {
          id: string;
          type: string;
          class_requirement: string | null;
          min_level_to_equip: number | null;
        },
        []
      >(
        `SELECT id, type, class_requirement, min_level_to_equip
         FROM item_definitions
         WHERE id IN (
           'w_kn_001_rusty_sword',
           'w_mg_001_apprentice_staff',
           'w_kn_006_iron_sword',
           'w_mg_006_oak_wand',
           'w_kn_056_kingbreaker',
           'w_mg_056_worldspark_staff'
         )
         ORDER BY id ASC`,
      )
      .all();

    expect(items).toEqual([
      {
        id: "w_kn_001_rusty_sword",
        type: "weapon",
        class_requirement: "knight",
        min_level_to_equip: 1,
      },
      {
        id: "w_kn_006_iron_sword",
        type: "weapon",
        class_requirement: "knight",
        min_level_to_equip: 6,
      },
      {
        id: "w_kn_056_kingbreaker",
        type: "weapon",
        class_requirement: "knight",
        min_level_to_equip: 56,
      },
      {
        id: "w_mg_001_apprentice_staff",
        type: "weapon",
        class_requirement: "mage",
        min_level_to_equip: 1,
      },
      {
        id: "w_mg_006_oak_wand",
        type: "weapon",
        class_requirement: "mage",
        min_level_to_equip: 6,
      },
      {
        id: "w_mg_056_worldspark_staff",
        type: "weapon",
        class_requirement: "mage",
        min_level_to_equip: 56,
      },
    ]);
    db.close();
  });

  test("enemy archetype table exposes level and xp reward columns", () => {
    const db = createDatabase(":memory:");

    const columns = db
      .query<{ name: string }, []>("PRAGMA table_info(enemy_archetypes);")
      .all()
      .map((column) => column.name);

    expect(columns).toContain("level");
    expect(columns).toContain("xp_reward");
    db.close();
  });

  test("backfills enemy archetype progression values for legacy rows", () => {
    const db = createDatabase(":memory:");
    db.exec("DROP TABLE enemy_archetypes;");
    db.exec(`
      CREATE TABLE enemy_archetypes (
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

    const timestamp = new Date().toISOString();
    const insertLegacy = db.query(
      `INSERT INTO enemy_archetypes (
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

    insertLegacy.run(
      "e_001_slime",
      "Green Slime",
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
      "#43c76b",
      timestamp,
      timestamp,
    );
    insertLegacy.run(
      "e_012_scorpion",
      "Canyon Scorpion",
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
      "#b07d2a",
      timestamp,
      timestamp,
    );

    bootstrapDatabase(db);

    const rows = db
      .query<{ id: string; level: number; xp_reward: number }, []>(
        `SELECT id, level, xp_reward
         FROM enemy_archetypes
         WHERE id IN ('e_001_slime', 'e_012_scorpion')
         ORDER BY id ASC`,
      )
      .all();

    expect(rows).toEqual([
      { id: "e_001_slime", level: 1, xp_reward: 10 },
      { id: "e_012_scorpion", level: 12, xp_reward: 75 },
    ]);
    db.close();
  });

  test("seeds level progression rows for levels 1 through 60", () => {
    const db = createDatabase(":memory:");

    const row = db
      .query<{ min_level: number; max_level: number; count: number }, []>(
        `SELECT
           MIN(level) AS min_level,
           MAX(level) AS max_level,
           COUNT(*) AS count
         FROM level_progression`,
      )
      .get();

    expect(row?.min_level).toBe(1);
    expect(row?.max_level).toBe(60);
    expect(row?.count).toBe(60);
    db.close();
  });
});
