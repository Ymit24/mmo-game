import type { Database } from "bun:sqlite";
import {
  type CharacterClass,
  type CharacterSummary,
  MAX_CHARACTERS_PER_ACCOUNT,
  getCharacterClassBaseCombatStats,
  normalizeCharacterProgress,
  normalizeNickname,
} from "@mmo/shared";

interface CharacterRow {
  id: string;
  nickname: string;
  class: CharacterClass;
  level: number;
  xp: number;
  created_at: string;
  updated_at: string;
}

interface UserLastUsedRow {
  last_used_character_id: string | null;
}

export interface NewCharacterInput {
  id: string;
  userId: string;
  nickname: string;
  class: CharacterClass;
}

export interface CharacterRecord {
  id: string;
  userId: string;
  nickname: string;
  class: CharacterClass;
  level: number;
  xp: number;
  xpToNextLevel: number | null;
  maxHp: number;
  baseDamage: number;
  baseAttackSpeedMs: number;
  baseAttackRange: number;
  createdAt: string;
  updatedAt: string;
}

interface CharacterRecordRow extends CharacterRow {
  user_id: string;
  max_hp: number;
  base_damage: number;
  base_attack_speed_ms: number;
  base_attack_range: number;
}

function mapCharacterRecord(row: CharacterRecordRow): CharacterRecord {
  const normalizedProgress = normalizeCharacterProgress(row.level, row.xp);
  return {
    id: row.id,
    userId: row.user_id,
    nickname: row.nickname,
    class: row.class,
    level: normalizedProgress.level,
    xp: normalizedProgress.xp,
    xpToNextLevel: normalizedProgress.xpToNextLevel,
    maxHp: row.max_hp,
    baseDamage: row.base_damage,
    baseAttackSpeedMs: row.base_attack_speed_ms,
    baseAttackRange: row.base_attack_range,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCharacterSummary(
  row: CharacterRow,
  lastUsedCharacterId: string | null,
): CharacterSummary {
  const normalizedProgress = normalizeCharacterProgress(row.level, row.xp);
  return {
    id: row.id,
    nickname: row.nickname,
    class: row.class,
    level: normalizedProgress.level,
    xp: normalizedProgress.xp,
    xpToNextLevel: normalizedProgress.xpToNextLevel,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isLastUsed: row.id === lastUsedCharacterId,
  };
}

export function findCharacterByIdForUser(
  db: Database,
  userId: string,
  characterId: string,
): CharacterRecord | null {
  const row = db
    .query<CharacterRecordRow, [string, string]>(
      `SELECT
         id,
         user_id,
         nickname,
         class,
         level,
         xp,
         max_hp,
         base_damage,
         base_attack_speed_ms,
         base_attack_range,
         created_at,
         updated_at
       FROM characters
       WHERE user_id = ?1 AND id = ?2
       LIMIT 1`,
    )
    .get(userId, characterId);
  return row ? mapCharacterRecord(row) : null;
}

export function listCharactersForUser(
  db: Database,
  userId: string,
): CharacterSummary[] {
  const lastUsedCharacterId = getLastUsedCharacterIdForUser(db, userId);
  const rows = db
    .query<CharacterRow, [string]>(
      `SELECT id, nickname, class, level, xp, created_at, updated_at
       FROM characters
       WHERE user_id = ?1
       ORDER BY updated_at DESC`,
    )
    .all(userId);

  return rows.map((row) => mapCharacterSummary(row, lastUsedCharacterId));
}

export function countCharactersForUser(db: Database, userId: string): number {
  const row = db
    .query<{ count: number }, [string]>(
      `SELECT COUNT(*) as count
       FROM characters
       WHERE user_id = ?1`,
    )
    .get(userId);
  return row?.count ?? 0;
}

function insertCharacter(
  db: Database,
  input: NewCharacterInput,
  timestamp: string,
): CharacterSummary {
  const normalizedNickname = normalizeNickname(input.nickname);
  const nickname = input.nickname.trim();
  const baseStats = getCharacterClassBaseCombatStats(input.class);

  db.query(
    `INSERT INTO characters (
      id,
      user_id,
      nickname,
      nickname_normalized,
      class,
      level,
      xp,
      max_hp,
      base_damage,
      base_attack_speed_ms,
      base_attack_range,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
  ).run(
    input.id,
    input.userId,
    nickname,
    normalizedNickname,
    input.class,
    1,
    0,
    baseStats.maxHp,
    baseStats.baseDamage,
    baseStats.baseAttackSpeedMs,
    baseStats.baseAttackRange,
    timestamp,
    timestamp,
  );

  setLastUsedCharacterIdForUser(db, input.userId, input.id);
  return {
    id: input.id,
    nickname,
    class: input.class,
    level: 1,
    xp: 0,
    xpToNextLevel: normalizeCharacterProgress(1, 0).xpToNextLevel,
    createdAt: timestamp,
    updatedAt: timestamp,
    isLastUsed: true,
  };
}

export function createCharacter(
  db: Database,
  input: NewCharacterInput,
): CharacterSummary {
  return insertCharacter(db, input, new Date().toISOString());
}

export function createCharacterIfWithinLimit(
  db: Database,
  input: NewCharacterInput,
): CharacterSummary | null {
  const timestamp = new Date().toISOString();
  let committed = false;

  db.exec("BEGIN IMMEDIATE;");
  try {
    const count = countCharactersForUser(db, input.userId);
    if (count >= MAX_CHARACTERS_PER_ACCOUNT) {
      return null;
    }

    const character = insertCharacter(db, input, timestamp);
    db.exec("COMMIT;");
    committed = true;

    return character;
  } finally {
    if (!committed) {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // Transaction may already be closed by SQLite after an error.
      }
    }
  }
}

export function deleteCharacterForUser(
  db: Database,
  userId: string,
  characterId: string,
): boolean {
  const existing = findCharacterByIdForUser(db, userId, characterId);
  if (!existing) {
    return false;
  }
  db.query(
    `DELETE FROM characters
     WHERE user_id = ?1 AND id = ?2`,
  ).run(userId, characterId);
  return true;
}

export function canCreateCharacter(db: Database, userId: string): boolean {
  return countCharactersForUser(db, userId) < MAX_CHARACTERS_PER_ACCOUNT;
}

export function updateCharacterProgressForUser(
  db: Database,
  userId: string,
  characterId: string,
  level: number,
  xp: number,
): CharacterRecord | null {
  const normalizedProgress = normalizeCharacterProgress(level, xp);
  const timestamp = new Date().toISOString();
  const result = db
    .query(
      `UPDATE characters
       SET level = ?3,
           xp = ?4,
           updated_at = ?5
       WHERE user_id = ?1 AND id = ?2`,
    )
    .run(
      userId,
      characterId,
      normalizedProgress.level,
      normalizedProgress.xp,
      timestamp,
    ) as { changes?: number };

  if (!result.changes) {
    return null;
  }

  return findCharacterByIdForUser(db, userId, characterId);
}

export function getLastUsedCharacterIdForUser(
  db: Database,
  userId: string,
): string | null {
  const row = db
    .query<UserLastUsedRow, [string]>(
      `SELECT last_used_character_id
       FROM users
       WHERE id = ?1
       LIMIT 1`,
    )
    .get(userId);
  return row?.last_used_character_id ?? null;
}

export function setLastUsedCharacterIdForUser(
  db: Database,
  userId: string,
  characterId: string | null,
): void {
  db.query(
    `UPDATE users
     SET last_used_character_id = ?2,
         updated_at = ?3
     WHERE id = ?1`,
  ).run(userId, characterId, new Date().toISOString());
}

export function reassignLastUsedCharacterIdForUser(
  db: Database,
  userId: string,
): void {
  const replacement = db
    .query<{ id: string }, [string]>(
      `SELECT id
       FROM characters
       WHERE user_id = ?1
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(userId);
  setLastUsedCharacterIdForUser(db, userId, replacement?.id ?? null);
}
