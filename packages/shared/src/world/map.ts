import type { EnemySpawner } from "../enemies";

export type CollisionShape = {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
};

export interface SpawnPoint {
  id: string;
  x: number;
  y: number;
}

export interface RegionTrigger {
  id: string;
  name: string;
  shape: CollisionShape;
}

export interface PortalTrigger {
  id: string;
  name: string;
  shape: CollisionShape;
  targetWorldId: string;
  targetSpawnId: string;
  exitOffset: {
    x: number;
    y: number;
  };
}

export interface WorldCombatRules {
  allowCombat: boolean;
  pvpEnabled: boolean;
}

export interface WorldMap {
  id: string;
  name: string;
  width: number;
  height: number;
  background: {
    color: string;
    gridSize: number;
  };
  combat: WorldCombatRules;
  playerSpawnId: string;
  spawnPoints: SpawnPoint[];
  collisions: CollisionShape[];
  regions: RegionTrigger[];
  portals: PortalTrigger[];
  enemySpawners: EnemySpawner[];
}
