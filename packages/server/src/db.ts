import { Database } from "bun:sqlite";

export function createDatabase(dbPath: string): Database {
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}
