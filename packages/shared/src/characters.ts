export const CHARACTER_CLASSES = ["knight", "mage"] as const;
export type CharacterClass = (typeof CHARACTER_CLASSES)[number];

export const MAX_CHARACTERS_PER_ACCOUNT = 6;
export const MIN_CHARACTER_NICKNAME_LENGTH = 3;
export const MAX_CHARACTER_NICKNAME_LENGTH = 20;
export const MAX_CHARACTER_LEVEL = 60;

const NICKNAME_REGEX = /^[A-Za-z][A-Za-z0-9_]*$/;

export interface CharacterSummary {
  id: string;
  nickname: string;
  class: CharacterClass;
  level: number;
  xp: number;
  xpToNextLevel: number | null;
  createdAt: string;
  updatedAt: string;
  isLastUsed: boolean;
}

export interface CharacterBaseCombatStats {
  maxHp: number;
  baseDamage: number;
  baseAttackSpeedMs: number;
  baseAttackRange: number;
}

export interface ListCharactersResponse {
  characters: CharacterSummary[];
  maxCharacters: number;
  lastUsedCharacterId: string | null;
}

export interface CreateCharacterRequest {
  nickname: string;
  class: CharacterClass;
}

export interface CreateCharacterResponse {
  character: CharacterSummary;
}

export const CHARACTER_ERROR_CODES = {
  unauthorized: "CHARACTER_UNAUTHORIZED",
  requestNotJson: "CHARACTER_REQUEST_NOT_JSON",
  invalidPayload: "CHARACTER_INVALID_PAYLOAD",
  maxReached: "CHARACTER_MAX_REACHED",
  duplicateNickname: "CHARACTER_DUPLICATE_NICKNAME",
  lastCharacterDeleteForbidden: "CHARACTER_LAST_DELETE_FORBIDDEN",
  notFound: "CHARACTER_NOT_FOUND",
  requestFailed: "CHARACTER_REQUEST_FAILED",
} as const;

export type CharacterErrorCode =
  (typeof CHARACTER_ERROR_CODES)[keyof typeof CHARACTER_ERROR_CODES];

export function isCharacterErrorCode(
  value: string,
): value is CharacterErrorCode {
  return (Object.values(CHARACTER_ERROR_CODES) as readonly string[]).includes(
    value,
  );
}

export interface CharacterErrorResponse {
  error: string;
  code: CharacterErrorCode;
}

export interface LevelProgressionRow {
  level: number;
  xpToNextLevel: number | null;
  hpMultiplier: number;
  damageMultiplier: number;
}

export interface AppliedExperienceResult {
  level: number;
  xp: number;
  xpToNextLevel: number | null;
  levelsGained: number;
  isMaxLevel: boolean;
  gainedXp: number;
}

