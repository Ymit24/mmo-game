import type { CharacterClass } from "./characters";

export const INVENTORY_BAG_SLOT_COUNT = 9;
export const LOOT_BAG_SLOT_COUNT = 9;
export const LOOT_BAG_INTERACT_RADIUS = 72;

export const ITEM_TYPES = ["weapon", "armor", "potion", "misc"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const WEAPON_STYLES = ["sword", "wand", "staff"] as const;
export type WeaponStyle = (typeof WEAPON_STYLES)[number];

export const ATTACK_PATTERN_IDS = [
  "sword_cleave",
  "sword_spinblade",
  "sword_whirl",
  "wand_multishot",
  "wand_burst",
  "staff_ground_aoe",
] as const;
export type AttackPatternId = (typeof ATTACK_PATTERN_IDS)[number];

export const EQUIP_SLOTS = ["weapon", "armor"] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export type InventorySlotRef =
  | {
      kind: "bag";
      index: number;
    }
  | {
      kind: "equip";
      slot: EquipSlot;
    };

export interface ContainerSlotRef {
  kind: "container";
  containerId: string;
  index: number;
}

export type StorageSlotRef = InventorySlotRef | ContainerSlotRef;

export interface ItemDefinition {
  id: string;
  name: string;
  iconKey: string;
  type: ItemType;
  isStackable: boolean;
  maxStackSize: number | null;
  classRequirement: CharacterClass | null;
  minLevelToEquip: number | null;
  potionHealFlat: number | null;
  armorMaxHpFlat: number | null;
  armorDamageReductionPercent: number | null;
  weaponDamageFlat: number | null;
  weaponRangeFlat: number | null;
  weaponSpeedPercent: number | null;
  weaponStyle: WeaponStyle | null;
  attackPatternId: AttackPatternId | null;
  attackDamageMultiplier: number | null;
  attackProjectileCount: number | null;
  attackSpreadDegrees: number | null;
  attackBurstCount: number | null;
  attackBurstIntervalMs: number | null;
  attackAoeRadius: number | null;
  attackAoeDelayMs: number | null;
}

export interface InventoryItemInstance {
  id: string;
  itemDefinitionId: string;
  quantity: number;
}

export interface InventoryStatePayload {
  bagSlots: Array<InventoryItemInstance | null>;
  equipSlots: Record<EquipSlot, InventoryItemInstance | null>;
  definitions: Record<string, ItemDefinition>;
}

export interface WeaponStatModifiers {
  damageFlat: number;
  rangeFlat: number;
  speedPercent: number;
}

export const MAX_ARMOR_DAMAGE_REDUCTION_PERCENT = 50;

export interface ArmorStatModifiers {
  maxHpFlat: number;
  damageReductionPercent: number;
}

export const INVENTORY_ACTION_ERROR_CODES = {
  sourceEmpty: "INVENTORY_SOURCE_EMPTY",
  slotInvalid: "INVENTORY_SLOT_INVALID",
  slotTypeMismatch: "INVENTORY_SLOT_TYPE_MISMATCH",
  classRequirementFailed: "INVENTORY_CLASS_REQUIREMENT_FAILED",
  levelRequirementFailed: "INVENTORY_LEVEL_REQUIREMENT_FAILED",
  itemNotConsumable: "INVENTORY_ITEM_NOT_CONSUMABLE",
  healthFull: "INVENTORY_HEALTH_FULL",
  notOwner: "INVENTORY_NOT_OWNER",
  requestInvalid: "INVENTORY_REQUEST_INVALID",
} as const;

export type InventoryActionErrorCode =
  (typeof INVENTORY_ACTION_ERROR_CODES)[keyof typeof INVENTORY_ACTION_ERROR_CODES];

export const CONTAINER_ACTION_ERROR_CODES = {
  containerMissing: "CONTAINER_MISSING",
  containerOutOfRange: "CONTAINER_OUT_OF_RANGE",
  containerLocked: "CONTAINER_LOCKED",
  containerOwnerLocked: "CONTAINER_OWNER_LOCKED",
  containerNotOpen: "CONTAINER_NOT_OPEN",
  sourceEmpty: "CONTAINER_SOURCE_EMPTY",
  slotInvalid: "CONTAINER_SLOT_INVALID",
  slotTypeMismatch: "CONTAINER_SLOT_TYPE_MISMATCH",
  classRequirementFailed: "CONTAINER_CLASS_REQUIREMENT_FAILED",
  levelRequirementFailed: "CONTAINER_LEVEL_REQUIREMENT_FAILED",
  requestInvalid: "CONTAINER_REQUEST_INVALID",
} as const;

export type ContainerActionErrorCode =
  (typeof CONTAINER_ACTION_ERROR_CODES)[keyof typeof CONTAINER_ACTION_ERROR_CODES];

export function isItemType(value: string): value is ItemType {
  return (ITEM_TYPES as readonly string[]).includes(value);
}

export function isEquipSlot(value: string): value is EquipSlot {
  return (EQUIP_SLOTS as readonly string[]).includes(value);
}

export function isWeaponStyle(value: string): value is WeaponStyle {
  return (WEAPON_STYLES as readonly string[]).includes(value);
}

export function isAttackPatternId(value: string): value is AttackPatternId {
  return (ATTACK_PATTERN_IDS as readonly string[]).includes(value);
}

export function isInventoryActionErrorCode(
  value: string,
): value is InventoryActionErrorCode {
  return (
    Object.values(INVENTORY_ACTION_ERROR_CODES) as readonly string[]
  ).includes(value);
}

export function isContainerActionErrorCode(
  value: string,
): value is ContainerActionErrorCode {
  return (
    Object.values(CONTAINER_ACTION_ERROR_CODES) as readonly string[]
  ).includes(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

export function isInventorySlotRef(value: unknown): value is InventorySlotRef {
  if (!isObject(value) || typeof value.kind !== "string") {
    return false;
  }

  if (value.kind === "bag") {
    return (
      typeof value.index === "number" &&
      Number.isSafeInteger(value.index) &&
      value.index >= 0 &&
      value.index < INVENTORY_BAG_SLOT_COUNT
    );
  }

  if (value.kind === "equip") {
    return typeof value.slot === "string" && isEquipSlot(value.slot);
  }

  return false;
}

export function isContainerSlotRef(value: unknown): value is ContainerSlotRef {
  if (!isObject(value) || value.kind !== "container") {
    return false;
  }

  return (
    typeof value.containerId === "string" &&
    value.containerId.length > 0 &&
    typeof value.index === "number" &&
    Number.isSafeInteger(value.index) &&
    value.index >= 0 &&
    value.index < LOOT_BAG_SLOT_COUNT
  );
}

export function isStorageSlotRef(value: unknown): value is StorageSlotRef {
  return isInventorySlotRef(value) || isContainerSlotRef(value);
}

export function slotRefEquals(
  first: InventorySlotRef,
  second: InventorySlotRef,
): boolean {
  if (first.kind !== second.kind) {
    return false;
  }
  if (first.kind === "bag" && second.kind === "bag") {
    return first.index === second.index;
  }
  if (first.kind === "equip" && second.kind === "equip") {
    return first.slot === second.slot;
  }
  return false;
}

export function isInventorySlotCompatibleForItem(
  definition: ItemDefinition,
  slot: InventorySlotRef,
): boolean {
  if (slot.kind === "bag") {
    return true;
  }

  return definition.type === slot.slot;
}

export function getInventorySlotPlacementError(
  definition: ItemDefinition,
  slot: InventorySlotRef,
  context: {
    characterClass: CharacterClass;
    characterLevel: number;
  },
):
  | "slotTypeMismatch"
  | "classRequirementFailed"
  | "levelRequirementFailed"
  | null {
  if (!isInventorySlotCompatibleForItem(definition, slot)) {
    return "slotTypeMismatch";
  }

  if (
    slot.kind === "equip" &&
    definition.classRequirement &&
    definition.classRequirement !== context.characterClass
  ) {
    return "classRequirementFailed";
  }

  if (
    slot.kind === "equip" &&
    definition.minLevelToEquip !== null &&
    context.characterLevel < definition.minLevelToEquip
  ) {
    return "levelRequirementFailed";
  }

  return null;
}

export function itemDefinitionToWeaponModifiers(
  definition: ItemDefinition | null | undefined,
): WeaponStatModifiers {
  if (!definition || definition.type !== "weapon") {
    return {
      damageFlat: 0,
      rangeFlat: 0,
      speedPercent: 0,
    };
  }

  return normalizeWeaponStatModifiers({
    damageFlat: definition.weaponDamageFlat ?? 0,
    rangeFlat: definition.weaponRangeFlat ?? 0,
    speedPercent: definition.weaponSpeedPercent ?? 0,
  });
}

export function itemDefinitionToMaxStackSize(
  definition: ItemDefinition | null | undefined,
): number {
  if (!definition?.isStackable) {
    return 1;
  }
  return Math.max(2, Math.floor(definition.maxStackSize ?? 9));
}

export function normalizeWeaponStatModifiers(
  partial?: Partial<WeaponStatModifiers>,
): WeaponStatModifiers {
  return {
    damageFlat: Number.isFinite(partial?.damageFlat ?? Number.NaN)
      ? (partial?.damageFlat ?? 0)
      : 0,
    rangeFlat: Number.isFinite(partial?.rangeFlat ?? Number.NaN)
      ? (partial?.rangeFlat ?? 0)
      : 0,
    speedPercent: Math.max(
      -95,
      Math.min(
        95,
        Number.isFinite(partial?.speedPercent ?? Number.NaN)
          ? (partial?.speedPercent ?? 0)
          : 0,
      ),
    ),
  };
}

export function itemDefinitionToArmorModifiers(
  definition: ItemDefinition | null | undefined,
): ArmorStatModifiers {
  if (!definition || definition.type !== "armor") {
    return {
      maxHpFlat: 0,
      damageReductionPercent: 0,
    };
  }

  return normalizeArmorStatModifiers({
    maxHpFlat: definition.armorMaxHpFlat ?? 0,
    damageReductionPercent: definition.armorDamageReductionPercent ?? 0,
  });
}

export function itemDefinitionToPotionHeal(
  definition: ItemDefinition | null | undefined,
): number {
  if (!definition || definition.type !== "potion") {
    return 0;
  }
  const heal = definition.potionHealFlat ?? 0;
  if (!Number.isFinite(heal)) {
    return 0;
  }
  return Math.max(0, Math.floor(heal));
}

export function normalizeArmorStatModifiers(
  partial?: Partial<ArmorStatModifiers>,
): ArmorStatModifiers {
  return {
    maxHpFlat: Math.max(
      0,
      Number.isFinite(partial?.maxHpFlat ?? Number.NaN)
        ? (partial?.maxHpFlat ?? 0)
        : 0,
    ),
    damageReductionPercent: Math.max(
      0,
      Math.min(
        MAX_ARMOR_DAMAGE_REDUCTION_PERCENT,
        Number.isFinite(partial?.damageReductionPercent ?? Number.NaN)
          ? (partial?.damageReductionPercent ?? 0)
          : 0,
      ),
    ),
  };
}

export function applyArmorModifiersToMaxHealth(
  baseMaxHealth: number,
  modifiers?: Partial<ArmorStatModifiers>,
): number {
  const safeModifiers = normalizeArmorStatModifiers(modifiers);
  return Math.max(
    1,
    Math.round((baseMaxHealth + safeModifiers.maxHpFlat) * 100) / 100,
  );
}

export function applyArmorDamageReduction(
  incomingDamage: number,
  damageReductionPercent: number,
): number {
  if (!Number.isFinite(incomingDamage) || incomingDamage <= 0) {
    return 0;
  }
  const safeReduction = normalizeArmorStatModifiers({
    damageReductionPercent,
  }).damageReductionPercent;
  return Math.max(1, Math.round(incomingDamage * (1 - safeReduction / 100)));
}

export function applyWeaponModifiersToCombatStats(base: {
  baseDamage: number;
  baseAttackRange: number;
  baseAttackSpeedMs: number;
}): {
  baseDamage: number;
  baseAttackRange: number;
  baseAttackSpeedMs: number;
};
export function applyWeaponModifiersToCombatStats(
  base: {
    baseDamage: number;
    baseAttackRange: number;
    baseAttackSpeedMs: number;
  },
  modifiers: WeaponStatModifiers,
): {
  baseDamage: number;
  baseAttackRange: number;
  baseAttackSpeedMs: number;
};
export function applyWeaponModifiersToCombatStats(
  base: {
    baseDamage: number;
    baseAttackRange: number;
    baseAttackSpeedMs: number;
  },
  modifiers?: WeaponStatModifiers,
): {
  baseDamage: number;
  baseAttackRange: number;
  baseAttackSpeedMs: number;
} {
  const safeModifiers = normalizeWeaponStatModifiers(modifiers);
  const nextDamage = Math.max(0, base.baseDamage + safeModifiers.damageFlat);
  const nextRange = Math.max(1, base.baseAttackRange + safeModifiers.rangeFlat);
  const speedFactor = 1 - safeModifiers.speedPercent / 100;
  const nextSpeedMs = Math.max(
    200,
    Math.round(base.baseAttackSpeedMs * Math.max(0.05, speedFactor)),
  );

  return {
    baseDamage: Math.round(nextDamage * 100) / 100,
    baseAttackRange: Math.round(nextRange * 100) / 100,
    baseAttackSpeedMs: nextSpeedMs,
  };
}
