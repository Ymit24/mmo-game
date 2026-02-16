import type { CharacterClass } from "../characters";
import {
  type AttackPatternId,
  type ItemDefinition,
  type WeaponStyle,
  isAttackPatternId,
  isWeaponStyle,
} from "../items";

export type WeaponAttackStyle = "melee" | "ranged" | "aoe";

export interface AttackPatternMetadata {
  id: AttackPatternId;
  label: string;
  shortLabel: string;
  description: string;
  attackStyle: WeaponAttackStyle;
  defaultWeaponStyle: WeaponStyle;
}

export interface ResolvedWeaponAttackConfig {
  weaponStyle: WeaponStyle;
  attackPatternId: AttackPatternId;
  attackStyle: WeaponAttackStyle;
  damageMultiplier: number;
  projectileCount: number;
  spreadDegrees: number;
  burstCount: number;
  burstIntervalMs: number;
  aoeRadius: number;
  aoeDelayMs: number;
  maxTargetHitsPerAttack: number;
}

const DEFAULT_PATTERN_BY_CLASS: Record<CharacterClass, AttackPatternId> = {
  knight: "sword_cleave",
  mage: "wand_multishot",
};

const DEFAULT_CONFIG_BY_PATTERN: Record<
  AttackPatternId,
  Omit<ResolvedWeaponAttackConfig, "attackPatternId" | "weaponStyle">
> = {
  sword_cleave: {
    attackStyle: "melee",
    damageMultiplier: 1,
    projectileCount: 1,
    spreadDegrees: 0,
    burstCount: 1,
    burstIntervalMs: 0,
    aoeRadius: 0,
    aoeDelayMs: 0,
    maxTargetHitsPerAttack: 3,
  },
  sword_lunge: {
    attackStyle: "melee",
    damageMultiplier: 1.15,
    projectileCount: 1,
    spreadDegrees: 0,
    burstCount: 1,
    burstIntervalMs: 0,
    aoeRadius: 0,
    aoeDelayMs: 0,
    maxTargetHitsPerAttack: 2,
  },
  wand_multishot: {
    attackStyle: "ranged",
    damageMultiplier: 1,
    projectileCount: 3,
    spreadDegrees: 22,
    burstCount: 1,
    burstIntervalMs: 0,
    aoeRadius: 0,
    aoeDelayMs: 0,
    maxTargetHitsPerAttack: 3,
  },
  wand_burst: {
    attackStyle: "ranged",
    damageMultiplier: 0.36,
    projectileCount: 1,
    spreadDegrees: 0,
    burstCount: 3,
    burstIntervalMs: 70,
    aoeRadius: 0,
    aoeDelayMs: 0,
    maxTargetHitsPerAttack: 3,
  },
  staff_ground_aoe: {
    attackStyle: "aoe",
    damageMultiplier: 0.95,
    projectileCount: 1,
    spreadDegrees: 0,
    burstCount: 1,
    burstIntervalMs: 0,
    aoeRadius: 72,
    aoeDelayMs: 180,
    maxTargetHitsPerAttack: 6,
  },
};

export const ATTACK_PATTERN_METADATA: Record<
  AttackPatternId,
  AttackPatternMetadata
