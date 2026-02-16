import type { Database } from "bun:sqlite";

import { isAdminApiEnabled } from "./admin/guard";
import { handleAdminRequest } from "./admin/routes";
import { handleSignin, handleSignup } from "./auth/routes";
import {
  handleCreateCharacter,
  handleDeleteCharacter,
  handleListCharacters,
} from "./characters/routes";
import { type ServerConfig, createServerConfig } from "./config";
import { createDatabase } from "./db";

export interface AppInstance {
  config: ServerConfig;
  db: Database;
  fetch: (request: Request) => Promise<Response>;
  close: () => void;
}

export interface CreateAppOptions {
  config?: Partial<ServerConfig>;
  db?: Database;
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

export function createApp(options: CreateAppOptions = {}): AppInstance {
  const config = createServerConfig(process.env, options.config);

  let ownsDb = false;
  const db =
    options.db ??
    (() => {
      ownsDb = true;
      return createDatabase(config.dbPath);
    })();

  const fetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json(200, { ok: true });
    }

    if (request.method === "POST" && url.pathname === "/auth/signup") {
      return handleSignup(request, db, config);
    }

    if (request.method === "POST" && url.pathname === "/auth/signin") {
      return handleSignin(request, db, config);
    }

    if (request.method === "GET" && url.pathname === "/characters") {
      return handleListCharacters(request, db, config);
    }

    if (request.method === "POST" && url.pathname === "/characters") {
      return handleCreateCharacter(request, db, config);
    }

    if (
      request.method === "DELETE" &&
      url.pathname.startsWith("/characters/")
    ) {
      const characterId = url.pathname.slice("/characters/".length);
      return handleDeleteCharacter(request, db, config, characterId);
    }

    // Admin routes – only registered outside production
    if (url.pathname.startsWith("/admin/") || url.pathname === "/admin") {
      if (!isAdminApiEnabled()) {
        return json(404, { error: "Not found." });
      }
      const adminResponse = await handleAdminRequest(request, url, db);
      if (adminResponse) {
        return adminResponse;
      }
    }

    return json(404, { error: "Not found." });
  };

  return {
    config,
    db,
    fetch,
    close: () => {
      if (ownsDb) {
        db.close();
      }
    },
  };
}
