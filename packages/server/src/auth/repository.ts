import type { Database } from "bun:sqlite";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewUser {
  id: string;
  email: string;
  passwordHash: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

function mapUserRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function findUserByEmail(db: Database, email: string): UserRecord | null {
  const row = db
    .query<UserRow, [string]>(
      `SELECT id, email, password_hash, created_at, updated_at
       FROM users
       WHERE email = ?1
       LIMIT 1`,
    )
    .get(email);

  return row ? mapUserRow(row) : null;
}

export function insertUser(db: Database, input: NewUser): UserRecord {
  const timestamp = new Date().toISOString();

  db.query(
    `INSERT INTO users (id, email, password_hash, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  ).run(input.id, input.email, input.passwordHash, timestamp, timestamp);

  return {
    id: input.id,
    email: input.email,
    passwordHash: input.passwordHash,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
