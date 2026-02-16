import type { Database } from "bun:sqlite";
import { isEmailFormatValid, normalizeEmail } from "@mmo/shared";

import { promoteUserToAdminByEmail } from "../auth/repository";
import { DEFAULT_AUTH_DB_PATH } from "../config";
import { createDatabase } from "../db";

const ADMIN_USAGE = ["Usage:", "  admin promote --email <email>"].join("\n");

interface AdminCliOptions {
  env?: Record<string, string | undefined>;
  log?: (message: string) => void;
  logError?: (message: string) => void;
  openDatabase?: (dbPath: string) => Database;
}

interface PromoteCommandArgs {
  email: string;
}

function parsePromoteCommandArgs(
  args: string[],
): { ok: true; value: PromoteCommandArgs } | { ok: false; error: string } {
  let email: string | null = null;

  for (let index = 2; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }
    if (arg === "--email") {
      const next = args[index + 1];
      if (!next) {
        return {
          ok: false,
          error: "Missing value for --email.",
        };
      }
      email = next;
      index += 1;
      continue;
    }
    if (arg.startsWith("--email=")) {
      email = arg.slice("--email=".length);
      continue;
    }

    return {
      ok: false,
      error: `Unknown option: ${arg}`,
    };
  }

  if (!email) {
    return {
      ok: false,
      error: "Email is required.",
    };
  }
  const normalizedEmail = normalizeEmail(email);
  if (!isEmailFormatValid(normalizedEmail)) {
    return {
      ok: false,
      error: "Email is invalid.",
    };
  }

  return {
    ok: true,
    value: {
      email: normalizedEmail,
    },
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

export async function runAdminCommand(
  args: string[],
  options: AdminCliOptions = {},
): Promise<number> {
  const env = options.env ?? process.env;
  const log = options.log ?? console.log;
  const logError = options.logError ?? console.error;
  const openDatabase = options.openDatabase ?? createDatabase;

  const [scope, command] = args;
  if (scope !== "admin") {
    logError("Unknown command scope.");
    logError(ADMIN_USAGE);
    return 1;
  }
  if (command !== "promote") {
    logError("Unknown admin command.");
    logError(ADMIN_USAGE);
    return 1;
  }

  const parsed = parsePromoteCommandArgs(args);
  if (!parsed.ok) {
    logError(parsed.error);
    logError(ADMIN_USAGE);
    return 1;
  }
  const dbPath = env.AUTH_DB_PATH ?? DEFAULT_AUTH_DB_PATH;

  let db: Database | null = null;
  try {
    db = openDatabase(dbPath);
    const result = promoteUserToAdminByEmail(db, parsed.value.email);
    if (!result.found) {
      logError(`No account found for ${parsed.value.email}.`);
      return 1;
    }
    if (result.changed) {
      log(`Promoted ${parsed.value.email} to admin.`);
      return 0;
    }
    log(`${parsed.value.email} is already an admin.`);
    return 0;
  } catch (error) {
    logError(`Failed to run admin command: ${toErrorMessage(error)}`);
    return 1;
  } finally {
    db?.close();
  }
}
