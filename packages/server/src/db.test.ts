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
});
