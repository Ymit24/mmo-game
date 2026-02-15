import { describe, expect, test } from "bun:test";

import { createDatabase } from "../db";
import { resolveEnemyLootDropDefinitionIds } from "./enemyLootRepository";

function sequenceRandom(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    return value ?? 0;
  };
}

describe("enemy loot repository", () => {
  test("returns no drops for enemies without loot table rows", () => {
    const db = createDatabase(":memory:");
    const drops = resolveEnemyLootDropDefinitionIds(
      db,
      "missing_enemy",
      "knight",
    );
    expect(drops).toHaveLength(0);
    db.close();
  });

  test("applies class-biased weighted selection for world-1 seed table", () => {
    const db = createDatabase(":memory:");

    const knightDrops = resolveEnemyLootDropDefinitionIds(
      db,
      "e_001_slime",
      "knight",
      {
        random: sequenceRandom([0.01, 0.6]),
      },
    );
    expect(knightDrops).toEqual(["w_kn_001_rusty_sword"]);

    const mageDrops = resolveEnemyLootDropDefinitionIds(
      db,
      "e_001_slime",
      "mage",
      {
        random: sequenceRandom([0.01, 0.6]),
      },
    );
    expect(mageDrops).toEqual(["w_mg_001_apprentice_staff"]);

    db.close();
  });
});
