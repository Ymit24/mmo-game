import type { Database } from "bun:sqlite";
import {
  type ArmorStatModifiers,
  type AttackPatternId,
  type CharacterClass,
  EQUIP_SLOTS,
  type EquipSlot,
  INVENTORY_ACTION_ERROR_CODES,
  INVENTORY_BAG_SLOT_COUNT,
  type InventoryActionErrorCode,
  type InventoryItemInstance,
  type InventorySlotRef,
  type InventoryStatePayload,
  type ItemDefinition,
  LOOT_BAG_SLOT_COUNT,
  type ResolvedWeaponAttackConfig,
  type StorageSlotRef,
  type WeaponStatModifiers,
  type WeaponStyle,
  getInventorySlotPlacementError,
  itemDefinitionToArmorModifiers,
  itemDefinitionToMaxStackSize,
  itemDefinitionToPotionHeal,
  itemDefinitionToWeaponModifiers,
  resolveWeaponAttackConfig,
  slotRefEquals,
} from "@mmo/shared";

interface ItemDefinitionRow {
  id: string;
  name: string;
  icon_key: string;
  type: string;
  is_stackable: number;
  max_stack_size: number | null;
  class_requirement: CharacterClass | null;
  min_level_to_equip: number | null;
  potion_heal_flat: number | null;
  armor_max_hp_flat: number | null;
  armor_damage_reduction_percent: number | null;
  weapon_damage_flat: number | null;
  weapon_range_flat: number | null;
  weapon_speed_percent: number | null;
  weapon_style: WeaponStyle | null;
  attack_pattern_id: AttackPatternId | null;
  attack_damage_multiplier: number | null;
  attack_projectile_count: number | null;
  attack_spread_degrees: number | null;
  attack_burst_count: number | null;
  attack_burst_interval_ms: number | null;
  attack_aoe_radius: number | null;
  attack_aoe_delay_ms: number | null;
}

interface InventoryRow {
  id: string;
  item_definition_id: string;
  stack_count: number;
  slot_kind: "bag" | "weapon" | "armor";
  slot_index: number | null;
}

interface InventoryRowWithDefinition extends InventoryRow {
  created_at: string;
  def_id: string;
  def_name: string;
  def_icon_key: string;
  def_type: string;
  def_is_stackable: number;
  def_max_stack_size: number | null;
  def_class_requirement: CharacterClass | null;
  def_min_level_to_equip: number | null;
  def_potion_heal_flat: number | null;
  def_armor_max_hp_flat: number | null;
  def_armor_damage_reduction_percent: number | null;
  def_weapon_damage_flat: number | null;
  def_weapon_range_flat: number | null;
  def_weapon_speed_percent: number | null;
  def_weapon_style: WeaponStyle | null;
  def_attack_pattern_id: AttackPatternId | null;
  def_attack_damage_multiplier: number | null;
  def_attack_projectile_count: number | null;
  def_attack_spread_degrees: number | null;
  def_attack_burst_count: number | null;
  def_attack_burst_interval_ms: number | null;
  def_attack_aoe_radius: number | null;
  def_attack_aoe_delay_ms: number | null;
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
  droppedItemDefinitionId: string;
  droppedCount: number;
  state: InventoryStatePayload;
}

interface InventoryConsumeSuccessResult {
  ok: true;
  from: InventorySlotRef;
  consumedItemInstanceId: string;
  consumedItemDefinitionId: string;
  consumedCount: number;
  restoreAmount: number;
  state: InventoryStatePayload;
}

interface InventoryContainerMoveSuccessResult {
  ok: true;
  from: StorageSlotRef;
  to: StorageSlotRef;
  inventoryState: InventoryStatePayload;
  containerSlots: Array<InventoryItemInstance | null>;
}

export type InventoryMoveResult =
  | InventoryMoveSuccessResult
  | InventoryErrorResult;
export type InventoryDropResult =
  | InventoryDropSuccessResult
  | InventoryErrorResult;