const LEVEL_PROGRESS_TABLE: readonly LevelProgressionRow[] = [
  { level: 1, xpToNextLevel: 60, hpMultiplier: 1.0, damageMultiplier: 1.0 },
  { level: 2, xpToNextLevel: 70, hpMultiplier: 1.06, damageMultiplier: 1.05 },
  { level: 3, xpToNextLevel: 80, hpMultiplier: 1.12, damageMultiplier: 1.1 },
  { level: 4, xpToNextLevel: 90, hpMultiplier: 1.18, damageMultiplier: 1.15 },
  { level: 5, xpToNextLevel: 110, hpMultiplier: 1.25, damageMultiplier: 1.2 },
  { level: 6, xpToNextLevel: 130, hpMultiplier: 1.33, damageMultiplier: 1.26 },
  { level: 7, xpToNextLevel: 150, hpMultiplier: 1.41, damageMultiplier: 1.32 },
  { level: 8, xpToNextLevel: 175, hpMultiplier: 1.5, damageMultiplier: 1.38 },
  { level: 9, xpToNextLevel: 200, hpMultiplier: 1.6, damageMultiplier: 1.44 },
  { level: 10, xpToNextLevel: 230, hpMultiplier: 1.72, damageMultiplier: 1.65 },
  { level: 11, xpToNextLevel: 270, hpMultiplier: 1.86, damageMultiplier: 1.8 },
  { level: 12, xpToNextLevel: 310, hpMultiplier: 2.02, damageMultiplier: 1.95 },
  { level: 13, xpToNextLevel: 360, hpMultiplier: 2.2, damageMultiplier: 2.15 },
  { level: 14, xpToNextLevel: 410, hpMultiplier: 2.4, damageMultiplier: 2.35 },
  { level: 15, xpToNextLevel: 470, hpMultiplier: 2.62, damageMultiplier: 2.6 },
  { level: 16, xpToNextLevel: 540, hpMultiplier: 2.86, damageMultiplier: 2.85 },
  { level: 17, xpToNextLevel: 620, hpMultiplier: 3.13, damageMultiplier: 3.15 },
  { level: 18, xpToNextLevel: 710, hpMultiplier: 3.42, damageMultiplier: 3.5 },
  { level: 19, xpToNextLevel: 810, hpMultiplier: 3.74, damageMultiplier: 3.9 },
  { level: 20, xpToNextLevel: 920, hpMultiplier: 4.1, damageMultiplier: 4.35 },
  {
    level: 21,
    xpToNextLevel: 1050,
    hpMultiplier: 4.48,
    damageMultiplier: 4.85,
  },
  { level: 22, xpToNextLevel: 1200, hpMultiplier: 4.9, damageMultiplier: 5.4 },
  { level: 23, xpToNextLevel: 1370, hpMultiplier: 5.36, damageMultiplier: 6.0 },
  {
    level: 24,
    xpToNextLevel: 1560,
    hpMultiplier: 5.86,
    damageMultiplier: 6.65,
  },
  { level: 25, xpToNextLevel: 1780, hpMultiplier: 6.4, damageMultiplier: 7.35 },
  {
    level: 26,
    xpToNextLevel: 2030,
    hpMultiplier: 6.99,
    damageMultiplier: 8.1,
  },
  {
    level: 27,
    xpToNextLevel: 2310,
    hpMultiplier: 7.63,
    damageMultiplier: 8.9,
  },
  {
    level: 28,
    xpToNextLevel: 2630,
    hpMultiplier: 8.32,
    damageMultiplier: 9.75,
  },
  {
    level: 29,
    xpToNextLevel: 2990,
    hpMultiplier: 9.08,
    damageMultiplier: 10.65,
  },
  { level: 30, xpToNextLevel: 3400, hpMultiplier: 9.9, damageMultiplier: 11.6 },
  {
    level: 31,
    xpToNextLevel: 3870,
    hpMultiplier: 10.8,
    damageMultiplier: 12.5,
  },
  {
    level: 32,
    xpToNextLevel: 4410,
    hpMultiplier: 11.78,
    damageMultiplier: 13.5,
  },
  {
    level: 33,
    xpToNextLevel: 5020,
    hpMultiplier: 12.85,
    damageMultiplier: 14.6,
  },
  {
    level: 34,
    xpToNextLevel: 5710,
    hpMultiplier: 14.02,
    damageMultiplier: 15.8,
  },
  {
    level: 35,
    xpToNextLevel: 6500,
    hpMultiplier: 15.3,
    damageMultiplier: 17.1,
  },
  {
    level: 36,
    xpToNextLevel: 7390,
    hpMultiplier: 16.71,
    damageMultiplier: 18.5,
  },
  {
    level: 37,
    xpToNextLevel: 8410,
    hpMultiplier: 18.26,
    damageMultiplier: 20.0,
  },
  {
    level: 38,
    xpToNextLevel: 9570,
    hpMultiplier: 19.96,
    damageMultiplier: 21.6,
  },
  {
    level: 39,
    xpToNextLevel: 10900,
    hpMultiplier: 21.82,
    damageMultiplier: 23.3,
  },
  {
    level: 40,
    xpToNextLevel: 12420,
    hpMultiplier: 23.87,
    damageMultiplier: 25.1,
  },
  {
    level: 41,
    xpToNextLevel: 14150,
    hpMultiplier: 26.12,
    damageMultiplier: 27.0,
  },
  {
    level: 42,
    xpToNextLevel: 16120,
    hpMultiplier: 28.6,
    damageMultiplier: 29.0,
  },
  {
    level: 43,
    xpToNextLevel: 18370,
    hpMultiplier: 31.33,
    damageMultiplier: 31.2,
  },
  {
    level: 44,
    xpToNextLevel: 20940,
    hpMultiplier: 34.34,
    damageMultiplier: 33.5,
  },
  {
    level: 45,
    xpToNextLevel: 23870,
    hpMultiplier: 37.66,
    damageMultiplier: 36.0,
  },
  {
    level: 46,
    xpToNextLevel: 27210,
    hpMultiplier: 41.32,
    damageMultiplier: 38.6,
  },
  {
    level: 47,
    xpToNextLevel: 31020,
    hpMultiplier: 45.36,
    damageMultiplier: 41.4,
  },
  {
    level: 48,
    xpToNextLevel: 35360,
    hpMultiplier: 49.81,
    damageMultiplier: 44.4,
  },
  {
    level: 49,
    xpToNextLevel: 40310,
    hpMultiplier: 54.72,
    damageMultiplier: 47.6,
  },
  {
    level: 50,
    xpToNextLevel: 45940,
    hpMultiplier: 60.14,
    damageMultiplier: 51.0,
  },
  {
    level: 51,
    xpToNextLevel: 52340,
    hpMultiplier: 66.12,
    damageMultiplier: 54.6,
  },
  {
    level: 52,
    xpToNextLevel: 59610,
    hpMultiplier: 72.72,
    damageMultiplier: 58.4,
  },
  {
    level: 53,
    xpToNextLevel: 67860,
    hpMultiplier: 80.0,
    damageMultiplier: 62.4,
  },
  {
    level: 54,
    xpToNextLevel: 77210,
    hpMultiplier: 88.04,
    damageMultiplier: 66.6,
  },
  {
    level: 55,
    xpToNextLevel: 87790,
    hpMultiplier: 96.92,
    damageMultiplier: 71.0,
  },
  {
    level: 56,
    xpToNextLevel: 99750,
    hpMultiplier: 106.72,
    damageMultiplier: 75.6,
  },
  {
    level: 57,
    xpToNextLevel: 113270,
    hpMultiplier: 117.55,
    damageMultiplier: 80.5,
  },
  {
    level: 58,
    xpToNextLevel: 128540,
    hpMultiplier: 129.5,
    damageMultiplier: 85.6,
  },
  {
    level: 59,
    xpToNextLevel: 145780,
    hpMultiplier: 142.69,
    damageMultiplier: 91.0,
  },
  {
    level: 60,
    xpToNextLevel: null,
    hpMultiplier: 157.23,
    damageMultiplier: 96.6,
  },
] as const;

