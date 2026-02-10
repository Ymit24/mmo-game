import type { Database } from "bun:sqlite";
import {
  type CharacterClass,
  EQUIP_SLOTS,
  type EquipSlot,
  INVENTORY_ACTION_ERROR_CODES,
  INVENTORY_BAG_SLOT_COUNT,
  type InventoryActionErrorCode,
  type InventorySlotRef,
  type InventoryStatePayload,
  type ItemDefinition,
  type WeaponStatModifiers,
  itemDefinitionToWeaponModifiers,
  slotRefEquals,
} from "@mmo/shared";

interface ItemDefinitionRow {
  id: string;
  name: string;
  icon_key: string;
  type: string;
  class_requirement: CharacterClass | null;
  min_level_to_equip: number | null;
  weapon_damage_flat: number | null;
  weapon_range_flat: number | null;
  weapon_speed_percent: number | null;
}

interface InventoryRow {
  id: string;
  item_definition_id: string;
  slot_kind: "bag" | "weapon" | "armor";
  slot_index: number | null;
}

interface InventoryRowWithDefinition extends InventoryRow {
  created_at: string;
  def_id: string;
  def_name: string;
  def_icon_key: string;
  def_type: string;
  def_class_requirement: CharacterClass | null;
  def_min_level_to_equip: number | null;
  def_weapon_damage_flat: number | null;
  def_weapon_range_flat: number | null;
  def_weapon_speed_percent: number | null;
}

interface InventoryActionContext {
  characterClass: CharacterClass;
  characterLevel: number;
}

interface InventoryErrorResult {
  ok: false;
  code: InventoryActionErrorCode;
  message: string;
}

interface InventoryMoveSuccessResult {
  ok: true;
  from: InventorySlotRef;
  to: InventorySlotRef;
  state: InventoryStatePayload;
}

interface InventoryDropSuccessResult {
  ok: true;
  from: InventorySlotRef;
  removedItemInstanceId: string;
  state: InventoryStatePayload;
}

export type InventoryMoveResult =
  | InventoryMoveSuccessResult
  | InventoryErrorResult;
export type InventoryDropResult =
  | InventoryDropSuccessResult
  | InventoryErrorResult;

const STARTER_WEAPON_BY_CLASS: Record<CharacterClass, string> = {
  knight: "training_sword",
  mage: "training_wand",
};

function mapItemDefinition(row: ItemDefinitionRow): ItemDefinition {
  return {
    id: row.id,
    name: row.name,
    iconKey: row.icon_key,
    type: row.type as ItemDefinition["type"],
    classRequirement: row.class_requirement,
    minLevelToEquip: row.min_level_to_equip,
    weaponDamageFlat: row.weapon_damage_flat,
    weaponRangeFlat: row.weapon_range_flat,
    weaponSpeedPercent: row.weapon_speed_percent,
  };
}

function mapItemDefinitionFromInventoryRow(
  row: InventoryRowWithDefinition,
): ItemDefinition {
  return {
    id: row.def_id,
    name: row.def_name,
    iconKey: row.def_icon_key,
    type: row.def_type as ItemDefinition["type"],
    classRequirement: row.def_class_requirement,
    minLevelToEquip: row.def_min_level_to_equip,
    weaponDamageFlat: row.def_weapon_damage_flat,
    weaponRangeFlat: row.def_weapon_range_flat,
    weaponSpeedPercent: row.def_weapon_speed_percent,
  };
}

function mapInventoryInstance(row: InventoryRow): {
  id: string;
  itemDefinitionId: string;
} {
  return {
    id: row.id,
    itemDefinitionId: row.item_definition_id,
  };
}

function slotToStorage(slot: InventorySlotRef): {
  slotKind: "bag" | "weapon" | "armor";
  slotIndex: number | null;
} | null {
  if (slot.kind === "bag") {
    if (
      !Number.isSafeInteger(slot.index) ||
      slot.index < 0 ||
      slot.index >= INVENTORY_BAG_SLOT_COUNT
    ) {
      return null;
    }
    return {
      slotKind: "bag",
      slotIndex: slot.index,
    };
  }

  if (slot.kind === "equip") {
    if (!EQUIP_SLOTS.includes(slot.slot)) {
      return null;
    }
    return {
      slotKind: slot.slot,
      slotIndex: null,
    };
  }

  return null;
}

