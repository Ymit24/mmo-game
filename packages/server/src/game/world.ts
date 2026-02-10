import type {
  CharacterClass,
  ClientToServerMessage,
  CollisionShape,
  EnemyArchetype,
  EnemyBehaviorState,
  EnemySnapshot,
  PlayerSnapshot,
  PortalTrigger,
  ProjectileSnapshot,
  ServerToClientMessage,
  Vector2,
  WorldMap,
} from "@mmo/shared";
import {
  DEFAULT_WORLD_ID,
  PLAYER_COLLIDER_SIZE,
  WORLD_MAPS_BY_ID,
  centeredBoxToCollisionShape,
  clampInputDtMs,
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
const DEFAULT_PLAYER_MAX_HP = 100;
const DEFAULT_PLAYER_DAMAGE = 10;
const DEFAULT_PLAYER_ATTACK_SPEED_MS = 900;
const DEFAULT_PLAYER_ATTACK_RANGE = 60;
const MELEE_ARC_COS_THRESHOLD = 0.4;
const PLAYER_PROJECTILE_SPEED = 640;
const PLAYER_PROJECTILE_TTL_MS = 900;
const PLAYER_PROJECTILE_RADIUS = 8;

interface PlayerCombatStats {
  currentHealth: number;
  maxHealth: number;
  baseDamage: number;
  baseAttackSpeedMs: number;
  baseAttackRange: number;
}

interface PlayerState {
  connectionId: string;
  id: string;
  nickname: string;
  class: CharacterClass;
  colorHex: string;
  position: Vector2;
  velocity: Vector2;
  lastProcessedInputSequence: number;
  currentHealth: number;
  maxHealth: number;
  baseDamage: number;
  baseAttackSpeedMs: number;
  baseAttackRange: number;
  nextAttackAtMs: number;
  pendingRespawn: boolean;
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

interface ProjectileState {
  id: string;
  ownerCharacterId: string;
  position: Vector2;
  velocity: Vector2;
  radius: number;
  damage: number;
  ttlMsRemaining: number;
  colorHex: string;
}

interface JoinWorldOptions {
  spawnOverride?: Vector2;
  combatStats?: Partial<PlayerCombatStats>;
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
  characterCurrentHealth: number | null;
  characterMaxHealth: number | null;
  characterBaseDamage: number | null;
  characterBaseAttackSpeedMs: number | null;
  characterBaseAttackRange: number | null;
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
    currentHealth: player.currentHealth,
    maxHealth: player.maxHealth,
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

function toProjectileSnapshot(projectile: ProjectileState): ProjectileSnapshot {
  return {
    id: projectile.id,
    ownerId: projectile.ownerCharacterId,
    position: projectile.position,
    velocity: projectile.velocity,
    radius: projectile.radius,
    colorHex: projectile.colorHex,
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

function dotProduct(first: Vector2, second: Vector2): number {
  return first.x * second.x + first.y * second.y;
}

function clampHealth(current: number, max: number): number {
  return Math.max(0, Math.min(max, current));
}

function resolveCombatStats(
  partial?: Partial<PlayerCombatStats>,
): PlayerCombatStats {
  const maxHealth = Math.max(
    1,
    Number.isFinite(partial?.maxHealth ?? Number.NaN)
      ? (partial?.maxHealth ?? DEFAULT_PLAYER_MAX_HP)
      : DEFAULT_PLAYER_MAX_HP,
  );
  const currentHealthRaw = Number.isFinite(partial?.currentHealth ?? Number.NaN)
    ? (partial?.currentHealth ?? maxHealth)
    : maxHealth;
  return {
    maxHealth,
    currentHealth: clampHealth(currentHealthRaw, maxHealth),
    baseDamage: Math.max(0, partial?.baseDamage ?? DEFAULT_PLAYER_DAMAGE),
    baseAttackSpeedMs: Math.max(
      1,
      Math.floor(partial?.baseAttackSpeedMs ?? DEFAULT_PLAYER_ATTACK_SPEED_MS),
    ),
    baseAttackRange: Math.max(
      1,
      partial?.baseAttackRange ?? DEFAULT_PLAYER_ATTACK_RANGE,
    ),
  };
}

class WorldInstance {
  readonly worldId: string;
  readonly map: WorldMap;

  private players = new Map<string, PlayerState>();
  private enemies = new Map<string, EnemyState>();
  private projectiles = new Map<string, ProjectileState>();
  private spawners = new Map<string, SpawnerRuntimeState>();
  private deadPlayerQueue = new Map<
    string,
    ServerWebSocket<RealtimeSocketData>
  >();
  private snapshotTimer: Timer;
  private simulationTimer: Timer;
  private readonly resolveEnemyArchetype: (
    archetypeId: string,
  ) => EnemyArchetype | null;
  private readonly onPlayerDeath: (
    socket: ServerWebSocket<RealtimeSocketData>,
    characterId: string,
  ) => void;

  constructor(
    worldId: string,
    map: WorldMap,
    resolveEnemyArchetype: (archetypeId: string) => EnemyArchetype | null,
    onPlayerDeath: (
      socket: ServerWebSocket<RealtimeSocketData>,
      characterId: string,
    ) => void,
  ) {
    this.worldId = worldId;
    this.map = map;
    this.resolveEnemyArchetype = resolveEnemyArchetype;
    this.onPlayerDeath = onPlayerDeath;

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
    combatStats: Partial<PlayerCombatStats>,
    spawnOverride?: Vector2,
  ): PlayerState {
    const fallbackSpawn = findSpawnPoint(this.map, this.map.playerSpawnId) ??
      this.map.spawnPoints[0] ?? { x: 120, y: 120 };
    const spawn = spawnOverride ?? fallbackSpawn;
    const resolvedCombat = resolveCombatStats(combatStats);

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
      currentHealth: resolvedCombat.currentHealth,
      maxHealth: resolvedCombat.maxHealth,
      baseDamage: resolvedCombat.baseDamage,
      baseAttackSpeedMs: resolvedCombat.baseAttackSpeedMs,
      baseAttackRange: resolvedCombat.baseAttackRange,
      nextAttackAtMs: 0,
      pendingRespawn: false,
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

    return player;
  }

  removePlayer(characterId: string, connectionId: string): PlayerState | null {
    const removed = this.players.get(characterId);
    if (!removed) {
      return null;
    }
    if (removed.connectionId !== connectionId) {
      return null;
    }

    this.players.delete(characterId);

    this.broadcast({
      type: "world.playerLeft",
      worldId: this.worldId,
      characterId,
    });
    return removed;
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
    if (player.pendingRespawn || player.currentHealth <= 0) {
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
        currentHealth: player.currentHealth,
        maxHealth: player.maxHealth,
      }),
    );

    return portal ?? null;
  }

  applyAttack(
    characterId: string,
    connectionId: string,
    message: Extract<ClientToServerMessage, { type: "player.attack" }>,
  ): void {
    const player = this.players.get(characterId);
    if (!player || player.connectionId !== connectionId) {
      return;
    }
    if (player.pendingRespawn || player.currentHealth <= 0) {
      player.socket.send(
        stringifyServerMessage({
          type: "combat.attackDenied",
          reason: "dead",
          message: "You are down.",
        }),
      );
      return;
    }
    if (!this.map.combat.allowCombat) {
      player.socket.send(
        stringifyServerMessage({
          type: "combat.attackDenied",
          reason: "safe_zone",
          message: "Safe zone: combat disabled.",
        }),
      );
      return;
    }

    const now = Date.now();
    if (now < player.nextAttackAtMs) {
      player.socket.send(
        stringifyServerMessage({
          type: "combat.attackDenied",
          reason: "cooldown",
          message: "Attack on cooldown.",
        }),
      );
      return;
    }

    const direction = normalizeDirection(player.position, message.aim);
    const attackStyle = player.class === "mage" ? "ranged" : "melee";
    player.nextAttackAtMs = now + player.baseAttackSpeedMs;

    this.broadcast({
      type: "combat.attackPerformed",
      attackerId: player.id,
      attackStyle,
      origin: { x: player.position.x, y: player.position.y },
      direction,
      range: player.baseAttackRange,
    });

    if (attackStyle === "melee") {
      this.applyMeleeAttack(player, direction);
      return;
    }

    this.spawnPlayerProjectile(player, direction);
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
    this.tickProjectiles(dtMs);
    this.tickEnemies(now, dtMs);
    this.flushDeadPlayers();
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
          x: position.x,
          y: position.y,
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
    const enemyCollidersById = new Map<string, CollisionShape>();
    for (const enemy of this.enemies.values()) {
      enemyCollidersById.set(enemy.id, this.toEnemyCollider(enemy));
    }
    const dtSeconds = clampInputDtMs(dtMs) / 1000;

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
            this.applyEnemyAttack(enemy, target);
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

      const dynamicEnemyColliders: CollisionShape[] = [];
      for (const [candidateId, collider] of enemyCollidersById) {
        if (candidateId === enemy.id) {
          continue;
        }
        dynamicEnemyColliders.push(collider);
      }

      const previousPosition = enemy.position;
      const nextPosition = resolveMovementWithSliding(
        previousPosition,
        velocity,
        dtMs,
        this.map,
        {
          width: enemy.archetype.visualWidth,
          height: enemy.archetype.visualHeight,
        },
        [...playerColliders, ...dynamicEnemyColliders],
      );
      enemy.position = nextPosition;
      enemy.velocity = {
        x: (nextPosition.x - previousPosition.x) / dtSeconds,
        y: (nextPosition.y - previousPosition.y) / dtSeconds,
      };
      enemy.state = desiredState;
      enemyCollidersById.set(enemy.id, this.toEnemyCollider(enemy));
    }
  }

  private tickProjectiles(dtMs: number): void {
    if (this.projectiles.size === 0) {
      return;
    }

    const dtSeconds = clampInputDtMs(dtMs) / 1000;
    const collisionRects = this.map.collisions;
    const worldWidth = this.map.width;
    const worldHeight = this.map.height;

    for (const projectile of this.projectiles.values()) {
      projectile.ttlMsRemaining -= dtMs;
      if (projectile.ttlMsRemaining <= 0) {
        this.projectiles.delete(projectile.id);
        continue;
      }

      const nextPosition = {
        x: projectile.position.x + projectile.velocity.x * dtSeconds,
        y: projectile.position.y + projectile.velocity.y * dtSeconds,
      };

      const outsideBounds =
        nextPosition.x < 0 ||
        nextPosition.y < 0 ||
        nextPosition.x > worldWidth ||
        nextPosition.y > worldHeight;
      if (outsideBounds) {
        this.projectiles.delete(projectile.id);
        continue;
      }

      const collidesMap = collisionRects.some(
        (shape) =>
          nextPosition.x + projectile.radius > shape.x &&
          nextPosition.x - projectile.radius < shape.x + shape.width &&
          nextPosition.y + projectile.radius > shape.y &&
          nextPosition.y - projectile.radius < shape.y + shape.height,
      );
      if (collidesMap) {
        this.projectiles.delete(projectile.id);
        continue;
      }

      projectile.position = nextPosition;

      if (this.tryHitEnemyWithProjectile(projectile)) {
        this.projectiles.delete(projectile.id);
        continue;
      }

      if (this.tryHitPlayerWithProjectile(projectile)) {
        this.projectiles.delete(projectile.id);
      }
    }
  }

  private resolveOrAcquireTarget(enemy: EnemyState): PlayerState | null {
    if (!this.map.combat.allowCombat) {
      enemy.targetCharacterId = null;
      return null;
    }

    if (enemy.targetCharacterId) {
      const existing = this.players.get(enemy.targetCharacterId);
      if (existing && existing.currentHealth > 0 && !existing.pendingRespawn) {
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
      if (player.currentHealth <= 0 || player.pendingRespawn) {
        continue;
      }
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
    const meleeRangeSq =
      enemy.archetype.meleeRange * enemy.archetype.meleeRange;
    const rangedRangeSq =
      enemy.archetype.rangedRange * enemy.archetype.rangedRange;

    return (
      (enemy.archetype.canMelee && distanceSq <= meleeRangeSq) ||
      (enemy.archetype.canRanged && distanceSq <= rangedRangeSq)
    );
  }

  private applyEnemyAttack(enemy: EnemyState, target: PlayerState): void {
    if (!this.canEnemyDamagePlayer()) {
      return;
    }
    this.applyDamageToPlayer(target, enemy.archetype.damage);
  }

  private applyMeleeAttack(player: PlayerState, direction: Vector2): void {
    if (!this.canPlayerDamageEnemy()) {
      return;
    }

    for (const enemy of this.enemies.values()) {
      const distanceToEnemySq = distanceSquared(
        player.position,
        enemy.position,
      );
      const extraRange =
        Math.max(enemy.archetype.visualWidth, enemy.archetype.visualHeight) / 2;
      if (distanceToEnemySq > (player.baseAttackRange + extraRange) ** 2) {
        continue;
      }

      const facing = normalizeDirection(player.position, enemy.position);
      if (dotProduct(facing, direction) < MELEE_ARC_COS_THRESHOLD) {
        continue;
      }

      this.applyDamageToEnemy(enemy.id, player.baseDamage);
    }
  }

  private spawnPlayerProjectile(player: PlayerState, direction: Vector2): void {
    const projectile: ProjectileState = {
      id: `projectile-${crypto.randomUUID()}`,
      ownerCharacterId: player.id,
      position: {
        x: player.position.x + direction.x * (PLAYER_COLLIDER_SIZE.width / 2),
        y: player.position.y + direction.y * (PLAYER_COLLIDER_SIZE.height / 2),
      },
      velocity: {
        x: direction.x * PLAYER_PROJECTILE_SPEED,
        y: direction.y * PLAYER_PROJECTILE_SPEED,
      },
      radius: PLAYER_PROJECTILE_RADIUS,
      damage: player.baseDamage,
      ttlMsRemaining: PLAYER_PROJECTILE_TTL_MS,
      colorHex: player.class === "mage" ? "#67e8f9" : "#fbbf24",
    };
    this.projectiles.set(projectile.id, projectile);
  }

  private tryHitEnemyWithProjectile(projectile: ProjectileState): boolean {
    if (!this.canPlayerDamageEnemy()) {
      return false;
    }

    for (const enemy of this.enemies.values()) {
      const halfWidth = enemy.archetype.visualWidth / 2;
      const halfHeight = enemy.archetype.visualHeight / 2;
      const hit =
        projectile.position.x + projectile.radius >=
          enemy.position.x - halfWidth &&
        projectile.position.x - projectile.radius <=
          enemy.position.x + halfWidth &&
        projectile.position.y + projectile.radius >=
          enemy.position.y - halfHeight &&
        projectile.position.y - projectile.radius <=
          enemy.position.y + halfHeight;
      if (!hit) {
        continue;
      }

      this.applyDamageToEnemy(enemy.id, projectile.damage);
      return true;
    }

    return false;
  }

  private tryHitPlayerWithProjectile(projectile: ProjectileState): boolean {
    if (!this.canPlayerDamagePlayer()) {
      return false;
    }

    for (const player of this.players.values()) {
      if (player.id === projectile.ownerCharacterId) {
        continue;
      }
      if (player.currentHealth <= 0 || player.pendingRespawn) {
        continue;
      }

      const halfWidth = PLAYER_COLLIDER_SIZE.width / 2;
      const halfHeight = PLAYER_COLLIDER_SIZE.height / 2;
      const hit =
        projectile.position.x + projectile.radius >=
          player.position.x - halfWidth &&
        projectile.position.x - projectile.radius <=
          player.position.x + halfWidth &&
        projectile.position.y + projectile.radius >=
          player.position.y - halfHeight &&
        projectile.position.y - projectile.radius <=
          player.position.y + halfHeight;
      if (!hit) {
        continue;
      }

      this.applyDamageToPlayer(player, projectile.damage);
      return true;
    }

    return false;
  }

  private applyDamageToEnemy(enemyId: string, amount: number): void {
    const enemy = this.enemies.get(enemyId);
    if (!enemy) {
      return;
    }

    enemy.currentHealth = Math.max(0, enemy.currentHealth - amount);
    if (enemy.currentHealth > 0) {
      return;
    }

    this.enemies.delete(enemy.id);
  }

  private applyDamageToPlayer(player: PlayerState, amount: number): void {
    if (!this.canEnemyDamagePlayer()) {
      return;
    }
    if (player.pendingRespawn || player.currentHealth <= 0) {
      return;
    }

    player.currentHealth = clampHealth(
      player.currentHealth - amount,
      player.maxHealth,
    );
    if (player.currentHealth > 0) {
      return;
    }

    player.pendingRespawn = true;
    player.velocity = { x: 0, y: 0 };
    this.deadPlayerQueue.set(player.id, player.socket);
  }

  private flushDeadPlayers(): void {
    if (this.deadPlayerQueue.size === 0) {
      return;
    }

    const queued = [...this.deadPlayerQueue.entries()];
    this.deadPlayerQueue.clear();

    for (const [characterId, socket] of queued) {
      this.onPlayerDeath(socket, characterId);
    }
  }

  private canPlayerDamageEnemy(): boolean {
    return this.map.combat.allowCombat;
  }

  private canEnemyDamagePlayer(): boolean {
    return this.map.combat.allowCombat;
  }

  private canPlayerDamagePlayer(): boolean {
    return this.map.combat.allowCombat && this.map.combat.pvpEnabled;
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

  private getEnemyColliders(
    predicate: (enemy: EnemyState) => boolean = () => true,
  ): CollisionShape[] {
    const colliders: CollisionShape[] = [];
    for (const enemy of this.enemies.values()) {
      if (!predicate(enemy)) {
        continue;
      }
      colliders.push(this.toEnemyCollider(enemy));
    }
    return colliders;
  }

  private toEnemyCollider(enemy: EnemyState): CollisionShape {
    return centeredBoxToCollisionShape(enemy.position, {
      width: enemy.archetype.visualWidth,
      height: enemy.archetype.visualHeight,
    });
  }

  private createSnapshotPayload(): {
    worldId: string;
    serverTimeMs: number;
    players: PlayerSnapshot[];
    enemies: EnemySnapshot[];
    projectiles: ProjectileSnapshot[];
  } {
    return {
      worldId: this.worldId,
      serverTimeMs: Date.now(),
      players: [...this.players.values()].map((player) => toSnapshot(player)),
      enemies: [...this.enemies.values()].map((enemy) =>
        toEnemySnapshot(enemy),
      ),
      projectiles: [...this.projectiles.values()].map((projectile) =>
        toProjectileSnapshot(projectile),
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
        characterCurrentHealth: null,
        characterMaxHealth: null,
        characterBaseDamage: null,
        characterBaseAttackSpeedMs: null,
        characterBaseAttackRange: null,
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

    const player = instance.addPlayer(
      socket.data.session.connectionId,
      characterId,
      nickname,
      characterClass,
      colorHex,
      socket,
      options?.combatStats ?? {
        currentHealth: socket.data.session.characterCurrentHealth ?? undefined,
        maxHealth: socket.data.session.characterMaxHealth ?? undefined,
        baseDamage: socket.data.session.characterBaseDamage ?? undefined,
        baseAttackSpeedMs:
          socket.data.session.characterBaseAttackSpeedMs ?? undefined,
        baseAttackRange:
          socket.data.session.characterBaseAttackRange ?? undefined,
      },
      options?.spawnOverride,
    );
    const spawn = player.position;
    socket.data.session.worldId = worldId;
    socket.data.session.characterId = characterId;
    socket.data.session.characterNickname = nickname;
    socket.data.session.characterClass = characterClass;
    socket.data.session.characterColorHex = colorHex;
    socket.data.session.characterCurrentHealth = player.currentHealth;
    socket.data.session.characterMaxHealth = player.maxHealth;
    socket.data.session.characterBaseDamage = player.baseDamage;
    socket.data.session.characterBaseAttackSpeedMs = player.baseAttackSpeedMs;
    socket.data.session.characterBaseAttackRange = player.baseAttackRange;

    socket.send(
      stringifyServerMessage({
        type: "world.joined",
        worldId,
        characterId,
        nickname,
        class: characterClass,
        colorHex,
        spawn,
        currentHealth: player.currentHealth,
        maxHealth: player.maxHealth,
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

    const removed = instance.removePlayer(characterId, connectionId);
    socket.data.session.worldId = null;
    if (removed) {
      socket.data.session.characterCurrentHealth = removed.currentHealth;
      socket.data.session.characterMaxHealth = removed.maxHealth;
      socket.data.session.characterBaseDamage = removed.baseDamage;
      socket.data.session.characterBaseAttackSpeedMs =
        removed.baseAttackSpeedMs;
      socket.data.session.characterBaseAttackRange = removed.baseAttackRange;
    }

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

  applyAttack(
    socket: ServerWebSocket<RealtimeSocketData>,
    message: Extract<ClientToServerMessage, { type: "player.attack" }>,
  ): void {
    const { connectionId, characterId, worldId } = socket.data.session;
    if (!characterId || !worldId) {
      return;
    }

    const instance = this.instances.get(worldId);
    if (!instance) {
      return;
    }

    instance.applyAttack(characterId, connectionId, message);
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

    const created = new WorldInstance(
      worldId,
      map,
      this.resolveEnemyArchetype,
      (socket, characterId) => {
        this.handlePlayerDeath(socket, characterId);
      },
    );
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
      characterCurrentHealth,
      characterMaxHealth,
      characterBaseDamage,
      characterBaseAttackSpeedMs,
      characterBaseAttackRange,
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
        combatStats: {
          currentHealth: characterCurrentHealth ?? undefined,
          maxHealth: characterMaxHealth ?? undefined,
          baseDamage: characterBaseDamage ?? undefined,
          baseAttackSpeedMs: characterBaseAttackSpeedMs ?? undefined,
          baseAttackRange: characterBaseAttackRange ?? undefined,
        },
        spawnOverride: {
          x: targetSpawn.x + portal.exitOffset.x,
          y: targetSpawn.y + portal.exitOffset.y,
        },
      },
    );
  }

  private handlePlayerDeath(
    socket: ServerWebSocket<RealtimeSocketData>,
    characterId: string,
  ): void {
    const {
      worldId,
      characterId: sessionCharacterId,
      characterNickname,
      characterClass,
      characterColorHex,
      characterMaxHealth,
      characterBaseDamage,
      characterBaseAttackSpeedMs,
      characterBaseAttackRange,
    } = socket.data.session;
    if (
      !worldId ||
      !sessionCharacterId ||
      sessionCharacterId !== characterId ||
      !characterNickname ||
      !characterClass ||
      !characterColorHex
    ) {
      return;
    }

    const respawnWorldId = DEFAULT_WORLD_ID;
    const maxHealth = Math.max(1, characterMaxHealth ?? DEFAULT_PLAYER_MAX_HP);
    socket.data.session.characterCurrentHealth = maxHealth;

    socket.send(
      stringifyServerMessage({
        type: "combat.playerDied",
        characterId,
        respawnWorldId,
      }),
    );

    const fromWorldId = worldId;
    this.leaveWorld(socket);
    socket.send(
      stringifyServerMessage({
        type: "world.transitioning",
        fromWorldId,
        toWorldId: respawnWorldId,
        portalId: "respawn",
        reason: "respawn",
      }),
    );

    this.joinWorld(
      socket,
      respawnWorldId,
      characterId,
      characterNickname,
      characterClass,
      characterColorHex,
      {
        combatStats: {
          currentHealth: maxHealth,
          maxHealth,
          baseDamage: characterBaseDamage ?? DEFAULT_PLAYER_DAMAGE,
          baseAttackSpeedMs:
            characterBaseAttackSpeedMs ?? DEFAULT_PLAYER_ATTACK_SPEED_MS,
          baseAttackRange:
            characterBaseAttackRange ?? DEFAULT_PLAYER_ATTACK_RANGE,
        },
      },
    );
  }
}
