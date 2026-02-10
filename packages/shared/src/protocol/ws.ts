import { type CharacterClass, isCharacterClass } from "../characters";
import type { EnemyBehaviorState, EnemySnapshot } from "../enemies";
import {
  type InventoryActionErrorCode,
  type InventorySlotRef,
  type InventoryStatePayload,
  isInventorySlotRef,
} from "../items";

export interface Vector2 {
  x: number;
  y: number;
}

export interface PlayerInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface PlayerSnapshot {
  id: string;
  nickname: string;
  class: CharacterClass;
  colorHex: string;
  position: Vector2;
  velocity: Vector2;
  lastProcessedInputSequence: number;
  currentHealth: number;
  maxHealth: number;
}

export interface ProjectileSnapshot {
  id: string;
  ownerId: string;
  position: Vector2;
  velocity: Vector2;
  radius: number;
  colorHex: string;
}

export interface WorldSnapshotPayload {
  worldId: string;
  serverTimeMs: number;
  players: PlayerSnapshot[];
  enemies: EnemySnapshot[];
  projectiles: ProjectileSnapshot[];
}

export interface InventoryMovePayload {
  from: InventorySlotRef;
  to: InventorySlotRef;
}

export interface InventoryDropPayload {
  from: InventorySlotRef;
  position: Vector2;
}

export type CombatFloatingTextVariant =
  | "damage_enemy"
  | "damage_player"
  | "xp_gain"
  | "level_up";

export type ClientToServerMessage =
  | {
      type: "auth.hello";
      token: string;
      forceTakeover?: boolean;
    }
  | {
      type: "world.join";
      worldId: string;
      characterId: string;
    }
  | {
      type: "player.input";
      sequence: number;
      dtMs: number;
      input: PlayerInputState;
    }
  | {
      type: "player.attack";
      aim: Vector2;
    }
  | {
      type: "inventory.move";
      payload: InventoryMovePayload;
    }
  | {
      type: "inventory.drop";
      payload: InventoryDropPayload;
    };

export type ServerToClientMessage =
  | {
      type: "auth.ok";
    }
  | {
      type: "auth.error";
      error: string;
    }
  | {
      type: "world.transitioning";
      fromWorldId: string;
      toWorldId: string;
      portalId: string;
      reason: "portal" | "respawn";
    }
  | {
      type: "world.joined";
      worldId: string;
      characterId: string;
      nickname: string;
      class: CharacterClass;
      colorHex: string;
      spawn: Vector2;
      level: number;
      xp: number;
      xpToNextLevel: number | null;
      currentHealth: number;
      maxHealth: number;
    }
  | {
      type: "world.playerJoined";
      worldId: string;
      player: PlayerSnapshot;
    }
  | {
      type: "world.playerLeft";
      worldId: string;
      characterId: string;
    }
  | {
      type: "world.snapshot";
      payload: WorldSnapshotPayload;
    }
  | {
      type: "player.state";
      position: Vector2;
      velocity: Vector2;
      lastProcessedInputSequence: number;
      currentHealth: number;
      maxHealth: number;
    }
  | {
      type: "combat.attackDenied";
      reason: "safe_zone" | "cooldown" | "dead";
      message: string;
    }
  | {
      type: "combat.attackPerformed";
      attackerId: string;
      attackStyle: "melee" | "ranged";
      origin: Vector2;
      direction: Vector2;
      range: number;
    }
  | {
      type: "combat.playerDied";
      characterId: string;
      respawnWorldId: string;
    }
  | {
      type: "combat.floatingText";
      position: Vector2;
      text: string;
      variant: CombatFloatingTextVariant;
    }
  | {
      type: "progression.updated";
      level: number;
      xp: number;
      xpToNextLevel: number | null;
      currentHealth: number;
      maxHealth: number;
      baseDamage: number;
    }
  | {
      type: "inventory.state";
      state: InventoryStatePayload;
    }
  | {
      type: "inventory.moved";
      from: InventorySlotRef;
      to: InventorySlotRef;
      state: InventoryStatePayload;
    }
  | {
      type: "inventory.drop.ack";
      from: InventorySlotRef;
      removedItemInstanceId: string;
      state: InventoryStatePayload;
    }
  | {
      type: "inventory.actionRejected";
      code: InventoryActionErrorCode;
      message: string;
    }
  | {
      type: "error";
      error: string;
    }
  | {
      type: "session.kicked";
      reason: string;
    }
  | {
      type: "session.conflict";
      reason: string;
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isVector2(value: unknown): value is Vector2 {
  if (!isObject(value)) {
    return false;
  }

  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

function isPlayerInputState(value: unknown): value is PlayerInputState {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.up === "boolean" &&
    typeof value.down === "boolean" &&
    typeof value.left === "boolean" &&
    typeof value.right === "boolean"
  );
}

function isPlayerSnapshot(value: unknown): value is PlayerSnapshot {
  if (!isObject(value)) {
    return false;
  }
  const currentHealth = value.currentHealth;
  const maxHealth = value.maxHealth;

  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.nickname === "string" &&
    value.nickname.length > 0 &&
    typeof value.class === "string" &&
    isCharacterClass(value.class) &&
    typeof value.colorHex === "string" &&
    value.colorHex.length > 0 &&
    isVector2(value.position) &&
    isVector2(value.velocity) &&
    typeof value.lastProcessedInputSequence === "number" &&
    Number.isSafeInteger(value.lastProcessedInputSequence) &&
    value.lastProcessedInputSequence >= 0 &&
    typeof currentHealth === "number" &&
    Number.isFinite(currentHealth) &&
    typeof maxHealth === "number" &&
    Number.isFinite(maxHealth) &&
    maxHealth > 0 &&
    currentHealth >= 0
  );
}

