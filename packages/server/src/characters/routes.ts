import type { Database } from "bun:sqlite";
import {
  CHARACTER_ERROR_CODES,
  type CharacterClass,
  type CreateCharacterRequest,
  MAX_CHARACTERS_PER_ACCOUNT,
  isCharacterClass,
  validateCharacterNickname,
} from "@mmo/shared";

import { verifyAccessToken } from "../auth/jwt";
import type { ServerConfig } from "../config";
import {
  canCreateCharacter,
  createCharacter,
  deleteCharacterForUser,
  findCharacterByIdForUser,
  getLastUsedCharacterIdForUser,
  listCharactersForUser,
  reassignLastUsedCharacterIdForUser,
} from "./repository";

const UNAUTHORIZED_MESSAGE = "Authentication is required.";
const INVALID_CHARACTER_MESSAGE = "Character payload is invalid.";
const LAST_CHARACTER_DELETE_MESSAGE =
  "Cannot delete your last remaining character.";

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

function characterError(
  status: number,
  code: (typeof CHARACTER_ERROR_CODES)[keyof typeof CHARACTER_ERROR_CODES],
  error: string,
): Response {
  return json(status, { code, error });
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(" ", 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token.trim() || null;
}

async function authenticateRequest(
  request: Request,
  config: ServerConfig,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const token = extractBearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: characterError(
        401,
        CHARACTER_ERROR_CODES.unauthorized,
        UNAUTHORIZED_MESSAGE,
      ),
    };
  }

  try {
    const result = await verifyAccessToken(token, config);
    const userId = result.payload.sub;
    if (typeof userId !== "string" || userId.length === 0) {
      return {
        ok: false,
        response: characterError(
          401,
          CHARACTER_ERROR_CODES.unauthorized,
          UNAUTHORIZED_MESSAGE,
        ),
      };
    }
    return { ok: true, userId };
  } catch {
    return {
      ok: false,
      response: characterError(
        401,
        CHARACTER_ERROR_CODES.unauthorized,
        UNAUTHORIZED_MESSAGE,
      ),
    };
  }
}

async function parseJsonBody(request: Request): Promise<unknown | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("UNIQUE") || message.includes("constraint");
}

function validateCreateBody(
  body: unknown,
): { ok: true; value: CreateCharacterRequest } | { ok: false } {
  if (!body || typeof body !== "object") {
    return { ok: false };
  }
  const nickname = (body as { nickname?: unknown }).nickname;
  const characterClass = (body as { class?: unknown }).class;
  if (typeof nickname !== "string" || typeof characterClass !== "string") {
    return { ok: false };
  }
  const nicknameError = validateCharacterNickname(nickname);
  if (nicknameError) {
    return { ok: false };
  }
  if (!isCharacterClass(characterClass)) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      nickname: nickname.trim(),
      class: characterClass as CharacterClass,
    },
  };
}

export async function handleListCharacters(
  request: Request,
  db: Database,
  config: ServerConfig,
): Promise<Response> {
  const auth = await authenticateRequest(request, config);
  if (!auth.ok) {
    return auth.response;
  }
  return json(200, {
    characters: listCharactersForUser(db, auth.userId),
    maxCharacters: MAX_CHARACTERS_PER_ACCOUNT,
    lastUsedCharacterId: getLastUsedCharacterIdForUser(db, auth.userId),
  });
}

export async function handleCreateCharacter(
  request: Request,
  db: Database,
  config: ServerConfig,
): Promise<Response> {
  const auth = await authenticateRequest(request, config);
  if (!auth.ok) {
    return auth.response;
  }

  if (!canCreateCharacter(db, auth.userId)) {
    return characterError(
      409,
      CHARACTER_ERROR_CODES.maxReached,
      "Character limit reached.",
    );
  }

  const body = await parseJsonBody(request);
  if (!body) {
    return characterError(
      415,
      CHARACTER_ERROR_CODES.requestNotJson,
      "Request must be valid application/json.",
    );
  }
  const validation = validateCreateBody(body);
  if (!validation.ok) {
    return characterError(
      400,
      CHARACTER_ERROR_CODES.invalidPayload,
      INVALID_CHARACTER_MESSAGE,
    );
  }

  try {
    const character = createCharacter(db, {
      id: crypto.randomUUID(),
      userId: auth.userId,
      nickname: validation.value.nickname,
      class: validation.value.class,
    });
    return json(201, { character });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return characterError(
        409,
        CHARACTER_ERROR_CODES.duplicateNickname,
        "Nickname is already used on this account.",
      );
    }
    throw error;
  }
}

export async function handleDeleteCharacter(
  request: Request,
  db: Database,
  config: ServerConfig,
  characterId: string,
): Promise<Response> {
  const auth = await authenticateRequest(request, config);
  if (!auth.ok) {
    return auth.response;
  }
  if (!characterId) {
    return characterError(404, CHARACTER_ERROR_CODES.notFound, "Not found.");
  }

  const characters = listCharactersForUser(db, auth.userId);
  if (characters.length <= 1) {
    return characterError(
      409,
      CHARACTER_ERROR_CODES.lastCharacterDeleteForbidden,
      LAST_CHARACTER_DELETE_MESSAGE,
    );
  }

  const target = findCharacterByIdForUser(db, auth.userId, characterId);
  if (!target) {
    return characterError(404, CHARACTER_ERROR_CODES.notFound, "Not found.");
  }

  const lastUsedCharacterId = getLastUsedCharacterIdForUser(db, auth.userId);
  deleteCharacterForUser(db, auth.userId, characterId);
  if (lastUsedCharacterId === characterId) {
    reassignLastUsedCharacterIdForUser(db, auth.userId);
  }
  return new Response(null, { status: 204 });
}

export async function resolveAuthenticatedUserId(
  request: Request,
  config: ServerConfig,
): Promise<string | null> {
  const auth = await authenticateRequest(request, config);
  if (!auth.ok) {
    return null;
  }
  return auth.userId;
}
