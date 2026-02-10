import type { Vector2 } from "./protocol/ws";

export const ENEMY_BEHAVIOR_STATES = [
  "idle",
  "chasing",
  "returning",
  "attacking",
] as const;

export type EnemyBehaviorState = (typeof ENEMY_BEHAVIOR_STATES)[number];

export interface EnemyArchetype {
  id: string;
  name: string;
  level: number;
  xpReward: number;
  maxHealth: number;
  damage: number;
  speed: number;
  detectionRadius: number;
  leashRadius: number;
  attackSpeedMs: number;
  meleeRange: number;
  rangedRange: number;
  canMelee: boolean;
  canRanged: boolean;
  visualWidth: number;
  visualHeight: number;
  colorHex: string;
}

export interface EnemySpawner {
  id: string;
  archetypeId: string;
  x: number;
  y: number;
  spawnRadius: number;
  maxAlive: number;
  respawnSeconds: number;
}

export interface EnemySnapshot {
  id: string;
  archetypeId: string;
  name: string;
  position: Vector2;
  velocity: Vector2;
  state: EnemyBehaviorState;
  currentHealth: number;
  maxHealth: number;
  colorHex: string;
  width: number;
  height: number;
}
