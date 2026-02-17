import { describe, expect, test } from "bun:test";

import { resolveWeaponAttackConfig } from "./attacks";

describe("resolveWeaponAttackConfig", () => {
  test("uses class defaults when no weapon is provided", () => {
    const knight = resolveWeaponAttackConfig(null, "knight");
    const mage = resolveWeaponAttackConfig(null, "mage");

    expect(knight.attackPatternId).toBe("sword_cleave");
    expect(mage.attackPatternId).toBe("wand_multishot");
  });

  test("clamps invalid weapon attack fields", () => {
    const resolved = resolveWeaponAttackConfig(
      {
        id: "w1",
        name: "W1",
        iconKey: "w1",
        type: "weapon",
        classRequirement: "mage",
        minLevelToEquip: null,
        weaponDamageFlat: 0,
        weaponRangeFlat: 0,
        weaponSpeedPercent: 0,
        weaponStyle: "staff",
        attackPatternId: "staff_ground_aoe",
        attackDamageMultiplier: 100,
        attackProjectileCount: 999,
        attackSpreadDegrees: 999,
        attackBurstCount: 999,
        attackBurstIntervalMs: -5,
        attackAoeRadius: 99999,
        attackAoeDelayMs: -1,
      },
      "mage",
    );

    expect(resolved.damageMultiplier).toBeLessThanOrEqual(10);
    expect(resolved.projectileCount).toBeLessThanOrEqual(12);
    expect(resolved.spreadDegrees).toBe(180);
    expect(resolved.burstIntervalMs).toBe(0);
    expect(resolved.aoeRadius).toBeLessThanOrEqual(1200);
    expect(resolved.aoeDelayMs).toBe(0);
  });

  test("supports new sword spinblade and whirl attack patterns", () => {
    const spinblade = resolveWeaponAttackConfig(
      {
        id: "w-spin",
        name: "Spinblade",
        iconKey: "w-spin",
        type: "weapon",
        classRequirement: "knight",
        minLevelToEquip: null,
        weaponDamageFlat: 0,
        weaponRangeFlat: 0,
        weaponSpeedPercent: 0,
        weaponStyle: "sword",
        attackPatternId: "sword_spinblade",
        attackDamageMultiplier: null,
        attackProjectileCount: null,
        attackSpreadDegrees: null,
        attackBurstCount: null,
        attackBurstIntervalMs: null,
        attackAoeRadius: null,
        attackAoeDelayMs: null,
      },
      "knight",
    );
    const whirl = resolveWeaponAttackConfig(
      {
        id: "w-whirl",
        name: "Whirl",
        iconKey: "w-whirl",
        type: "weapon",
        classRequirement: "knight",
        minLevelToEquip: null,
        weaponDamageFlat: 0,
        weaponRangeFlat: 0,
        weaponSpeedPercent: 0,
        weaponStyle: "sword",
        attackPatternId: "sword_whirl",
        attackDamageMultiplier: null,
        attackProjectileCount: null,
        attackSpreadDegrees: null,
        attackBurstCount: null,
        attackBurstIntervalMs: null,
        attackAoeRadius: null,
        attackAoeDelayMs: null,
      },
      "knight",
    );

    expect(spinblade.attackStyle).toBe("ranged");
    expect(spinblade.damageMultiplier).toBe(0.55);
    expect(whirl.attackStyle).toBe("aoe");
    expect(whirl.aoeRadius).toBe(88);
  });

  test("uses AOE defaults when AOE radius is zero", () => {
    const whirl = resolveWeaponAttackConfig(
      {
        id: "w-whirl-zero-radius",
        name: "Whirl Zero Radius",
        iconKey: "w-whirl-zero-radius",
        type: "weapon",
        classRequirement: "knight",
        minLevelToEquip: null,
        weaponDamageFlat: 0,
        weaponRangeFlat: 0,
        weaponSpeedPercent: 0,
        weaponStyle: "sword",
        attackPatternId: "sword_whirl",
        attackDamageMultiplier: null,
        attackProjectileCount: null,
        attackSpreadDegrees: null,
        attackBurstCount: null,
        attackBurstIntervalMs: null,
        attackAoeRadius: 0,
        attackAoeDelayMs: null,
      },
      "knight",
    );
    const staffAoe = resolveWeaponAttackConfig(
      {
        id: "w-staff-zero-radius",
        name: "Staff Zero Radius",
        iconKey: "w-staff-zero-radius",
        type: "weapon",
        classRequirement: "mage",
        minLevelToEquip: null,
        weaponDamageFlat: 0,
        weaponRangeFlat: 0,
        weaponSpeedPercent: 0,
        weaponStyle: "staff",
        attackPatternId: "staff_ground_aoe",
        attackDamageMultiplier: null,
        attackProjectileCount: null,
        attackSpreadDegrees: null,
        attackBurstCount: null,
        attackBurstIntervalMs: null,
        attackAoeRadius: 0,
        attackAoeDelayMs: null,
      },
      "mage",
    );

    expect(whirl.aoeRadius).toBe(88);
    expect(staffAoe.aoeRadius).toBe(72);
  });
});
