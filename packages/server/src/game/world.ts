import type {
  AttackPatternId,
  CharacterBaseCombatStats,
  CharacterClass,
  ClientToServerMessage,
  CollisionShape,
  ContainerActionErrorCode,
  EnemyArchetype,
  EnemyBehaviorState,
  EnemySnapshot,
  InventoryItemInstance,
  LootBagSnapshot,
  PlayerSnapshot,
  PortalTrigger,
  ProjectileSnapshot,
  ResolvedWeaponAttackConfig,
  ServerToClientMessage,
  Vector2,
  WeaponStatModifiers,
  WeaponStyle,
  WorldMap,
} from "@mmo/shared";
import {
  DEFAULT_WORLD_ID,
  LOOT_BAG_INTERACT_RADIUS,
  LOOT_BAG_SLOT_COUNT,
  PLAYER_COLLIDER_SIZE,
  WORLD_MAPS_BY_ID,
  applyCharacterExperience,
  applyWeaponModifiersToCombatStats,
  centeredBoxToCollisionShape,
  clampInputDtMs,
  clampToWorldBounds,
  computeAdjustedEnemyExperience,
  computeLevelScaledCombatStats,
  findSpawnPoint,
  getCharacterClassBaseCombatStats,
  getXpToNextLevelForLevel,
  inputToVelocity,
  normalizeCharacterProgress,
  normalizeWeaponStatModifiers,
  positionCollidesWithMap,
  resolveMovementWithSliding,
  resolveWeaponAttackConfig,
  stringifyServerMessage,
} from "@mmo/shared";
import type { ServerWebSocket } from "bun";

const SNAPSHOT_INTERVAL_MS = 100;
const SIMULATION_INTERVAL_MS = 50;
const ENEMY_SPAWN_ATTEMPTS = 12;
const ENEMY_IDLE_EPSILON = 4;
const PLAYER_PROJECTILE_SPEED = 640;
const PLAYER_PROJECTILE_TTL_MS = 900;
const PLAYER_PROJECTILE_RADIUS = 8;
const SWORD_CLEAVE_ARC_THRESHOLD = 0.45;
const SPINBLADE_CAST_COOLDOWN_MIN_MS = 2_000;
const SPINBLADE_SPEED = 220;
const SPINBLADE_TTL_MS = 3_200;
const SPINBLADE_RADIUS = 20;
const SPINBLADE_HIT_INTERVAL_MS = 1_000;
const ATTACK_TRACKER_TTL_MS = 8_000;
const LOOT_BAG_DESPAWN_MS = 5 * 60 * 1000;
const LOOT_BAG_OWNER_GRACE_MS = 10 * 1000;
const LOOT_BAG_INTERACT_RADIUS_SQ =
  LOOT_BAG_INTERACT_RADIUS * LOOT_BAG_INTERACT_RADIUS;
const LOOT_BAG_DROP_DISTANCE = 42;

interface PlayerCombatStats {
  currentHealth: number;
  maxHealth: number;
  baseDamage: number;
  baseAttackSpeedMs: number;
  baseAttackRange: number;
}

interface PlayerProgression {
  level: number;
  xp: number;
  xpToNextLevel: number | null;
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
  rawMaxHealth: number;
  rawBaseDamage: number;
  rawBaseAttackSpeedMs: number;
  rawBaseAttackRange: number;
  weaponDamageFlat: number;
  weaponRangeFlat: number;
  weaponSpeedPercent: number;
  attackConfig: ResolvedWeaponAttackConfig;
  level: number;
  xp: number;
  nextAttackAtMs: number;
  pendingRespawn: boolean;
  openedContainerId: string | null;
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
  style: "orb" | "blade_spin";
  destroyOnHit: boolean;
  nextDamageAllowedAtMs: number;
  attackInstanceId: string | null;
  capSingleTargetPerAttack: boolean;
}

interface PendingBurstProjectileEvent {
  id: string;
  kind: "burst_projectile";
  ownerCharacterId: string;
  triggerAtMs: number;
  origin: Vector2;
  direction: Vector2;
  damage: number;
  colorHex: string;
  attackInstanceId: string | null;
  capSingleTargetPerAttack: boolean;
}

interface PendingAoeImpactEvent {
  id: string;
  kind: "aoe_impact";
  ownerCharacterId: string;
  triggerAtMs: number;
  center: Vector2;
  radius: number;
  damage: number;
}

type PendingAttackEvent = PendingBurstProjectileEvent | PendingAoeImpactEvent;

interface AttackHitTracker {
  enemyIds: Set<string>;
  playerIds: Set<string>;
  expiresAtMs: number;
}

interface LootBagState {
  id: string;
  position: Vector2;
  slots: Array<InventoryItemInstance | null>;
  createdAtEpochMs: number;
  expiresAtEpochMs: number;
  ownerCharacterId: string | null;
  ownerLockedUntilEpochMs: number | null;
  openedByCharacterId: string | null;
  pendingDespawn: boolean;
}

interface JoinWorldOptions {
  spawnOverride?: Vector2;
  combatStats?: Partial<PlayerCombatStats>;
  baseStats?: Partial<CharacterBaseCombatStats>;
  progression?: Partial<PlayerProgression>;
  weaponModifiers?: Partial<WeaponStatModifiers>;
  attackConfig?: Partial<ResolvedWeaponAttackConfig>;
}

interface CharacterProgressionUpdate {
  userId: string;
  characterId: string;
  level: number;
  xp: number;
}

type PersistCharacterProgression = (update: CharacterProgressionUpdate) => void;

interface WorldManagerOptions {
  resolveEnemyArchetype?: (archetypeId: string) => EnemyArchetype | null;
  persistCharacterProgression?: PersistCharacterProgression;
  resolveEnemyLootDropDefinitionIds?: (
    enemyArchetypeId: string,
    killerClass: CharacterClass | null,
  ) => string[];
}

export interface ContainerOpenSuccess {
  ok: true;
  state: {
    containerId: string;
    slots: Array<InventoryItemInstance | null>;
    slotCount: number;
    openedByCharacterId: string | null;
    ownerCharacterId: string | null;
    ownerLockedUntilEpochMs: number | null;
  };
}

export interface ContainerOpenError {
  ok: false;
  code: ContainerActionErrorCode;
  message: string;
}

export type ContainerOpenResult = ContainerOpenSuccess | ContainerOpenError;

export interface ContainerUpdateResult {
  ok: true;
  state: {
    containerId: string;
    slots: Array<InventoryItemInstance | null>;
    slotCount: number;
    openedByCharacterId: string | null;
    ownerCharacterId: string | null;
    ownerLockedUntilEpochMs: number | null;
  };
}

export type ContainerUpdateStateResult =
  | ContainerUpdateResult
  | ContainerOpenError;

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
  characterRawMaxHealth: number | null;
  characterRawBaseDamage: number | null;
  characterRawBaseAttackSpeedMs: number | null;
  characterRawBaseAttackRange: number | null;
  characterWeaponDamageFlat: number | null;
  characterWeaponRangeFlat: number | null;
  characterWeaponSpeedPercent: number | null;
  characterWeaponStyle: WeaponStyle | null;
  characterAttackPatternId: AttackPatternId | null;
  characterAttackDamageMultiplier: number | null;
  characterAttackProjectileCount: number | null;
  characterAttackSpreadDegrees: number | null;
  characterAttackBurstCount: number | null;
  characterAttackBurstIntervalMs: number | null;
  characterAttackAoeRadius: number | null;
  characterAttackAoeDelayMs: number | null;
  characterAttackMaxTargetHitsPerAttack: number | null;
  characterLevel: number | null;
  characterXp: number | null;
  characterXpToNextLevel: number | null;
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
    style: projectile.style,
  };
}

function toLootBagSnapshot(lootBag: LootBagState): LootBagSnapshot {
  let itemCount = 0;
  for (const item of lootBag.slots) {
    if (item) {
      itemCount += 1;
    }
  }

  return {
    id: lootBag.id,
    position: lootBag.position,
    itemCount,
    slotCount: lootBag.slots.length,
    openedByCharacterId: lootBag.openedByCharacterId,
    ownerCharacterId: lootBag.ownerCharacterId,
    ownerLockedUntilEpochMs: lootBag.ownerLockedUntilEpochMs,
    expiresAtEpochMs: lootBag.expiresAtEpochMs,
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

function rotateDirection(direction: Vector2, radians: number): Vector2 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: direction.x * cos - direction.y * sin,
    y: direction.x * sin + direction.y * cos,
  };
}

function createEmptyLootBagSlots(): Array<InventoryItemInstance | null> {
  return Array.from({ length: LOOT_BAG_SLOT_COUNT }, () => null);
}

function countFilledSlots(
  slots: ReadonlyArray<InventoryItemInstance | null>,
): number {
  let count = 0;
  for (const slot of slots) {
    if (slot) {
      count += 1;
    }
  }
  return count;
}

