import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findUserByEmail, insertUser } from "../auth/repository";
import { createDatabase } from "../db";
import { runAdminCommand } from "./cli";

const cleanupDirs: string[] = [];

function createTempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "mmo-admin-cli-"));
  cleanupDirs.push(dir);
  return join(dir, "auth.sqlite");
}

afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("admin cli", () => {
  test("promotes an existing account to admin", async () => {
    const dbPath = createTempDbPath();
    const db = createDatabase(dbPath);
    insertUser(db, {
      id: "user-1",
      email: "owner@example.com",
      passwordHash: "hash",
    });
    db.close();

    const logs: string[] = [];
    const errors: string[] = [];
    const exitCode = await runAdminCommand(
      ["admin", "promote", "--email", " OWNER@Example.com "],
      {
        env: { AUTH_DB_PATH: dbPath },
        log: (message) => logs.push(message),
        logError: (message) => errors.push(message),
      },
    );

    expect(exitCode).toBe(0);
    expect(errors).toHaveLength(0);
    expect(logs).toContain("Promoted owner@example.com to admin.");

    const verifyDb = createDatabase(dbPath);
    const promoted = findUserByEmail(verifyDb, "owner@example.com");
    expect(promoted?.role).toBe("admin");
    verifyDb.close();
  });

  test("returns success when account is already admin", async () => {
    const dbPath = createTempDbPath();
    const db = createDatabase(dbPath);
    insertUser(db, {
      id: "user-2",
      email: "admin@example.com",
      passwordHash: "hash",
      role: "admin",
    });
    db.close();

    const logs: string[] = [];
    const exitCode = await runAdminCommand(
      ["admin", "promote", "--email=admin@example.com"],
      { env: { AUTH_DB_PATH: dbPath }, log: (message) => logs.push(message) },
    );

    expect(exitCode).toBe(0);
    expect(logs).toContain("admin@example.com is already an admin.");
  });

  test("fails when target account does not exist", async () => {
    const dbPath = createTempDbPath();
    createDatabase(dbPath).close();

    const errors: string[] = [];
    const exitCode = await runAdminCommand(
      ["admin", "promote", "--email", "missing@example.com"],
      {
        env: { AUTH_DB_PATH: dbPath },
        logError: (message) => errors.push(message),
      },
    );

    expect(exitCode).toBe(1);
    expect(errors).toContain("No account found for missing@example.com.");
  });

  test("fails for malformed command arguments", async () => {
    const errors: string[] = [];
    const exitCode = await runAdminCommand(["admin", "promote"], {
      logError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(errors[0]).toBe("Email is required.");
  });

  test("fails when unsupported options are provided", async () => {
    const errors: string[] = [];
    const exitCode = await runAdminCommand(
      ["admin", "promote", "--email", "owner@example.com", "--db-path", "x"],
      { logError: (message) => errors.push(message) },
    );

    expect(exitCode).toBe(1);
    expect(errors[0]).toBe("Unknown option: --db-path");
  });
});
