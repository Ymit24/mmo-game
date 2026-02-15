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
      "stone_golem",
      "knight",
    );
    expect(drops).toHaveLength(0);
    db.close();
  });

  test("applies class-biased weighted selection for slime scout seed table", () => {
    const db = createDatabase(":memory:");

    const knightDrops = resolveEnemyLootDropDefinitionIds(
      db,
      "slime_scout",
      "knight",
      {
        random: sequenceRandom([0.01, 0.6]),
      },
    );
    expect(knightDrops).toEqual(["iron_broadsword"]);

    const mageDrops = resolveEnemyLootDropDefinitionIds(
      db,
      "slime_scout",
      "mage",
      {
        random: sequenceRandom([0.01, 0.6]),
      },
    );
    expect(mageDrops).toEqual(["adept_focus_wand"]);

    db.close();
  });
});
