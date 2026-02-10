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

const LEVEL_PROGRESS_TABLE = buildDefaultLevelProgressionTable();

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
        baseAttackSpeedMs: 600,
        baseAttackRange: 60,
      };
    case "mage":
      return {
        maxHp: 110,
        baseDamage: 18,
        baseAttackSpeedMs: 820,
        baseAttackRange: 360,
      };
    default:
      return {
        maxHp: 180,
        baseDamage: 24,
        baseAttackSpeedMs: 600,
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

function buildDefaultLevelProgressionTable(): LevelProgressionRow[] {
  const rows: LevelProgressionRow[] = [];
  for (let level = 1; level <= MAX_CHARACTER_LEVEL; level += 1) {
    const isMax = level === MAX_CHARACTER_LEVEL;
    rows.push({
      level,
      xpToNextLevel: isMax
        ? null
        : Math.max(25, Math.round(75 + level * level * 5.5 + level * 36)),
      hpMultiplier: Math.round((1 + (level - 1) * 0.05) * 1000) / 1000,
      damageMultiplier: Math.round((1 + (level - 1) * 0.038) * 1000) / 1000,
    });
  }
  return rows;
}
