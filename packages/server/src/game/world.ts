import type {
  CharacterClass,
  ClientToServerMessage,
  CollisionShape,
  EnemyArchetype,
  EnemyBehaviorState,
  EnemySnapshot,
  PlayerSnapshot,
  PortalTrigger,
  ServerToClientMessage,
  Vector2,
  WorldMap,
} from "@mmo/shared";
import {
  PLAYER_COLLIDER_SIZE,
  WORLD_MAPS_BY_ID,
  centeredBoxToCollisionShape,
  clampToWorldBounds,
  findSpawnPoint,
  inputToVelocity,
  positionCollidesWithMap,
  resolveMovementWithSliding,
  stringifyServerMessage,
} from "@mmo/shared";
import type { ServerWebSocket } from "bun";

const SNAPSHOT_INTERVAL_MS = 100;
const SIMULATION_INTERVAL_MS = 50;
const ENEMY_SPAWN_ATTEMPTS = 12;
const ENEMY_IDLE_EPSILON = 4;
const ENEMY_MELEE_RANGE = 42;
const ENEMY_RANGED_RANGE = 220;

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

interface EnemyState {
  id: string;
  spawnerId: string;
  archetype: EnemyArchetype;
  position: Vector2;
  velocity: Vector2;
  currentHealth: number;
  state: EnemyBehaviorState;
  spawnAnchor: Vector2;
  targetCharacterId: string | null;
  nextAttackAtMs: number;
}

interface SpawnerRuntimeState {
  id: string;
  archetypeId: string;
  x: number;
  y: number;
  spawnRadius: number;
  maxAlive: number;
  respawnSeconds: number;
  nextSpawnAtMs: number;
}

interface JoinWorldOptions {
  spawnOverride?: Vector2;
}

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