function getItemDefinitionMap(db: Database): Record<string, ItemDefinition> {
  const rows = db
    .query<ItemDefinitionRow, []>(
      `SELECT
         id,
         name,
         icon_key,
         type,
         class_requirement,
         min_level_to_equip,
         weapon_damage_flat,
         weapon_range_flat,
         weapon_speed_percent
       FROM item_definitions
       ORDER BY id ASC`,
    )
    .all();

  const definitions: Record<string, ItemDefinition> = {};
  for (const row of rows) {
    definitions[row.id] = mapItemDefinition(row);
  }
  return definitions;
}

function getCharacterInventoryRows(
  db: Database,
  characterId: string,
): InventoryRow[] {
  return db
    .query<InventoryRow, [string]>(
      `SELECT
         id,
         item_definition_id,
         slot_kind,
         slot_index
       FROM character_inventory
       WHERE character_id = ?1`,
    )
    .all(characterId);
}

function findInventoryItemForSlot(
  db: Database,
  characterId: string,
  slot: InventorySlotRef,
): InventoryRowWithDefinition | null {
  const storage = slotToStorage(slot);
  if (!storage) {
    return null;
  }

  if (storage.slotKind === "bag") {
    return (
      db
        .query<InventoryRowWithDefinition, [string, number]>(
          `SELECT
             inv.id,
             inv.item_definition_id,
             inv.slot_kind,
             inv.slot_index,
             inv.created_at,
             def.id AS def_id,
             def.name AS def_name,
             def.icon_key AS def_icon_key,
             def.type AS def_type,
             def.class_requirement AS def_class_requirement,
             def.min_level_to_equip AS def_min_level_to_equip,
             def.weapon_damage_flat AS def_weapon_damage_flat,
             def.weapon_range_flat AS def_weapon_range_flat,
             def.weapon_speed_percent AS def_weapon_speed_percent
           FROM character_inventory inv
           INNER JOIN item_definitions def
             ON def.id = inv.item_definition_id
           WHERE inv.character_id = ?1
             AND inv.slot_kind = 'bag'
             AND inv.slot_index = ?2
           LIMIT 1`,
        )
        .get(characterId, storage.slotIndex ?? 0) ?? null
    );
  }

  return (
    db
      .query<InventoryRowWithDefinition, [string, string]>(
        `SELECT
           inv.id,
           inv.item_definition_id,
           inv.slot_kind,
           inv.slot_index,
           inv.created_at,
           def.id AS def_id,
           def.name AS def_name,
           def.icon_key AS def_icon_key,
           def.type AS def_type,
           def.class_requirement AS def_class_requirement,
           def.min_level_to_equip AS def_min_level_to_equip,
           def.weapon_damage_flat AS def_weapon_damage_flat,
           def.weapon_range_flat AS def_weapon_range_flat,
           def.weapon_speed_percent AS def_weapon_speed_percent
         FROM character_inventory inv
         INNER JOIN item_definitions def
           ON def.id = inv.item_definition_id
         WHERE inv.character_id = ?1
           AND inv.slot_kind = ?2
         LIMIT 1`,
      )
      .get(characterId, storage.slotKind) ?? null
  );
}

function validateDestination(
  definition: ItemDefinition,
  slot: InventorySlotRef,
  context: InventoryActionContext,
): InventoryErrorResult | null {
  if (slot.kind === "bag") {
    return null;
  }

  const requiredType = slot.slot;
  if (definition.type !== requiredType) {
    return {
      ok: false,
      code: INVENTORY_ACTION_ERROR_CODES.slotTypeMismatch,
      message:
        requiredType === "weapon"
          ? "Only weapon items can be equipped in the weapon slot."
          : "Only armor items can be equipped in the armor slot.",
    };
  }

  if (
    definition.classRequirement &&
    definition.classRequirement !== context.characterClass
  ) {
    return {
      ok: false,
      code: INVENTORY_ACTION_ERROR_CODES.classRequirementFailed,
      message: `Requires ${definition.classRequirement} class.`,
    };
  }

  if (
    definition.minLevelToEquip !== null &&
    context.characterLevel < definition.minLevelToEquip
  ) {
    return {
      ok: false,
      code: INVENTORY_ACTION_ERROR_CODES.levelRequirementFailed,
      message: `Requires level ${definition.minLevelToEquip}.`,
    };
  }

  return null;
}

