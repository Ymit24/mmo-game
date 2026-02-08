import type {
  CharacterClass,
  ClientToServerMessage,
  CollisionShape,
  PlayerSnapshot,
  PortalTrigger,
  ServerToClientMessage,
  Vector2,
  WorldMap,
} from "@mmo/shared";
import {
  PLAYER_COLLIDER_SIZE,
  WORLD_MAPS_BY_ID,
  findSpawnPoint,
  inputToVelocity,
  resolveMovementWithSliding,
  stringifyServerMessage,
} from "@mmo/shared";
import type { ServerWebSocket } from "bun";

interface PlayerState {
  connectionId: string;
  id: string;
  nickname: string;
  class: CharacterClass;
  colorHex: string;
  position: Vector2;
  velocity: Vector2;
  lastProcessedInputSequence: number;
  socket: ServerWebSocket<RealtimeSocketData>;
}

interface JoinWorldOptions {
  spawnOverride?: Vector2;
}

const PORTAL_TRAVEL_COOLDOWN_MS = 750;

export interface RealtimeSession {
  connectionId: string;
  authenticated: boolean;
  accountKey: string | null;
  authToken: string | null;
  authExpiresAtEpochMs: number | null;
  userId: string | null;
  characterId: string | null;
  characterNickname: string | null;
  characterClass: CharacterClass | null;
  characterColorHex: string | null;
  worldId: string | null;
  lastPortalTravelAtEpochMs: number | null;
}

export interface RealtimeSocketData {
  session: RealtimeSession;
}

function toSnapshot(player: PlayerState): PlayerSnapshot {
  return {
    id: player.id,
    nickname: player.nickname,
    class: player.class,
    colorHex: player.colorHex,
    position: player.position,
    velocity: player.velocity,
    lastProcessedInputSequence: player.lastProcessedInputSequence,
  };
}