function clampHealth(current: number, max: number): number {
  return Math.max(0, Math.min(max, current));
}

function resolveCombatStats(
  characterClass: CharacterClass,
  partial?: Partial<PlayerCombatStats>,
): PlayerCombatStats {
  const classDefaults = getCharacterClassBaseCombatStats(characterClass);
  const maxHealth = Math.max(
    1,
    Number.isFinite(partial?.maxHealth ?? Number.NaN)
      ? (partial?.maxHealth ?? classDefaults.maxHp)
      : classDefaults.maxHp,
  );
  const currentHealthRaw = Number.isFinite(partial?.currentHealth ?? Number.NaN)
    ? (partial?.currentHealth ?? maxHealth)
    : maxHealth;
  return {
    maxHealth,
    currentHealth: clampHealth(currentHealthRaw, maxHealth),
    baseDamage: Math.max(0, partial?.baseDamage ?? classDefaults.baseDamage),
    baseAttackSpeedMs: Math.max(
      1,
      Math.floor(partial?.baseAttackSpeedMs ?? classDefaults.baseAttackSpeedMs),
    ),
    baseAttackRange: Math.max(
      1,
      partial?.baseAttackRange ?? classDefaults.baseAttackRange,
    ),
  };
}

function resolveBaseStats(
  characterClass: CharacterClass,
  baseStats?: Partial<CharacterBaseCombatStats>,
): CharacterBaseCombatStats {
  const classDefaults = getCharacterClassBaseCombatStats(characterClass);
  return {
    maxHp: Math.max(1, baseStats?.maxHp ?? classDefaults.maxHp),
    baseDamage: Math.max(0, baseStats?.baseDamage ?? classDefaults.baseDamage),
    baseAttackSpeedMs: Math.max(
      1,
      Math.floor(
        baseStats?.baseAttackSpeedMs ?? classDefaults.baseAttackSpeedMs,
      ),
    ),
    baseAttackRange: Math.max(
      1,
      baseStats?.baseAttackRange ?? classDefaults.baseAttackRange,
    ),
  };
}

function resolveProgression(
  partialProgression?: Partial<PlayerProgression>,
): PlayerProgression {
  const normalized = normalizeCharacterProgress(
    partialProgression?.level ?? 1,
    partialProgression?.xp ?? 0,
  );
  return {
    level: normalized.level,
    xp: normalized.xp,
    xpToNextLevel: normalized.xpToNextLevel,
  };
}

function resolveWeaponModifiers(
  partialModifiers?: Partial<WeaponStatModifiers>,
): WeaponStatModifiers {
  return normalizeWeaponStatModifiers(partialModifiers);
}

function resolveAttackConfig(
  characterClass: CharacterClass,
  partialConfig?: Partial<ResolvedWeaponAttackConfig>,
): ResolvedWeaponAttackConfig {
  return resolveWeaponAttackConfig(
    {
      id: "runtime-weapon",
      name: "Runtime Weapon",
      iconKey: "runtime-weapon",
      type: "weapon",
      classRequirement: characterClass,
      minLevelToEquip: null,
      weaponDamageFlat: 0,
      weaponRangeFlat: 0,
      weaponSpeedPercent: 0,
      weaponStyle: partialConfig?.weaponStyle ?? null,
      attackPatternId: partialConfig?.attackPatternId ?? null,
      attackDamageMultiplier: partialConfig?.damageMultiplier ?? null,
      attackProjectileCount: partialConfig?.projectileCount ?? null,
      attackSpreadDegrees: partialConfig?.spreadDegrees ?? null,
      attackBurstCount: partialConfig?.burstCount ?? null,
      attackBurstIntervalMs: partialConfig?.burstIntervalMs ?? null,
      attackAoeRadius: partialConfig?.aoeRadius ?? null,
      attackAoeDelayMs: partialConfig?.aoeDelayMs ?? null,
    },
    characterClass,
  );
}

function computeEffectiveCombatStatsForLevel(
  baseStats: CharacterBaseCombatStats,
  level: number,
  weaponModifiers: WeaponStatModifiers,
): Pick<
  PlayerCombatStats,
  "maxHealth" | "baseDamage" | "baseAttackSpeedMs" | "baseAttackRange"
> {
  const scaledBase = computeLevelScaledCombatStats(baseStats, level);
  const effective = applyWeaponModifiersToCombatStats(
    {
      baseDamage: scaledBase.baseDamage,
      baseAttackRange: scaledBase.baseAttackRange,
      baseAttackSpeedMs: scaledBase.baseAttackSpeedMs,
    },
    weaponModifiers,
  );

  return {
    maxHealth: scaledBase.maxHp,
    baseDamage: effective.baseDamage,
    baseAttackSpeedMs: effective.baseAttackSpeedMs,
    baseAttackRange: effective.baseAttackRange,
  };
}

function recalculateNextAttackAtMs(
  previousNextAttackAtMs: number,
  previousAttackSpeedMs: number,
  nextAttackSpeedMs: number,
  now: number,
): number {
  if (previousNextAttackAtMs <= now) {
    return previousNextAttackAtMs;
  }

  const previousAttackAtMs = previousNextAttackAtMs - previousAttackSpeedMs;
  return Math.max(now, previousAttackAtMs + nextAttackSpeedMs);
}

class WorldInstance {
  readonly worldId: string;
  readonly map: WorldMap;

  private players = new Map<string, PlayerState>();
  private enemies = new Map<string, EnemyState>();
  private projectiles = new Map<string, ProjectileState>();
  private pendingAttackEvents: PendingAttackEvent[] = [];
  private attackHitTracker = new Map<string, AttackHitTracker>();
  private lootBags = new Map<string, LootBagState>();
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
  private readonly persistCharacterProgression: PersistCharacterProgression | null;
  private readonly resolveEnemyLootDropDefinitionIds: (
    enemyArchetypeId: string,
    killerClass: CharacterClass | null,
  ) => string[];

