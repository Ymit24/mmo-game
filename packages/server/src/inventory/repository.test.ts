import { describe, expect, test } from "bun:test";
import { getCharacterClassBaseCombatStats } from "@mmo/shared";

import { createDatabase } from "../db";
import {
  consumeInventoryItem,
  dropInventoryItem,
  getEquipmentLoadoutFromInventoryState,
  getWeaponLoadoutFromInventoryState,
  loadInventoryStateForCharacter,
  moveBetweenInventoryAndContainer,
  moveInventoryItem,
} from "./repository";

interface SeedCharacterOptions {
  userId?: string;
  characterId?: string;
  characterClass?: "knight" | "mage";
  level?: number;
}

function seedCharacter(
  db: ReturnType<typeof createDatabase>,
  options: SeedCharacterOptions = {},
): { userId: string; characterId: string } {
  const userId = options.userId ?? "user-1";
  const characterId = options.characterId ?? "char-1";
  const characterClass = options.characterClass ?? "knight";
  const level = options.level ?? 1;
  const timestamp = new Date().toISOString();
  const baseStats = getCharacterClassBaseCombatStats(characterClass);

  db.query(
    `INSERT INTO users (
      id,
      email,
      password_hash,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5)`,
  ).run(userId, `${userId}@example.com`, "hash", timestamp, timestamp);

  db.query(
    `INSERT INTO characters (
      id,
      user_id,
      nickname,
      nickname_normalized,
      class,
      level,
      xp,
      max_hp,
      base_damage,
      base_attack_speed_ms,
      base_attack_range,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9, ?10, ?11, ?12)`,
  ).run(
    characterId,
    userId,
    `Hero_${characterId}`,
    `hero_${characterId}`,
    characterClass,
    level,
    baseStats.maxHp,
    baseStats.baseDamage,
    baseStats.baseAttackSpeedMs,
    baseStats.baseAttackRange,
    timestamp,
    timestamp,
  );

  return { userId, characterId };
}