function toEnemySnapshot(enemy: EnemyState): EnemySnapshot {
  return {
    id: enemy.id,
    archetypeId: enemy.archetype.id,
    name: enemy.archetype.name,
    position: enemy.position,
    velocity: enemy.velocity,
    state: enemy.state,
    currentHealth: enemy.currentHealth,
    maxHealth: enemy.archetype.maxHealth,
    colorHex: enemy.archetype.colorHex,
    width: enemy.archetype.visualWidth,
    height: enemy.archetype.visualHeight,
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

function distanceSquared(from: Vector2, to: Vector2): number {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  return dx * dx + dy * dy;
}

function normalizeDirection(from: Vector2, to: Vector2): Vector2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;

  return {
    x: dx / length,
    y: dy / length,
  };
}

class WorldInstance {
  readonly worldId: string;
  readonly map: WorldMap;

  private players = new Map<string, PlayerState>();
  private enemies = new Map<string, EnemyState>();
  private spawners = new Map<string, SpawnerRuntimeState>();
  private snapshotTimer: Timer;
  private simulationTimer: Timer;
  private readonly resolveEnemyArchetype: (
    archetypeId: string,
  ) => EnemyArchetype | null;

  constructor(
    worldId: string,
    map: WorldMap,
    resolveEnemyArchetype: (archetypeId: string) => EnemyArchetype | null,
  ) {
    this.worldId = worldId;
    this.map = map;
    this.resolveEnemyArchetype = resolveEnemyArchetype;

    for (const spawner of map.enemySpawners) {
      this.spawners.set(spawner.id, {
        ...spawner,
        nextSpawnAtMs: 0,
      });
    }

    this.snapshotTimer = setInterval(() => {
      this.broadcast({
        type: "world.snapshot",
        payload: this.createSnapshotPayload(),
      });
    }, SNAPSHOT_INTERVAL_MS);

    this.simulationTimer = setInterval(() => {
      this.simulate(SIMULATION_INTERVAL_MS);
    }, SIMULATION_INTERVAL_MS);
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
      PLAYER_COLLIDER_SIZE,
      this.getEnemyColliders(),
    );
    player.velocity = velocity;
    player.lastProcessedInputSequence = message.sequence;

    const portal = this.map.portals.find((candidate) =>
      intersectsPlayerBounds(player.position, candidate.shape),
    );

    player.socket.send(
      stringifyServerMessage({
        type: "player.state",
        position: player.position,
        velocity: player.velocity,
        lastProcessedInputSequence: message.sequence,
      }),
    );

    return portal ?? null;
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
    clearInterval(this.simulationTimer);
  }

  get size(): number {
    return this.players.size;
  }

  private simulate(dtMs: number): void {
    const now = Date.now();
    this.tickSpawners(now);
    this.tickEnemies(now, dtMs);
  }

  private tickSpawners(now: number): void {
    for (const spawner of this.spawners.values()) {
      const alive = this.countEnemiesForSpawner(spawner.id);
      if (alive >= spawner.maxAlive) {
        continue;
      }
      if (now < spawner.nextSpawnAtMs) {
        continue;
      }

      const archetype = this.resolveEnemyArchetype(spawner.archetypeId);
      if (!archetype) {
        spawner.nextSpawnAtMs = now + 1_000;
        continue;
      }

      const position = this.findEnemySpawnPosition(spawner, archetype);
      if (!position) {
        spawner.nextSpawnAtMs = now + 250;
        continue;
      }

      const enemy: EnemyState = {
        id: `enemy-${crypto.randomUUID()}`,
        spawnerId: spawner.id,
        archetype,
        position,
        velocity: { x: 0, y: 0 },
        currentHealth: archetype.maxHealth,
        state: "idle",
        spawnAnchor: {
          x: spawner.x,
          y: spawner.y,
        },
        targetCharacterId: null,
        nextAttackAtMs: now,
      };

      this.enemies.set(enemy.id, enemy);
      spawner.nextSpawnAtMs = now + spawner.respawnSeconds * 1000;
    }
  }

  private tickEnemies(now: number, dtMs: number): void {
    const playerColliders = this.getPlayerColliders();

    for (const enemy of this.enemies.values()) {
      const target = this.resolveOrAcquireTarget(enemy);
      const anchorDistanceSq = distanceSquared(
        enemy.position,
        enemy.spawnAnchor,
      );
      const leashSq = enemy.archetype.leashRadius * enemy.archetype.leashRadius;

      let desiredState: EnemyBehaviorState = "idle";
      let desiredTarget: Vector2 | null = null;

      if (target && anchorDistanceSq <= leashSq) {
        desiredTarget = target.position;
        desiredState = "chasing";

        if (this.isEnemyInAttackRange(enemy, target.position)) {
          if (now >= enemy.nextAttackAtMs) {
            enemy.nextAttackAtMs = now + enemy.archetype.attackSpeedMs;
            desiredState = "attacking";
          }
        }
      } else {
        enemy.targetCharacterId = null;
      }

      if (!desiredTarget) {
        const distanceToAnchorSq = distanceSquared(
          enemy.position,
          enemy.spawnAnchor,
        );
        if (distanceToAnchorSq > ENEMY_IDLE_EPSILON * ENEMY_IDLE_EPSILON) {
          desiredTarget = enemy.spawnAnchor;
          desiredState = "returning";
        }
      }

      if (!desiredTarget || desiredState === "attacking") {
        enemy.velocity = { x: 0, y: 0 };
        enemy.state = desiredState;
        continue;
      }

      const direction = normalizeDirection(enemy.position, desiredTarget);
      const velocity = {
        x: direction.x * enemy.archetype.speed,
        y: direction.y * enemy.archetype.speed,
      };

      enemy.position = resolveMovementWithSliding(
        enemy.position,
        velocity,
        dtMs,
        this.map,
        {
          width: enemy.archetype.visualWidth,
          height: enemy.archetype.visualHeight,
        },
        playerColliders,
      );
      enemy.velocity = velocity;
      enemy.state = desiredState;
    }
  }

  private resolveOrAcquireTarget(enemy: EnemyState): PlayerState | null {
    if (enemy.targetCharacterId) {
      const existing = this.players.get(enemy.targetCharacterId);
      if (existing) {
        const distanceToExistingSq = distanceSquared(
          enemy.position,
          existing.position,
        );
        const detectionSq =
          enemy.archetype.detectionRadius * enemy.archetype.detectionRadius;
        if (distanceToExistingSq <= detectionSq) {
          return existing;
        }
      }
      enemy.targetCharacterId = null;
    }

    const nearest = this.findNearestPlayerInRadius(
      enemy.position,
      enemy.archetype.detectionRadius,
    );
    enemy.targetCharacterId = nearest?.id ?? null;

    return nearest;
  }

  private findNearestPlayerInRadius(
    position: Vector2,
    radius: number,
  ): PlayerState | null {
    let nearest: PlayerState | null = null;
    let nearestDistanceSq = radius * radius;

    for (const player of this.players.values()) {
      const candidateDistanceSq = distanceSquared(position, player.position);
      if (candidateDistanceSq > nearestDistanceSq) {
        continue;
      }
      nearest = player;
      nearestDistanceSq = candidateDistanceSq;
    }

    return nearest;
  }

  private isEnemyInAttackRange(
    enemy: EnemyState,
    targetPosition: Vector2,
  ): boolean {
    const distanceSq = distanceSquared(enemy.position, targetPosition);
    const meleeRangeSq = ENEMY_MELEE_RANGE * ENEMY_MELEE_RANGE;
    const rangedRangeSq = ENEMY_RANGED_RANGE * ENEMY_RANGED_RANGE;

    return (
      (enemy.archetype.canMelee && distanceSq <= meleeRangeSq) ||
      (enemy.archetype.canRanged && distanceSq <= rangedRangeSq)
    );
  }

  private findEnemySpawnPosition(
    spawner: SpawnerRuntimeState,
    archetype: EnemyArchetype,
  ): Vector2 | null {
    const colliderSize = {
      width: archetype.visualWidth,
      height: archetype.visualHeight,
    };

    const dynamicColliders = [
      ...this.getPlayerColliders(),
      ...this.getEnemyColliders(),
    ];

    for (let attempt = 0; attempt < ENEMY_SPAWN_ATTEMPTS; attempt += 1) {
      const attemptRatio = attempt / ENEMY_SPAWN_ATTEMPTS;
      const angle = ((Math.random() + attemptRatio) % 1) * Math.PI * 2;
      const distance =
        Math.sqrt((Math.random() + attemptRatio) % 1) * spawner.spawnRadius;
      const candidate = clampToWorldBounds(
        {
          x: spawner.x + Math.cos(angle) * distance,
          y: spawner.y + Math.sin(angle) * distance,
        },
        this.map,
        colliderSize,
      );

      if (
        !positionCollidesWithMap(
          candidate,
          this.map,
          colliderSize,
          dynamicColliders,
        )
      ) {
        return candidate;
      }
    }

    return null;
  }

  private countEnemiesForSpawner(spawnerId: string): number {
    let count = 0;
    for (const enemy of this.enemies.values()) {
      if (enemy.spawnerId === spawnerId) {
        count += 1;
      }
    }
    return count;
  }

  private getPlayerColliders(): CollisionShape[] {
    const colliders: CollisionShape[] = [];
    for (const player of this.players.values()) {
      colliders.push(
        centeredBoxToCollisionShape(player.position, PLAYER_COLLIDER_SIZE),
      );
    }
    return colliders;
  }

  private getEnemyColliders(): CollisionShape[] {
    const colliders: CollisionShape[] = [];
    for (const enemy of this.enemies.values()) {
      colliders.push(
        centeredBoxToCollisionShape(enemy.position, {
          width: enemy.archetype.visualWidth,
          height: enemy.archetype.visualHeight,
        }),
      );
    }
    return colliders;
  }

  private createSnapshotPayload(): {
    worldId: string;
    serverTimeMs: number;
    players: PlayerSnapshot[];
    enemies: EnemySnapshot[];
  } {
    return {
      worldId: this.worldId,
      serverTimeMs: Date.now(),
      players: [...this.players.values()].map((player) => toSnapshot(player)),
      enemies: [...this.enemies.values()].map((enemy) =>
        toEnemySnapshot(enemy),
      ),
    };
  }
}