function updateInventoryRowSlot(
  db: Database,
  rowId: string,
  slot: InventorySlotRef,
  timestamp: string,
): void {
  const storage = slotToStorage(slot);
  if (!storage) {
    return;
  }

  db.query(
    `UPDATE character_inventory
     SET slot_kind = ?2,
         slot_index = ?3,
         updated_at = ?4
     WHERE id = ?1`,
  ).run(rowId, storage.slotKind, storage.slotIndex, timestamp);
}

function swapInventoryRowSlots(
  db: Database,
  characterId: string,
  fromRowId: string,
  fromSlot: InventorySlotRef,
  destination: InventoryRowWithDefinition,
  toSlot: InventorySlotRef,
  timestamp: string,
): void {
  const fromStorage = slotToStorage(fromSlot);
  const toStorage = slotToStorage(toSlot);
  if (!fromStorage || !toStorage) {
    return;
  }

  db.query(
    `DELETE FROM character_inventory
     WHERE id = ?1 AND character_id = ?2`,
  ).run(destination.id, characterId);

  updateInventoryRowSlot(db, fromRowId, toSlot, timestamp);

  db.query(
    `INSERT INTO character_inventory (
       id,
       character_id,
       item_definition_id,
       slot_kind,
       slot_index,
       created_at,
       updated_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  ).run(
    destination.id,
    characterId,
    destination.item_definition_id,
    fromStorage.slotKind,
    fromStorage.slotIndex,
    destination.created_at,
    timestamp,
  );
}

function buildInventoryState(
  definitions: Record<string, ItemDefinition>,
  rows: InventoryRow[],
): InventoryStatePayload {
  const bagSlots = Array.from(
    { length: INVENTORY_BAG_SLOT_COUNT },
    () => null as InventoryStatePayload["bagSlots"][number],
  );
  const equipSlots: Record<
    EquipSlot,
    InventoryStatePayload["bagSlots"][number]
  > = {
    weapon: null,
    armor: null,
  };

  for (const row of rows) {
    const instance = mapInventoryInstance(row);
    if (row.slot_kind === "bag") {
      const slotIndex = row.slot_index;
      if (
        slotIndex === null ||
        slotIndex < 0 ||
        slotIndex >= INVENTORY_BAG_SLOT_COUNT
      ) {
        continue;
      }
      bagSlots[slotIndex] = instance;
      continue;
    }

    if (row.slot_kind === "weapon") {
      equipSlots.weapon = instance;
      continue;
    }
    if (row.slot_kind === "armor") {
      equipSlots.armor = instance;
    }
  }

  return {
    bagSlots,
    equipSlots,
    definitions,
  };
}

export function loadInventoryStateForCharacter(
  db: Database,
  characterId: string,
): InventoryStatePayload {
  const definitions = getItemDefinitionMap(db);
  const rows = getCharacterInventoryRows(db, characterId);
  return buildInventoryState(definitions, rows);
}

export function getEquippedWeaponDefinitionForCharacter(
  db: Database,
  characterId: string,
): ItemDefinition | null {
  const row = db
    .query<ItemDefinitionRow, [string]>(
      `SELECT
         def.id,
         def.name,
         def.icon_key,
         def.type,
         def.class_requirement,
         def.min_level_to_equip,
         def.weapon_damage_flat,
         def.weapon_range_flat,
         def.weapon_speed_percent
       FROM character_inventory inv
       INNER JOIN item_definitions def
         ON def.id = inv.item_definition_id
       WHERE inv.character_id = ?1
         AND inv.slot_kind = 'weapon'
       LIMIT 1`,
    )
    .get(characterId);
  return row ? mapItemDefinition(row) : null;
}

export function getWeaponModifiersFromInventoryState(
  state: InventoryStatePayload,
): WeaponStatModifiers {
  const weapon = state.equipSlots.weapon;
  if (!weapon) {
    return itemDefinitionToWeaponModifiers(null);
  }
  return itemDefinitionToWeaponModifiers(
    state.definitions[weapon.itemDefinitionId] ?? null,
  );
}

export function grantStarterInventoryForCharacter(
  db: Database,
  characterId: string,
  characterClass: CharacterClass,
  timestamp: string,
): void {
  const starterItemId = STARTER_WEAPON_BY_CLASS[characterClass];
  db.query(
    `INSERT INTO character_inventory (
       id,
       character_id,
       item_definition_id,
       slot_kind,
       slot_index,
       created_at,
       updated_at
     ) VALUES (?1, ?2, ?3, 'weapon', NULL, ?4, ?5)`,
  ).run(crypto.randomUUID(), characterId, starterItemId, timestamp, timestamp);
}

export function moveInventoryItem(
  db: Database,
  characterId: string,
  from: InventorySlotRef,
  to: InventorySlotRef,
  context: InventoryActionContext,
): InventoryMoveResult {
  if (!slotToStorage(from) || !slotToStorage(to)) {
    return {
      ok: false,
      code: INVENTORY_ACTION_ERROR_CODES.slotInvalid,
      message: "Inventory slot is invalid.",
    };
  }

  if (slotRefEquals(from, to)) {
    return {
      ok: true,
      from,
      to,
      state: loadInventoryStateForCharacter(db, characterId),
    };
  }

  let committed = false;
  try {
    db.exec("BEGIN IMMEDIATE;");

    const source = findInventoryItemForSlot(db, characterId, from);
    if (!source) {
      return {
        ok: false,
        code: INVENTORY_ACTION_ERROR_CODES.sourceEmpty,
        message: "Source slot is empty.",
      };
    }

    const sourceDefinition = mapItemDefinitionFromInventoryRow(source);
    const sourceDestinationError = validateDestination(
      sourceDefinition,
      to,
      context,
    );
    if (sourceDestinationError) {
      return sourceDestinationError;
    }

    const destination = findInventoryItemForSlot(db, characterId, to);
    if (destination) {
      const destinationDefinition =
        mapItemDefinitionFromInventoryRow(destination);
      const destinationError = validateDestination(
        destinationDefinition,
        from,
        context,
      );
      if (destinationError) {
        return destinationError;
      }
    }

    const timestamp = new Date().toISOString();
    if (destination) {
      swapInventoryRowSlots(
        db,
        characterId,
        source.id,
        from,
        destination,
        to,
        timestamp,
      );
    } else {
      updateInventoryRowSlot(db, source.id, to, timestamp);
    }

    db.exec("COMMIT;");
    committed = true;

    return {
      ok: true,
      from,
      to,
      state: loadInventoryStateForCharacter(db, characterId),
    };
  } finally {
    if (!committed) {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // SQLite may auto-close transaction after errors.
      }
    }
  }
}

export function dropInventoryItem(
  db: Database,
  characterId: string,
  from: InventorySlotRef,
): InventoryDropResult {
  if (!slotToStorage(from)) {
    return {
      ok: false,
      code: INVENTORY_ACTION_ERROR_CODES.slotInvalid,
      message: "Inventory slot is invalid.",
    };
  }

  let committed = false;
  try {
    db.exec("BEGIN IMMEDIATE;");

    const source = findInventoryItemForSlot(db, characterId, from);
    if (!source) {
      return {
        ok: false,
        code: INVENTORY_ACTION_ERROR_CODES.sourceEmpty,
        message: "Source slot is empty.",
      };
    }

    db.query(
      `DELETE FROM character_inventory
       WHERE id = ?1 AND character_id = ?2`,
    ).run(source.id, characterId);

    db.exec("COMMIT;");
    committed = true;

    return {
      ok: true,
      from,
      removedItemInstanceId: source.id,
      state: loadInventoryStateForCharacter(db, characterId),
    };
  } finally {
    if (!committed) {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // SQLite may auto-close transaction after errors.
      }
    }
  }
}
