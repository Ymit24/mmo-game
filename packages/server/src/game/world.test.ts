import { afterEach, describe, expect, test } from "bun:test";
import {
  HUB_ALPHA_MAP,
  type PlayerInputState,
  type ServerToClientMessage,
  findSpawnPoint,
} from "@mmo/shared";
import type { ServerWebSocket } from "bun";

import { type RealtimeSocketData, WorldManager } from "./world";

interface MockSocket {
  data: RealtimeSocketData;
  sent: string[];
  send: (message: string) => void;
}

function createMockSocket(manager: WorldManager, playerId: string): MockSocket {
  const socket: MockSocket = {
    data: manager.createSocketData(),
    sent: [],
    send(message: string) {
      this.sent.push(message);
    },
  };

  socket.data.session.playerId = playerId;

  return socket;
}

function asServerSocket(
  socket: MockSocket,
): ServerWebSocket<RealtimeSocketData> {
  return socket as unknown as ServerWebSocket<RealtimeSocketData>;
}

function parseMessages(socket: MockSocket): ServerToClientMessage[] {
  return socket.sent.map((raw) => JSON.parse(raw) as ServerToClientMessage);
}

function collides(position: { x: number; y: number }): boolean {
  for (const shape of HUB_ALPHA_MAP.collisions) {
    if (shape.type === "rect") {
      const insideRect =
        position.x >= shape.x &&
        position.x <= shape.x + shape.width &&
        position.y >= shape.y &&
        position.y <= shape.y + shape.height;

      if (insideRect) {
        return true;
      }
      continue;
    }

    const dx = position.x - shape.x;
    const dy = position.y - shape.y;
    if (dx * dx + dy * dy <= shape.radius * shape.radius) {
      return true;
    }
  }

  return false;
}

describe("world manager", () => {
  const cleanup: Array<() => void> = [];

  afterEach(() => {
    for (const dispose of cleanup.splice(0)) {
      dispose();
    }
  });

  test("join sends immediate snapshot containing already connected players", () => {
    const manager = new WorldManager();
    const socketA = createMockSocket(manager, "player-a");
    const socketB = createMockSocket(manager, "player-b");

    manager.joinWorld(asServerSocket(socketA), HUB_ALPHA_MAP.id, "player-a");
    manager.joinWorld(asServerSocket(socketB), HUB_ALPHA_MAP.id, "player-b");

    cleanup.push(() => manager.leaveWorld(asServerSocket(socketA)));
    cleanup.push(() => manager.leaveWorld(asServerSocket(socketB)));

    const messagesB = parseMessages(socketB);
    const joined = messagesB.find((message) => message.type === "world.joined");
    const snapshot = messagesB.find(
      (message) => message.type === "world.snapshot",
    );

    expect(joined?.type).toBe("world.joined");
    expect(snapshot?.type).toBe("world.snapshot");

    if (!snapshot || snapshot.type !== "world.snapshot") {
      throw new Error("missing world snapshot");
    }

    const playerIds = snapshot.payload.players
      .map((player) => player.id)
      .sort();
    expect(playerIds).toEqual(["player-a", "player-b"]);
  });

  test("spawn point is outside collision geometry", () => {
    const spawn = findSpawnPoint(HUB_ALPHA_MAP, HUB_ALPHA_MAP.playerSpawnId);
    expect(spawn).toBeDefined();

    if (!spawn) {
      throw new Error("spawn not found");
    }

    expect(collides(spawn)).toBe(false);
  });

  test("applyInput returns authoritative player.state with moved position", () => {
    const manager = new WorldManager();
    const socket = createMockSocket(manager, "player-a");

    const spawn = manager.joinWorld(
      asServerSocket(socket),
      HUB_ALPHA_MAP.id,
      "player-a",
    );
    cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

    expect(spawn).not.toBeNull();
    socket.sent = [];

    const input: PlayerInputState = {
      up: false,
      down: false,
      left: false,
      right: true,
    };

    manager.applyInput(asServerSocket(socket), {
      type: "player.input",
      sequence: 1,
      dtMs: 16,
      input,
    });

    const playerState = parseMessages(socket).find(
      (message) => message.type === "player.state",
    );

    expect(playerState?.type).toBe("player.state");

    if (!spawn || !playerState || playerState.type !== "player.state") {
      throw new Error("missing player.state payload");
    }

    expect(playerState.position.x).toBeGreaterThan(spawn.x);
    expect(playerState.lastProcessedInputSequence).toBe(1);
  });

  test("acknowledgeDrop validates payload and responds with error for invalid item", () => {
    const manager = new WorldManager();
    const socket = createMockSocket(manager, "player-a");

    manager.acknowledgeDrop(asServerSocket(socket), {
      type: "inventory.drop",
      payload: {
        itemId: " ",
        quantity: 1,
        position: { x: 200, y: 300 },
      },
    });

    const response = parseMessages(socket)[0];
    expect(response?.type).toBe("error");

    if (!response || response.type !== "error") {
      throw new Error("missing error response");
    }

    expect(response.error).toContain("Invalid drop payload");
  });

  test("closing an old connection does not remove a newer connection for the same player", () => {
    const manager = new WorldManager();
    const oldSocket = createMockSocket(manager, "player-a");
    const newSocket = createMockSocket(manager, "player-a");

    manager.joinWorld(asServerSocket(oldSocket), HUB_ALPHA_MAP.id, "player-a");
    manager.joinWorld(asServerSocket(newSocket), HUB_ALPHA_MAP.id, "player-a");

    manager.leaveWorld(asServerSocket(oldSocket));

    newSocket.sent = [];
    manager.applyInput(asServerSocket(newSocket), {
      type: "player.input",
      sequence: 1,
      dtMs: 16,
      input: {
        up: false,
        down: false,
        left: false,
        right: true,
      },
    });

    const playerState = parseMessages(newSocket).find(
      (message) => message.type === "player.state",
    );
    expect(playerState?.type).toBe("player.state");

    cleanup.push(() => manager.leaveWorld(asServerSocket(newSocket)));
  });
});
