import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { type AppInstance, createApp } from "../app";

const TEST_SECRET = "test-jwt-secret-at-least-32-characters-long";
const ADMIN_TOKEN = "admin-test-token";

function adminRequest(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: unknown,
): Request {
  const headers = new Headers({
    authorization: `Bearer ${ADMIN_TOKEN}`,
  });
  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }

  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("admin item routes", () => {
  let app: AppInstance;
  const previousEnabled = process.env.ADMIN_API_ENABLED;
  const previousToken = process.env.ADMIN_API_BEARER_TOKEN;

  beforeEach(() => {
    process.env.ADMIN_API_ENABLED = "1";
    process.env.ADMIN_API_BEARER_TOKEN = ADMIN_TOKEN;

    app = createApp({
      config: {
        dbPath: ":memory:",
        jwtSecret: TEST_SECRET,
      },
    });
  });

  afterEach(() => {
    app.close();
    process.env.ADMIN_API_ENABLED = previousEnabled;
    process.env.ADMIN_API_BEARER_TOKEN = previousToken;
  });

  test("list items includes weapon attack metadata columns", async () => {
    const response = await app.fetch(adminRequest("/admin/items", "GET"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      items: Array<{
        id: string;
        weaponStyle: string | null;
        attackPatternId: string | null;
      }>;
    };

    const trainingSword = body.items.find(
      (item) => item.id === "training_sword",
    );
    expect(trainingSword?.weaponStyle).toBe("sword");
    expect(trainingSword?.attackPatternId).toBe("sword_cleave");
  });

  test("create weapon defaults style and attack pattern when omitted", async () => {
    const response = await app.fetch(
      adminRequest("/admin/items", "POST", {
        id: "test_wand",
        name: "Test Wand",
        iconKey: "training_wand",
        type: "weapon",
        classRequirement: "mage",
        minLevelToEquip: 1,
        weaponDamageFlat: 8,
        weaponRangeFlat: 20,
        weaponSpeedPercent: 5,
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      item: {
        weaponStyle: string | null;
        attackPatternId: string | null;
        attackProjectileCount: number | null;
      };
    };

    expect(body.item.weaponStyle).toBe("wand");
    expect(body.item.attackPatternId).toBe("wand_multishot");
    expect(body.item.attackProjectileCount).toBe(3);
  });

  test("update non-weapon coerces attack metadata to null", async () => {
    const response = await app.fetch(
      adminRequest("/admin/items/training_sword", "PUT", {
        id: "training_sword",
        name: "Training Sword",
        iconKey: "training_sword",
        type: "misc",
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      item: {
        type: string;
        weaponStyle: string | null;
        attackPatternId: string | null;
      };
    };

    expect(body.item.type).toBe("misc");
    expect(body.item.weaponStyle).toBeNull();
    expect(body.item.attackPatternId).toBeNull();
  });

  test("create armor clamps armor mitigation fields and clears weapon metadata", async () => {
    const response = await app.fetch(
      adminRequest("/admin/items", "POST", {
        id: "test_plate",
        name: "Test Plate",
        iconKey: "aegis_plate",
        type: "armor",
        classRequirement: "knight",
        minLevelToEquip: 1,
        armorMaxHpFlat: 25,
        armorDamageReductionPercent: 99,
        weaponStyle: "sword",
        attackPatternId: "sword_cleave",
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      item: {
        type: string;
        armorMaxHpFlat: number | null;
        armorDamageReductionPercent: number | null;
        weaponStyle: string | null;
        attackPatternId: string | null;
      };
    };

    expect(body.item.type).toBe("armor");
    expect(body.item.armorMaxHpFlat).toBe(25);
    expect(body.item.armorDamageReductionPercent).toBe(50);
    expect(body.item.weaponStyle).toBeNull();
    expect(body.item.attackPatternId).toBeNull();
  });

  test("item icon catalog supports create/update/delete when unused", async () => {
    const createResponse = await app.fetch(
      adminRequest("/admin/item-icons", "POST", {
        key: "quest_scroll",
        name: "Quest Scroll",
      }),
    );
    expect(createResponse.status).toBe(200);

    const updateResponse = await app.fetch(
      adminRequest("/admin/item-icons/quest_scroll", "PUT", {
        name: "Ancient Quest Scroll",
      }),
    );
    expect(updateResponse.status).toBe(200);
    const updatedBody = (await updateResponse.json()) as {
      icon: { key: string; name: string; itemUsageCount: number };
    };
    expect(updatedBody.icon).toEqual({
      key: "quest_scroll",
      name: "Ancient Quest Scroll",
      itemUsageCount: 0,
    });

    const deleteResponse = await app.fetch(
      adminRequest("/admin/item-icons/quest_scroll", "DELETE"),
    );
    expect(deleteResponse.status).toBe(204);
  });

  test("delete item icon returns 409 when referenced by items", async () => {
    const response = await app.fetch(
      adminRequest("/admin/item-icons/training_sword", "DELETE"),
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: string;
      itemUsageCount: number;
    };
    expect(body.error).toBe("Item icon is in use by items.");
    expect(body.itemUsageCount).toBeGreaterThan(0);
  });

  test("create item rejects unknown icon key", async () => {
    const response = await app.fetch(
      adminRequest("/admin/items", "POST", {
        id: "broken_item",
        name: "Broken Item",
        iconKey: "missing_icon",
        type: "misc",
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Invalid payload. Unknown icon key.");
  });
});