export type InventoryConsumeResult =
  | InventoryConsumeSuccessResult
  | InventoryErrorResult;
export type InventoryContainerMoveResult =
  | InventoryContainerMoveSuccessResult
  | InventoryErrorResult;

const STARTER_LOADOUT_BY_CLASS: Record<
  CharacterClass,
  {
    equippedWeaponId: string;
    equippedArmorId: string;
    bagWeaponIds: [string, string, string];
    bagArmorIds: [string, string];
    bagPotionDefinitionId: string;
    bagPotionCount: number;
  }
> = {
  knight: {
    equippedWeaponId: "training_sword",
    equippedArmorId: "training_hauberk",
    bagWeaponIds: ["iron_broadsword", "runed_greatsword", "dragonbone_blade"],
    bagArmorIds: ["steel_bulwark_armor", "aegis_plate"],
    bagPotionDefinitionId: "basic_health_potion",
    bagPotionCount: 3,
  },
  mage: {
    equippedWeaponId: "training_wand",
    equippedArmorId: "training_robe",
    bagWeaponIds: ["adept_focus_wand", "stormweave_rod", "arcane_scepter"],
    bagArmorIds: ["glyphweave_robe", "astral_ward_raiment"],
    bagPotionDefinitionId: "basic_health_potion",
    bagPotionCount: 3,
  },
};

function mapItemDefinition(row: ItemDefinitionRow): ItemDefinition {
  return {
    id: row.id,
    name: row.name,
    iconKey: row.icon_key,
    type: row.type as ItemDefinition["type"],
    isStackable: row.is_stackable === 1,
    maxStackSize: row.max_stack_size,
    classRequirement: row.class_requirement,
    minLevelToEquip: row.min_level_to_equip,
    potionHealFlat: row.potion_heal_flat,
    armorMaxHpFlat: row.armor_max_hp_flat,
    armorDamageReductionPercent: row.armor_damage_reduction_percent,
    weaponDamageFlat: row.weapon_damage_flat,
    weaponRangeFlat: row.weapon_range_flat,
    weaponSpeedPercent: row.weapon_speed_percent,
    weaponStyle: row.weapon_style,
    attackPatternId: row.attack_pattern_id,
    attackDamageMultiplier: row.attack_damage_multiplier,
    attackProjectileCount: row.attack_projectile_count,
    attackSpreadDegrees: row.attack_spread_degrees,
    attackBurstCount: row.attack_burst_count,
    attackBurstIntervalMs: row.attack_burst_interval_ms,
    attackAoeRadius: row.attack_aoe_radius,
    attackAoeDelayMs: row.attack_aoe_delay_ms,
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
    isStackable: row.def_is_stackable === 1,
    maxStackSize: row.def_max_stack_size,
    classRequirement: row.def_class_requirement,
    minLevelToEquip: row.def_min_level_to_equip,
    potionHealFlat: row.def_potion_heal_flat,
    armorMaxHpFlat: row.def_armor_max_hp_flat,
    armorDamageReductionPercent: row.def_armor_damage_reduction_percent,
    weaponDamageFlat: row.def_weapon_damage_flat,
    weaponRangeFlat: row.def_weapon_range_flat,
    weaponSpeedPercent: row.def_weapon_speed_percent,
    weaponStyle: row.def_weapon_style,
    attackPatternId: row.def_attack_pattern_id,
    attackDamageMultiplier: row.def_attack_damage_multiplier,
    attackProjectileCount: row.def_attack_projectile_count,
    attackSpreadDegrees: row.def_attack_spread_degrees,
    attackBurstCount: row.def_attack_burst_count,
    attackBurstIntervalMs: row.def_attack_burst_interval_ms,
    attackAoeRadius: row.def_attack_aoe_radius,
    attackAoeDelayMs: row.def_attack_aoe_delay_ms,
  };
}

