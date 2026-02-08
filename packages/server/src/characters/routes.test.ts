import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { type AppInstance, createApp } from "../app";

const TEST_SECRET = "test-jwt-secret-at-least-32-characters-long";

function createJsonRequest(
  path: string,
  method: "POST" | "GET" | "DELETE",
  token: string,
  body?: unknown,
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function signupAndGetToken(
  app: AppInstance,
  email: string,
): Promise<string> {
  const response = await app.fetch(
    new Request("http://localhost/auth/signup", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
        password: "password123",
      }),
    }),
  );
  const body = (await response.json()) as { token: string };
  return body.token;
}

describe("character routes", () => {
  let app: AppInstance;

  beforeEach(() => {
    app = createApp({
      config: {
        dbPath: ":memory:",
        jwtSecret: TEST_SECRET,
        jwtExpiresInSeconds: 86_400,
      },
    });
  });

  afterEach(() => {
    app.close();
  });

  test("create/list characters for authenticated user", async () => {
    const token = await signupAndGetToken(app, "player1@example.com");

    const createResponse = await app.fetch(
      createJsonRequest("/characters", "POST", token, {
        nickname: "AlphaOne",
        class: "knight",
      }),
    );
    expect(createResponse.status).toBe(201);

    const listResponse = await app.fetch(
      createJsonRequest("/characters", "GET", token),
    );
    expect(listResponse.status).toBe(200);
    const body = (await listResponse.json()) as {
      characters: Array<{
        nickname: string;
        class: string;
        isLastUsed: boolean;
      }>;
    };
    expect(body.characters).toHaveLength(1);
    expect(body.characters[0]?.nickname).toBe("AlphaOne");
    expect(body.characters[0]?.class).toBe("knight");
    expect(body.characters[0]?.isLastUsed).toBe(true);
  });

  test("enforces per-account nickname uniqueness", async () => {
    const token = await signupAndGetToken(app, "player2@example.com");

    const first = await app.fetch(
      createJsonRequest("/characters", "POST", token, {
        nickname: "AlphaOne",
        class: "knight",
      }),
    );
    expect(first.status).toBe(201);

    const second = await app.fetch(
      createJsonRequest("/characters", "POST", token, {
        nickname: " alphaone ",
        class: "mage",
      }),
    );
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({
      code: "CHARACTER_DUPLICATE_NICKNAME",
      error: "Nickname is already used on this account.",
    });
  });

  test("disallows deleting last remaining character", async () => {
    const token = await signupAndGetToken(app, "player3@example.com");

    const createResponse = await app.fetch(
      createJsonRequest("/characters", "POST", token, {
        nickname: "OnlyOne",
        class: "mage",
      }),
    );
    const created = (await createResponse.json()) as {
      character: {
        id: string;
      };
    };

    const deleteResponse = await app.fetch(
      createJsonRequest(`/characters/${created.character.id}`, "DELETE", token),
    );
    expect(deleteResponse.status).toBe(409);
    expect(await deleteResponse.json()).toEqual({
      code: "CHARACTER_LAST_DELETE_FORBIDDEN",
      error: "Cannot delete your last remaining character.",
    });
  });

  test("preserves last-used character when deleting a different character", async () => {
    const token = await signupAndGetToken(app, "player4@example.com");

    const firstCreate = await app.fetch(
      createJsonRequest("/characters", "POST", token, {
        nickname: "AlphaOne",
        class: "knight",
      }),
    );
    const first = (await firstCreate.json()) as {
      character: { id: string };
    };

    const secondCreate = await app.fetch(
      createJsonRequest("/characters", "POST", token, {
        nickname: "BetaTwo",
        class: "mage",
      }),
    );
    const second = (await secondCreate.json()) as {
      character: { id: string };
    };

    const deleteFirst = await app.fetch(
      createJsonRequest(`/characters/${first.character.id}`, "DELETE", token),
    );
    expect(deleteFirst.status).toBe(204);

    const listResponse = await app.fetch(
      createJsonRequest("/characters", "GET", token),
    );
    expect(listResponse.status).toBe(200);
    const body = (await listResponse.json()) as {
      lastUsedCharacterId: string | null;
      characters: Array<{
        id: string;
        isLastUsed: boolean;
      }>;
    };

    expect(body.lastUsedCharacterId).toBe(second.character.id);
    expect(body.characters).toHaveLength(1);
    expect(body.characters[0]?.id).toBe(second.character.id);
    expect(body.characters[0]?.isLastUsed).toBe(true);
  });
});