> = {
  sword_cleave: {
    id: "sword_cleave",
    label: "Sword Cleave",
    shortLabel: "Cleave",
    description: "Wide melee sweep that can hit multiple nearby targets.",
    attackStyle: "melee",
    defaultWeaponStyle: "sword",
  },
  sword_lunge: {
    id: "sword_lunge",
    label: "Sword Lunge",
    shortLabel: "Lunge",
    description: "Forward piercing slash with bonus damage in a narrow lane.",
    attackStyle: "melee",
    defaultWeaponStyle: "sword",
  },
  wand_multishot: {
    id: "wand_multishot",
    label: "Wand Multishot",
    shortLabel: "Multishot",
    description: "Three-projectile fan attack with spread.",
    attackStyle: "ranged",
    defaultWeaponStyle: "wand",
  },
  wand_burst: {
    id: "wand_burst",
    label: "Wand Burst",
    shortLabel: "Burst",
    description: "Rapid sequential shots fired in a short burst.",
    attackStyle: "ranged",
    defaultWeaponStyle: "wand",
  },
  staff_ground_aoe: {
    id: "staff_ground_aoe",
    label: "Staff Ground AOE",
    shortLabel: "Ground AOE",
    description: "Delayed arcane blast centered on a targeted ground point.",
    attackStyle: "aoe",
    defaultWeaponStyle: "staff",
  },
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteOrNull(value: number | null | undefined): number | null {
  return Number.isFinite(value ?? Number.NaN) ? (value ?? null) : null;
}

export function getDefaultAttackPatternForClass(
  characterClass: CharacterClass,
): AttackPatternId {
  return DEFAULT_PATTERN_BY_CLASS[characterClass] ?? "sword_cleave";
}

export function resolveWeaponAttackConfig(
  itemDefinition: ItemDefinition | null | undefined,
  characterClass: CharacterClass,
): ResolvedWeaponAttackConfig {
  const fallbackPattern = getDefaultAttackPatternForClass(characterClass);
  const fallbackMetadata = ATTACK_PATTERN_METADATA[fallbackPattern];

  const attackPatternId: AttackPatternId =
    itemDefinition?.type === "weapon" &&
    typeof itemDefinition.attackPatternId === "string" &&
    isAttackPatternId(itemDefinition.attackPatternId)
      ? itemDefinition.attackPatternId
      : fallbackPattern;

  const metadata = ATTACK_PATTERN_METADATA[attackPatternId] ?? fallbackMetadata;
  const defaults = DEFAULT_CONFIG_BY_PATTERN[attackPatternId];

  const rawWeaponStyle = itemDefinition?.weaponStyle;
  const weaponStyle: WeaponStyle =
    itemDefinition?.type === "weapon" &&
    typeof rawWeaponStyle === "string" &&
    isWeaponStyle(rawWeaponStyle)
      ? rawWeaponStyle
      : metadata.defaultWeaponStyle;

  const damageMultiplier =
    finiteOrNull(itemDefinition?.attackDamageMultiplier) ??
    defaults.damageMultiplier;
  const projectileCount =
    finiteOrNull(itemDefinition?.attackProjectileCount) ??
    defaults.projectileCount;
  const spreadDegrees =
    finiteOrNull(itemDefinition?.attackSpreadDegrees) ?? defaults.spreadDegrees;
  const burstCount =
    finiteOrNull(itemDefinition?.attackBurstCount) ?? defaults.burstCount;
  const burstIntervalMs =
    finiteOrNull(itemDefinition?.attackBurstIntervalMs) ??
    defaults.burstIntervalMs;
  const aoeRadius =
    finiteOrNull(itemDefinition?.attackAoeRadius) ?? defaults.aoeRadius;
  const aoeDelayMs =
    finiteOrNull(itemDefinition?.attackAoeDelayMs) ?? defaults.aoeDelayMs;

  return {
    weaponStyle,
    attackPatternId,
    attackStyle: metadata.attackStyle,
    damageMultiplier: clampNumber(damageMultiplier, 0.05, 10),
    projectileCount: Math.max(
      1,
      Math.floor(clampNumber(projectileCount, 1, 12)),
    ),
    spreadDegrees: clampNumber(spreadDegrees, 0, 180),
    burstCount: Math.max(1, Math.floor(clampNumber(burstCount, 1, 12))),
    burstIntervalMs: Math.floor(clampNumber(burstIntervalMs, 0, 5_000)),
    aoeRadius: clampNumber(aoeRadius, 0, 1_200),
    aoeDelayMs: Math.floor(clampNumber(aoeDelayMs, 0, 10_000)),
    maxTargetHitsPerAttack: Math.max(
      1,
      Math.floor(clampNumber(defaults.maxTargetHitsPerAttack, 1, 64)),
    ),
  };
}

export function estimatePatternDps(
  baseDamage: number,
  attackSpeedMs: number,
  config: ResolvedWeaponAttackConfig,
  targetCount = 1,
): number {
  const safeBaseDamage = Math.max(
    0,
    Number.isFinite(baseDamage) ? baseDamage : 0,
  );
  const safeAttackSpeedMs = Math.max(
    1,
    Number.isFinite(attackSpeedMs) ? attackSpeedMs : 1,
  );
  const safeTargetCount = Math.max(
    1,
    Math.floor(Number.isFinite(targetCount) ? targetCount : 1),
  );

  let hitCount = 1;
  switch (config.attackPatternId) {
    case "wand_multishot":
      hitCount = Math.min(safeTargetCount, config.projectileCount);
      break;
    case "wand_burst":
      hitCount = config.burstCount;
      break;
    case "sword_cleave":
    case "sword_lunge":
    case "staff_ground_aoe":
      hitCount = Math.min(safeTargetCount, config.maxTargetHitsPerAttack);
      break;
    default:
      hitCount = 1;
      break;
  }

  const damagePerAttack =
    safeBaseDamage * Math.max(0, config.damageMultiplier) * hitCount;
  const dps = (damagePerAttack / safeAttackSpeedMs) * 1000;
  return Math.round(Math.max(0, dps) * 100) / 100;
}
