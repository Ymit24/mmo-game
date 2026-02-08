import { describe, expect, test } from "bun:test";
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
        worldId: "hub-alpha",
        characterId: "character-1",
      }),
    );

    expect(socket.closed).toBe(true);
    const message = parseLastMessage(socket);
    expect(message.type).toBe("auth.error");
    db.close();
  });
});
