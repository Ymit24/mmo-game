import type {
  ClientToServerMessage,
  PlayerSnapshot,
  ServerToClientMessage,
  Vector2,
  WorldMap,
} from "@mmo/shared";
import {
  HUB_ALPHA_MAP,
  findSpawnPoint,
  inputToVelocity,
  resolveMovementWithSliding,
  stringifyServerMessage,
} from "@mmo/shared";
import type { ServerWebSocket } from "bun";

interface PlayerState {
  connectionId: string;
  id: string;
  position: Vector2;
  velocity: Vector2;
  lastProcessedInputSequence: number;
  socket: ServerWebSocket<RealtimeSocketData>;
}

export interface RealtimeSession {
  connectionId: string;
  authenticated: boolean;
  accountKey: string | null;
  authToken: string | null;
  authExpiresAtEpochMs: number | null;
  playerId: string | null;
  worldId: string | null;
}

export interface RealtimeSocketData {
  session: RealtimeSession;
}

function toSnapshot(player: PlayerState): PlayerSnapshot {
  return {
    id: player.id,
    position: player.position,
    velocity: player.velocity,
    lastProcessedInputSequence: player.lastProcessedInputSequence,
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
    connectionId: string,
    playerId: string,
    socket: ServerWebSocket<RealtimeSocketData>,
  ): Vector2 {
    const spawn = findSpawnPoint(this.map, this.map.playerSpawnId) ??
      this.map.spawnPoints[0] ?? { x: 120, y: 120 };

    const player: PlayerState = {
      connectionId,
      id: playerId,
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

  removePlayer(playerId: string, connectionId: string): void {
    const removed = this.players.get(playerId);
    if (!removed) {
      return;
    }
    if (removed.connectionId !== connectionId) {
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
    connectionId: string,
    message: Extract<ClientToServerMessage, { type: "player.input" }>,
  ): void {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    if (player.connectionId !== connectionId) {
      return;
    }

    const velocity = inputToVelocity(message.input);
    player.position = resolveMovementWithSliding(
      player.position,
      velocity,
      message.dtMs,
      this.map,
    );
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
        connectionId: crypto.randomUUID(),
        authenticated: false,
        accountKey: null,
        authToken: null,
        authExpiresAtEpochMs: null,
        playerId: null,
        worldId: null,
      },
    };
  }

  joinWorld(
    socket: ServerWebSocket<RealtimeSocketData>,
    worldId: string,
    playerId: string,
  ): Vector2 | null {
    const instance = this.getOrCreate(worldId);
    if (!instance) {
      return null;
    }

    const currentWorldId = socket.data.session.worldId;
    if (currentWorldId && currentWorldId !== worldId) {
      this.leaveWorld(socket);
    }

    const spawn = instance.addPlayer(
      socket.data.session.connectionId,
      playerId,
      socket,
    );
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
    const { connectionId, playerId, worldId } = socket.data.session;
    if (!playerId || !worldId) {
      return;
    }

    const instance = this.instances.get(worldId);
    if (!instance) {
      socket.data.session.worldId = null;
      return;
    }

    instance.removePlayer(playerId, connectionId);
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
    const { connectionId, playerId, worldId } = socket.data.session;
    if (!playerId || !worldId) {
      return;
    }

    const instance = this.instances.get(worldId);
    if (!instance) {
      return;
    }

    instance.applyInput(playerId, connectionId, message);
  }

  acknowledgeDrop(
    socket: ServerWebSocket<RealtimeSocketData>,
    message: Extract<ClientToServerMessage, { type: "inventory.drop" }>,
  ): void {
    if (
      !Number.isSafeInteger(message.payload.quantity) ||
      message.payload.quantity <= 0 ||
      message.payload.itemId.trim().length === 0 ||
      !Number.isFinite(message.payload.position.x) ||
      !Number.isFinite(message.payload.position.y)
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