export function normalizeNickname(nickname: string): string {
  return nickname.trim().toLowerCase();
}

export function isCharacterClass(value: string): value is CharacterClass {
  return (CHARACTER_CLASSES as readonly string[]).includes(value);
}

export function validateCharacterNickname(nickname: string): string | null {
  const trimmed = nickname.trim();
  if (trimmed.length < MIN_CHARACTER_NICKNAME_LENGTH) {
    return `Nickname must be at least ${MIN_CHARACTER_NICKNAME_LENGTH} characters.`;
  }
  if (trimmed.length > MAX_CHARACTER_NICKNAME_LENGTH) {
    return `Nickname must be at most ${MAX_CHARACTER_NICKNAME_LENGTH} characters.`;
  }
  if (!NICKNAME_REGEX.test(trimmed)) {
    return "Nickname must start with a letter and use only letters, numbers, or underscores.";
  }
  return null;
}

export function validateCharacterClass(value: string): string | null {
  if (!isCharacterClass(value)) {
    return "Class must be one of: knight, mage.";
  }
  return null;
}

export function getCharacterClassColorHex(
  characterClass: CharacterClass,
): string {
  switch (characterClass) {
    case "knight":
      return "#E8A832";
    case "mage":
      return "#22D3EE";
    default:
      return "#E8A832";
  }
}

export function getCharacterClassBaseCombatStats(
  characterClass: CharacterClass,
): CharacterBaseCombatStats {
  switch (characterClass) {
    case "knight":
      return {
        maxHp: 180,
        baseDamage: 24,
        baseAttackSpeedMs: 100,
        baseAttackRange: 60,
      };
    case "mage":
      return {
        maxHp: 110,
        baseDamage: 18,
        baseAttackSpeedMs: 100,
        baseAttackRange: 360,
      };
    default:
      return {
        maxHp: 180,
        baseDamage: 24,
        baseAttackSpeedMs: 100,
        baseAttackRange: 60,
      };
  }
}

export function clampCharacterLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return 1;
  }
  return Math.max(1, Math.min(MAX_CHARACTER_LEVEL, Math.floor(level)));
}

export function getLevelProgressionTable(): readonly LevelProgressionRow[] {
  return LEVEL_PROGRESS_TABLE;
}

export function getLevelProgression(level: number): LevelProgressionRow {
  const clampedLevel = clampCharacterLevel(level);
  const fallback =
    LEVEL_PROGRESS_TABLE[0] ??
    ({
      level: 1,
      xpToNextLevel: null,
      hpMultiplier: 1,
      damageMultiplier: 1,
    } satisfies LevelProgressionRow);
  return LEVEL_PROGRESS_TABLE[clampedLevel - 1] ?? fallback;
}

export function getXpToNextLevelForLevel(level: number): number | null {
  return getLevelProgression(level).xpToNextLevel;
}

