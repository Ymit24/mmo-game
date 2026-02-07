import type {
  CollisionShape,
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
  if (!isObject(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "rect") {
    return (
      isNumber(value.x) &&
      isNumber(value.y) &&
      isNumber(value.width) &&
      isNumber(value.height)
    );
  }

  if (value.type === "circle") {
    return isNumber(value.x) && isNumber(value.y) && isNumber(value.radius);
  }

  return false;
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
    value.regions.every((region) => isRegionTrigger(region))
  );
}

export function parseWorldMap(value: unknown, context: string): WorldMap {
  if (!isWorldMap(value)) {
    throw new Error(`Invalid world map payload for ${context}.`);
  }

  return value;
}