  constructor(
    worldId: string,
    map: WorldMap,
    resolveEnemyArchetype: (archetypeId: string) => EnemyArchetype | null,
    onPlayerDeath: (
      socket: ServerWebSocket<RealtimeSocketData>,
      characterId: string,
    ) => void,
    persistCharacterProgression: PersistCharacterProgression | null = null,
    resolveEnemyLootDropDefinitionIds: (
      enemyArchetypeId: string,
      killerClass: CharacterClass | null,
    ) => string[] = () => [],
  ) {
    this.worldId = worldId;
    this.map = map;
    this.resolveEnemyArchetype = resolveEnemyArchetype;
    this.onPlayerDeath = onPlayerDeath;
    this.persistCharacterProgression = persistCharacterProgression;
    this.resolveEnemyLootDropDefinitionIds = resolveEnemyLootDropDefinitionIds;

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
    baseStats: Partial<CharacterBaseCombatStats>,
    progression: Partial<PlayerProgression>,
    weaponModifiers?: Partial<WeaponStatModifiers>,
    attackConfig?: Partial<ResolvedWeaponAttackConfig>,
    spawnOverride?: Vector2,
  ): PlayerState {
    const fallbackSpawn = findSpawnPoint(this.map, this.map.playerSpawnId) ??
      this.map.spawnPoints[0] ?? { x: 120, y: 120 };
    const spawn = spawnOverride ?? fallbackSpawn;
    const resolvedBaseStats = resolveBaseStats(characterClass, baseStats);
    const resolvedProgression = resolveProgression(progression);
    const resolvedWeaponModifiers = resolveWeaponModifiers(weaponModifiers);
    const resolvedAttackConfig = resolveAttackConfig(
      characterClass,
      attackConfig,
    );
    const effectiveCombatStats = computeEffectiveCombatStatsForLevel(
      resolvedBaseStats,
      resolvedProgression.level,
      resolvedWeaponModifiers,
    );
    const resolvedCombat = resolveCombatStats(characterClass, {
      maxHealth: combatStats.maxHealth ?? effectiveCombatStats.maxHealth,
      currentHealth: combatStats.currentHealth ?? combatStats.maxHealth,
      baseDamage: combatStats.baseDamage ?? effectiveCombatStats.baseDamage,
      baseAttackSpeedMs:
        combatStats.baseAttackSpeedMs ?? effectiveCombatStats.baseAttackSpeedMs,
      baseAttackRange:
        combatStats.baseAttackRange ?? effectiveCombatStats.baseAttackRange,
    });

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
      rawMaxHealth: resolvedBaseStats.maxHp,
      rawBaseDamage: resolvedBaseStats.baseDamage,
      rawBaseAttackSpeedMs: resolvedBaseStats.baseAttackSpeedMs,
      rawBaseAttackRange: resolvedBaseStats.baseAttackRange,
      weaponDamageFlat: resolvedWeaponModifiers.damageFlat,
      weaponRangeFlat: resolvedWeaponModifiers.rangeFlat,
      weaponSpeedPercent: resolvedWeaponModifiers.speedPercent,
      attackConfig: resolvedAttackConfig,
      level: resolvedProgression.level,
      xp: resolvedProgression.xp,
      nextAttackAtMs: 0,
      pendingRespawn: false,
      openedContainerId: null,
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

    if (removed.openedContainerId) {
      this.closeLootBagForPlayer(removed.id, "disconnect");
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
    const attackConfig = player.attackConfig;
    let target: Vector2 | undefined;
    let aoeRadius: number | undefined;
    let impactDelayMs: number | undefined;
    let attackCooldownMs = player.baseAttackSpeedMs;

    switch (attackConfig.attackPatternId) {
      case "sword_cleave":
        this.applyMeleeAttack(
          player,
          direction,
          SWORD_CLEAVE_ARC_THRESHOLD,
          attackConfig.damageMultiplier,
          attackConfig.maxTargetHitsPerAttack,
        );
        break;
      case "sword_spinblade":
        attackCooldownMs = Math.max(
          player.baseAttackSpeedMs,
          SPINBLADE_CAST_COOLDOWN_MIN_MS,
        );
        this.spawnSpinbladeProjectile(player, direction);
        break;
      case "sword_whirl":
        target = { x: player.position.x, y: player.position.y };
        aoeRadius = attackConfig.aoeRadius;
        impactDelayMs = 0;
        this.applyAoeImpact(
          player.id,
          target,
          attackConfig.aoeRadius,
          player.baseDamage * attackConfig.damageMultiplier,
        );
        break;
      case "wand_multishot":
        this.spawnMultiShotProjectiles(player, direction, now);
        break;
      case "wand_burst":
        this.enqueueBurstProjectiles(player, direction, now);
        break;
      case "staff_ground_aoe": {
        const clamped = this.resolveAoeTarget(
          player,
          message.aim,
          attackConfig.aoeRadius,
        );
        target = clamped;
        aoeRadius = attackConfig.aoeRadius;
        impactDelayMs = attackConfig.aoeDelayMs;
        this.enqueueAoeImpact(player, clamped, now);
        break;
      }
      default:
        this.spawnPlayerProjectile(player, direction, player.baseDamage);
        break;
    }
    player.nextAttackAtMs = now + attackCooldownMs;

    this.broadcast({
      type: "combat.attackPerformed",
      attackerId: player.id,
      attackStyle: attackConfig.attackStyle,
      attackPatternId: attackConfig.attackPatternId,
      weaponStyle: attackConfig.weaponStyle,
      origin: { x: player.position.x, y: player.position.y },
      direction,
      range: player.baseAttackRange,
      target,
      aoeRadius,
      impactDelayMs,
    });
  }

  updatePlayerWeaponModifiers(
    characterId: string,
    connectionId: string,
    modifiers: WeaponStatModifiers,
    attackConfig?: Partial<ResolvedWeaponAttackConfig>,
  ): PlayerState | null {
    const player = this.players.get(characterId);
    if (!player || player.connectionId !== connectionId) {
      return null;
    }

    const safeModifiers = resolveWeaponModifiers(modifiers);
    const previousAttackSpeedMs = player.baseAttackSpeedMs;
    const previousNextAttackAtMs = player.nextAttackAtMs;
    player.weaponDamageFlat = safeModifiers.damageFlat;
    player.weaponRangeFlat = safeModifiers.rangeFlat;
    player.weaponSpeedPercent = safeModifiers.speedPercent;
    player.attackConfig = resolveAttackConfig(
      player.class,
      attackConfig ?? player.attackConfig,
    );

    const effectiveStats = computeEffectiveCombatStatsForLevel(
      {
        maxHp: player.rawMaxHealth,
        baseDamage: player.rawBaseDamage,
        baseAttackSpeedMs: player.rawBaseAttackSpeedMs,
        baseAttackRange: player.rawBaseAttackRange,
      },
      player.level,
      safeModifiers,
    );

    player.baseDamage = effectiveStats.baseDamage;
    player.baseAttackSpeedMs = effectiveStats.baseAttackSpeedMs;
    player.baseAttackRange = effectiveStats.baseAttackRange;
    player.nextAttackAtMs = recalculateNextAttackAtMs(
      previousNextAttackAtMs,
      previousAttackSpeedMs,
      player.baseAttackSpeedMs,
      Date.now(),
    );

    return player;
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
    this.tickPendingAttackEvents(now);
    this.tickProjectiles(dtMs, now);
    this.pruneAttackHitTracker(now);
    this.tickEnemies(now, dtMs);
    this.tickLootBags(now);
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

  private tickProjectiles(dtMs: number, now: number): void {
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

      if (projectile.style === "blade_spin") {
        if (now < projectile.nextDamageAllowedAtMs) {
          continue;
        }
        const hitApplied = this.applySpinbladeProjectileHits(projectile);
        if (hitApplied) {
          projectile.nextDamageAllowedAtMs = now + SPINBLADE_HIT_INTERVAL_MS;
        }
        continue;
      }

      if (this.tryHitEnemyWithProjectile(projectile, now)) {
        if (projectile.destroyOnHit) {
          this.projectiles.delete(projectile.id);
          continue;
        }
      }

      if (this.tryHitPlayerWithProjectile(projectile, now)) {
        if (projectile.destroyOnHit) {
          this.projectiles.delete(projectile.id);
        }
      }
    }
  }

  private tickPendingAttackEvents(now: number): void {
    if (this.pendingAttackEvents.length === 0) {
      return;
    }

    const remaining: PendingAttackEvent[] = [];
    for (const event of this.pendingAttackEvents) {
      if (now < event.triggerAtMs) {
        remaining.push(event);
        continue;
      }

      if (event.kind === "burst_projectile") {
        const owner = this.players.get(event.ownerCharacterId);
        if (!owner || owner.pendingRespawn || owner.currentHealth <= 0) {
          continue;
        }
        this.spawnProjectile({
          ownerCharacterId: event.ownerCharacterId,
          origin: event.origin,
          direction: event.direction,
          damage: event.damage,
          colorHex: event.colorHex,
          attackInstanceId: event.attackInstanceId,
          capSingleTargetPerAttack: event.capSingleTargetPerAttack,
        });
        continue;
      }

      const owner = this.players.get(event.ownerCharacterId);
      if (!owner || owner.pendingRespawn || owner.currentHealth <= 0) {
        continue;
      }
      this.applyAoeImpact(
        event.ownerCharacterId,
        event.center,
        event.radius,
        event.damage,
      );
    }

    this.pendingAttackEvents = remaining;
  }

  private pruneAttackHitTracker(now: number): void {
    if (this.attackHitTracker.size === 0) {
      return;
    }

    for (const [attackInstanceId, tracker] of this.attackHitTracker) {
      if (tracker.expiresAtMs <= now) {
        this.attackHitTracker.delete(attackInstanceId);
      }
    }
  }

  private tickLootBags(now: number): void {
    for (const lootBag of this.lootBags.values()) {
      if (lootBag.openedByCharacterId) {
        const opener = this.players.get(lootBag.openedByCharacterId);
        if (!opener) {
          lootBag.openedByCharacterId = null;
          continue;
        }

        const distanceToOpenerSq = distanceSquared(
          opener.position,
          lootBag.position,
        );
        if (distanceToOpenerSq > LOOT_BAG_INTERACT_RADIUS_SQ) {
          this.closeLootBagForPlayer(opener.id, "out_of_range", lootBag.id);
          continue;
        }
      }

      if (now >= lootBag.expiresAtEpochMs) {
        if (lootBag.openedByCharacterId) {
          lootBag.pendingDespawn = true;
          this.closeLootBagForPlayer(
            lootBag.openedByCharacterId,
            "despawned",
            lootBag.id,
          );
          continue;
        }
        this.lootBags.delete(lootBag.id);
        continue;
      }

      if (
        !lootBag.openedByCharacterId &&
        countFilledSlots(lootBag.slots) === 0
      ) {
        this.lootBags.delete(lootBag.id);
      }
    }
  }

  createPlayerDropLootBag(
    characterId: string,
    connectionId: string,
    targetPosition: Vector2,
    item: InventoryItemInstance,
  ): LootBagSnapshot | null {
    const player = this.players.get(characterId);
    if (!player || player.connectionId !== connectionId) {
      return null;
    }

    const direction = normalizeDirection(player.position, targetPosition);
    const candidate = clampToWorldBounds(
      {
        x: player.position.x + direction.x * LOOT_BAG_DROP_DISTANCE,
        y: player.position.y + direction.y * LOOT_BAG_DROP_DISTANCE,
      },
      this.map,
      PLAYER_COLLIDER_SIZE,
    );
    const fallback = clampToWorldBounds(
      {
        x: player.position.x,
        y: player.position.y,
      },
      this.map,
      PLAYER_COLLIDER_SIZE,
    );

    const spawnPosition = positionCollidesWithMap(
      candidate,
      this.map,
      PLAYER_COLLIDER_SIZE,
    )
      ? fallback
      : candidate;

    const lootBag = this.spawnLootBagAtPosition(
      spawnPosition,
      [item],
      player.id,
      Date.now(),
    );
    return toLootBagSnapshot(lootBag);
  }

  createEnemyDropLootBag(
    enemyArchetypeId: string,
    enemyPosition: Vector2,
    killerCharacterId: string | null,
    killerClass: CharacterClass | null,
  ): LootBagSnapshot | null {
    const definitionIds = this.resolveEnemyLootDropDefinitionIds(
      enemyArchetypeId,
      killerClass,
    );
    if (definitionIds.length === 0) {
      return null;
    }

    const items = definitionIds
      .slice(0, LOOT_BAG_SLOT_COUNT)
      .map((itemDefinitionId) => ({
        id: `loot-${crypto.randomUUID()}`,
        itemDefinitionId,
      }));

    const lootBag = this.spawnLootBagAtPosition(
      enemyPosition,
      items,
      killerCharacterId,
      Date.now(),
    );
    return toLootBagSnapshot(lootBag);
  }

  openLootBag(
    characterId: string,
    connectionId: string,
    containerId: string,
  ): ContainerOpenResult {
    const player = this.players.get(characterId);
    if (!player || player.connectionId !== connectionId) {
      return {
        ok: false,
        code: "CONTAINER_REQUEST_INVALID",
        message: "Player context is invalid.",
      };
    }

    const lootBag = this.lootBags.get(containerId);
    if (!lootBag) {
      return {
        ok: false,
        code: "CONTAINER_MISSING",
        message: "Loot bag no longer exists.",
      };
    }

    const distanceToBagSq = distanceSquared(player.position, lootBag.position);
    if (distanceToBagSq > LOOT_BAG_INTERACT_RADIUS_SQ) {
      return {
        ok: false,
        code: "CONTAINER_OUT_OF_RANGE",
        message: "Move closer to interact with this loot bag.",
      };
    }

    const now = Date.now();
    if (
      lootBag.ownerCharacterId &&
      lootBag.ownerCharacterId !== player.id &&
      typeof lootBag.ownerLockedUntilEpochMs === "number" &&
      now < lootBag.ownerLockedUntilEpochMs
    ) {
      return {
        ok: false,
        code: "CONTAINER_OWNER_LOCKED",
        message: "This loot bag is temporarily reserved.",
      };
    }

    if (
      lootBag.openedByCharacterId &&
      lootBag.openedByCharacterId !== player.id
    ) {
      return {
        ok: false,
        code: "CONTAINER_LOCKED",
        message: "Another player is currently looting this bag.",
      };
    }

    if (player.openedContainerId && player.openedContainerId !== containerId) {
      this.closeLootBagForPlayer(player.id, "manual", player.openedContainerId);
    }

    lootBag.openedByCharacterId = player.id;
    player.openedContainerId = lootBag.id;

    return {
      ok: true,
      state: this.toContainerState(lootBag),
    };
  }

  closeLootBagForPlayer(
    characterId: string,
    reason: "manual" | "out_of_range" | "despawned" | "disconnect",
    expectedContainerId?: string,
  ): string | null {
    const player = this.players.get(characterId);
    if (!player) {
      return null;
    }

    const openedContainerId = player.openedContainerId;
    if (!openedContainerId) {
      return null;
    }
    if (
      expectedContainerId !== undefined &&
      expectedContainerId !== openedContainerId
    ) {
      return null;
    }
    const containerId = openedContainerId;

    const lootBag = this.lootBags.get(containerId);
    if (lootBag && lootBag.openedByCharacterId === characterId) {
      lootBag.openedByCharacterId = null;
      if (countFilledSlots(lootBag.slots) === 0 || lootBag.pendingDespawn) {
        this.lootBags.delete(lootBag.id);
      }
    }
    player.openedContainerId = null;

    player.socket.send(
      stringifyServerMessage({
        type: "container.closed",
        containerId,
        reason,
      }),
    );

    return containerId;
  }

  getOpenedLootBagState(
    characterId: string,
    connectionId: string,
  ): {
    containerId: string;
    slots: Array<InventoryItemInstance | null>;
  } | null {
    const player = this.players.get(characterId);
    if (
      !player ||
      player.connectionId !== connectionId ||
      !player.openedContainerId
    ) {
      return null;
    }
    const lootBag = this.lootBags.get(player.openedContainerId);
    if (!lootBag || lootBag.openedByCharacterId !== player.id) {
      player.openedContainerId = null;
      return null;
    }

    return {
      containerId: lootBag.id,
      slots: [...lootBag.slots],
    };
  }

  updateOpenedLootBagSlots(
    characterId: string,
    connectionId: string,
    containerId: string,
    nextSlotsInput: ReadonlyArray<InventoryItemInstance | null>,
  ): ContainerUpdateResult | ContainerOpenError {
    const player = this.players.get(characterId);
    if (!player || player.connectionId !== connectionId) {
      return {
        ok: false,
        code: "CONTAINER_REQUEST_INVALID",
        message: "Player context is invalid.",
      };
    }
    if (player.openedContainerId !== containerId) {
      return {
        ok: false,
        code: "CONTAINER_NOT_OPEN",
        message: "Open this loot bag before moving items.",
      };
    }
    const lootBag = this.lootBags.get(containerId);
    if (!lootBag || lootBag.openedByCharacterId !== player.id) {
      return {
        ok: false,
        code: "CONTAINER_MISSING",
        message: "Loot bag no longer exists.",
      };
    }

    lootBag.slots = Array.from(
      { length: LOOT_BAG_SLOT_COUNT },
      (_, index) => nextSlotsInput[index] ?? null,
    );

    return {
      ok: true,
      state: this.toContainerState(lootBag),
    };
  }

  private spawnLootBagAtPosition(
    position: Vector2,
    items: ReadonlyArray<InventoryItemInstance>,
    ownerCharacterId: string | null,
    now: number,
  ): LootBagState {
    const slots = createEmptyLootBagSlots();
    for (
      let index = 0;
      index < items.length && index < LOOT_BAG_SLOT_COUNT;
      index += 1
    ) {
      const item = items[index];
      if (!item) {
        continue;
      }
      slots[index] = item;
    }

    const lootBag: LootBagState = {
      id: `lootbag-${crypto.randomUUID()}`,
      position: { x: position.x, y: position.y },
      slots,
      createdAtEpochMs: now,
      expiresAtEpochMs: now + LOOT_BAG_DESPAWN_MS,
      ownerCharacterId,
      ownerLockedUntilEpochMs: ownerCharacterId
        ? now + LOOT_BAG_OWNER_GRACE_MS
        : null,
      openedByCharacterId: null,
      pendingDespawn: false,
    };
    this.lootBags.set(lootBag.id, lootBag);
    return lootBag;
  }

  private toContainerState(lootBag: LootBagState): {
    containerId: string;
    slots: Array<InventoryItemInstance | null>;
    slotCount: number;
    openedByCharacterId: string | null;
    ownerCharacterId: string | null;
    ownerLockedUntilEpochMs: number | null;
  } {
    return {
      containerId: lootBag.id,
      slots: [...lootBag.slots],
      slotCount: lootBag.slots.length,
      openedByCharacterId: lootBag.openedByCharacterId,
      ownerCharacterId: lootBag.ownerCharacterId,
      ownerLockedUntilEpochMs: lootBag.ownerLockedUntilEpochMs,
    };
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

  private applyMeleeAttack(
    player: PlayerState,
    direction: Vector2,
    arcThreshold: number,
    damageMultiplier = 1,
    maxTargets = Number.POSITIVE_INFINITY,
  ): void {
    if (!this.canPlayerDamageEnemy()) {
      return;
    }

    let hits = 0;
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
      if (dotProduct(facing, direction) < arcThreshold) {
        continue;
      }

      this.applyDamageToEnemy(
        enemy.id,
        player.baseDamage * damageMultiplier,
        player.id,
      );
      hits += 1;
      if (hits >= maxTargets) {
        return;
      }
    }
  }

  private resolveProjectileColorHex(player: PlayerState): string {
    switch (player.attackConfig.weaponStyle) {
      case "sword":
        return "#fbbf24";
      case "staff":
        return "#38bdf8";
      default:
        return "#67e8f9";
    }
  }

  private spawnProjectile(input: {
    ownerCharacterId: string;
    origin: Vector2;
    direction: Vector2;
    damage: number;
    colorHex: string;
    speed?: number;
    ttlMs?: number;
    radius?: number;
    style?: "orb" | "blade_spin";
    destroyOnHit?: boolean;
    nextDamageAllowedAtMs?: number;
    attackInstanceId: string | null;
    capSingleTargetPerAttack: boolean;
  }): void {
    const speed = input.speed ?? PLAYER_PROJECTILE_SPEED;
    const ttlMs = input.ttlMs ?? PLAYER_PROJECTILE_TTL_MS;
    const radius = input.radius ?? PLAYER_PROJECTILE_RADIUS;

    const projectile: ProjectileState = {
      id: `projectile-${crypto.randomUUID()}`,
      ownerCharacterId: input.ownerCharacterId,
      position: {
        x:
          input.origin.x + input.direction.x * (PLAYER_COLLIDER_SIZE.width / 2),
        y:
          input.origin.y +
          input.direction.y * (PLAYER_COLLIDER_SIZE.height / 2),
      },
      velocity: {
        x: input.direction.x * speed,
        y: input.direction.y * speed,
      },
      radius,
      damage: input.damage,
      ttlMsRemaining: ttlMs,
      colorHex: input.colorHex,
      style: input.style ?? "orb",
      destroyOnHit: input.destroyOnHit ?? true,
      nextDamageAllowedAtMs: input.nextDamageAllowedAtMs ?? 0,
      attackInstanceId: input.attackInstanceId,
      capSingleTargetPerAttack: input.capSingleTargetPerAttack,
    };
    this.projectiles.set(projectile.id, projectile);
  }

  private spawnPlayerProjectile(
    player: PlayerState,
    direction: Vector2,
    damage: number,
    attackInstanceId: string | null = null,
    capSingleTargetPerAttack = false,
  ): void {
    this.spawnProjectile({
      ownerCharacterId: player.id,
      origin: player.position,
      direction,
      damage,
      colorHex: this.resolveProjectileColorHex(player),
      attackInstanceId,
      capSingleTargetPerAttack,
    });
  }

  private spawnSpinbladeProjectile(
    player: PlayerState,
    direction: Vector2,
  ): void {
    this.spawnProjectile({
      ownerCharacterId: player.id,
      origin: player.position,
      direction,
      damage: player.baseDamage * player.attackConfig.damageMultiplier,
      colorHex: this.resolveProjectileColorHex(player),
      speed: SPINBLADE_SPEED,
      ttlMs: SPINBLADE_TTL_MS,
      radius: SPINBLADE_RADIUS,
      style: "blade_spin",
      destroyOnHit: false,
      nextDamageAllowedAtMs: 0,
      attackInstanceId: null,
      capSingleTargetPerAttack: false,
    });
  }

  private spawnMultiShotProjectiles(
    player: PlayerState,
    direction: Vector2,
    now: number,
  ): void {
    const config = player.attackConfig;
    const projectileCount = Math.max(1, config.projectileCount);
    const spreadRadians = (config.spreadDegrees * Math.PI) / 180;
    const step =
      projectileCount <= 1 ? 0 : spreadRadians / (projectileCount - 1);
    const start = -spreadRadians / 2;
    const attackInstanceId = `attack-${crypto.randomUUID()}`;
    this.attackHitTracker.set(attackInstanceId, {
      enemyIds: new Set<string>(),
      playerIds: new Set<string>(),
      expiresAtMs: now + ATTACK_TRACKER_TTL_MS,
    });

    for (let index = 0; index < projectileCount; index += 1) {
      const offset = start + step * index;
      const projectileDirection = rotateDirection(direction, offset);
      this.spawnPlayerProjectile(
        player,
        projectileDirection,
        player.baseDamage * config.damageMultiplier,
        attackInstanceId,
        true,
      );
    }
  }

  private enqueueBurstProjectiles(
    player: PlayerState,
    direction: Vector2,
    now: number,
  ): void {
    const config = player.attackConfig;
    const eventCount = Math.max(1, config.burstCount);
    const colorHex = this.resolveProjectileColorHex(player);
    for (let index = 0; index < eventCount; index += 1) {
      this.pendingAttackEvents.push({
        id: `pending-${crypto.randomUUID()}`,
        kind: "burst_projectile",
        ownerCharacterId: player.id,
        triggerAtMs: now + index * config.burstIntervalMs,
        origin: { x: player.position.x, y: player.position.y },
        direction: { x: direction.x, y: direction.y },
        damage: player.baseDamage * config.damageMultiplier,
        colorHex,
        attackInstanceId: null,
        capSingleTargetPerAttack: false,
      });
    }
  }

  private resolveAoeTarget(
    player: PlayerState,
    aim: Vector2,
    radius: number,
  ): Vector2 {
    const direction = normalizeDirection(player.position, aim);
    const distance = Math.min(
      player.baseAttackRange,
      Math.hypot(aim.x - player.position.x, aim.y - player.position.y),
    );
    const colliderSize = {
      width: Math.max(20, radius * 1.7),
      height: Math.max(20, radius * 1.7),
    };
    const step = Math.max(8, radius * 0.35);
    let candidateDistance = distance;

    for (let attempts = 0; attempts < 12; attempts += 1) {
      const candidate = clampToWorldBounds(
        {
          x: player.position.x + direction.x * candidateDistance,
          y: player.position.y + direction.y * candidateDistance,
        },
        this.map,
        colliderSize,
      );
      if (!positionCollidesWithMap(candidate, this.map, colliderSize)) {
        return candidate;
      }
      candidateDistance = Math.max(12, candidateDistance - step);
    }

    return clampToWorldBounds(
      {
        x:
          player.position.x +
          direction.x * Math.min(36, player.baseAttackRange),
        y:
          player.position.y +
          direction.y * Math.min(36, player.baseAttackRange),
      },
      this.map,
      colliderSize,
    );
  }

  private enqueueAoeImpact(
    player: PlayerState,
    center: Vector2,
    now: number,
  ): void {
    const config = player.attackConfig;
    this.pendingAttackEvents.push({
      id: `pending-${crypto.randomUUID()}`,
      kind: "aoe_impact",
      ownerCharacterId: player.id,
      triggerAtMs: now + config.aoeDelayMs,
      center,
      radius: config.aoeRadius,
      damage: player.baseDamage * config.damageMultiplier,
    });
  }

  private applyAoeImpact(
    ownerCharacterId: string,
    center: Vector2,
    radius: number,
    damage: number,
  ): void {
    for (const enemy of this.enemies.values()) {
      const extraRadius =
        Math.max(enemy.archetype.visualWidth, enemy.archetype.visualHeight) / 2;
      if (
        distanceSquared(center, enemy.position) >
        (radius + extraRadius) ** 2
      ) {
        continue;
      }
      this.applyDamageToEnemy(enemy.id, damage, ownerCharacterId);
    }

    if (!this.canPlayerDamagePlayer()) {
      return;
    }
    for (const player of this.players.values()) {
      if (player.id === ownerCharacterId) {
        continue;
      }
      if (distanceSquared(center, player.position) > (radius + 16) ** 2) {
        continue;
      }
      this.applyDamageToPlayer(player, damage);
    }
  }

  private applySpinbladeProjectileHits(projectile: ProjectileState): boolean {
    let hitApplied = false;

    if (this.canPlayerDamageEnemy()) {
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

        hitApplied = true;
        this.applyDamageToEnemy(
          enemy.id,
          projectile.damage,
          projectile.ownerCharacterId,
        );
      }
    }

    if (!this.canPlayerDamagePlayer()) {
      return hitApplied;
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

      hitApplied = true;
      this.applyDamageToPlayer(player, projectile.damage);
    }

    return hitApplied;
  }