function mapInventoryInstance(row: InventoryRow): {
  id: string;
  itemDefinitionId: string;
  quantity: number;
} {
  return {
    id: row.id,
    itemDefinitionId: row.item_definition_id,
    quantity: row.stack_count,
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
         is_stackable,
         max_stack_size,
         class_requirement,
         min_level_to_equip,
         potion_heal_flat,
         armor_max_hp_flat,
         armor_damage_reduction_percent,
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
         attack_aoe_delay_ms
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
         stack_count,
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
             inv.stack_count,
             inv.slot_kind,
             inv.slot_index,
             inv.created_at,
             def.id AS def_id,
             def.name AS def_name,
             def.icon_key AS def_icon_key,
             def.type AS def_type,
             def.is_stackable AS def_is_stackable,
             def.max_stack_size AS def_max_stack_size,
             def.class_requirement AS def_class_requirement,
             def.min_level_to_equip AS def_min_level_to_equip,
             def.potion_heal_flat AS def_potion_heal_flat,
             def.armor_max_hp_flat AS def_armor_max_hp_flat,
             def.armor_damage_reduction_percent AS def_armor_damage_reduction_percent,
             def.weapon_damage_flat AS def_weapon_damage_flat,
             def.weapon_range_flat AS def_weapon_range_flat,
             def.weapon_speed_percent AS def_weapon_speed_percent,
             def.weapon_style AS def_weapon_style,
             def.attack_pattern_id AS def_attack_pattern_id,
             def.attack_damage_multiplier AS def_attack_damage_multiplier,
             def.attack_projectile_count AS def_attack_projectile_count,
             def.attack_spread_degrees AS def_attack_spread_degrees,
             def.attack_burst_count AS def_attack_burst_count,
             def.attack_burst_interval_ms AS def_attack_burst_interval_ms,
             def.attack_aoe_radius AS def_attack_aoe_radius,
             def.attack_aoe_delay_ms AS def_attack_aoe_delay_ms
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
           inv.stack_count,
           inv.slot_kind,
           inv.slot_index,
           inv.created_at,
           def.id AS def_id,
           def.name AS def_name,
           def.icon_key AS def_icon_key,
           def.type AS def_type,
           def.is_stackable AS def_is_stackable,
           def.max_stack_size AS def_max_stack_size,
           def.class_requirement AS def_class_requirement,
           def.min_level_to_equip AS def_min_level_to_equip,
           def.potion_heal_flat AS def_potion_heal_flat,
           def.armor_max_hp_flat AS def_armor_max_hp_flat,
           def.armor_damage_reduction_percent AS def_armor_damage_reduction_percent,
           def.weapon_damage_flat AS def_weapon_damage_flat,
           def.weapon_range_flat AS def_weapon_range_flat,
           def.weapon_speed_percent AS def_weapon_speed_percent,
           def.weapon_style AS def_weapon_style,
           def.attack_pattern_id AS def_attack_pattern_id,
           def.attack_damage_multiplier AS def_attack_damage_multiplier,
           def.attack_projectile_count AS def_attack_projectile_count,
           def.attack_spread_degrees AS def_attack_spread_degrees,
           def.attack_burst_count AS def_attack_burst_count,
           def.attack_burst_interval_ms AS def_attack_burst_interval_ms,
           def.attack_aoe_radius AS def_attack_aoe_radius,
           def.attack_aoe_delay_ms AS def_attack_aoe_delay_ms
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
  const placementError = getInventorySlotPlacementError(definition, slot, {
    characterClass: context.characterClass,
    characterLevel: context.characterLevel,
  });
  if (placementError === "slotTypeMismatch") {
    const requiredType = slot.kind === "equip" ? slot.slot : "weapon";
    return {
      ok: false,
      code: INVENTORY_ACTION_ERROR_CODES.slotTypeMismatch,
      message:
        requiredType === "weapon"
          ? "Only weapon items can be equipped in the weapon slot."
          : "Only armor items can be equipped in the armor slot.",
    };
  }

  if (placementError === "classRequirementFailed") {
    return {
      ok: false,
      code: INVENTORY_ACTION_ERROR_CODES.classRequirementFailed,
      message: `Requires ${definition.classRequirement} class.`,
    };
  }

  if (placementError === "levelRequirementFailed") {
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

function updateInventoryRowStackCount(
  db: Database,
  rowId: string,
  quantity: number,
  timestamp: string,
): void {
  db.query(
    `UPDATE character_inventory
     SET stack_count = ?2,
         updated_at = ?3
     WHERE id = ?1`,
  ).run(rowId, quantity, timestamp);
}

function deleteInventoryRow(
  db: Database,
  rowId: string,
  characterId: string,
): void {
  db.query(
    `DELETE FROM character_inventory
     WHERE id = ?1 AND character_id = ?2`,
  ).run(rowId, characterId);
}

function resolveRequestedCount(
  requested: number | undefined,
  sourceQuantity: number,
): number | null {
  if (requested === undefined) {
    return sourceQuantity;
  }
  if (!Number.isSafeInteger(requested) || requested < 1) {
    return null;
  }
  if (requested > sourceQuantity) {
    return null;
  }
  return requested;
}

function canMergeStacks(
  source: InventoryRowWithDefinition,
  destination: InventoryRowWithDefinition,
): boolean {
  if (source.item_definition_id !== destination.item_definition_id) {
    return false;
  }
  const sourceDefinition = mapItemDefinitionFromInventoryRow(source);
  return sourceDefinition.isStackable;
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
       stack_count,
       created_at,
       updated_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  ).run(
    destination.id,
    characterId,
    destination.item_definition_id,
    fromStorage.slotKind,
    fromStorage.slotIndex,
    destination.stack_count,
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
         def.is_stackable,
         def.max_stack_size,
         def.class_requirement,
         def.min_level_to_equip,
         def.potion_heal_flat,
         def.armor_max_hp_flat,
         def.armor_damage_reduction_percent,
         def.weapon_damage_flat,
         def.weapon_range_flat,
         def.weapon_speed_percent,
         def.weapon_style,
         def.attack_pattern_id,
         def.attack_damage_multiplier,
         def.attack_projectile_count,
         def.attack_spread_degrees,
         def.attack_burst_count,
         def.attack_burst_interval_ms,
         def.attack_aoe_radius,
         def.attack_aoe_delay_ms
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

export function getArmorModifiersFromInventoryState(
  state: InventoryStatePayload,
): ArmorStatModifiers {
  const armor = state.equipSlots.armor;
  if (!armor) {
    return itemDefinitionToArmorModifiers(null);
  }
  return itemDefinitionToArmorModifiers(
    state.definitions[armor.itemDefinitionId] ?? null,
  );
}

export interface WeaponLoadout {
  modifiers: WeaponStatModifiers;
  attack: ResolvedWeaponAttackConfig;
}

export interface EquipmentLoadout {
  weapon: WeaponLoadout;
  armor: ArmorStatModifiers;
}

export function getEquipmentLoadoutFromInventoryState(
  state: InventoryStatePayload,
  characterClass: CharacterClass,
): EquipmentLoadout {
  const weapon = state.equipSlots.weapon;
  const weaponDefinition = weapon
    ? (state.definitions[weapon.itemDefinitionId] ?? null)
    : null;
  return {
    weapon: {
      modifiers: itemDefinitionToWeaponModifiers(weaponDefinition),
      attack: resolveWeaponAttackConfig(weaponDefinition, characterClass),
    },
    armor: getArmorModifiersFromInventoryState(state),
  };
}

export function getWeaponLoadoutFromInventoryState(
  state: InventoryStatePayload,
  characterClass: CharacterClass,
): WeaponLoadout {
  return getEquipmentLoadoutFromInventoryState(state, characterClass).weapon;
}

export function grantStarterInventoryForCharacter(
  db: Database,
  characterId: string,
  characterClass: CharacterClass,
  timestamp: string,
): void {
  const starterLoadout = STARTER_LOADOUT_BY_CLASS[characterClass];
  db.query(
    `INSERT INTO character_inventory (
       id,
       character_id,
       item_definition_id,
       slot_kind,
       slot_index,
       created_at,
       updated_at
     ) VALUES (?1, ?2, ?3, 'armor', NULL, ?4, ?5)`,
  ).run(
    crypto.randomUUID(),
    characterId,
    starterLoadout.equippedArmorId,
    timestamp,
    timestamp,
  );

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
  ).run(
    crypto.randomUUID(),
    characterId,
    starterLoadout.equippedWeaponId,
    timestamp,
    timestamp,
  );

  db.query(
    `INSERT INTO character_inventory (
       id,
       character_id,
       item_definition_id,
       slot_kind,
       slot_index,
       created_at,
       updated_at
     ) VALUES (?1, ?2, ?3, 'bag', ?4, ?5, ?6)`,
  ).run(
    crypto.randomUUID(),
    characterId,
    starterLoadout.bagWeaponIds[0],
    0,
    timestamp,
    timestamp,
  );

  db.query(
    `INSERT INTO character_inventory (
       id,
       character_id,
       item_definition_id,
       slot_kind,
       slot_index,
       created_at,
       updated_at
     ) VALUES (?1, ?2, ?3, 'bag', ?4, ?5, ?6)`,
  ).run(
    crypto.randomUUID(),
    characterId,
    starterLoadout.bagWeaponIds[1],
    1,
    timestamp,
    timestamp,
  );

  db.query(
    `INSERT INTO character_inventory (
       id,
       character_id,
       item_definition_id,
       slot_kind,
       slot_index,
       created_at,
       updated_at
     ) VALUES (?1, ?2, ?3, 'bag', ?4, ?5, ?6)`,
  ).run(
    crypto.randomUUID(),
    characterId,
    starterLoadout.bagWeaponIds[2],
    2,
    timestamp,
    timestamp,
  );

  db.query(
    `INSERT INTO character_inventory (
       id,
       character_id,
       item_definition_id,
       slot_kind,
       slot_index,
       created_at,
       updated_at
     ) VALUES (?1, ?2, ?3, 'bag', ?4, ?5, ?6)`,
  ).run(
    crypto.randomUUID(),
    characterId,
    starterLoadout.bagArmorIds[0],
    3,
    timestamp,
    timestamp,
  );

  db.query(
    `INSERT INTO character_inventory (
       id,
       character_id,
       item_definition_id,
       slot_kind,
       slot_index,
       created_at,
       updated_at
     ) VALUES (?1, ?2, ?3, 'bag', ?4, ?5, ?6)`,
  ).run(
    crypto.randomUUID(),
    characterId,
    starterLoadout.bagArmorIds[1],
    4,
    timestamp,
    timestamp,
  );
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
     ) VALUES (?1, ?2, ?3, 'bag', ?4, ?5, ?6, ?7)`,
  ).run(
    crypto.randomUUID(),
    characterId,
    starterLoadout.bagPotionDefinitionId,
    5,
    starterLoadout.bagPotionCount,
    timestamp,
    timestamp,
  );
}

export function moveInventoryItem(
  db: Database,
  characterId: string,
  from: InventorySlotRef,
  to: InventorySlotRef,
  count: number | undefined,
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
    const requestedCount = resolveRequestedCount(count, source.stack_count);
    if (requestedCount === null) {
      return {
        ok: false,
        code: INVENTORY_ACTION_ERROR_CODES.requestInvalid,
        message: "Requested stack count is invalid.",
      };
    }
    const sourceDestinationError = validateDestination(
      sourceDefinition,
      to,
      context,
    );
    if (sourceDestinationError) {
      return sourceDestinationError;
    }
    if (to.kind === "equip" && requestedCount < source.stack_count) {
      return {
        ok: false,
        code: INVENTORY_ACTION_ERROR_CODES.requestInvalid,
        message: "Cannot split stacks into equipment slots.",
      };
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
      if (canMergeStacks(source, destination)) {
        const maxStackSize = itemDefinitionToMaxStackSize(sourceDefinition);
        const destinationSpace = Math.max(
          0,
          maxStackSize - destination.stack_count,
        );
        const movedCount = Math.min(requestedCount, destinationSpace);

        if (movedCount > 0) {
          updateInventoryRowStackCount(
            db,
            destination.id,
            destination.stack_count + movedCount,
            timestamp,
          );
          const sourceRemaining = source.stack_count - movedCount;
          if (sourceRemaining <= 0) {
            deleteInventoryRow(db, source.id, characterId);
          } else {
            updateInventoryRowStackCount(
              db,
              source.id,
              sourceRemaining,
              timestamp,
            );
          }
        }
      } else if (requestedCount === source.stack_count) {
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
        return {
          ok: false,
          code: INVENTORY_ACTION_ERROR_CODES.requestInvalid,
          message: "Cannot split-stack swap with occupied slot.",
        };
      }
    } else {
      if (requestedCount === source.stack_count) {
        updateInventoryRowSlot(db, source.id, to, timestamp);
      } else {
        updateInventoryRowStackCount(
          db,
          source.id,
          source.stack_count - requestedCount,
          timestamp,
        );
        const storage = slotToStorage(to);
        if (!storage) {
          return {
            ok: false,
            code: INVENTORY_ACTION_ERROR_CODES.slotInvalid,
            message: "Inventory slot is invalid.",
          };
        }
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
          crypto.randomUUID(),
          characterId,
          source.item_definition_id,
          storage.slotKind,
          storage.slotIndex,
          requestedCount,
          timestamp,
          timestamp,
        );
      }
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
  count: number | undefined,
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
    const requestedCount = resolveRequestedCount(count, source.stack_count);
    if (requestedCount === null) {
      return {
        ok: false,
        code: INVENTORY_ACTION_ERROR_CODES.requestInvalid,
        message: "Requested stack count is invalid.",
      };
    }

    const timestamp = new Date().toISOString();
    if (requestedCount === source.stack_count) {
      deleteInventoryRow(db, source.id, characterId);
    } else {
      updateInventoryRowStackCount(
        db,
        source.id,
        source.stack_count - requestedCount,
        timestamp,
      );
    }

    db.exec("COMMIT;");
    committed = true;

    return {
      ok: true,
      from,
      droppedItemDefinitionId: source.item_definition_id,
      droppedCount: requestedCount,
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

export function consumeInventoryItem(
  db: Database,
  characterId: string,
  from: InventorySlotRef,
): InventoryConsumeResult {
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

    const sourceDefinition = mapItemDefinitionFromInventoryRow(source);
    if (sourceDefinition.type !== "potion") {
      return {
        ok: false,
        code: INVENTORY_ACTION_ERROR_CODES.itemNotConsumable,
        message: "This item cannot be consumed.",
      };
    }

    const restoreAmount = itemDefinitionToPotionHeal(sourceDefinition);
    if (restoreAmount <= 0) {
      return {
        ok: false,
        code: INVENTORY_ACTION_ERROR_CODES.itemNotConsumable,
        message: "This item cannot be consumed.",
      };
    }

    const timestamp = new Date().toISOString();
    if (source.stack_count <= 1) {
      deleteInventoryRow(db, source.id, characterId);
    } else {
      updateInventoryRowStackCount(
        db,
        source.id,
        source.stack_count - 1,
        timestamp,
      );
    }

    db.exec("COMMIT;");
    committed = true;

    return {
      ok: true,
      from,
      consumedItemInstanceId: source.id,
      consumedItemDefinitionId: source.item_definition_id,
      consumedCount: 1,
      restoreAmount,
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

function storageSlotRefEquals(
  first: StorageSlotRef,
  second: StorageSlotRef,
): boolean {
  if (first.kind === "container" && second.kind === "container") {
    return (
      first.containerId === second.containerId && first.index === second.index
    );
  }
  if (first.kind === "container" || second.kind === "container") {
    return false;
  }
  return slotRefEquals(first, second);
}

function isValidStorageSlotRef(
  slot: StorageSlotRef,
  containerId: string,
): boolean {
  if (slot.kind === "container") {
    return (
      slot.containerId === containerId &&
      Number.isSafeInteger(slot.index) &&
      slot.index >= 0 &&
      slot.index < LOOT_BAG_SLOT_COUNT
    );
  }

  return slotToStorage(slot) !== null;
}

function getStorageItem(
  slot: StorageSlotRef,
  inventoryState: InventoryStatePayload,
  containerSlots: Array<InventoryItemInstance | null>,
): InventoryItemInstance | null {
  if (slot.kind === "container") {
    return containerSlots[slot.index] ?? null;
  }

  if (slot.kind === "bag") {
    return inventoryState.bagSlots[slot.index] ?? null;
  }

  return inventoryState.equipSlots[slot.slot] ?? null;
}

function setStorageItem(
  slot: StorageSlotRef,
  inventoryState: InventoryStatePayload,
  containerSlots: Array<InventoryItemInstance | null>,
  item: InventoryItemInstance | null,
): void {
  if (slot.kind === "container") {
    containerSlots[slot.index] = item;
    return;
  }

  if (slot.kind === "bag") {
    inventoryState.bagSlots[slot.index] = item;
    return;
  }

  inventoryState.equipSlots[slot.slot] = item;
}

function persistInventoryLayout(
  db: Database,
  characterId: string,
  state: Pick<InventoryStatePayload, "bagSlots" | "equipSlots">,
): void {
  let committed = false;
  const timestamp = new Date().toISOString();

  try {
    db.exec("BEGIN IMMEDIATE;");
    db.query(
      `DELETE FROM character_inventory
       WHERE character_id = ?1`,
    ).run(characterId);

    const insertStatement = db.query(
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
    );

    for (let index = 0; index < state.bagSlots.length; index += 1) {
      const item = state.bagSlots[index];
      if (!item) {
        continue;
      }
      insertStatement.run(
        item.id,
        characterId,
        item.itemDefinitionId,
        "bag",
        index,
        item.quantity,
        timestamp,
        timestamp,
      );
    }

    for (const slot of EQUIP_SLOTS) {
      const item = state.equipSlots[slot];
      if (!item) {
        continue;
      }
      insertStatement.run(
        item.id,
        characterId,
        item.itemDefinitionId,
        slot,
        null,
        item.quantity,
        timestamp,
        timestamp,
      );
    }

    db.exec("COMMIT;");
    committed = true;
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

export function moveBetweenInventoryAndContainer(
  db: Database,
  characterId: string,
  containerId: string,
  containerSlotsInput: ReadonlyArray<InventoryItemInstance | null>,
  from: StorageSlotRef,
  to: StorageSlotRef,
  count: number | undefined,
  context: InventoryActionContext,
): InventoryContainerMoveResult {
  if (
    !isValidStorageSlotRef(from, containerId) ||
    !isValidStorageSlotRef(to, containerId)
  ) {
    return {
      ok: false,
      code: INVENTORY_ACTION_ERROR_CODES.slotInvalid,
      message: "Inventory slot is invalid.",
    };
  }

  const inventoryState = loadInventoryStateForCharacter(db, characterId);
  const containerSlots = Array.from(
    { length: LOOT_BAG_SLOT_COUNT },
    (_, index) => containerSlotsInput[index] ?? null,
  );

  if (storageSlotRefEquals(from, to)) {
    return {
      ok: true,
      from,
      to,
      inventoryState,
      containerSlots,
    };
  }

  const sourceItem = getStorageItem(from, inventoryState, containerSlots);
  if (!sourceItem) {
    return {
      ok: false,
      code: INVENTORY_ACTION_ERROR_CODES.sourceEmpty,
      message: "Source slot is empty.",
    };
  }
  const sourceDefinition =
    inventoryState.definitions[sourceItem.itemDefinitionId];
  if (!sourceDefinition) {
    return {
      ok: false,
      code: INVENTORY_ACTION_ERROR_CODES.requestInvalid,
      message: "Source item definition could not be resolved.",
    };
  }
  const requestedCount = resolveRequestedCount(count, sourceItem.quantity);
  if (requestedCount === null) {
    return {
      ok: false,
      code: INVENTORY_ACTION_ERROR_CODES.requestInvalid,
      message: "Requested stack count is invalid.",
    };
  }
  if (to.kind === "equip" && requestedCount < sourceItem.quantity) {
    return {
      ok: false,
      code: INVENTORY_ACTION_ERROR_CODES.requestInvalid,
      message: "Cannot split stacks into equipment slots.",
    };
  }

  if (to.kind !== "container") {
    const destinationError = validateDestination(sourceDefinition, to, context);
    if (destinationError) {
      return destinationError;
    }
  }

  const destinationItem = getStorageItem(to, inventoryState, containerSlots);
  if (destinationItem && from.kind !== "container") {
    const destinationDefinition =
      inventoryState.definitions[destinationItem.itemDefinitionId];
    if (!destinationDefinition) {
      return {
        ok: false,
        code: INVENTORY_ACTION_ERROR_CODES.requestInvalid,
        message: "Destination item definition could not be resolved.",
      };
    }
    const sourceError = validateDestination(
      destinationDefinition,
      from,
      context,
    );
    if (sourceError) {
      return sourceError;
    }
  }

  if (
    destinationItem &&
    destinationItem.itemDefinitionId === sourceItem.itemDefinitionId &&
    sourceDefinition.isStackable
  ) {
    const maxStack = itemDefinitionToMaxStackSize(sourceDefinition);
    const destinationSpace = Math.max(0, maxStack - destinationItem.quantity);
    const moved = Math.min(requestedCount, destinationSpace);
    if (moved > 0) {
      const mergedDestination: InventoryItemInstance = {
        ...destinationItem,
        quantity: destinationItem.quantity + moved,
      };
      setStorageItem(to, inventoryState, containerSlots, mergedDestination);
      const sourceRemaining = sourceItem.quantity - moved;
      if (sourceRemaining <= 0) {
        setStorageItem(from, inventoryState, containerSlots, null);
      } else {
        setStorageItem(from, inventoryState, containerSlots, {
          ...sourceItem,
          quantity: sourceRemaining,
        });
      }
    }
  } else if (requestedCount === sourceItem.quantity) {
    setStorageItem(
      from,
      inventoryState,
      containerSlots,
      destinationItem ?? null,
    );
    setStorageItem(to, inventoryState, containerSlots, sourceItem);
  } else if (!destinationItem) {
    setStorageItem(from, inventoryState, containerSlots, {
      ...sourceItem,
      quantity: sourceItem.quantity - requestedCount,
    });
    setStorageItem(to, inventoryState, containerSlots, {
      id: crypto.randomUUID(),
      itemDefinitionId: sourceItem.itemDefinitionId,
      quantity: requestedCount,
    });
  } else {
    return {
      ok: false,
      code: INVENTORY_ACTION_ERROR_CODES.requestInvalid,
      message: "Cannot split-stack swap with occupied slot.",
    };
  }

  if (from.kind !== "container" || to.kind !== "container") {
    persistInventoryLayout(db, characterId, inventoryState);
  }

  return {
    ok: true,
    from,
    to,
    inventoryState: loadInventoryStateForCharacter(db, characterId),
    containerSlots,
  };
}
