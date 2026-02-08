import { afterEach, describe, expect, test } from "bun:test";
import {
  HUB_ALPHA_MAP,
  PLAYER_COLLIDER_SIZE,
  type PlayerInputState,
  type ServerToClientMessage,
  findSpawnPoint,
  positionCollidesWithMap,
} from "@mmo/shared";
import type { ServerWebSocket } from "bun";

import { type RealtimeSocketData, WorldManager } from "./world";

interface MockSocket {
  data: RealtimeSocketData;
  sent: string[];
  send: (message: string) => void;
}

function createMockSocket(
  manager: WorldManager,
  userId: string,
  characterId: string,
): MockSocket {
  const socket: MockSocket = {
    data: manager.createSocketData(),
    sent: [],
    send(message: string) {
      this.sent.push(message);
    },
  };

  socket.data.session.userId = userId;
  socket.data.session.characterId = characterId;

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

describe("world manager", () => {
  const cleanup: Array<() => void> = [];

  afterEach(() => {
    for (const dispose of cleanup.splice(0)) {
      dispose();
    }
  });

  test("join sends immediate snapshot containing already connected players", () => {
    const manager = new WorldManager();
    const socketA = createMockSocket(manager, "user-a", "player-a");
    const socketB = createMockSocket(manager, "user-b", "player-b");

    manager.joinWorld(
      asServerSocket(socketA),
      HUB_ALPHA_MAP.id,
      "player-a",
      "Alpha",
      "knight",
      "#E8A832",
    );
    manager.joinWorld(
      asServerSocket(socketB),
      HUB_ALPHA_MAP.id,
      "player-b",
      "Beta",
      "mage",
      "#22D3EE",
    );

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

  test("join does not emit world.playerJoined for the joining player", () => {
    const manager = new WorldManager();
    const socket = createMockSocket(manager, "user-a", "player-a");

    manager.joinWorld(
      asServerSocket(socket),
      HUB_ALPHA_MAP.id,
      "player-a",
      "Alpha",
      "knight",
      "#E8A832",
    );
    cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

    const joinEvents = parseMessages(socket).filter(
      (message) => message.type === "world.playerJoined",
    );
    expect(joinEvents).toHaveLength(0);
  });

  test("spawn point is outside collision geometry", () => {
    const spawn = findSpawnPoint(HUB_ALPHA_MAP, HUB_ALPHA_MAP.playerSpawnId);
    expect(spawn).toBeDefined();

    if (!spawn) {
      throw new Error("spawn not found");
    }

    expect(
      positionCollidesWithMap(spawn, HUB_ALPHA_MAP, PLAYER_COLLIDER_SIZE),
    ).toBe(false);
  });

  test("applyInput returns authoritative player.state with moved position", () => {
    const manager = new WorldManager();
    const socket = createMockSocket(manager, "user-a", "player-a");

    const spawn = manager.joinWorld(
      asServerSocket(socket),
      HUB_ALPHA_MAP.id,
      "player-a",
      "Alpha",
      "knight",
      "#E8A832",
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
    const socket = createMockSocket(manager, "user-a", "player-a");

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

  test("acknowledgeDrop rejects non-finite coordinates", () => {
    const manager = new WorldManager();
    const socket = createMockSocket(manager, "user-a", "player-a");

    manager.acknowledgeDrop(asServerSocket(socket), {
      type: "inventory.drop",
      payload: {
        itemId: "health_potion",
        quantity: 1,
        position: { x: Number.NaN, y: 300 },
      },
    });

    const response = parseMessages(socket)[0];
    expect(response?.type).toBe("error");
  });

  test("closing an old connection does not remove a newer connection for the same player", () => {
    const manager = new WorldManager();
    const oldSocket = createMockSocket(manager, "user-a", "player-a");
    const newSocket = createMockSocket(manager, "user-a", "player-a");

    manager.joinWorld(
      asServerSocket(oldSocket),
      HUB_ALPHA_MAP.id,
      "player-a",
      "Alpha",
      "knight",
      "#E8A832",
    );
    manager.joinWorld(
      asServerSocket(newSocket),
      HUB_ALPHA_MAP.id,
      "player-a",
      "Alpha",
      "knight",
      "#E8A832",
    );

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

  test("diagonal movement slides along obstacle instead of full stop", () => {
    const manager = new WorldManager();
    const socket = createMockSocket(manager, "user-a", "player-a");

    manager.joinWorld(
      asServerSocket(socket),
      HUB_ALPHA_MAP.id,
      "player-a",
      "Alpha",
      "knight",
      "#E8A832",
    );
    cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

    socket.sent = [];

    for (let sequence = 1; sequence <= 20; sequence += 1) {
      manager.applyInput(asServerSocket(socket), {
        type: "player.input",
        sequence,
        dtMs: 80,
        input: {
          up: false,
          down: true,
          left: false,
          right: true,
        },
      });
    }

    const states = parseMessages(socket).filter(
      (
        message,
      ): message is Extract<ServerToClientMessage, { type: "player.state" }> =>
        message.type === "player.state",
    );

    expect(states.length).toBeGreaterThan(0);

    const first = states[0];
    const last = states[states.length - 1];

    if (!first || !last) {
      throw new Error("missing player.state payloads");
    }

    let plateauIndex = -1;
    for (let index = 1; index < states.length; index += 1) {
      if (states[index]?.position.y === states[index - 1]?.position.y) {
        plateauIndex = index;
        break;
      }
    }

    expect(plateauIndex).toBeGreaterThan(0);

    if (plateauIndex < 0) {
      throw new Error("expected to hit obstacle and plateau on y-axis");
    }

    const xAtPlateau = states[plateauIndex]?.position.x;
    const yAtPlateau = states[plateauIndex]?.position.y;

    expect(xAtPlateau).toBeDefined();
    expect(yAtPlateau).toBeDefined();

    if (xAtPlateau === undefined || yAtPlateau === undefined) {
      throw new Error("missing plateau state");
    }

    const progressedWhileSliding = states
      .slice(plateauIndex + 1)
      .some(
        (state) =>
          state.position.y === yAtPlateau && state.position.x > xAtPlateau,
      );

    expect(progressedWhileSliding).toBe(true);
    expect(last.position.x).toBeGreaterThan(first.position.x);
    expect(last.position.y).toBeGreaterThan(first.position.y);
  });
});
