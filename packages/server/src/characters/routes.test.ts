import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MAX_CHARACTERS_PER_ACCOUNT } from "@mmo/shared";

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
        level: number;
        xp: number;
        xpToNextLevel: number | null;
      }>;
    };
    expect(body.characters).toHaveLength(1);
    expect(body.characters[0]?.nickname).toBe("AlphaOne");
    expect(body.characters[0]?.class).toBe("knight");
    expect(body.characters[0]?.isLastUsed).toBe(true);
    expect(body.characters[0]?.level).toBe(1);
    expect(body.characters[0]?.xp).toBe(0);
    expect(body.characters[0]?.xpToNextLevel).not.toBeNull();
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

  test("returns not found when deleting unknown character id", async () => {
    const token = await signupAndGetToken(app, "player404@example.com");

    const createResponse = await app.fetch(
      createJsonRequest("/characters", "POST", token, {
        nickname: "OnlyOne",
        class: "mage",
      }),
    );
    expect(createResponse.status).toBe(201);

    const deleteResponse = await app.fetch(
      createJsonRequest("/characters/does-not-exist", "DELETE", token),
    );
    expect(deleteResponse.status).toBe(404);
    expect(await deleteResponse.json()).toEqual({
      code: "CHARACTER_NOT_FOUND",
      error: "Not found.",
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

  test("enforces max characters under concurrent create requests", async () => {
    const token = await signupAndGetToken(app, "player5@example.com");

    const createPromises = Array.from({
      length: MAX_CHARACTERS_PER_ACCOUNT + 2,
    }).map((_, index) =>
      app.fetch(
        createJsonRequest("/characters", "POST", token, {
          nickname: `Hero${index + 1}`,
          class: index % 2 === 0 ? "knight" : "mage",
        }),
      ),
    );

    const responses = await Promise.all(createPromises);
    const created = responses.filter((response) => response.status === 201);
    const maxReached = await Promise.all(
      responses
        .filter((response) => response.status === 409)
        .map(async (response) => response.json()),
    );

    expect(created).toHaveLength(MAX_CHARACTERS_PER_ACCOUNT);
    expect(maxReached).toContainEqual({
      code: "CHARACTER_MAX_REACHED",
      error: "Character limit reached.",
    });

    const listResponse = await app.fetch(
      createJsonRequest("/characters", "GET", token),
    );
    const listBody = (await listResponse.json()) as {
      characters: Array<{ id: string }>;
    };
    expect(listBody.characters).toHaveLength(MAX_CHARACTERS_PER_ACCOUNT);
  });

  test("assigns class-specific base combat stats on character creation", async () => {
    const token = await signupAndGetToken(app, "player6@example.com");

    const knightResponse = await app.fetch(
      createJsonRequest("/characters", "POST", token, {
        nickname: "ShieldOne",
        class: "knight",
      }),
    );
    expect(knightResponse.status).toBe(201);

    const mageResponse = await app.fetch(
      createJsonRequest("/characters", "POST", token, {
        nickname: "SparkTwo",
        class: "mage",
      }),
    );
    expect(mageResponse.status).toBe(201);

    const rows = app.db
      .query<
        {
          class: string;
          max_hp: number;
          base_damage: number;
          base_attack_speed_ms: number;
          base_attack_range: number;
        },
        []
      >(
        `SELECT class, max_hp, base_damage, base_attack_speed_ms, base_attack_range
         FROM characters
         WHERE nickname IN ('ShieldOne', 'SparkTwo')
         ORDER BY class ASC`,
      )
      .all();

    expect(rows).toHaveLength(2);
    const knight = rows.find((row) => row.class === "knight");
    const mage = rows.find((row) => row.class === "mage");
    expect(knight).toEqual({
      class: "knight",
      max_hp: 180,
      base_damage: 24,
      base_attack_speed_ms: 600,
      base_attack_range: 60,
    });
    expect(mage).toEqual({
      class: "mage",
      max_hp: 110,
      base_damage: 18,
      base_attack_speed_ms: 820,
      base_attack_range: 360,
    });
  });

  test("assigns full class starter loadout on character creation", async () => {
    const token = await signupAndGetToken(app, "player7@example.com");

    const knightResponse = await app.fetch(
      createJsonRequest("/characters", "POST", token, {
        nickname: "StarterKnight",
        class: "knight",
      }),
    );
    expect(knightResponse.status).toBe(201);

    const mageResponse = await app.fetch(
      createJsonRequest("/characters", "POST", token, {
        nickname: "StarterMage",
        class: "mage",
      }),
    );
    expect(mageResponse.status).toBe(201);

    const rows = app.db
      .query<
        {
          nickname: string;
          item_definition_id: string;
          slot_kind: string;
          slot_index: number | null;
        },
        []
      >(
        `SELECT
           c.nickname,
           i.item_definition_id,
           i.slot_kind,
           i.slot_index
         FROM character_inventory i
         INNER JOIN characters c
           ON c.id = i.character_id
         WHERE c.nickname IN ('StarterKnight', 'StarterMage')
         ORDER BY
           c.nickname ASC,
           CASE
             WHEN i.slot_kind = 'weapon' THEN -1
             ELSE i.slot_index
           END ASC`,
      )
      .all();

    expect(rows).toEqual([
      {
        nickname: "StarterKnight",
        item_definition_id: "training_sword",
        slot_kind: "weapon",
        slot_index: null,
      },
      {
        nickname: "StarterKnight",
        item_definition_id: "iron_broadsword",
        slot_kind: "bag",
        slot_index: 0,
      },
      {
        nickname: "StarterKnight",
        item_definition_id: "runed_greatsword",
        slot_kind: "bag",
        slot_index: 1,
      },
      {
        nickname: "StarterMage",
        item_definition_id: "training_wand",
        slot_kind: "weapon",
        slot_index: null,
      },
      {
        nickname: "StarterMage",
        item_definition_id: "adept_focus_wand",
        slot_kind: "bag",
        slot_index: 0,
      },
      {
        nickname: "StarterMage",
        item_definition_id: "stormweave_rod",
        slot_kind: "bag",
        slot_index: 1,
      },
    ]);
  });
});
