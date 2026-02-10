import { describe, expect, test } from "bun:test";
import { getCharacterClassBaseCombatStats } from "@mmo/shared";
import type { ServerWebSocket } from "bun";

import { issueAccessToken } from "../auth/jwt";
import type { ServerConfig } from "../config";
import { createDatabase } from "../db";
import { createRealtimeGateway } from "./realtime";
import type { RealtimeSocketData } from "./world";

interface MockSocket {
  data: RealtimeSocketData;
  sent: string[];
  closed: boolean;
  send: (message: string) => void;
  close: () => void;
}

const baseConfig: ServerConfig = {
  jwtSecret: "test-jwt-secret-at-least-32-characters-long",
  jwtExpiresInSeconds: 60,
  dbPath: ":memory:",
};

function asServerSocket(
  socket: MockSocket,
): ServerWebSocket<RealtimeSocketData> {
  return socket as unknown as ServerWebSocket<RealtimeSocketData>;
}

function createMockSocket(
  sessionFactory: () => RealtimeSocketData,
): ServerWebSocket<RealtimeSocketData> & MockSocket {
  const socket: MockSocket = {
    data: sessionFactory(),
    sent: [],
    closed: false,
    send(message: string) {
      this.sent.push(message);
    },
    close() {
      this.closed = true;
    },
  };

  return socket as unknown as ServerWebSocket<RealtimeSocketData> & MockSocket;
}

function parseLastMessage(socket: MockSocket): {
  type: string;
  [k: string]: unknown;
} {
  const raw = socket.sent[socket.sent.length - 1];
  if (!raw) {
    throw new Error("missing socket message");
  }
  return JSON.parse(raw) as { type: string; [k: string]: unknown };
}

function parseMessages(
  socket: MockSocket,
): Array<{ type: string; [k: string]: unknown }> {
  return socket.sent.map(
    (raw) => JSON.parse(raw) as { type: string; [k: string]: unknown },
  );
}

describe("realtime gateway", () => {
  test("authenticates with minimal JWT claims", async () => {
    const db = createDatabase(":memory:");
    const gateway = createRealtimeGateway(baseConfig, db);
    const socket = createMockSocket(gateway.createSocketData);
    const token = await issueAccessToken({ sub: "player-a" }, baseConfig);

    await gateway.handlers.message(
      asServerSocket(socket),
      JSON.stringify({
        type: "auth.hello",
        token: token.token,
      }),
    );

    expect(socket.data.session.authenticated).toBe(true);
    const authMessage = parseLastMessage(socket);
    expect(authMessage.type).toBe("auth.ok");
    expect(authMessage.userId).toBeUndefined();
    db.close();
  });

  test("disconnects authenticated sockets after token expiry when processing messages", async () => {
    const db = createDatabase(":memory:");
    const gateway = createRealtimeGateway(baseConfig, db);
    const socket = createMockSocket(gateway.createSocketData);
    const token = await issueAccessToken({ sub: "player-a" }, baseConfig);

    await gateway.handlers.message(
      asServerSocket(socket),
      JSON.stringify({
        type: "auth.hello",
        token: token.token,
      }),
    );
    socket.data.session.authExpiresAtEpochMs = Date.now() - 1;

    await gateway.handlers.message(
      asServerSocket(socket),
      JSON.stringify({
        type: "world.join",
        worldId: "hub:alpha",
        characterId: "character-1",
      }),
    );

    expect(socket.closed).toBe(true);
    const message = parseLastMessage(socket);
    expect(message.type).toBe("auth.error");
    db.close();
  });

  test("sends inventory state after successful world join", async () => {
    const db = createDatabase(":memory:");
    const gateway = createRealtimeGateway(baseConfig, db);
    const socket = createMockSocket(gateway.createSocketData);
    const token = await issueAccessToken({ sub: "player-a" }, baseConfig);
    const now = new Date().toISOString();
    const baseStats = getCharacterClassBaseCombatStats("knight");

    db.query(
      `INSERT INTO users (
        id,
        email,
        password_hash,
        created_at,
        updated_at
      ) VALUES ('player-a', 'player-a@example.com', 'hash', ?1, ?2)`,
    ).run(now, now);
    db.query(
      `INSERT INTO characters (
        id,
        user_id,
        nickname,
        nickname_normalized,
        class,
        level,
        xp,
        max_hp,
        base_damage,
        base_attack_speed_ms,
        base_attack_range,
        created_at,
        updated_at
      ) VALUES ('character-1', 'player-a', 'Alpha', 'alpha', 'knight', 1, 0, ?1, ?2, ?3, ?4, ?5, ?6)`,
    ).run(
      baseStats.maxHp,
      baseStats.baseDamage,
      baseStats.baseAttackSpeedMs,
      baseStats.baseAttackRange,
      now,
      now,
    );
    db.query(
      `INSERT INTO character_inventory (
        id,
        character_id,
        item_definition_id,
        slot_kind,
        slot_index,
        created_at,
        updated_at
      ) VALUES ('inv-1', 'character-1', 'training_sword', 'bag', 0, ?1, ?2)`,
    ).run(now, now);

    await gateway.handlers.message(
      asServerSocket(socket),
      JSON.stringify({
        type: "auth.hello",
        token: token.token,
      }),
    );

    await gateway.handlers.message(
      asServerSocket(socket),
      JSON.stringify({
        type: "world.join",
        worldId: "hub:alpha",
        characterId: "character-1",
      }),
    );

    const messages = parseMessages(socket);
    const inventoryMessage = messages.find(
      (message) => message.type === "inventory.state",
    );
    expect(inventoryMessage?.type).toBe("inventory.state");
    expect(
      (inventoryMessage?.state as { bagSlots?: Array<{ id: string } | null> })
        ?.bagSlots?.length,
    ).toBe(9);
    expect(
      (inventoryMessage?.state as { bagSlots?: Array<{ id: string } | null> })
        ?.bagSlots?.[0]?.id,
    ).toBe("inv-1");
    db.close();
  });
});
