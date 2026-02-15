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
  test("returns no drops for enemies without table rows or non-boss enemies", () => {
    const db = createDatabase(":memory:");
    const missingDrops = resolveEnemyLootDropDefinitionIds(
      db,
      "missing_enemy",
      "knight",
    );
    expect(missingDrops).toHaveLength(0);

    const nonBossDrops = resolveEnemyLootDropDefinitionIds(
      db,
      "e_001_slime",
      "knight",
      {
        random: sequenceRandom([0]),
      },
    );
    expect(nonBossDrops).toHaveLength(0);
    db.close();
  });

  test("boss enemies drop weapon entries from their table", () => {
    const db = createDatabase(":memory:");

    const knightDrops = resolveEnemyLootDropDefinitionIds(
      db,
      "e_010_forest_ogre",
      "knight",
      {
        random: sequenceRandom([0.01, 0.6]),
      },
    );
    expect(knightDrops).toEqual(["w_kn_006_iron_sword"]);

    const mageDrops = resolveEnemyLootDropDefinitionIds(
      db,
      "e_010_forest_ogre",
      "mage",
      {
        random: sequenceRandom([0.01, 0.6]),
      },
    );
    expect(mageDrops).toEqual(["w_mg_006_oak_wand"]);

    db.close();
  });
});