  private tryHitEnemyWithProjectile(
    projectile: ProjectileState,
    now: number,
  ): boolean {
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

      if (
        projectile.capSingleTargetPerAttack &&
        projectile.attackInstanceId !== null
      ) {
        const tracker =
          this.attackHitTracker.get(projectile.attackInstanceId) ??
          ({
            enemyIds: new Set<string>(),
            playerIds: new Set<string>(),
            expiresAtMs: now + ATTACK_TRACKER_TTL_MS,
          } satisfies AttackHitTracker);
        if (tracker.enemyIds.has(enemy.id)) {
          continue;
        }
        tracker.enemyIds.add(enemy.id);
        tracker.expiresAtMs = now + ATTACK_TRACKER_TTL_MS;
        this.attackHitTracker.set(projectile.attackInstanceId, tracker);
      }

      this.applyDamageToEnemy(
        enemy.id,
        projectile.damage,
        projectile.ownerCharacterId,
      );
      return true;
    }

    return false;
  }

  private tryHitPlayerWithProjectile(
    projectile: ProjectileState,
    now: number,
  ): boolean {
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

      if (
        projectile.capSingleTargetPerAttack &&
        projectile.attackInstanceId !== null
      ) {
        const tracker =
          this.attackHitTracker.get(projectile.attackInstanceId) ??
          ({
            enemyIds: new Set<string>(),
            playerIds: new Set<string>(),
            expiresAtMs: now + ATTACK_TRACKER_TTL_MS,
          } satisfies AttackHitTracker);
        if (tracker.playerIds.has(player.id)) {
          continue;
        }
        tracker.playerIds.add(player.id);
        tracker.expiresAtMs = now + ATTACK_TRACKER_TTL_MS;
        this.attackHitTracker.set(projectile.attackInstanceId, tracker);
      }

      this.applyDamageToPlayer(player, projectile.damage);
      return true;
    }

    return false;
  }

  private applyDamageToEnemy(
    enemyId: string,
    amount: number,
    attackerCharacterId: string | null = null,
  ): void {
    const enemy = this.enemies.get(enemyId);
    if (!enemy) {
      return;
    }

    const attacker =
      attackerCharacterId !== null
        ? (this.players.get(attackerCharacterId) ?? null)
        : null;

    if (attacker) {
      this.emitFloatingText(
        attacker.socket,
        enemy.position,
        `-${Math.max(0, Math.round(amount))}`,
        "damage_enemy",
      );
    }

    enemy.currentHealth = Math.max(0, enemy.currentHealth - amount);
    if (enemy.currentHealth > 0) {
      return;
    }

    const enemyPosition = {
      x: enemy.position.x,
      y: enemy.position.y,
    };
    const enemyArchetypeId = enemy.archetype.id;
    this.enemies.delete(enemy.id);

    this.createEnemyDropLootBag(
      enemyArchetypeId,
      enemyPosition,
      attacker?.id ?? null,
      attacker?.class ?? null,
    );

    if (attacker) {
      this.awardEnemyKillExperience(attacker, enemy);
    }
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
    this.emitFloatingText(
      player.socket,
      player.position,
      `-${Math.max(0, Math.round(amount))}`,
      "damage_player",
    );
    if (player.currentHealth > 0) {
      return;
    }

    player.pendingRespawn = true;
    player.velocity = { x: 0, y: 0 };
    this.deadPlayerQueue.set(player.id, player.socket);
  }

  private awardEnemyKillExperience(
    player: PlayerState,
    enemy: EnemyState,
  ): void {
    const xpAward = computeAdjustedEnemyExperience(
      enemy.archetype.xpReward,
      enemy.archetype.level,
      player.level,
    );
    if (xpAward <= 0) {
      return;
    }

    const nextProgression = applyCharacterExperience(
      player.level,
      player.xp,
      xpAward,
    );
    if (nextProgression.gainedXp <= 0) {
      return;
    }

    const levelChanged = nextProgression.level > player.level;
    player.level = nextProgression.level;
    player.xp = nextProgression.xp;

    if (levelChanged) {
      const scaledStats = computeEffectiveCombatStatsForLevel(
        {
          maxHp: player.rawMaxHealth,
          baseDamage: player.rawBaseDamage,
          baseAttackSpeedMs: player.rawBaseAttackSpeedMs,
          baseAttackRange: player.rawBaseAttackRange,
        },
        player.level,
        {
          damageFlat: player.weaponDamageFlat,
          rangeFlat: player.weaponRangeFlat,
          speedPercent: player.weaponSpeedPercent,
        },
      );
      player.maxHealth = scaledStats.maxHealth;
      player.currentHealth = player.maxHealth;
      player.baseDamage = scaledStats.baseDamage;
      player.baseAttackSpeedMs = scaledStats.baseAttackSpeedMs;
      player.baseAttackRange = scaledStats.baseAttackRange;

      this.emitFloatingText(
        player.socket,
        player.position,
        `LEVEL ${player.level}!`,
        "level_up",
      );
    }

    this.emitFloatingText(
      player.socket,
      enemy.position,
      `+${nextProgression.gainedXp} XP`,
      "xp_gain",
    );
    this.syncPlayerSessionProgress(player);

    player.socket.send(
      stringifyServerMessage({
        type: "progression.updated",
        level: player.level,
        xp: player.xp,
        xpToNextLevel: getXpToNextLevelForLevel(player.level),
        currentHealth: player.currentHealth,
        maxHealth: player.maxHealth,
        baseDamage: player.baseDamage,
      }),
    );

    const userId = player.socket.data.session.userId;
    if (!userId || !this.persistCharacterProgression) {
      return;
    }

    this.persistCharacterProgression({
      userId,
      characterId: player.id,
      level: player.level,
      xp: player.xp,
    });
  }

  private syncPlayerSessionProgress(player: PlayerState): void {
    const xpToNextLevel = getXpToNextLevelForLevel(player.level);
    player.socket.data.session.characterCurrentHealth = player.currentHealth;
    player.socket.data.session.characterMaxHealth = player.maxHealth;
    player.socket.data.session.characterBaseDamage = player.baseDamage;
    player.socket.data.session.characterBaseAttackSpeedMs =
      player.baseAttackSpeedMs;
    player.socket.data.session.characterBaseAttackRange =
      player.baseAttackRange;
    player.socket.data.session.characterRawMaxHealth = player.rawMaxHealth;
    player.socket.data.session.characterRawBaseDamage = player.rawBaseDamage;
    player.socket.data.session.characterRawBaseAttackSpeedMs =
      player.rawBaseAttackSpeedMs;
    player.socket.data.session.characterRawBaseAttackRange =
      player.rawBaseAttackRange;
    player.socket.data.session.characterWeaponDamageFlat =
      player.weaponDamageFlat;
    player.socket.data.session.characterWeaponRangeFlat =
      player.weaponRangeFlat;
    player.socket.data.session.characterWeaponSpeedPercent =
      player.weaponSpeedPercent;
    player.socket.data.session.characterWeaponStyle =
      player.attackConfig.weaponStyle;
    player.socket.data.session.characterAttackPatternId =
      player.attackConfig.attackPatternId;
    player.socket.data.session.characterAttackDamageMultiplier =
      player.attackConfig.damageMultiplier;
    player.socket.data.session.characterAttackProjectileCount =
      player.attackConfig.projectileCount;
    player.socket.data.session.characterAttackSpreadDegrees =
      player.attackConfig.spreadDegrees;
    player.socket.data.session.characterAttackBurstCount =
      player.attackConfig.burstCount;
    player.socket.data.session.characterAttackBurstIntervalMs =
      player.attackConfig.burstIntervalMs;
    player.socket.data.session.characterAttackAoeRadius =
      player.attackConfig.aoeRadius;
    player.socket.data.session.characterAttackAoeDelayMs =
      player.attackConfig.aoeDelayMs;
    player.socket.data.session.characterAttackMaxTargetHitsPerAttack =
      player.attackConfig.maxTargetHitsPerAttack;
    player.socket.data.session.characterLevel = player.level;
    player.socket.data.session.characterXp = player.xp;
    player.socket.data.session.characterXpToNextLevel = xpToNextLevel;
  }

  private emitFloatingText(
    socket: ServerWebSocket<RealtimeSocketData>,
    position: Vector2,
    text: string,
    variant: "damage_enemy" | "damage_player" | "xp_gain" | "level_up",
  ): void {
    socket.send(
      stringifyServerMessage({
        type: "combat.floatingText",
        position: {
          x: position.x,
          y: position.y,
        },
        text,
        variant,
      }),
    );
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
    lootBags: LootBagSnapshot[];
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
      lootBags: [...this.lootBags.values()].map((lootBag) =>
        toLootBagSnapshot(lootBag),
      ),
    };
  }
}

