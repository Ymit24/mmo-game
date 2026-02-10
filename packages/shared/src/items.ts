import type { CharacterClass } from "./characters";

export const INVENTORY_BAG_SLOT_COUNT = 9;

export const ITEM_TYPES = ["weapon", "armor", "potion", "misc"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

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

export interface ItemDefinition {
  id: string;
  name: string;
  iconKey: string;
  type: ItemType;
  classRequirement: CharacterClass | null;
  minLevelToEquip: number | null;
  weaponDamageFlat: number | null;
  weaponRangeFlat: number | null;
  weaponSpeedPercent: number | null;
}

export interface InventoryItemInstance {
  id: string;
  itemDefinitionId: string;
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

export const INVENTORY_ACTION_ERROR_CODES = {
  sourceEmpty: "INVENTORY_SOURCE_EMPTY",
  slotInvalid: "INVENTORY_SLOT_INVALID",
  slotTypeMismatch: "INVENTORY_SLOT_TYPE_MISMATCH",
  classRequirementFailed: "INVENTORY_CLASS_REQUIREMENT_FAILED",
  levelRequirementFailed: "INVENTORY_LEVEL_REQUIREMENT_FAILED",
  notOwner: "INVENTORY_NOT_OWNER",
  requestInvalid: "INVENTORY_REQUEST_INVALID",
} as const;

export type InventoryActionErrorCode =
  (typeof INVENTORY_ACTION_ERROR_CODES)[keyof typeof INVENTORY_ACTION_ERROR_CODES];

export function isItemType(value: string): value is ItemType {
  return (ITEM_TYPES as readonly string[]).includes(value);
}

export function isEquipSlot(value: string): value is EquipSlot {
  return (EQUIP_SLOTS as readonly string[]).includes(value);
}

export function isInventoryActionErrorCode(
  value: string,
): value is InventoryActionErrorCode {
  return (
    Object.values(INVENTORY_ACTION_ERROR_CODES) as readonly string[]
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