function insertInventoryItem(
  db: ReturnType<typeof createDatabase>,
  options: {
    id: string;
    characterId: string;
    definitionId: string;
    slotKind: "bag" | "weapon" | "armor";
    slotIndex: number | null;
    stackCount?: number;
  },
): void {
  const timestamp = new Date().toISOString();
  db.query(
    `INSERT INTO character_inventory (
      id,
      character_id,
      item_definition_id,
      slot_kind,
      slot_index,
      stack_count,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  ).run(
    options.id,
    options.characterId,
    options.definitionId,
    options.slotKind,
    options.slotIndex,
    options.stackCount ?? 1,
    timestamp,
    timestamp,
  );
}

describe("inventory repository", () => {
  test("loadInventoryStateForCharacter returns 9 visible bag slots", () => {
    const db = createDatabase(":memory:");
    const { characterId } = seedCharacter(db);
    insertInventoryItem(db, {
      id: "inv-a",
      characterId,
      definitionId: "training_sword",
      slotKind: "bag",
      slotIndex: 0,
    });

    const state = loadInventoryStateForCharacter(db, characterId);
    expect(state.bagSlots).toHaveLength(9);
    expect(state.bagSlots[0]?.itemDefinitionId).toBe("training_sword");
    expect(state.bagSlots[1]).toBeNull();
    expect(state.equipSlots.weapon).toBeNull();
    expect(state.equipSlots.armor).toBeNull();
    db.close();
  });

  test("getEquipmentLoadoutFromInventoryState resolves armor modifiers", () => {
    const db = createDatabase(":memory:");
    const { characterId } = seedCharacter(db, { characterClass: "knight" });
    insertInventoryItem(db, {
      id: "equipped-armor",
      characterId,
      definitionId: "training_hauberk",
      slotKind: "armor",
      slotIndex: null,
    });

    const state = loadInventoryStateForCharacter(db, characterId);
    const loadout = getEquipmentLoadoutFromInventoryState(state, "knight");
    expect(loadout.armor).toEqual({
      maxHpFlat: 24,
      damageReductionPercent: 8,
    });
    db.close();
  });

  test("getWeaponLoadoutFromInventoryState resolves modifiers and attack config", () => {
    const db = createDatabase(":memory:");
    const { characterId } = seedCharacter(db, { characterClass: "mage" });
    insertInventoryItem(db, {
      id: "equipped-wand",
      characterId,
      definitionId: "training_wand",
      slotKind: "weapon",
      slotIndex: null,
    });

    const state = loadInventoryStateForCharacter(db, characterId);
    const loadout = getWeaponLoadoutFromInventoryState(state, "mage");
    expect(loadout.modifiers).toEqual({
      damageFlat: 8,
      rangeFlat: 24,
      speedPercent: 7,
    });
    expect(loadout.attack.weaponStyle).toBe("wand");
    expect(loadout.attack.attackPatternId).toBe("wand_multishot");
    expect(loadout.attack.projectileCount).toBe(3);
    expect(loadout.attack.spreadDegrees).toBe(22);

    const emptyState = {
      ...state,
      equipSlots: {
        ...state.equipSlots,
        weapon: null,
      },
    };
    const defaultLoadout = getWeaponLoadoutFromInventoryState(
      emptyState,
      "mage",
    );
    expect(defaultLoadout.modifiers).toEqual({
      damageFlat: 0,
      rangeFlat: 0,
      speedPercent: 0,
    });
    expect(defaultLoadout.attack.attackPatternId).toBe("wand_multishot");
    db.close();
  });

  test("moveInventoryItem moves item to empty bag slot", () => {
    const db = createDatabase(":memory:");
    const { characterId } = seedCharacter(db);
    insertInventoryItem(db, {
      id: "inv-a",
      characterId,
      definitionId: "training_sword",
      slotKind: "bag",
      slotIndex: 0,
    });

    const result = moveInventoryItem(
      db,
      characterId,
      { kind: "bag", index: 0 },
      { kind: "bag", index: 5 },
      undefined,
      {
        characterClass: "knight",
        characterLevel: 1,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.bagSlots[0]).toBeNull();
      expect(result.state.bagSlots[5]?.itemDefinitionId).toBe("training_sword");
    }
    db.close();
  });

  test("moveInventoryItem swaps occupied slots atomically", () => {
    const db = createDatabase(":memory:");
    const { characterId } = seedCharacter(db);
    insertInventoryItem(db, {
      id: "inv-a",
      characterId,
      definitionId: "training_sword",
      slotKind: "bag",
      slotIndex: 0,
    });
    insertInventoryItem(db, {
      id: "inv-b",
      characterId,
      definitionId: "training_wand",
      slotKind: "bag",
      slotIndex: 1,
    });

    const result = moveInventoryItem(
      db,
      characterId,
      { kind: "bag", index: 0 },
      { kind: "bag", index: 1 },
      undefined,
      {
        characterClass: "knight",
        characterLevel: 1,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.bagSlots[0]?.id).toBe("inv-b");
      expect(result.state.bagSlots[1]?.id).toBe("inv-a");
    }
    db.close();
  });

  test("moveInventoryItem enforces class restrictions when equipping", () => {
    const db = createDatabase(":memory:");
    const { characterId } = seedCharacter(db, { characterClass: "mage" });
    insertInventoryItem(db, {
      id: "inv-a",
      characterId,
      definitionId: "training_sword",
      slotKind: "bag",
      slotIndex: 0,
    });

    const result = moveInventoryItem(
      db,
      characterId,
      { kind: "bag", index: 0 },
      { kind: "equip", slot: "weapon" },
      undefined,
      {
        characterClass: "mage",
        characterLevel: 1,
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVENTORY_CLASS_REQUIREMENT_FAILED");
    }
    db.close();
  });

  test("moveInventoryItem enforces min level for equip only", () => {
    const db = createDatabase(":memory:");
    const { characterId } = seedCharacter(db, {
      characterClass: "knight",
      level: 1,
    });
    const timestamp = new Date().toISOString();
    db.query(
      `INSERT OR IGNORE INTO item_icons (key, name, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4)`,
    ).run("elite_sword", "Elite Sword", timestamp, timestamp);
    db.query(
      `INSERT INTO item_definitions (
        id,
        name,
        icon_key,
        type,
        class_requirement,
        min_level_to_equip,
        weapon_damage_flat,
        weapon_range_flat,
        weapon_speed_percent,
        created_at,
        updated_at
      ) VALUES ('elite_sword', 'Elite Sword', 'elite_sword', 'weapon', 'knight', 5, 12, 15, 10, ?1, ?2)`,
    ).run(timestamp, timestamp);
    insertInventoryItem(db, {
      id: "inv-a",
      characterId,
      definitionId: "elite_sword",
      slotKind: "bag",
      slotIndex: 0,
    });

    const equipResult = moveInventoryItem(
      db,
      characterId,
      { kind: "bag", index: 0 },
      { kind: "equip", slot: "weapon" },
      undefined,
      {
        characterClass: "knight",
        characterLevel: 1,
      },
    );

    expect(equipResult.ok).toBe(false);
    if (!equipResult.ok) {
      expect(equipResult.code).toBe("INVENTORY_LEVEL_REQUIREMENT_FAILED");
    }

    const bagMoveResult = moveInventoryItem(
      db,
      characterId,
      { kind: "bag", index: 0 },
      { kind: "bag", index: 3 },
      undefined,
      {
        characterClass: "knight",
        characterLevel: 1,
      },
    );
    expect(bagMoveResult.ok).toBe(true);
    db.close();
  });

  test("dropInventoryItem deletes item instance from slot", () => {
    const db = createDatabase(":memory:");
    const { characterId } = seedCharacter(db);
    insertInventoryItem(db, {
      id: "inv-a",
      characterId,
      definitionId: "training_sword",
      slotKind: "bag",
      slotIndex: 0,
    });

    const result = dropInventoryItem(
      db,
      characterId,
      {
        kind: "bag",
        index: 0,
      },
      undefined,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.droppedItemDefinitionId).toBe("training_sword");
      expect(result.droppedCount).toBe(1);
      expect(result.state.bagSlots[0]).toBeNull();
    }
    db.close();
  });

  test("moveInventoryItem split-moves part of a stack into an empty slot", () => {
    const db = createDatabase(":memory:");
    const { characterId } = seedCharacter(db);
    insertInventoryItem(db, {
      id: "inv-potion",
      characterId,
      definitionId: "basic_health_potion",
      slotKind: "bag",
      slotIndex: 0,
      stackCount: 5,
    });

    const result = moveInventoryItem(
      db,
      characterId,
      { kind: "bag", index: 0 },
      { kind: "bag", index: 1 },
      2,
      {
        characterClass: "knight",
        characterLevel: 1,
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.bagSlots[0]?.quantity).toBe(3);
      expect(result.state.bagSlots[1]?.quantity).toBe(2);
      expect(result.state.bagSlots[1]?.itemDefinitionId).toBe(
        "basic_health_potion",
      );
    }
    db.close();
  });

  test("moveInventoryItem merges stack count into an existing destination stack", () => {
    const db = createDatabase(":memory:");
    const { characterId } = seedCharacter(db);
    insertInventoryItem(db, {
      id: "inv-potion-a",
      characterId,
      definitionId: "basic_health_potion",
      slotKind: "bag",
      slotIndex: 0,
      stackCount: 5,
    });
    insertInventoryItem(db, {
      id: "inv-potion-b",
      characterId,
      definitionId: "basic_health_potion",
      slotKind: "bag",
      slotIndex: 1,
      stackCount: 4,
    });

    const result = moveInventoryItem(
      db,
      characterId,
      { kind: "bag", index: 0 },
      { kind: "bag", index: 1 },
      3,
      {
        characterClass: "knight",
        characterLevel: 1,
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.bagSlots[0]?.quantity).toBe(2);
      expect(result.state.bagSlots[1]?.quantity).toBe(7);
    }
    db.close();
  });

  test("dropInventoryItem drops a partial count from a stack", () => {
    const db = createDatabase(":memory:");
    const { characterId } = seedCharacter(db);
    insertInventoryItem(db, {
      id: "inv-potion",
      characterId,
      definitionId: "basic_health_potion",
      slotKind: "bag",
      slotIndex: 0,
      stackCount: 5,
    });

    const result = dropInventoryItem(
      db,
      characterId,
      {
        kind: "bag",
        index: 0,
      },
      2,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.droppedItemDefinitionId).toBe("basic_health_potion");
      expect(result.droppedCount).toBe(2);
      expect(result.state.bagSlots[0]?.quantity).toBe(3);
    }
    db.close();
  });

  test("moveBetweenInventoryAndContainer moves item from inventory bag to container slot", () => {
    const db = createDatabase(":memory:");
    const { characterId } = seedCharacter(db, {
      characterClass: "knight",
      level: 1,
    });
    insertInventoryItem(db, {
      id: "inv-a",
      characterId,
      definitionId: "training_sword",
      slotKind: "bag",
      slotIndex: 0,
    });

    const result = moveBetweenInventoryAndContainer(
      db,
      characterId,
      "lootbag-1",
      Array.from({ length: 9 }, () => null),
      { kind: "bag", index: 0 },
      { kind: "container", containerId: "lootbag-1", index: 0 },
      undefined,
      {
        characterClass: "knight",
        characterLevel: 1,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inventoryState.bagSlots[0]).toBeNull();
      expect(result.containerSlots[0]?.id).toBe("inv-a");
    }
    db.close();
  });

  test("moveBetweenInventoryAndContainer enforces equip class requirements", () => {
    const db = createDatabase(":memory:");
    const { characterId } = seedCharacter(db, {
      characterClass: "knight",
      level: 1,
    });
    insertInventoryItem(db, {
      id: "inv-weapon",
      characterId,
      definitionId: "training_sword",
      slotKind: "weapon",
      slotIndex: null,
    });

    const result = moveBetweenInventoryAndContainer(
      db,
      characterId,
      "lootbag-1",
      [
        {
          id: "container-wand-1",
          itemDefinitionId: "training_wand",
          quantity: 1,
        },
        ...Array.from({ length: 8 }, () => null),
      ],
      { kind: "container", containerId: "lootbag-1", index: 0 },
      { kind: "equip", slot: "weapon" },
      undefined,
      {
        characterClass: "knight",
        characterLevel: 1,
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVENTORY_CLASS_REQUIREMENT_FAILED");
    }
    db.close();
  });

  test("moveBetweenInventoryAndContainer split-moves from container into empty bag slot", () => {
    const db = createDatabase(":memory:");
    const { characterId } = seedCharacter(db, {
      characterClass: "knight",
      level: 1,
    });

    const result = moveBetweenInventoryAndContainer(
      db,
      characterId,
      "lootbag-1",
      [
        {
          id: "container-potion",
          itemDefinitionId: "basic_health_potion",
          quantity: 5,
        },
        ...Array.from({ length: 8 }, () => null),
      ],
      { kind: "container", containerId: "lootbag-1", index: 0 },
      { kind: "bag", index: 0 },
      2,
      {
        characterClass: "knight",
        characterLevel: 1,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inventoryState.bagSlots[0]?.quantity).toBe(2);
      expect(result.containerSlots[0]?.quantity).toBe(3);
    }
    db.close();
  });

  test("consumeInventoryItem removes potion from inventory and returns restore amount", () => {
    const db = createDatabase(":memory:");
    const { characterId } = seedCharacter(db);
    insertInventoryItem(db, {
      id: "inv-potion",
      characterId,
      definitionId: "basic_health_potion",
      slotKind: "bag",
      slotIndex: 0,
    });

    const result = consumeInventoryItem(db, characterId, {
      kind: "bag",
      index: 0,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.restoreAmount).toBe(50);
      expect(result.consumedItemInstanceId).toBe("inv-potion");
      expect(result.consumedItemDefinitionId).toBe("basic_health_potion");
      expect(result.state.bagSlots[0]).toBeNull();
    }
    db.close();
  });

  test("consumeInventoryItem rejects non-potion items", () => {
    const db = createDatabase(":memory:");
    const { characterId } = seedCharacter(db);
    insertInventoryItem(db, {
      id: "inv-weapon",
      characterId,
      definitionId: "training_sword",
      slotKind: "bag",
      slotIndex: 0,
    });

    const result = consumeInventoryItem(db, characterId, {
      kind: "bag",
      index: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVENTORY_ITEM_NOT_CONSUMABLE");
    }
    db.close();
  });

  test("consumeInventoryItem rejects empty/invalid source", () => {
    const db = createDatabase(":memory:");
    const { characterId } = seedCharacter(db);

    const result = consumeInventoryItem(db, characterId, {
      kind: "bag",
      index: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVENTORY_SOURCE_EMPTY");
    }
    db.close();
  });
});
