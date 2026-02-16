import { afterEach, describe, expect, test } from "bun:test";
import {
  type EnemyArchetype,
  HUB_ALPHA_MAP,
  PLAYER_COLLIDER_SIZE,
  type PlayerInputState,
  type ServerToClientMessage,
  WILDS_BETA_MAP,
  findSpawnPoint,
  positionCollidesWithMap,
} from "@mmo/shared";
import type { ServerWebSocket } from "bun";

import { createDatabase } from "../db";
import { findEnemyArchetypeById } from "./enemyArchetypeRepository";
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

function latestWorldSnapshot(
  socket: MockSocket,
): Extract<ServerToClientMessage, { type: "world.snapshot" }> | null {
  const snapshot = parseMessages(socket)
    .filter((message) => message.type === "world.snapshot")
    .at(-1);
  if (!snapshot || snapshot.type !== "world.snapshot") {
    return null;
  }
  return snapshot;
}

function enemiesOverlap(
  first: {
    position: { x: number; y: number };
    width: number;
    height: number;
  },
  second: {
    position: { x: number; y: number };
    width: number;
    height: number;
  },
): boolean {
  const firstLeft = first.position.x - first.width / 2;
  const firstRight = first.position.x + first.width / 2;
  const firstTop = first.position.y - first.height / 2;
  const firstBottom = first.position.y + first.height / 2;

  const secondLeft = second.position.x - second.width / 2;
  const secondRight = second.position.x + second.width / 2;
  const secondTop = second.position.y - second.height / 2;
  const secondBottom = second.position.y + second.height / 2;

  return (
    firstLeft < secondRight &&
    firstRight > secondLeft &&
    firstTop < secondBottom &&
    firstBottom > secondTop
  );
}