export class WorldManager {
  private instances = new Map<string, WorldInstance>();
  private readonly resolveEnemyArchetype: (
    archetypeId: string,
  ) => EnemyArchetype | null;
  private readonly persistCharacterProgression: PersistCharacterProgression | null;
  private readonly resolveEnemyLootDropDefinitionIds: (
    enemyArchetypeId: string,
    killerClass: CharacterClass | null,
  ) => string[];

  constructor(
    resolveEnemyArchetypeOrOptions:
      | ((archetypeId: string) => EnemyArchetype | null)
      | WorldManagerOptions = () => null,
  ) {
    if (typeof resolveEnemyArchetypeOrOptions === "function") {
      this.resolveEnemyArchetype = resolveEnemyArchetypeOrOptions;
      this.persistCharacterProgression = null;
      this.resolveEnemyLootDropDefinitionIds = () => [];
      return;
    }

    this.resolveEnemyArchetype =
      resolveEnemyArchetypeOrOptions.resolveEnemyArchetype ?? (() => null);
    this.persistCharacterProgression =
      resolveEnemyArchetypeOrOptions.persistCharacterProgression ?? null;
    this.resolveEnemyLootDropDefinitionIds =
      resolveEnemyArchetypeOrOptions.resolveEnemyLootDropDefinitionIds ??
      (() => []);
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
        characterRawMaxHealth: null,
        characterRawBaseDamage: null,
        characterRawBaseAttackSpeedMs: null,
        characterRawBaseAttackRange: null,
        characterWeaponDamageFlat: null,
        characterWeaponRangeFlat: null,
        characterWeaponSpeedPercent: null,
        characterWeaponStyle: null,
        characterAttackPatternId: null,
        characterAttackDamageMultiplier: null,
        characterAttackProjectileCount: null,
        characterAttackSpreadDegrees: null,
        characterAttackBurstCount: null,
        characterAttackBurstIntervalMs: null,
        characterAttackAoeRadius: null,
        characterAttackAoeDelayMs: null,
        characterAttackMaxTargetHitsPerAttack: null,
        characterLevel: null,
        characterXp: null,
        characterXpToNextLevel: null,
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
      options?.baseStats ?? {
        maxHp: socket.data.session.characterRawMaxHealth ?? undefined,
        baseDamage: socket.data.session.characterRawBaseDamage ?? undefined,
        baseAttackSpeedMs:
          socket.data.session.characterRawBaseAttackSpeedMs ?? undefined,
        baseAttackRange:
          socket.data.session.characterRawBaseAttackRange ?? undefined,
      },
      options?.progression ?? {
        level: socket.data.session.characterLevel ?? undefined,
        xp: socket.data.session.characterXp ?? undefined,
      },
      options?.weaponModifiers ?? {
        damageFlat: socket.data.session.characterWeaponDamageFlat ?? undefined,
        rangeFlat: socket.data.session.characterWeaponRangeFlat ?? undefined,
        speedPercent:
          socket.data.session.characterWeaponSpeedPercent ?? undefined,
      },
      options?.attackConfig ?? {
        weaponStyle: socket.data.session.characterWeaponStyle ?? undefined,
        attackPatternId:
          socket.data.session.characterAttackPatternId ?? undefined,
        damageMultiplier:
          socket.data.session.characterAttackDamageMultiplier ?? undefined,
        projectileCount:
          socket.data.session.characterAttackProjectileCount ?? undefined,
        spreadDegrees:
          socket.data.session.characterAttackSpreadDegrees ?? undefined,
        burstCount: socket.data.session.characterAttackBurstCount ?? undefined,
        burstIntervalMs:
          socket.data.session.characterAttackBurstIntervalMs ?? undefined,
        aoeRadius: socket.data.session.characterAttackAoeRadius ?? undefined,
        aoeDelayMs: socket.data.session.characterAttackAoeDelayMs ?? undefined,
        maxTargetHitsPerAttack:
          socket.data.session.characterAttackMaxTargetHitsPerAttack ??
          undefined,
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
    socket.data.session.characterRawMaxHealth = player.rawMaxHealth;
    socket.data.session.characterRawBaseDamage = player.rawBaseDamage;
    socket.data.session.characterRawBaseAttackSpeedMs =
      player.rawBaseAttackSpeedMs;
    socket.data.session.characterRawBaseAttackRange = player.rawBaseAttackRange;
    socket.data.session.characterWeaponDamageFlat = player.weaponDamageFlat;
    socket.data.session.characterWeaponRangeFlat = player.weaponRangeFlat;
    socket.data.session.characterWeaponSpeedPercent = player.weaponSpeedPercent;
    socket.data.session.characterWeaponStyle = player.attackConfig.weaponStyle;
    socket.data.session.characterAttackPatternId =
      player.attackConfig.attackPatternId;
    socket.data.session.characterAttackDamageMultiplier =
      player.attackConfig.damageMultiplier;
    socket.data.session.characterAttackProjectileCount =
      player.attackConfig.projectileCount;
    socket.data.session.characterAttackSpreadDegrees =
      player.attackConfig.spreadDegrees;
    socket.data.session.characterAttackBurstCount =
      player.attackConfig.burstCount;
    socket.data.session.characterAttackBurstIntervalMs =
      player.attackConfig.burstIntervalMs;
    socket.data.session.characterAttackAoeRadius =
      player.attackConfig.aoeRadius;
    socket.data.session.characterAttackAoeDelayMs =
      player.attackConfig.aoeDelayMs;
    socket.data.session.characterAttackMaxTargetHitsPerAttack =
      player.attackConfig.maxTargetHitsPerAttack;
    socket.data.session.characterLevel = player.level;
    socket.data.session.characterXp = player.xp;
    socket.data.session.characterXpToNextLevel = getXpToNextLevelForLevel(
      player.level,
    );

    socket.send(
      stringifyServerMessage({
        type: "world.joined",
        worldId,
        characterId,
        nickname,
        class: characterClass,
        colorHex,
        spawn,
        level: player.level,
        xp: player.xp,
        xpToNextLevel: getXpToNextLevelForLevel(player.level),
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
      socket.data.session.characterRawMaxHealth = removed.rawMaxHealth;
      socket.data.session.characterRawBaseDamage = removed.rawBaseDamage;
      socket.data.session.characterRawBaseAttackSpeedMs =
        removed.rawBaseAttackSpeedMs;
      socket.data.session.characterRawBaseAttackRange =
        removed.rawBaseAttackRange;
      socket.data.session.characterWeaponDamageFlat = removed.weaponDamageFlat;
      socket.data.session.characterWeaponRangeFlat = removed.weaponRangeFlat;
      socket.data.session.characterWeaponSpeedPercent =
        removed.weaponSpeedPercent;
      socket.data.session.characterWeaponStyle =
        removed.attackConfig.weaponStyle;
      socket.data.session.characterAttackPatternId =
        removed.attackConfig.attackPatternId;
      socket.data.session.characterAttackDamageMultiplier =
        removed.attackConfig.damageMultiplier;
      socket.data.session.characterAttackProjectileCount =
        removed.attackConfig.projectileCount;
      socket.data.session.characterAttackSpreadDegrees =
        removed.attackConfig.spreadDegrees;
      socket.data.session.characterAttackBurstCount =
        removed.attackConfig.burstCount;
      socket.data.session.characterAttackBurstIntervalMs =
        removed.attackConfig.burstIntervalMs;
      socket.data.session.characterAttackAoeRadius =
        removed.attackConfig.aoeRadius;
      socket.data.session.characterAttackAoeDelayMs =
        removed.attackConfig.aoeDelayMs;
      socket.data.session.characterAttackMaxTargetHitsPerAttack =
        removed.attackConfig.maxTargetHitsPerAttack;
      socket.data.session.characterLevel = removed.level;
      socket.data.session.characterXp = removed.xp;
      socket.data.session.characterXpToNextLevel = getXpToNextLevelForLevel(
        removed.level,
      );
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

  updatePlayerWeaponModifiers(
    socket: ServerWebSocket<RealtimeSocketData>,
    modifiers: Partial<WeaponStatModifiers>,
    attackConfig?: Partial<ResolvedWeaponAttackConfig>,
  ): void {
    const normalized = resolveWeaponModifiers(modifiers);
    const attack = resolveAttackConfig(
      socket.data.session.characterClass ?? "knight",
      attackConfig ?? {
        weaponStyle: socket.data.session.characterWeaponStyle ?? undefined,
        attackPatternId:
          socket.data.session.characterAttackPatternId ?? undefined,
        damageMultiplier:
          socket.data.session.characterAttackDamageMultiplier ?? undefined,
        projectileCount:
          socket.data.session.characterAttackProjectileCount ?? undefined,
        spreadDegrees:
          socket.data.session.characterAttackSpreadDegrees ?? undefined,
        burstCount: socket.data.session.characterAttackBurstCount ?? undefined,
        burstIntervalMs:
          socket.data.session.characterAttackBurstIntervalMs ?? undefined,
        aoeRadius: socket.data.session.characterAttackAoeRadius ?? undefined,
        aoeDelayMs: socket.data.session.characterAttackAoeDelayMs ?? undefined,
        maxTargetHitsPerAttack:
          socket.data.session.characterAttackMaxTargetHitsPerAttack ??
          undefined,
      },
    );
    const { connectionId, characterId, worldId } = socket.data.session;

    socket.data.session.characterWeaponDamageFlat = normalized.damageFlat;
    socket.data.session.characterWeaponRangeFlat = normalized.rangeFlat;
    socket.data.session.characterWeaponSpeedPercent = normalized.speedPercent;
    socket.data.session.characterWeaponStyle = attack.weaponStyle;
    socket.data.session.characterAttackPatternId = attack.attackPatternId;
    socket.data.session.characterAttackDamageMultiplier =
      attack.damageMultiplier;
    socket.data.session.characterAttackProjectileCount = attack.projectileCount;
    socket.data.session.characterAttackSpreadDegrees = attack.spreadDegrees;
    socket.data.session.characterAttackBurstCount = attack.burstCount;
    socket.data.session.characterAttackBurstIntervalMs = attack.burstIntervalMs;
    socket.data.session.characterAttackAoeRadius = attack.aoeRadius;
    socket.data.session.characterAttackAoeDelayMs = attack.aoeDelayMs;
    socket.data.session.characterAttackMaxTargetHitsPerAttack =
      attack.maxTargetHitsPerAttack;

    if (!characterId || !worldId) {
      return;
    }

    const instance = this.instances.get(worldId);
    if (!instance) {
      return;
    }

    const updated = instance.updatePlayerWeaponModifiers(
      characterId,
      connectionId,
      normalized,
      attack,
    );
    if (!updated) {
      return;
    }

    socket.data.session.characterBaseDamage = updated.baseDamage;
    socket.data.session.characterBaseAttackSpeedMs = updated.baseAttackSpeedMs;
    socket.data.session.characterBaseAttackRange = updated.baseAttackRange;
  }

  createPlayerDropLootBag(
    socket: ServerWebSocket<RealtimeSocketData>,
    targetPosition: Vector2,
    item: InventoryItemInstance,
  ): LootBagSnapshot | null {
    const { connectionId, characterId, worldId } = socket.data.session;
    if (!characterId || !worldId) {
      return null;
    }

    const instance = this.instances.get(worldId);
    if (!instance) {
      return null;
    }

    return instance.createPlayerDropLootBag(
      characterId,
      connectionId,
      targetPosition,
      item,
    );
  }

  openContainer(
    socket: ServerWebSocket<RealtimeSocketData>,
    containerId: string,
  ): ContainerOpenResult {
    const { connectionId, characterId, worldId } = socket.data.session;
    if (!characterId || !worldId) {
      return {
        ok: false,
        code: "CONTAINER_REQUEST_INVALID",
        message: "Join a world before opening containers.",
      };
    }

    const instance = this.instances.get(worldId);
    if (!instance) {
      return {
        ok: false,
        code: "CONTAINER_MISSING",
        message: "Container world is unavailable.",
      };
    }

    return instance.openLootBag(characterId, connectionId, containerId);
  }

  closeContainer(
    socket: ServerWebSocket<RealtimeSocketData>,
    containerId: string,
    reason: "manual" | "out_of_range" | "despawned" | "disconnect" = "manual",
  ): boolean {
    const { characterId, worldId } = socket.data.session;
    if (!characterId || !worldId) {
      return false;
    }
    const instance = this.instances.get(worldId);
    if (!instance) {
      return false;
    }

    return (
      instance.closeLootBagForPlayer(characterId, reason, containerId) !== null
    );
  }

  getOpenedContainer(socket: ServerWebSocket<RealtimeSocketData>): {
    containerId: string;
    slots: Array<InventoryItemInstance | null>;
  } | null {
    const { characterId, connectionId, worldId } = socket.data.session;
    if (!characterId || !worldId) {
      return null;
    }
    const instance = this.instances.get(worldId);
    if (!instance) {
      return null;
    }
    return instance.getOpenedLootBagState(characterId, connectionId);
  }

  updateOpenedContainerSlots(
    socket: ServerWebSocket<RealtimeSocketData>,
    containerId: string,
    nextSlots: ReadonlyArray<InventoryItemInstance | null>,
  ): ContainerUpdateStateResult {
    const { characterId, connectionId, worldId } = socket.data.session;
    if (!characterId || !worldId) {
      return {
        ok: false,
        code: "CONTAINER_REQUEST_INVALID",
        message: "Join a world before moving container items.",
      };
    }

    const instance = this.instances.get(worldId);
    if (!instance) {
      return {
        ok: false,
        code: "CONTAINER_MISSING",
        message: "Container world is unavailable.",
      };
    }

    return instance.updateOpenedLootBagSlots(
      characterId,
      connectionId,
      containerId,
      nextSlots,
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
      this.persistCharacterProgression,
      this.resolveEnemyLootDropDefinitionIds,
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
      characterRawMaxHealth,
      characterRawBaseDamage,
      characterRawBaseAttackSpeedMs,
      characterRawBaseAttackRange,
      characterWeaponDamageFlat,
      characterWeaponRangeFlat,
      characterWeaponSpeedPercent,
      characterWeaponStyle,
      characterAttackPatternId,
      characterAttackDamageMultiplier,
      characterAttackProjectileCount,
      characterAttackSpreadDegrees,
      characterAttackBurstCount,
      characterAttackBurstIntervalMs,
      characterAttackAoeRadius,
      characterAttackAoeDelayMs,
      characterAttackMaxTargetHitsPerAttack,
      characterLevel,
      characterXp,
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
        baseStats: {
          maxHp: characterRawMaxHealth ?? undefined,
          baseDamage: characterRawBaseDamage ?? undefined,
          baseAttackSpeedMs: characterRawBaseAttackSpeedMs ?? undefined,
          baseAttackRange: characterRawBaseAttackRange ?? undefined,
        },
        progression: {
          level: characterLevel ?? undefined,
          xp: characterXp ?? undefined,
        },
        weaponModifiers: {
          damageFlat: characterWeaponDamageFlat ?? undefined,
          rangeFlat: characterWeaponRangeFlat ?? undefined,
          speedPercent: characterWeaponSpeedPercent ?? undefined,
        },
        attackConfig: {
          weaponStyle: characterWeaponStyle ?? undefined,
          attackPatternId: characterAttackPatternId ?? undefined,
          damageMultiplier: characterAttackDamageMultiplier ?? undefined,
          projectileCount: characterAttackProjectileCount ?? undefined,
          spreadDegrees: characterAttackSpreadDegrees ?? undefined,
          burstCount: characterAttackBurstCount ?? undefined,
          burstIntervalMs: characterAttackBurstIntervalMs ?? undefined,
          aoeRadius: characterAttackAoeRadius ?? undefined,
          aoeDelayMs: characterAttackAoeDelayMs ?? undefined,
          maxTargetHitsPerAttack:
            characterAttackMaxTargetHitsPerAttack ?? undefined,
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
      characterRawMaxHealth,
      characterRawBaseDamage,
      characterRawBaseAttackSpeedMs,
      characterRawBaseAttackRange,
      characterWeaponDamageFlat,
      characterWeaponRangeFlat,
      characterWeaponSpeedPercent,
      characterWeaponStyle,
      characterAttackPatternId,
      characterAttackDamageMultiplier,
      characterAttackProjectileCount,
      characterAttackSpreadDegrees,
      characterAttackBurstCount,
      characterAttackBurstIntervalMs,
      characterAttackAoeRadius,
      characterAttackAoeDelayMs,
      characterAttackMaxTargetHitsPerAttack,
      characterLevel,
      characterXp,
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
    const classDefaults = getCharacterClassBaseCombatStats(characterClass);
    const normalizedProgression = normalizeCharacterProgress(
      characterLevel ?? 1,
      characterXp ?? 0,
    );
    const baseStats: CharacterBaseCombatStats = {
      maxHp: Math.max(1, characterRawMaxHealth ?? classDefaults.maxHp),
      baseDamage: Math.max(
        0,
        characterRawBaseDamage ?? classDefaults.baseDamage,
      ),
      baseAttackSpeedMs: Math.max(
        1,
        Math.floor(
          characterRawBaseAttackSpeedMs ?? classDefaults.baseAttackSpeedMs,
        ),
      ),
      baseAttackRange: Math.max(
        1,
        characterRawBaseAttackRange ?? classDefaults.baseAttackRange,
      ),
    };
    const scaledStats = computeEffectiveCombatStatsForLevel(
      baseStats,
      normalizedProgression.level,
      resolveWeaponModifiers({
        damageFlat: characterWeaponDamageFlat ?? undefined,
        rangeFlat: characterWeaponRangeFlat ?? undefined,
        speedPercent: characterWeaponSpeedPercent ?? undefined,
      }),
    );
    const maxHealth = Math.max(1, characterMaxHealth ?? scaledStats.maxHealth);
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
          baseDamage: scaledStats.baseDamage,
          baseAttackSpeedMs: scaledStats.baseAttackSpeedMs,
          baseAttackRange: scaledStats.baseAttackRange,
        },
        baseStats,
        progression: {
          level: normalizedProgression.level,
          xp: normalizedProgression.xp,
        },
        weaponModifiers: {
          damageFlat: characterWeaponDamageFlat ?? undefined,
          rangeFlat: characterWeaponRangeFlat ?? undefined,
          speedPercent: characterWeaponSpeedPercent ?? undefined,
        },
        attackConfig: {
          weaponStyle: characterWeaponStyle ?? undefined,
          attackPatternId: characterAttackPatternId ?? undefined,
          damageMultiplier: characterAttackDamageMultiplier ?? undefined,
          projectileCount: characterAttackProjectileCount ?? undefined,
          spreadDegrees: characterAttackSpreadDegrees ?? undefined,
          burstCount: characterAttackBurstCount ?? undefined,
          burstIntervalMs: characterAttackBurstIntervalMs ?? undefined,
          aoeRadius: characterAttackAoeRadius ?? undefined,
          aoeDelayMs: characterAttackAoeDelayMs ?? undefined,
          maxTargetHitsPerAttack:
            characterAttackMaxTargetHitsPerAttack ?? undefined,
        },
      },
    );
  }
}