export class WorldManager {
  private instances = new Map<string, WorldInstance>();
  private readonly resolveEnemyArchetype: (
    archetypeId: string,
  ) => EnemyArchetype | null;

  constructor(
    resolveEnemyArchetype: (
      archetypeId: string,
    ) => EnemyArchetype | null = () => null,
  ) {
    this.resolveEnemyArchetype = resolveEnemyArchetype;
  }

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

    this.tryTravelThroughPortal(socket, portal);
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

    const created = new WorldInstance(worldId, map, this.resolveEnemyArchetype);
    this.instances.set(worldId, created);
    return created;
  }

  private tryTravelThroughPortal(
    socket: ServerWebSocket<RealtimeSocketData>,
    portal: PortalTrigger,
  ): void {
    const {
      characterId,
      worldId,
      characterNickname,
      characterClass,
      characterColorHex,
    } = socket.data.session;
    if (
      !characterId ||
      !worldId ||
      !characterNickname ||
      !characterClass ||
      !characterColorHex
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

    const fromWorldId = worldId;
    this.leaveWorld(socket);
    socket.send(
      stringifyServerMessage({
        type: "world.transitioning",
        fromWorldId,
        toWorldId: portal.targetWorldId,
        portalId: portal.id,
        reason: "portal",
      }),
    );
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
}