function intersectsPlayerBounds(
  position: Vector2,
  shape: CollisionShape,
): boolean {
  const halfWidth = PLAYER_COLLIDER_SIZE.width / 2;
  const halfHeight = PLAYER_COLLIDER_SIZE.height / 2;

  const playerLeft = position.x - halfWidth;
  const playerRight = position.x + halfWidth;
  const playerTop = position.y - halfHeight;
  const playerBottom = position.y + halfHeight;

  return (
    playerLeft < shape.x + shape.width &&
    playerRight > shape.x &&
    playerTop < shape.y + shape.height &&
    playerBottom > shape.y
  );
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
    characterId: string,
    nickname: string,
    characterClass: CharacterClass,
    colorHex: string,
    socket: ServerWebSocket<RealtimeSocketData>,
    spawnOverride?: Vector2,
  ): Vector2 {
    const fallbackSpawn = findSpawnPoint(this.map, this.map.playerSpawnId) ??
      this.map.spawnPoints[0] ?? { x: 120, y: 120 };
    const spawn = spawnOverride ?? fallbackSpawn;

    const player: PlayerState = {
      connectionId,
      id: characterId,
      nickname,
      class: characterClass,
      colorHex,
      socket,
      position: { x: spawn.x, y: spawn.y },
      velocity: { x: 0, y: 0 },
      lastProcessedInputSequence: 0,
    };

    this.players.set(characterId, player);

    this.broadcast(
      {
        type: "world.playerJoined",
        worldId: this.worldId,
        player: toSnapshot(player),
      },
      connectionId,
    );

    return player.position;
  }

  removePlayer(characterId: string, connectionId: string): void {
    const removed = this.players.get(characterId);
    if (!removed) {
      return;
    }
    if (removed.connectionId !== connectionId) {
      return;
    }

    this.players.delete(characterId);

    this.broadcast({
      type: "world.playerLeft",
      worldId: this.worldId,
      characterId,
    });
  }

  applyInput(
    characterId: string,
    connectionId: string,
    message: Extract<ClientToServerMessage, { type: "player.input" }>,
  ): PortalTrigger | null {
    const player = this.players.get(characterId);
    if (!player) {
      return null;
    }
    if (player.connectionId !== connectionId) {
      return null;
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

    return (
      this.map.portals.find((portal) =>
        intersectsPlayerBounds(player.position, portal.shape),
      ) ?? null
    );
  }

  broadcast(
    message: ServerToClientMessage,
    excludeConnectionId?: string,
  ): void {
    const wire = stringifyServerMessage(message);

    for (const player of this.players.values()) {
      if (excludeConnectionId && player.connectionId === excludeConnectionId) {
        continue;
      }
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
        userId: null,
        characterId: null,
        characterNickname: null,
        characterClass: null,
        characterColorHex: null,
        worldId: null,
        lastPortalTravelAtEpochMs: null,
      },
    };
  }

  joinWorld(
    socket: ServerWebSocket<RealtimeSocketData>,
    worldId: string,
    characterId: string,
    nickname: string,
    characterClass: CharacterClass,
    colorHex: string,
    options?: JoinWorldOptions,
  ): Vector2 | null {
    const instance = this.getOrCreate(worldId);
    if (!instance) {
      return null;
    }

    const currentWorldId = socket.data.session.worldId;
    if (currentWorldId) {
      this.leaveWorld(socket);
    }

    const spawn = instance.addPlayer(
      socket.data.session.connectionId,
      characterId,
      nickname,
      characterClass,
      colorHex,
      socket,
      options?.spawnOverride,
    );
    socket.data.session.worldId = worldId;
    socket.data.session.characterId = characterId;
    socket.data.session.characterNickname = nickname;
    socket.data.session.characterClass = characterClass;
    socket.data.session.characterColorHex = colorHex;

    socket.send(
      stringifyServerMessage({
        type: "world.joined",
        worldId,
        characterId,
        nickname,
        class: characterClass,
        colorHex,
        spawn,
      }),
    );
    instance.sendSnapshotTo(socket);

    return spawn;
  }

  leaveWorld(socket: ServerWebSocket<RealtimeSocketData>): void {
    const { connectionId, characterId, worldId } = socket.data.session;
    if (!characterId || !worldId) {
      return;
    }

    const instance = this.instances.get(worldId);
    if (!instance) {
      socket.data.session.worldId = null;
      return;
    }

    instance.removePlayer(characterId, connectionId);
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
    const { connectionId, characterId, worldId } = socket.data.session;
    if (!characterId || !worldId) {
      return;
    }

    const instance = this.instances.get(worldId);
    if (!instance) {
      return;
    }

    const portal = instance.applyInput(characterId, connectionId, message);
    if (!portal) {
      return;
    }

    const { characterNickname, characterClass, characterColorHex } =
      socket.data.session;
    if (!characterNickname || !characterClass || !characterColorHex) {
      return;
    }

    const now = Date.now();
    const lastPortalTravelAtEpochMs =
      socket.data.session.lastPortalTravelAtEpochMs;
    if (
      typeof lastPortalTravelAtEpochMs === "number" &&
      now - lastPortalTravelAtEpochMs < PORTAL_TRAVEL_COOLDOWN_MS
    ) {
      return;
    }

    const targetMap = WORLD_MAPS_BY_ID.get(portal.targetWorldId);
    if (!targetMap) {
      return;
    }

    const targetSpawn = findSpawnPoint(targetMap, portal.targetSpawnId);
    if (!targetSpawn) {
      return;
    }

    socket.data.session.lastPortalTravelAtEpochMs = now;
    this.joinWorld(
      socket,
      portal.targetWorldId,
      characterId,
      characterNickname,
      characterClass,
      characterColorHex,
      {
        spawnOverride: {
          x: targetSpawn.x + portal.exitOffset.x,
          y: targetSpawn.y + portal.exitOffset.y,
        },
      },
    );
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

    const map = WORLD_MAPS_BY_ID.get(worldId);
    if (!map) {
      return null;
    }

    const created = new WorldInstance(worldId, map);
    this.instances.set(worldId, created);
    return created;
  }
}