function moveRightInput(): PlayerInputState {
  return {
    up: false,
    down: false,
    left: false,
    right: true,
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createTestArchetype(
  id: string,
  overrides: Partial<EnemyArchetype> = {},
): EnemyArchetype {
  return {
    id,
    name: id,
    level: 1,
    xpReward: 16,
    maxHealth: 100,
    damage: 10,
    speed: 120,
    detectionRadius: 280,
    leashRadius: 420,
    attackSpeedMs: 1000,
    meleeRange: 42,
    rangedRange: 220,
    canMelee: true,
    canRanged: false,
    visualWidth: 34,
    visualHeight: 24,
    colorHex: "#22d3ee",
    ...overrides,
  };
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

  test("rejoin in same world with a different character replaces previous character entry", () => {
    const manager = new WorldManager();
    const socket = createMockSocket(manager, "user-a", "character-a");

    manager.joinWorld(
      asServerSocket(socket),
      HUB_ALPHA_MAP.id,
      "character-a",
      "Alpha",
      "knight",
      "#E8A832",
    );
    manager.joinWorld(
      asServerSocket(socket),
      HUB_ALPHA_MAP.id,
      "character-b",
      "Bravo",
      "mage",
      "#22D3EE",
    );
    cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

    const snapshot = parseMessages(socket)
      .filter((message) => message.type === "world.snapshot")
      .at(-1);

    expect(snapshot?.type).toBe("world.snapshot");
    if (!snapshot || snapshot.type !== "world.snapshot") {
      throw new Error("missing world snapshot");
    }

    const playerIds = snapshot.payload.players.map((player) => player.id);
    expect(playerIds).toEqual(["character-b"]);
  });

  test("invalid world join does not remove player from current world", () => {
    const manager = new WorldManager();
    const socket = createMockSocket(manager, "user-a", "character-a");

    manager.joinWorld(
      asServerSocket(socket),
      HUB_ALPHA_MAP.id,
      "character-a",
      "Alpha",
      "knight",
      "#E8A832",
    );

    const invalidJoin = manager.joinWorld(
      asServerSocket(socket),
      "missing-world",
      "character-a",
      "Alpha",
      "knight",
      "#E8A832",
    );
    expect(invalidJoin).toBeNull();

    socket.sent = [];
    manager.applyInput(asServerSocket(socket), {
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

    const playerState = parseMessages(socket).find(
      (message) => message.type === "player.state",
    );
    expect(playerState?.type).toBe("player.state");

    cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));
  });

  test("portal travel emits world.transitioning before world.joined for destination world", () => {
    const manager = new WorldManager();
    const socket = createMockSocket(manager, "user-a", "character-a");

    manager.joinWorld(
      asServerSocket(socket),
      HUB_ALPHA_MAP.id,
      "character-a",
      "Alpha",
      "knight",
      "#E8A832",
    );

    let travelJoined = false;
    for (let sequence = 1; sequence <= 40; sequence += 1) {
      manager.applyInput(asServerSocket(socket), {
        type: "player.input",
        sequence,
        dtMs: 80,
        input: {
          up: true,
          down: false,
          left: false,
          right: false,
        },
      });

      const lastJoined = parseMessages(socket)
        .filter((message) => message.type === "world.joined")
        .at(-1);
      if (
        lastJoined?.type === "world.joined" &&
        lastJoined.worldId !== HUB_ALPHA_MAP.id
      ) {
        travelJoined = true;
        break;
      }
    }

    expect(travelJoined).toBe(true);
    const messages = parseMessages(socket);
    const transitionIndex = messages.findIndex(
      (message) => message.type === "world.transitioning",
    );
    const destinationJoinIndex = messages.findIndex(
      (message) =>
        message.type === "world.joined" &&
        message.worldId === WILDS_BETA_MAP.id,
    );
    expect(transitionIndex).toBeGreaterThan(-1);
    expect(destinationJoinIndex).toBeGreaterThan(transitionIndex);
    expect(socket.data.session.worldId).toBe(WILDS_BETA_MAP.id);
    cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));
  });

  test("players remain isolated across separate world instances", () => {
    const manager = new WorldManager();
    const socketA = createMockSocket(manager, "user-a", "player-a");
    const socketB = createMockSocket(manager, "user-b", "player-b");
    const socketC = createMockSocket(manager, "user-c", "player-c");

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
    socketA.sent = [];
    socketB.sent = [];

    manager.joinWorld(
      asServerSocket(socketC),
      WILDS_BETA_MAP.id,
      "player-c",
      "Gamma",
      "knight",
      "#E8A832",
    );

    expect(
      parseMessages(socketA).every((message) => {
        if (message.type !== "world.playerJoined") {
          return true;
        }
        return message.player.id !== "player-c";
      }),
    ).toBe(true);
    expect(
      parseMessages(socketB).every((message) => {
        if (message.type !== "world.playerJoined") {
          return true;
        }
        return message.player.id !== "player-c";
      }),
    ).toBe(true);

    const snapshotC = parseMessages(socketC).find(
      (message) => message.type === "world.snapshot",
    );
    expect(snapshotC?.type).toBe("world.snapshot");
    if (!snapshotC || snapshotC.type !== "world.snapshot") {
      throw new Error("missing world snapshot");
    }
    expect(snapshotC.payload.worldId).toBe(WILDS_BETA_MAP.id);
    expect(snapshotC.payload.players.map((player) => player.id)).toEqual([
      "player-c",
    ]);

    cleanup.push(() => manager.leaveWorld(asServerSocket(socketA)));
    cleanup.push(() => manager.leaveWorld(asServerSocket(socketB)));
    cleanup.push(() => manager.leaveWorld(asServerSocket(socketC)));
  });

  test("portal exit offset avoids immediate bounce on the next input tick", () => {
    const manager = new WorldManager();
    const socket = createMockSocket(manager, "user-a", "character-a");

    manager.joinWorld(
      asServerSocket(socket),
      HUB_ALPHA_MAP.id,
      "character-a",
      "Alpha",
      "knight",
      "#E8A832",
    );

    for (let sequence = 1; sequence <= 40; sequence += 1) {
      manager.applyInput(asServerSocket(socket), {
        type: "player.input",
        sequence,
        dtMs: 80,
        input: {
          up: true,
          down: false,
          left: false,
          right: false,
        },
      });
    }

    const joinedMessages = parseMessages(socket).filter(
      (message) => message.type === "world.joined",
    );
    expect(joinedMessages).toHaveLength(2);
    const destination = joinedMessages[1];
    if (!destination || destination.type !== "world.joined") {
      throw new Error("missing second world join");
    }
    expect(destination.worldId).toBe(WILDS_BETA_MAP.id);

    socket.sent = [];
    manager.applyInput(asServerSocket(socket), {
      type: "player.input",
      sequence: 99,
      dtMs: 16,
      input: {
        up: false,
        down: false,
        left: false,
        right: true,
      },
    });

    const immediateRejoin = parseMessages(socket).find(
      (message) =>
        message.type === "world.joined" && message.worldId === HUB_ALPHA_MAP.id,
    );
    expect(immediateRejoin).toBeUndefined();

    cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));
  });

  test("player can return through the opposite portal immediately after transition", () => {
    const manager = new WorldManager();
    const socket = createMockSocket(manager, "user-a", "character-a");

    manager.joinWorld(
      asServerSocket(socket),
      WILDS_BETA_MAP.id,
      "character-a",
      "Alpha",
      "knight",
      "#E8A832",
    );

    let traveledToHub = false;
    for (let sequence = 1; sequence <= 20; sequence += 1) {
      manager.applyInput(asServerSocket(socket), {
        type: "player.input",
        sequence,
        dtMs: 80,
        input: {
          up: false,
          down: false,
          left: true,
          right: false,
        },
      });

      const inHubNow = parseMessages(socket).some(
        (message) =>
          message.type === "world.joined" &&
          message.worldId === HUB_ALPHA_MAP.id,
      );
      if (inHubNow) {
        traveledToHub = true;
        break;
      }
    }

    expect(traveledToHub).toBe(true);

    socket.sent = [];
    for (let sequence = 99; sequence <= 150; sequence += 1) {
      manager.applyInput(asServerSocket(socket), {
        type: "player.input",
        sequence,
        dtMs: 80,
        input: {
          up: true,
          down: false,
          left: false,
          right: false,
        },
      });

      const hasReturnedToWilds = parseMessages(socket).some(
        (message) =>
          message.type === "world.joined" &&
          message.worldId === WILDS_BETA_MAP.id,
      );
      if (hasReturnedToWilds) {
        break;
      }
    }

    const returnedToWilds = parseMessages(socket).some(
      (message) =>
        message.type === "world.joined" &&
        message.worldId === WILDS_BETA_MAP.id,
    );
    expect(returnedToWilds).toBe(true);

    cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));
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

    const input: PlayerInputState = moveRightInput();

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

  test("updatePlayerWeaponModifiers recalculates effective combat stats", () => {
    const manager = new WorldManager();
    const socket = createMockSocket(manager, "user-a", "player-a");

    manager.joinWorld(
      asServerSocket(socket),
      HUB_ALPHA_MAP.id,
      "player-a",
      "Alpha",
      "knight",
      "#E8A832",
      {
        baseStats: {
          maxHp: 180,
          baseDamage: 24,
          baseAttackSpeedMs: 600,
          baseAttackRange: 60,
        },
      },
    );
    cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

    manager.updatePlayerWeaponModifiers(asServerSocket(socket), {
      damageFlat: 10,
      rangeFlat: 20,
      speedPercent: 10,
    });

    expect(socket.data.session.characterBaseDamage).toBe(34);
    expect(socket.data.session.characterBaseAttackRange).toBe(80);
    expect(socket.data.session.characterBaseAttackSpeedMs).toBe(540);
  });

  test("updatePlayerWeaponModifiers recalculates active attack cooldown", () => {
    const originalDateNow = Date.now;
    let nowMs = 1_000;
    Date.now = () => nowMs;

    try {
      const manager = new WorldManager();
      const socket = createMockSocket(manager, "user-a", "player-a");

      manager.joinWorld(
        asServerSocket(socket),
        WILDS_BETA_MAP.id,
        "player-a",
        "Alpha",
        "knight",
        "#E8A832",
        {
          spawnOverride: { x: 1_220, y: 700 },
          baseStats: {
            maxHp: 180,
            baseDamage: 24,
            baseAttackSpeedMs: 1_000,
            baseAttackRange: 60,
          },
          combatStats: {
            maxHealth: 180,
            currentHealth: 180,
            baseDamage: 24,
            baseAttackSpeedMs: 1_000,
            baseAttackRange: 60,
          },
        },
      );
      cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

      socket.sent = [];
      manager.applyAttack(asServerSocket(socket), {
        type: "player.attack",
        aim: { x: 1_260, y: 700 },
      });
      const firstAttack = parseMessages(socket).find(
        (message) => message.type === "combat.attackPerformed",
      );
      expect(firstAttack?.type).toBe("combat.attackPerformed");

      nowMs = 1_300;
      manager.updatePlayerWeaponModifiers(asServerSocket(socket), {
        speedPercent: -50,
      });
      expect(socket.data.session.characterBaseAttackSpeedMs).toBe(1500);

      nowMs = 2_200;
      socket.sent = [];
      manager.applyAttack(asServerSocket(socket), {
        type: "player.attack",
        aim: { x: 1_260, y: 700 },
      });
      const cooldownDenied = parseMessages(socket).find(
        (message) => message.type === "combat.attackDenied",
      );
      expect(cooldownDenied?.type).toBe("combat.attackDenied");
      if (!cooldownDenied || cooldownDenied.type !== "combat.attackDenied") {
        throw new Error("missing combat.attackDenied message");
      }
      expect(cooldownDenied.reason).toBe("cooldown");

      nowMs = 2_500;
      socket.sent = [];
      manager.applyAttack(asServerSocket(socket), {
        type: "player.attack",
        aim: { x: 1_260, y: 700 },
      });
      const secondAttack = parseMessages(socket).find(
        (message) => message.type === "combat.attackPerformed",
      );
      expect(secondAttack?.type).toBe("combat.attackPerformed");
    } finally {
      Date.now = originalDateNow;
    }
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
      {
        spawnOverride: {
          x: 900,
          y: 500,
        },
      },
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

  test("world snapshots include spawned enemies for worlds with spawners", async () => {
    const archetypes = new Map<string, EnemyArchetype>([
      ["slime_scout", createTestArchetype("slime_scout")],
      ["briar_wolf", createTestArchetype("briar_wolf")],
    ]);
    const manager = new WorldManager(
      (archetypeId) => archetypes.get(archetypeId) ?? null,
    );
    const socket = createMockSocket(manager, "user-a", "player-a");

    manager.joinWorld(
      asServerSocket(socket),
      WILDS_BETA_MAP.id,
      "player-a",
      "Alpha",
      "knight",
      "#E8A832",
      {
        spawnOverride: { x: 350, y: 700 },
      },
    );
    cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

    await wait(250);

    const snapshot = latestWorldSnapshot(socket);
    expect(snapshot?.type).toBe("world.snapshot");
    expect(snapshot?.payload.enemies.length ?? 0).toBeGreaterThan(0);
  });

  test("spawners honor respawn cadence while growing population", async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;

    try {
      const archetypes = new Map<string, EnemyArchetype>([
        [
          "slime_scout",
          createTestArchetype("slime_scout", { detectionRadius: 1 }),
        ],
        [
          "briar_wolf",
          createTestArchetype("briar_wolf", { detectionRadius: 1 }),
        ],
      ]);
      const manager = new WorldManager(
        (archetypeId) => archetypes.get(archetypeId) ?? null,
      );
      const socket = createMockSocket(manager, "user-a", "player-a");

      manager.joinWorld(
        asServerSocket(socket),
        WILDS_BETA_MAP.id,
        "player-a",
        "Alpha",
        "knight",
        "#E8A832",
        {
          spawnOverride: { x: 350, y: 700 },
        },
      );
      cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

      await wait(700);
      const early = latestWorldSnapshot(socket);
      expect(early?.payload.enemies.length).toBe(2);

      await wait(2_100);
      const later = latestWorldSnapshot(socket);
      expect(later?.payload.enemies.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(later?.payload.enemies.length ?? 0).toBeLessThanOrEqual(4);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("spawned enemies keep their own leash anchor instead of collapsing to spawner center", async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;

    try {
      const archetypes = new Map<string, EnemyArchetype>([
        [
          "slime_scout",
          createTestArchetype("slime_scout", {
            speed: 220,
            detectionRadius: 1,
            leashRadius: 1,
          }),
        ],
        [
          "briar_wolf",
          createTestArchetype("briar_wolf", {
            detectionRadius: 1,
            leashRadius: 1,
          }),
        ],
      ]);
      const manager = new WorldManager(
        (archetypeId) => archetypes.get(archetypeId) ?? null,
      );
      const socket = createMockSocket(manager, "user-a", "player-a");
      const slimeSpawner = WILDS_BETA_MAP.enemySpawners.find(
        (spawner) => spawner.id === "wilds_center_slime",
      );
      expect(slimeSpawner).toBeDefined();

      if (!slimeSpawner) {
        throw new Error("expected wilds_center_slime spawner");
      }

      manager.joinWorld(
        asServerSocket(socket),
        WILDS_BETA_MAP.id,
        "player-a",
        "Alpha",
        "knight",
        "#E8A832",
        {
          spawnOverride: { x: 350, y: 700 },
        },
      );
      cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

      await wait(2_900);
      const snapshot = latestWorldSnapshot(socket);
      expect(snapshot?.type).toBe("world.snapshot");

      const slimes = snapshot?.payload.enemies.filter(
        (enemy) => enemy.archetypeId === "slime_scout",
      );
      expect(slimes?.length ?? 0).toBeGreaterThanOrEqual(2);

      const farIdleSlime = slimes?.find((enemy) => {
        const distanceFromSpawnerCenter = Math.hypot(
          enemy.position.x - slimeSpawner.x,
          enemy.position.y - slimeSpawner.y,
        );

        return distanceFromSpawnerCenter >= 40 && enemy.state === "idle";
      });

      expect(farIdleSlime).toBeDefined();
    } finally {
      Math.random = originalRandom;
    }
  });

  test("enemy AI enters chasing or attacking state when a player is nearby", async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;

    try {
      const archetypes = new Map<string, EnemyArchetype>([
        ["slime_scout", createTestArchetype("slime_scout", { speed: 160 })],
        ["briar_wolf", createTestArchetype("briar_wolf", { speed: 160 })],
      ]);
      const manager = new WorldManager(
        (archetypeId) => archetypes.get(archetypeId) ?? null,
      );
      const socket = createMockSocket(manager, "user-a", "player-a");

      manager.joinWorld(
        asServerSocket(socket),
        WILDS_BETA_MAP.id,
        "player-a",
        "Alpha",
        "knight",
        "#E8A832",
        {
          spawnOverride: { x: 1280, y: 700 },
        },
      );
      cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

      await wait(700);
      const snapshot = latestWorldSnapshot(socket);
      const hasAggroState = snapshot?.payload.enemies.some(
        (enemy) => enemy.state === "chasing" || enemy.state === "attacking",
      );
      expect(hasAggroState).toBe(true);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("player movement is blocked by enemy collision in authoritative simulation", async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;

    try {
      const archetypes = new Map<string, EnemyArchetype>([
        [
          "slime_scout",
          createTestArchetype("slime_scout", {
            detectionRadius: 1,
            leashRadius: 1,
            visualWidth: 40,
            visualHeight: 40,
          }),
        ],
        [
          "briar_wolf",
          createTestArchetype("briar_wolf", {
            detectionRadius: 1,
            leashRadius: 1,
            visualWidth: 40,
            visualHeight: 40,
          }),
        ],
      ]);
      const manager = new WorldManager(
        (archetypeId) => archetypes.get(archetypeId) ?? null,
      );
      const socket = createMockSocket(manager, "user-a", "player-a");

      manager.joinWorld(
        asServerSocket(socket),
        WILDS_BETA_MAP.id,
        "player-a",
        "Alpha",
        "knight",
        "#E8A832",
        {
          spawnOverride: { x: 1280, y: 700 },
        },
      );
      cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

      await wait(700);
      socket.sent = [];

      for (let sequence = 1; sequence <= 4; sequence += 1) {
        manager.applyInput(asServerSocket(socket), {
          type: "player.input",
          sequence,
          dtMs: 80,
          input: {
            up: false,
            down: false,
            left: true,
            right: false,
          },
        });
      }

      const states = parseMessages(socket).filter(
        (
          message,
        ): message is Extract<
          ServerToClientMessage,
          { type: "player.state" }
        > => message.type === "player.state",
      );
      const last = states.at(-1);
      expect(last?.type).toBe("player.state");
      expect(last?.position.x ?? 0).toBeGreaterThan(1_250);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("enemy movement avoids overlapping with other enemies while pathing", async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;

    try {
      const archetypes = new Map<string, EnemyArchetype>([
        [
          "slime_scout",
          createTestArchetype("slime_scout", {
            speed: 220,
            detectionRadius: 600,
            leashRadius: 800,
            canMelee: false,
            canRanged: false,
            visualWidth: 40,
            visualHeight: 40,
          }),
        ],
        [
          "briar_wolf",
          createTestArchetype("briar_wolf", {
            detectionRadius: 1,
            leashRadius: 1,
          }),
        ],
      ]);
      const manager = new WorldManager(
        (archetypeId) => archetypes.get(archetypeId) ?? null,
      );
      const socket = createMockSocket(manager, "user-a", "player-a");

      manager.joinWorld(
        asServerSocket(socket),
        WILDS_BETA_MAP.id,
        "player-a",
        "Alpha",
        "knight",
        "#E8A832",
        {
          spawnOverride: { x: 1_420, y: 700 },
        },
      );
      cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

      await wait(3_100);
      const snapshot = latestWorldSnapshot(socket);
      expect(snapshot?.type).toBe("world.snapshot");

      const slimes = snapshot?.payload.enemies.filter(
        (enemy) => enemy.archetypeId === "slime_scout",
      );
      expect(slimes?.length ?? 0).toBeGreaterThanOrEqual(2);

      let hasOverlap = false;
      for (let first = 0; first < (slimes?.length ?? 0); first += 1) {
        for (
          let second = first + 1;
          second < (slimes?.length ?? 0);
          second += 1
        ) {
          const a = slimes?.[first];
          const b = slimes?.[second];
          if (!a || !b) {
            continue;
          }

          if (enemiesOverlap(a, b)) {
            hasOverlap = true;
          }
        }
      }

      expect(hasOverlap).toBe(false);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("newly spawned enemies pick up tuned archetype values without restart", async () => {
    const db = createDatabase(":memory:");
    const originalRandom = Math.random;
    Math.random = () => 0;

    try {
      const manager = new WorldManager((archetypeId) =>
        findEnemyArchetypeById(db, archetypeId),
      );
      const socket = createMockSocket(manager, "user-a", "player-a");

      manager.joinWorld(
        asServerSocket(socket),
        WILDS_BETA_MAP.id,
        "player-a",
        "Alpha",
        "knight",
        "#E8A832",
        {
          spawnOverride: { x: 350, y: 700 },
        },
      );
      cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

      await wait(700);
      const firstSnapshot = latestWorldSnapshot(socket);
      const firstSlime = firstSnapshot?.payload.enemies.find(
        (enemy) => enemy.archetypeId === "slime_scout",
      );
      expect(firstSlime).toBeDefined();

      db.query(
        `UPDATE enemy_archetypes
         SET visual_width = ?1,
             updated_at = ?2
         WHERE id = ?3`,
      ).run(72, new Date().toISOString(), "slime_scout");

      await wait(2_200);
      const secondSnapshot = latestWorldSnapshot(socket);
      const hasUpdatedWidth = secondSnapshot?.payload.enemies.some(
        (enemy) => enemy.archetypeId === "slime_scout" && enemy.width === 72,
      );
      expect(hasUpdatedWidth).toBe(true);
    } finally {
      Math.random = originalRandom;
      db.close();
    }
  });

  test("safe-zone worlds deny player attacks", () => {
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
    manager.applyAttack(asServerSocket(socket), {
      type: "player.attack",
      aim: { x: 1_180, y: 520 },
    });

    const denial = parseMessages(socket).find(
      (message) => message.type === "combat.attackDenied",
    );
    expect(denial?.type).toBe("combat.attackDenied");
    if (!denial || denial.type !== "combat.attackDenied") {
      throw new Error("missing combat.attackDenied message");
    }
    expect(denial.reason).toBe("safe_zone");
  });

  test("player current health persists across portal travel", () => {
    const manager = new WorldManager();
    const socket = createMockSocket(manager, "user-a", "player-a");

    manager.joinWorld(
      asServerSocket(socket),
      HUB_ALPHA_MAP.id,
      "player-a",
      "Alpha",
      "knight",
      "#E8A832",
      {
        combatStats: {
          maxHealth: 120,
          currentHealth: 45,
          baseDamage: 20,
          baseAttackSpeedMs: 700,
          baseAttackRange: 80,
        },
      },
    );
    cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

    for (let sequence = 1; sequence <= 40; sequence += 1) {
      manager.applyInput(asServerSocket(socket), {
        type: "player.input",
        sequence,
        dtMs: 80,
        input: {
          up: true,
          down: false,
          left: false,
          right: false,
        },
      });
    }

    const destinationJoin = parseMessages(socket).find(
      (message) =>
        message.type === "world.joined" &&
        message.worldId === WILDS_BETA_MAP.id,
    );
    expect(destinationJoin?.type).toBe("world.joined");
    if (!destinationJoin || destinationJoin.type !== "world.joined") {
      throw new Error("missing destination world.joined message");
    }
    expect(destinationJoin.currentHealth).toBe(45);
    expect(destinationJoin.maxHealth).toBe(120);
  });

  test("melee attack can kill enemies in combat worlds", async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;

    try {
      const archetypes = new Map<string, EnemyArchetype>([
        [
          "slime_scout",
          createTestArchetype("slime_scout", {
            maxHealth: 20,
            detectionRadius: 1,
            leashRadius: 1,
          }),
        ],
        [
          "briar_wolf",
          createTestArchetype("briar_wolf", {
            detectionRadius: 1,
            leashRadius: 1,
          }),
        ],
      ]);
      const manager = new WorldManager(
        (archetypeId) => archetypes.get(archetypeId) ?? null,
      );
      const socket = createMockSocket(manager, "user-a", "player-a");

      manager.joinWorld(
        asServerSocket(socket),
        WILDS_BETA_MAP.id,
        "player-a",
        "Alpha",
        "knight",
        "#E8A832",
        {
          spawnOverride: { x: 1_220, y: 700 },
          combatStats: {
            maxHealth: 100,
            currentHealth: 100,
            baseDamage: 50,
            baseAttackSpeedMs: 600,
            baseAttackRange: 120,
          },
        },
      );
      cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

      await wait(300);
      const before = latestWorldSnapshot(socket);
      const target = before?.payload.enemies[0];
      expect(target).toBeDefined();
      if (!target) {
        throw new Error("expected at least one enemy");
      }

      socket.sent = [];
      manager.applyAttack(asServerSocket(socket), {
        type: "player.attack",
        aim: { x: target.position.x, y: target.position.y },
      });

      await wait(150);
      const after = latestWorldSnapshot(socket);
      const killed = after?.payload.enemies.every(
        (enemy) => enemy.id !== target.id,
      );
      expect(killed).toBe(true);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("enemy kill grants xp, levels up, and persists progression immediately", async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;

    try {
      const persistedUpdates: Array<{
        userId: string;
        characterId: string;
        level: number;
        xp: number;
      }> = [];
      const archetypes = new Map<string, EnemyArchetype>([
        [
          "slime_scout",
          createTestArchetype("slime_scout", {
            maxHealth: 20,
            xpReward: 2_000,
            level: 8,
            detectionRadius: 1,
            leashRadius: 1,
          }),
        ],
        [
          "briar_wolf",
          createTestArchetype("briar_wolf", {
            detectionRadius: 1,
            leashRadius: 1,
          }),
        ],
      ]);
      const manager = new WorldManager({
        resolveEnemyArchetype: (archetypeId) =>
          archetypes.get(archetypeId) ?? null,
        persistCharacterProgression: (update) => {
          persistedUpdates.push(update);
        },
      });
      const socket = createMockSocket(manager, "user-a", "player-a");

      manager.joinWorld(
        asServerSocket(socket),
        WILDS_BETA_MAP.id,
        "player-a",
        "Alpha",
        "knight",
        "#E8A832",
        {
          spawnOverride: { x: 1_220, y: 700 },
          progression: { level: 1, xp: 0 },
          combatStats: {
            maxHealth: 100,
            currentHealth: 100,
            baseDamage: 200,
            baseAttackSpeedMs: 600,
            baseAttackRange: 120,
          },
          baseStats: {
            maxHp: 180,
            baseDamage: 24,
            baseAttackSpeedMs: 600,
            baseAttackRange: 60,
          },
        },
      );
      cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

      await wait(300);
      const before = latestWorldSnapshot(socket);
      const target = before?.payload.enemies[0];
      expect(target).toBeDefined();
      if (!target) {
        throw new Error("expected at least one enemy");
      }

      socket.sent = [];
      manager.applyAttack(asServerSocket(socket), {
        type: "player.attack",
        aim: { x: target.position.x, y: target.position.y },
      });

      await wait(150);
      const messages = parseMessages(socket);
      const progression = messages.find(
        (message) => message.type === "progression.updated",
      );
      expect(progression?.type).toBe("progression.updated");
      if (!progression || progression.type !== "progression.updated") {
        throw new Error("missing progression.updated message");
      }
      expect(progression.level).toBeGreaterThan(1);
      expect(
        progression.xpToNextLevel === null ||
          progression.xp < progression.xpToNextLevel,
      ).toBe(true);

      const xpGainText = messages.find(
        (message) =>
          message.type === "combat.floatingText" &&
          message.variant === "xp_gain",
      );
      const levelUpText = messages.find(
        (message) =>
          message.type === "combat.floatingText" &&
          message.variant === "level_up",
      );

      expect(xpGainText).toBeDefined();
      expect(levelUpText).toBeDefined();
      expect(persistedUpdates.length).toBeGreaterThan(0);
      const persisted = persistedUpdates.at(-1);
      expect(persisted?.userId).toBe("user-a");
      expect(persisted?.characterId).toBe("player-a");
      expect(persisted?.level).toBe(progression.level);
      expect(persisted?.xp).toBe(progression.xp);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("player death emits respawn flow and returns to hub", async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;

    try {
      const archetypes = new Map<string, EnemyArchetype>([
        [
          "slime_scout",
          createTestArchetype("slime_scout", {
            damage: 250,
            attackSpeedMs: 120,
            meleeRange: 150,
            detectionRadius: 400,
            leashRadius: 500,
          }),
        ],
        [
          "briar_wolf",
          createTestArchetype("briar_wolf", {
            detectionRadius: 1,
            leashRadius: 1,
          }),
        ],
      ]);
      const manager = new WorldManager(
        (archetypeId) => archetypes.get(archetypeId) ?? null,
      );
      const socket = createMockSocket(manager, "user-a", "player-a");

      manager.joinWorld(
        asServerSocket(socket),
        WILDS_BETA_MAP.id,
        "player-a",
        "Alpha",
        "knight",
        "#E8A832",
        {
          spawnOverride: { x: 1_220, y: 700 },
          combatStats: {
            maxHealth: 60,
            currentHealth: 60,
            baseDamage: 24,
            baseAttackSpeedMs: 650,
            baseAttackRange: 60,
          },
        },
      );
      cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

      await wait(700);
      const messages = parseMessages(socket);
      const death = messages.find(
        (message) => message.type === "combat.playerDied",
      );
      const transition = messages.find(
        (message) =>
          message.type === "world.transitioning" &&
          message.reason === "respawn",
      );
      const respawnJoin = messages.find(
        (message) =>
          message.type === "world.joined" &&
          message.worldId === HUB_ALPHA_MAP.id,
      );

      expect(death?.type).toBe("combat.playerDied");
      expect(transition?.type).toBe("world.transitioning");
      expect(respawnJoin?.type).toBe("world.joined");
      if (!respawnJoin || respawnJoin.type !== "world.joined") {
        throw new Error("missing respawn join payload");
      }
      expect(respawnJoin.currentHealth).toBe(respawnJoin.maxHealth);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("closeContainer ignores mismatched container id and keeps active bag open", () => {
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

    const lootBag = manager.createPlayerDropLootBag(
      asServerSocket(socket),
      { x: 1_150, y: 520 },
      {
        id: "loot-item-1",
        itemDefinitionId: "training_sword",
      },
    );
    expect(lootBag).not.toBeNull();
    if (!lootBag) {
      throw new Error("expected loot bag to be created");
    }

    const opened = manager.openContainer(asServerSocket(socket), lootBag.id);
    expect(opened.ok).toBe(true);

    const closedWithWrongId = manager.closeContainer(
      asServerSocket(socket),
      "lootbag-wrong",
    );
    expect(closedWithWrongId).toBe(false);

    const stillOpen = manager.getOpenedContainer(asServerSocket(socket));
    expect(stillOpen?.containerId).toBe(lootBag.id);
  });

  test("expired open loot bags force-close with despawn reason", async () => {
    const manager = new WorldManager();
    const socket = createMockSocket(manager, "user-a", "player-a");
    const originalDateNow = Date.now;
    let fakeNow = originalDateNow();
    Date.now = () => fakeNow;

    try {
      manager.joinWorld(
        asServerSocket(socket),
        HUB_ALPHA_MAP.id,
        "player-a",
        "Alpha",
        "knight",
        "#E8A832",
      );
      cleanup.push(() => manager.leaveWorld(asServerSocket(socket)));

      const lootBag = manager.createPlayerDropLootBag(
        asServerSocket(socket),
        { x: 1_150, y: 520 },
        {
          id: "loot-item-2",
          itemDefinitionId: "training_sword",
        },
      );
      expect(lootBag).not.toBeNull();
      if (!lootBag) {
        throw new Error("expected loot bag to be created");
      }

      const opened = manager.openContainer(asServerSocket(socket), lootBag.id);
      expect(opened.ok).toBe(true);
      socket.sent = [];

      fakeNow += 5 * 60 * 1000 + 1;
      await wait(140);

      const closeMessage = parseMessages(socket).find(
        (message) =>
          message.type === "container.closed" &&
          message.containerId === lootBag.id,
      );
      expect(closeMessage?.type).toBe("container.closed");
      if (!closeMessage || closeMessage.type !== "container.closed") {
        throw new Error("missing container.closed message");
      }
      expect(closeMessage.reason).toBe("despawned");

      const openedAfterExpiry = manager.getOpenedContainer(
        asServerSocket(socket),
      );
      expect(openedAfterExpiry).toBeNull();

      const snapshot = latestWorldSnapshot(socket);
      const stillExists =
        snapshot?.payload.lootBags.some((bag) => bag.id === lootBag.id) ??
        false;
      expect(stillExists).toBe(false);
    } finally {
      Date.now = originalDateNow;
    }
  });
});
