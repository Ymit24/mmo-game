import type { Database } from "bun:sqlite";
import { USER_ROLES, type UserRole, isUserRole } from "@mmo/shared";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface NewUser {
  id: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: string;
  updated_at: string;
}

function mapUserRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: isUserRole(row.role) ? row.role : USER_ROLES.user,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function findUserByEmail(
  db: Database,
  email: string,
): UserRecord | null {
  const row = db
    .query<UserRow, [string]>(
      `SELECT id, email, password_hash, role, created_at, updated_at
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
    `INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  ).run(
    input.id,
    input.email,
    input.passwordHash,
    input.role ?? USER_ROLES.user,
    timestamp,
    timestamp,
  );

  return {
    id: input.id,
    email: input.email,
    passwordHash: input.passwordHash,
    role: input.role ?? USER_ROLES.user,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export interface PromoteUserToAdminResult {
  found: boolean;
  changed: boolean;
  user: UserRecord | null;
}

export function promoteUserToAdminByEmail(
  db: Database,
  email: string,
): PromoteUserToAdminResult {
  const existing = findUserByEmail(db, email);
  if (!existing) {
    return { found: false, changed: false, user: null };
  }
  if (existing.role === USER_ROLES.admin) {
    return { found: true, changed: false, user: existing };
  }

  const result = db
    .query(
      `UPDATE users
       SET role = ?2,
           updated_at = ?3
       WHERE email = ?1`,
    )
    .run(email, USER_ROLES.admin, new Date().toISOString()) as {
    changes?: number;
  };
  const user = findUserByEmail(db, email);

  return {
    found: true,
    changed: !!result.changes,
    user,
  };
}