function isProjectileSnapshot(value: unknown): value is ProjectileSnapshot {
  if (!isObject(value)) {
    return false;
  }
  const radius = value.radius;

  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.ownerId === "string" &&
    value.ownerId.length > 0 &&
    isVector2(value.position) &&
    isVector2(value.velocity) &&
    typeof radius === "number" &&
    Number.isFinite(radius) &&
    radius > 0 &&
    typeof value.colorHex === "string" &&
    value.colorHex.length > 0
  );
}

function isEnemyBehaviorState(value: unknown): value is EnemyBehaviorState {
  return (
    value === "idle" ||
    value === "chasing" ||
    value === "returning" ||
    value === "attacking"
  );
}

function isEnemySnapshot(value: unknown): value is EnemySnapshot {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.archetypeId === "string" &&
    value.archetypeId.length > 0 &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    isVector2(value.position) &&
    isVector2(value.velocity) &&
    isEnemyBehaviorState(value.state) &&
    Number.isFinite(value.currentHealth) &&
    Number.isFinite(value.maxHealth) &&
    typeof value.colorHex === "string" &&
    value.colorHex.length > 0 &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.height)
  );
}

export function isWorldSnapshotPayload(
  value: unknown,
): value is WorldSnapshotPayload {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.worldId === "string" &&
    value.worldId.length > 0 &&
    Number.isFinite(value.serverTimeMs) &&
    Array.isArray(value.players) &&
    value.players.every((player) => isPlayerSnapshot(player)) &&
    Array.isArray(value.enemies) &&
    value.enemies.every((enemy) => isEnemySnapshot(enemy)) &&
    Array.isArray(value.projectiles) &&
    value.projectiles.every((projectile) => isProjectileSnapshot(projectile))
  );
}

export function parseClientMessage(raw: string): ClientToServerMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  if (!isObject(parsed) || typeof parsed.type !== "string") {
    return null;
  }

  switch (parsed.type) {
    case "auth.hello":
      if (
        typeof parsed.token !== "string" ||
        parsed.token.length === 0 ||
        (parsed.forceTakeover !== undefined &&
          typeof parsed.forceTakeover !== "boolean")
      ) {
        return null;
      }
      return {
        type: "auth.hello",
        token: parsed.token,
        forceTakeover: parsed.forceTakeover,
      };

    case "world.join":
      if (
        typeof parsed.worldId !== "string" ||
        parsed.worldId.length === 0 ||
        typeof parsed.characterId !== "string" ||
        parsed.characterId.length === 0
      ) {
        return null;
      }
      return {
        type: "world.join",
        worldId: parsed.worldId,
        characterId: parsed.characterId,
      };

    case "player.input": {
      const sequence = parsed.sequence;
      const dtMs = parsed.dtMs;
      if (
        typeof sequence !== "number" ||
        !Number.isSafeInteger(sequence) ||
        sequence < 0 ||
        typeof dtMs !== "number" ||
        !Number.isFinite(dtMs) ||
        dtMs < 0 ||
        dtMs > 1_000 ||
        !isPlayerInputState(parsed.input)
      ) {
        return null;
      }

      return {
        type: "player.input",
        sequence,
        dtMs,
        input: parsed.input,
      };
    }

    case "player.attack":
      if (!isVector2(parsed.aim)) {
        return null;
      }

      return {
        type: "player.attack",
        aim: parsed.aim,
      };

    case "inventory.move": {
      const payload = parsed.payload;
      if (
        !isObject(payload) ||
        !isInventorySlotRef(payload.from) ||
        !isInventorySlotRef(payload.to)
      ) {
        return null;
      }

      return {
        type: "inventory.move",
        payload: {
          from: payload.from,
          to: payload.to,
        },
      };
    }

    case "inventory.drop": {
      const payload = parsed.payload;
      if (
        !isObject(payload) ||
        !isInventorySlotRef(payload.from) ||
        !isVector2(payload.position)
      ) {
        return null;
      }

      return {
        type: "inventory.drop",
        payload: {
          from: payload.from,
          position: payload.position,
        },
      };
    }

    default:
      return null;
  }
}

export function stringifyServerMessage(message: ServerToClientMessage): string {
  return JSON.stringify(message);
}
