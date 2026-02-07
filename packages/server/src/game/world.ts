import type {
  ClientToServerMessage,
  PlayerInputState,
  PlayerSnapshot,
  ServerToClientMessage,
  Vector2,
  WorldMap,
} from "@mmo/shared";
import {
  HUB_ALPHA_MAP,
  findSpawnPoint,
  stringifyServerMessage,
} from "@mmo/shared";
import type { ServerWebSocket } from "bun";

interface PlayerState {
  id: string;
  email: string;
  position: Vector2;
  velocity: Vector2;
  lastProcessedInputSequence: number;
  socket: ServerWebSocket<RealtimeSocketData>;
}

export interface RealtimeSession {
  authenticated: boolean;
  playerId: string | null;
  email: string | null;
  worldId: string | null;
}

export interface RealtimeSocketData {
  session: RealtimeSession;
}

function toSnapshot(player: PlayerState): PlayerSnapshot {
  return {
    id: player.id,
    email: player.email,
    position: player.position,
    velocity: player.velocity,
    lastProcessedInputSequence: player.lastProcessedInputSequence,
  };
}

function collides(
  shape: WorldMap["collisions"][number],
  position: Vector2,
): boolean {
  if (shape.type === "rect") {
    return (
      position.x >= shape.x &&
      position.x <= shape.x + shape.width &&
      position.y >= shape.y &&
      position.y <= shape.y + shape.height
    );
  }

  const dx = position.x - shape.x;
  const dy = position.y - shape.y;
  return dx * dx + dy * dy <= shape.radius * shape.radius;
}

function resolvePosition(
  map: WorldMap,
  next: Vector2,
  fallback: Vector2,
): Vector2 {
  const clamped = {
    x: Math.max(0, Math.min(map.width, next.x)),
    y: Math.max(0, Math.min(map.height, next.y)),
  };

  for (const shape of map.collisions) {
    if (collides(shape, clamped)) {
      return fallback;
    }
  }

  return clamped;
}

function calcVelocity(input: PlayerInputState, speed: number): Vector2 {
  const horizontal = Number(input.right) - Number(input.left);
  const vertical = Number(input.down) - Number(input.up);
  if (horizontal === 0 && vertical === 0) {
    return { x: 0, y: 0 };
  }

  const length = Math.hypot(horizontal, vertical) || 1;
  return {
    x: (horizontal / length) * speed,
    y: (vertical / length) * speed,
  };
}

class WorldInstance {
  readonly worldId: string;
  readonly map: WorldMap;

  private players = new Map<string, PlayerState>();
  private snapshotTimer: Timer;

  constructor(worldId: string, map: WorldMap) {
    this.worldId = worldId;
    this.map = map;

    this.snapshotTimer = setInterval(() => {
      this.broadcast({
        type: "world.snapshot",
        payload: this.createSnapshotPayload(),
      });
    }, 100);
  }

  addPlayer(
    playerId: string,
    email: string,
    socket: ServerWebSocket<RealtimeSocketData>,
  ): Vector2 {
    const spawn = findSpawnPoint(this.map, this.map.playerSpawnId) ??
      this.map.spawnPoints[0] ?? { x: 120, y: 120 };

    const player: PlayerState = {
      id: playerId,
      email,
      socket,
      position: { x: spawn.x, y: spawn.y },
      velocity: { x: 0, y: 0 },
      lastProcessedInputSequence: 0,
    };

    this.players.set(playerId, player);

    this.broadcast({
      type: "world.playerJoined",
      worldId: this.worldId,
      player: toSnapshot(player),
    });

    return player.position;
  }

  removePlayer(playerId: string): void {
    const removed = this.players.get(playerId);
    if (!removed) {
      return;
    }

    this.players.delete(playerId);

    this.broadcast({
      type: "world.playerLeft",
      worldId: this.worldId,
      playerId,
    });
  }

  applyInput(
    playerId: string,
    message: Extract<ClientToServerMessage, { type: "player.input" }>,
  ): void {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }

    const dtSeconds = Math.max(0.005, Math.min(message.dtMs, 80)) / 1000;
    const velocity = calcVelocity(message.input, 240);