export function computeLevelScaledCombatStats(
  base: CharacterBaseCombatStats,
  level: number,
): CharacterBaseCombatStats {
  const progression = getLevelProgression(level);
  return {
    maxHp: Math.max(1, Math.round(base.maxHp * progression.hpMultiplier)),
    baseDamage: Math.max(
      0,
      Math.round(base.baseDamage * progression.damageMultiplier * 100) / 100,
    ),
    baseAttackSpeedMs: Math.max(1, Math.floor(base.baseAttackSpeedMs)),
    baseAttackRange: Math.max(1, base.baseAttackRange),
  };
}

export function normalizeCharacterProgress(
  level: number,
  xp: number,
): Pick<
  AppliedExperienceResult,
  "level" | "xp" | "xpToNextLevel" | "isMaxLevel"
> {
  let nextLevel = clampCharacterLevel(level);
  let nextXp = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));

  while (nextLevel < MAX_CHARACTER_LEVEL) {
    const xpToNext = getXpToNextLevelForLevel(nextLevel);
    if (xpToNext === null || xpToNext <= 0) {
      break;
    }
    if (nextXp < xpToNext) {
      return {
        level: nextLevel,
        xp: nextXp,
        xpToNextLevel: xpToNext,
        isMaxLevel: false,
      };
    }
    nextXp -= xpToNext;
    nextLevel += 1;
  }

  if (nextLevel >= MAX_CHARACTER_LEVEL) {
    return {
      level: MAX_CHARACTER_LEVEL,
      xp: 0,
      xpToNextLevel: null,
      isMaxLevel: true,
    };
  }

  return {
    level: nextLevel,
    xp: nextXp,
    xpToNextLevel: getXpToNextLevelForLevel(nextLevel),
    isMaxLevel: false,
  };
}

export function applyCharacterExperience(
  level: number,
  xp: number,
  gainedXp: number,
): AppliedExperienceResult {
  const normalized = normalizeCharacterProgress(level, xp);
  let nextLevel = normalized.level;
  let nextXp = normalized.xp;
  let remainingXp = Math.max(
    0,
    Math.floor(Number.isFinite(gainedXp) ? gainedXp : 0),
  );
  let levelsGained = 0;

  if (normalized.isMaxLevel || remainingXp === 0) {
    return {
      level: nextLevel,
      xp: nextXp,
      xpToNextLevel: normalized.xpToNextLevel,
      levelsGained,
      isMaxLevel: normalized.isMaxLevel,
      gainedXp: 0,
    };
  }

  while (remainingXp > 0 && nextLevel < MAX_CHARACTER_LEVEL) {
    const xpToNext = getXpToNextLevelForLevel(nextLevel);
    if (xpToNext === null || xpToNext <= 0) {
      break;
    }

    const needed = xpToNext - nextXp;
    if (remainingXp < needed) {
      nextXp += remainingXp;
      remainingXp = 0;
      break;
    }

    remainingXp -= needed;
    nextLevel += 1;
    levelsGained += 1;
    nextXp = 0;
  }

  if (nextLevel >= MAX_CHARACTER_LEVEL) {
    return {
      level: MAX_CHARACTER_LEVEL,
      xp: 0,
      xpToNextLevel: null,
      levelsGained,
      isMaxLevel: true,
      gainedXp:
        gainedXp > 0 ? Math.max(0, Math.floor(gainedXp)) - remainingXp : 0,
    };
  }

  const xpToNextLevel = getXpToNextLevelForLevel(nextLevel);
  return {
    level: nextLevel,
    xp: nextXp,
    xpToNextLevel,
    levelsGained,
    isMaxLevel: false,
    gainedXp:
      gainedXp > 0 ? Math.max(0, Math.floor(gainedXp)) - remainingXp : 0,
  };
}

export function getEnemyExperienceMultiplier(
  enemyLevel: number,
  playerLevel: number,
): number {
  const safeEnemyLevel = clampCharacterLevel(enemyLevel);
  const safePlayerLevel = clampCharacterLevel(playerLevel);
  const delta = safeEnemyLevel - safePlayerLevel;
  const multiplier = 1 + delta * 0.12;
  return Math.max(0.25, Math.min(1.75, multiplier));
}

export function computeAdjustedEnemyExperience(
  baseExperience: number,
  enemyLevel: number,
  playerLevel: number,
): number {
  if (!Number.isFinite(baseExperience) || baseExperience <= 0) {
    return 0;
  }
  const scaled = Math.round(
    baseExperience * getEnemyExperienceMultiplier(enemyLevel, playerLevel),
  );
  return Math.max(1, scaled);
}
