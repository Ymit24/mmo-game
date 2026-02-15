import type { Database } from "bun:sqlite";
import type { CharacterClass } from "@mmo/shared";

interface EnemyLootTableRow {
  drop_chance: number;
}

interface EnemyLootTableEntryRow {
  item_definition_id: string;
  weight: number;
  class_affinity: CharacterClass | null;
}

interface WeightedLootEntry {
  itemDefinitionId: string;
  weight: number;
}

const MATCHING_CLASS_BIAS = 0.7;
const OFF_CLASS_BIAS = 0.3;

export interface ResolveEnemyLootOptions {
  random?: () => number;
}

export function resolveEnemyLootDropDefinitionIds(
  db: Database,
  enemyArchetypeId: string,
  killerClass: CharacterClass | null,
  options: ResolveEnemyLootOptions = {},
): string[] {
  const random = options.random ?? Math.random;
  const table = db
    .query<EnemyLootTableRow, [string]>(
      `SELECT drop_chance
       FROM enemy_loot_tables
       WHERE enemy_archetype_id = ?1
       LIMIT 1`,
    )
    .get(enemyArchetypeId);

  if (!table || table.drop_chance <= 0) {
    return [];
  }

  const chanceRoll = random();
  if (!Number.isFinite(chanceRoll) || chanceRoll < 0 || chanceRoll > 1) {
    return [];
  }
  if (chanceRoll > table.drop_chance) {
    return [];
  }

  const entries = db
    .query<EnemyLootTableEntryRow, [string]>(
      `SELECT
         item_definition_id,
         weight,
         class_affinity
       FROM enemy_loot_table_entries
       WHERE enemy_archetype_id = ?1
       ORDER BY item_definition_id ASC`,
    )
    .all(enemyArchetypeId);

  const weightedEntries: WeightedLootEntry[] = [];
  for (const entry of entries) {
    if (!Number.isFinite(entry.weight) || entry.weight <= 0) {
      continue;
    }

    let adjustedWeight = entry.weight;
    if (killerClass && entry.class_affinity) {
      adjustedWeight *=
        entry.class_affinity === killerClass
          ? MATCHING_CLASS_BIAS
          : OFF_CLASS_BIAS;
    }

    if (!Number.isFinite(adjustedWeight) || adjustedWeight <= 0) {
      continue;
    }
    weightedEntries.push({
      itemDefinitionId: entry.item_definition_id,
      weight: adjustedWeight,
    });
  }

  if (weightedEntries.length === 0) {
    return [];
  }

  const totalWeight = weightedEntries.reduce(
    (sum, entry) => sum + entry.weight,
    0,
  );
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    return [];
  }

  const pickRoll = random();
  if (!Number.isFinite(pickRoll) || pickRoll < 0 || pickRoll > 1) {
    return [];
  }
  let threshold = pickRoll * totalWeight;
  for (const entry of weightedEntries) {
    threshold -= entry.weight;
    if (threshold <= 0) {
      return [entry.itemDefinitionId];
    }
  }

  const fallbackEntry = weightedEntries[weightedEntries.length - 1];
  if (!fallbackEntry) {
    return [];
  }

  return [fallbackEntry.itemDefinitionId];
}
