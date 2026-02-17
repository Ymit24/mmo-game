import { describe, expect, test } from "bun:test";

import {
  MAX_ARMOR_DAMAGE_REDUCTION_PERCENT,
  applyArmorDamageReduction,
  applyArmorModifiersToMaxHealth,
  itemDefinitionToArmorModifiers,
  normalizeArmorStatModifiers,
} from "./items";

describe("armor item helpers", () => {
  test("itemDefinitionToArmorModifiers returns zero modifiers for non-armor items", () => {
    const modifiers = itemDefinitionToArmorModifiers({
      id: "training_sword",
      name: "Training Sword",
      iconKey: "training_sword",
      type: "weapon",
      classRequirement: "knight",
      minLevelToEquip: 1,
      armorMaxHpFlat: null,
      armorDamageReductionPercent: null,
      weaponDamageFlat: 10,
      weaponRangeFlat: 8,
      weaponSpeedPercent: 5,
      weaponStyle: "sword",
      attackPatternId: "sword_cleave",
      attackDamageMultiplier: 1,
      attackProjectileCount: 1,
      attackSpreadDegrees: 0,
      attackBurstCount: 1,
      attackBurstIntervalMs: 0,
      attackAoeRadius: 0,
      attackAoeDelayMs: 0,
    });

    expect(modifiers).toEqual({
      maxHpFlat: 0,
      damageReductionPercent: 0,
    });
  });

  test("normalizeArmorStatModifiers clamps values", () => {
    const modifiers = normalizeArmorStatModifiers({
      maxHpFlat: -40,
      damageReductionPercent: 999,
    });

    expect(modifiers.maxHpFlat).toBe(0);
    expect(modifiers.damageReductionPercent).toBe(
      MAX_ARMOR_DAMAGE_REDUCTION_PERCENT,
    );
  });

  test("applyArmorModifiersToMaxHealth adds flat hp", () => {
    expect(
      applyArmorModifiersToMaxHealth(180, {
        maxHpFlat: 24,
      }),
    ).toBe(204);
  });

  test("applyArmorDamageReduction applies mitigation and floors to 1", () => {
    expect(applyArmorDamageReduction(100, 10)).toBe(90);
    expect(applyArmorDamageReduction(100, 50)).toBe(50);
    expect(applyArmorDamageReduction(1, 50)).toBe(1);
  });
});