    const next = {
      x: player.position.x + velocity.x * dtSeconds,
      y: player.position.y + velocity.y * dtSeconds,
    };

    player.position = resolvePosition(this.map, next, player.position);
    player.velocity = velocity;
    player.lastProcessedInputSequence = message.sequence;

    player.socket.send(
      stringifyServerMessage({
        type: "player.state",
        position: player.position,
        velocity: player.velocity,
        lastProcessedInputSequence: message.sequence,
      }),
    );
  }

  broadcast(message: ServerToClientMessage): void {
    const wire = stringifyServerMessage(message);

    for (const player of this.players.values()) {
      player.socket.send(wire);
    }
  }

  sendSnapshotTo(socket: ServerWebSocket<RealtimeSocketData>): void {
    socket.send(
      stringifyServerMessage({
        type: "world.snapshot",
        payload: this.createSnapshotPayload(),
      }),
    );
  }

  dispose(): void {
    clearInterval(this.snapshotTimer);
  }

  get size(): number {
    return this.players.size;
  }

  private createSnapshotPayload(): {
    worldId: string;
    serverTimeMs: number;
    players: PlayerSnapshot[];
  } {
    return {
      worldId: this.worldId,
      serverTimeMs: Date.now(),
      players: [...this.players.values()].map((player) => toSnapshot(player)),
    };
  }
}

export class WorldManager {
  private instances = new Map<string, WorldInstance>();

  createSocketData(): RealtimeSocketData {
    return {
      session: {
        authenticated: false,
        playerId: null,
        email: null,
        worldId: null,
      },
    };
  }

  joinWorld(
    socket: ServerWebSocket<RealtimeSocketData>,
    worldId: string,
    playerId: string,
    email: string,
  ): Vector2 | null {
    const instance = this.getOrCreate(worldId);
    if (!instance) {
      return null;
    }

    const currentWorldId = socket.data.session.worldId;
    if (currentWorldId && currentWorldId !== worldId) {
      this.leaveWorld(socket);
    }

    const spawn = instance.addPlayer(playerId, email, socket);
    socket.data.session.worldId = worldId;

    socket.send(
      stringifyServerMessage({
        type: "world.joined",
        worldId,
        playerId,
        spawn,
      }),
    );
    instance.sendSnapshotTo(socket);

    return spawn;
  }

  leaveWorld(socket: ServerWebSocket<RealtimeSocketData>): void {
    const { playerId, worldId } = socket.data.session;
    if (!playerId || !worldId) {
      return;
    }

    const instance = this.instances.get(worldId);
    if (!instance) {
      socket.data.session.worldId = null;
      return;
    }

    instance.removePlayer(playerId);
    socket.data.session.worldId = null;

    if (instance.size === 0) {
      instance.dispose();
      this.instances.delete(worldId);
    }
  }

  applyInput(
    socket: ServerWebSocket<RealtimeSocketData>,
    message: Extract<ClientToServerMessage, { type: "player.input" }>,
  ): void {
    const { playerId, worldId } = socket.data.session;
    if (!playerId || !worldId) {
      return;
    }

    const instance = this.instances.get(worldId);
    if (!instance) {
      return;
    }

    instance.applyInput(playerId, message);
  }

  acknowledgeDrop(
    socket: ServerWebSocket<RealtimeSocketData>,
    message: Extract<ClientToServerMessage, { type: "inventory.drop" }>,
  ): void {
    if (
      message.payload.quantity <= 0 ||
      message.payload.itemId.trim().length === 0
    ) {
      socket.send(
        stringifyServerMessage({
          type: "error",
          error: "Invalid drop payload.",
        }),
      );
      return;
    }

    socket.send(
      stringifyServerMessage({
        type: "inventory.drop.ack",
        itemId: message.payload.itemId,
        quantity: message.payload.quantity,
        position: message.payload.position,
      }),
    );
  }

  private getOrCreate(worldId: string): WorldInstance | null {
    const existing = this.instances.get(worldId);
    if (existing) {
      return existing;
    }

    if (worldId !== HUB_ALPHA_MAP.id) {
      return null;
    }

    const created = new WorldInstance(worldId, HUB_ALPHA_MAP);
    this.instances.set(worldId, created);
    return created;
  }
}
