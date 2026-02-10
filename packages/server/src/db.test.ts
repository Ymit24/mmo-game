import { describe, expect, test } from "bun:test";

import { bootstrapDatabase, createDatabase } from "./db";

describe("database bootstrap", () => {
  test("enemy archetype table exposes configurable melee/ranged attack ranges", () => {
    const db = createDatabase(":memory:");

    const slime = db
      .query<{ melee_range: number; ranged_range: number }, []>(
        `SELECT melee_range, ranged_range
         FROM enemy_archetypes
         WHERE id = 'slime_scout'
         LIMIT 1`,
      )
      .get();

    expect(slime).toBeDefined();
    expect(slime?.melee_range).toBeGreaterThan(0);
    expect(slime?.ranged_range).toBeGreaterThan(0);
    db.close();
  });

  test("creates and seeds enemy archetypes without overwriting tuned values", () => {
    const db = createDatabase(":memory:");

    const seeded = db
      .query<{ id: string; visual_width: number }, []>(
        `SELECT id, visual_width
         FROM enemy_archetypes
         WHERE id IN ('slime_scout', 'stone_golem')
         ORDER BY id ASC`,
      )
      .all();
    expect(seeded).toHaveLength(2);

    db.query(
      `UPDATE enemy_archetypes
       SET visual_width = ?1,
           updated_at = ?2
       WHERE id = ?3`,
    ).run(99, new Date().toISOString(), "slime_scout");

    bootstrapDatabase(db);

    const slime = db
      .query<{ visual_width: number }, []>(
        `SELECT visual_width
         FROM enemy_archetypes
         WHERE id = 'slime_scout'
         LIMIT 1`,
      )
      .get();

    expect(slime?.visual_width).toBe(99);
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
