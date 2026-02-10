export const CHARACTER_CLASSES = ["knight", "mage"] as const;
export type CharacterClass = (typeof CHARACTER_CLASSES)[number];

export const MAX_CHARACTERS_PER_ACCOUNT = 6;
export const MIN_CHARACTER_NICKNAME_LENGTH = 3;
export const MAX_CHARACTER_NICKNAME_LENGTH = 20;

const NICKNAME_REGEX = /^[A-Za-z][A-Za-z0-9_]*$/;

export interface CharacterSummary {
  id: string;
  nickname: string;
  class: CharacterClass;
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
