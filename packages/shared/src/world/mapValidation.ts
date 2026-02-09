import type { EnemySpawner } from "../enemies";
import type {
  CollisionShape,
  PortalTrigger,
  RegionTrigger,
  SpawnPoint,
  WorldMap,
} from "./map";

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCollisionShape(value: unknown): value is CollisionShape {
  if (!isObject(value) || value.type !== "rect") {
    return false;
  }

  return (
    isNumber(value.x) &&
    isNumber(value.y) &&
    isNumber(value.width) &&
    isNumber(value.height)
  );
}

function isSpawnPoint(value: unknown): value is SpawnPoint {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    isNumber(value.x) &&
    isNumber(value.y)
  );
}

function isRegionTrigger(value: unknown): value is RegionTrigger {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isCollisionShape(value.shape)
  );
}

function isPortalTrigger(value: unknown): value is PortalTrigger {
  if (!isObject(value) || !isObject(value.exitOffset)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isCollisionShape(value.shape) &&
    typeof value.targetWorldId === "string" &&
    value.targetWorldId.length > 0 &&
    typeof value.targetSpawnId === "string" &&
    value.targetSpawnId.length > 0 &&
    isNumber(value.exitOffset.x) &&
    isNumber(value.exitOffset.y)
  );
}

function isEnemySpawner(value: unknown): value is EnemySpawner {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.archetypeId === "string" &&
    value.archetypeId.length > 0 &&
    isNumber(value.x) &&
    isNumber(value.y) &&
    isNumber(value.spawnRadius) &&
    value.spawnRadius >= 0 &&
    isNumber(value.maxAlive) &&
    Number.isInteger(value.maxAlive) &&
    value.maxAlive > 0 &&
    isNumber(value.respawnSeconds) &&
    value.respawnSeconds >= 0
  );
}

export function isWorldMap(value: unknown): value is WorldMap {
  if (!isObject(value) || !isObject(value.background)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isNumber(value.width) &&
    isNumber(value.height) &&
    typeof value.background.color === "string" &&
    isNumber(value.background.gridSize) &&
    typeof value.playerSpawnId === "string" &&
    Array.isArray(value.spawnPoints) &&
    value.spawnPoints.every((spawn) => isSpawnPoint(spawn)) &&
    Array.isArray(value.collisions) &&
    value.collisions.every((shape) => isCollisionShape(shape)) &&
    Array.isArray(value.regions) &&
    value.regions.every((region) => isRegionTrigger(region)) &&
    Array.isArray(value.portals) &&
    value.portals.every((portal) => isPortalTrigger(portal)) &&
    Array.isArray(value.enemySpawners) &&
    value.enemySpawners.every((spawner) => isEnemySpawner(spawner))
  );
}

export function parseWorldMap(value: unknown, context: string): WorldMap {
  if (!isWorldMap(value)) {
    throw new Error(`Invalid world map payload for ${context}.`);
  }

  return value;
}
