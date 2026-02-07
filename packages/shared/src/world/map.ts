export type CollisionShape =
  | {
      type: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      type: "circle";
      x: number;
      y: number;
      radius: number;
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

export interface WorldMap {
  id: string;
  name: string;
  width: number;
  height: number;
  background: {
    color: string;
    gridSize: number;
  };
  playerSpawnId: string;
  spawnPoints: SpawnPoint[];
  collisions: CollisionShape[];
  regions: RegionTrigger[];
}
