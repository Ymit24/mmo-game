import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

function ensureDatabaseDirectory(dbPath: string): void {
  if (dbPath === ":memory:" || dbPath.startsWith("file:")) {
    return;
  }

  const directory = dirname(dbPath);
  if (directory === ".") {
    return;
  }

  mkdirSync(directory, { recursive: true });
}

export function createDatabase(dbPath: string): Database {
  ensureDatabaseDirectory(dbPath);
  const db = new Database(dbPath, { create: true, strict: true });
  bootstrapDatabase(db);
  return db;
}

export function bootstrapDatabase(db: Database): void {
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      last_used_character_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  ensureUsersLastUsedCharacterColumn(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nickname TEXT NOT NULL,
      nickname_normalized TEXT NOT NULL,
      class TEXT NOT NULL CHECK (class IN ('knight', 'mage')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, nickname_normalized)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_characters_user_id
    ON characters (user_id);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_characters_user_updated_at
    ON characters (user_id, updated_at DESC);
  `);
}

function ensureUsersLastUsedCharacterColumn(db: Database): void {
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(users);")
    .all();
  const hasColumn = columns.some(
    (column) => column.name === "last_used_character_id",
  );
  if (!hasColumn) {
    db.exec("ALTER TABLE users ADD COLUMN last_used_character_id TEXT;");
  }
}
