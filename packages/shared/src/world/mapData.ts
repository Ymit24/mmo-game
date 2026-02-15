import world01GreenfieldsMapJson from "../maps/world_01_greenfields.json";
import world02DustyCanyonsMapJson from "../maps/world_02_dusty_canyons.json";
import world03FrostmarchMapJson from "../maps/world_03_frostmarch.json";
import world04EmberHighlandsMapJson from "../maps/world_04_ember_highlands.json";
import world05DreadmoorMapJson from "../maps/world_05_dreadmoor.json";
import world06VoidCitadelMapJson from "../maps/world_06_void_citadel.json";

import type { SpawnPoint, WorldMap } from "./map";
import { parseWorldMap } from "./mapValidation";

const WORLD_COORDINATE_SCALE = 10;

function scaleWorldMap(map: WorldMap, factor: number): WorldMap {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) {
    return map;
  }

  return {
    ...map,
    width: map.width * factor,
    height: map.height * factor,
    background: {
      ...map.background,
      gridSize: map.background.gridSize * factor,
    },
    spawnPoints: map.spawnPoints.map((spawn) => ({
      ...spawn,
      x: spawn.x * factor,
      y: spawn.y * factor,
    })),
    collisions: map.collisions.map((shape) => ({
      ...shape,
      x: shape.x * factor,
      y: shape.y * factor,
      width: shape.width * factor,
      height: shape.height * factor,
    })),
    regions: map.regions.map((region) => ({
      ...region,
      shape: {
        ...region.shape,
        x: region.shape.x * factor,
        y: region.shape.y * factor,
        width: region.shape.width * factor,
        height: region.shape.height * factor,
      },
    })),
    portals: map.portals.map((portal) => ({
      ...portal,
      shape: {
        ...portal.shape,
        x: portal.shape.x * factor,
        y: portal.shape.y * factor,
        width: portal.shape.width * factor,
        height: portal.shape.height * factor,
      },
      exitOffset: {
        x: portal.exitOffset.x * factor,
        y: portal.exitOffset.y * factor,
      },
    })),
    enemySpawners: map.enemySpawners.map((spawner) => ({
      ...spawner,
      x: spawner.x * factor,
      y: spawner.y * factor,
      spawnRadius: spawner.spawnRadius * factor,
    })),
  };
}

function parseAndScaleMap(payload: unknown, context: string): WorldMap {
  return scaleWorldMap(parseWorldMap(payload, context), WORLD_COORDINATE_SCALE);
}

export const WORLD_01_GREENFIELDS_MAP: WorldMap = parseAndScaleMap(
  world01GreenfieldsMapJson,
  "world_01_greenfields.json",
);

export const WORLD_02_DUSTY_CANYONS_MAP: WorldMap = parseAndScaleMap(
  world02DustyCanyonsMapJson,
  "world_02_dusty_canyons.json",
);

export const WORLD_03_FROSTMARCH_MAP: WorldMap = parseAndScaleMap(
  world03FrostmarchMapJson,
  "world_03_frostmarch.json",
);

export const WORLD_04_EMBER_HIGHLANDS_MAP: WorldMap = parseAndScaleMap(
  world04EmberHighlandsMapJson,
  "world_04_ember_highlands.json",
);

export const WORLD_05_DREADMOOR_MAP: WorldMap = parseAndScaleMap(
  world05DreadmoorMapJson,
  "world_05_dreadmoor.json",
);

export const WORLD_06_VOID_CITADEL_MAP: WorldMap = parseAndScaleMap(
  world06VoidCitadelMapJson,
  "world_06_void_citadel.json",
);

export const WORLD_MAPS_BY_ID = new Map<string, WorldMap>([
  [WORLD_01_GREENFIELDS_MAP.id, WORLD_01_GREENFIELDS_MAP],
  [WORLD_02_DUSTY_CANYONS_MAP.id, WORLD_02_DUSTY_CANYONS_MAP],
  [WORLD_03_FROSTMARCH_MAP.id, WORLD_03_FROSTMARCH_MAP],
  [WORLD_04_EMBER_HIGHLANDS_MAP.id, WORLD_04_EMBER_HIGHLANDS_MAP],
  [WORLD_05_DREADMOOR_MAP.id, WORLD_05_DREADMOOR_MAP],
  [WORLD_06_VOID_CITADEL_MAP.id, WORLD_06_VOID_CITADEL_MAP],
]);

export const DEFAULT_WORLD_ID = WORLD_01_GREENFIELDS_MAP.id;

// Compatibility aliases for existing imports.
export const HUB_ALPHA_MAP = WORLD_01_GREENFIELDS_MAP;
export const WILDS_BETA_MAP = WORLD_02_DUSTY_CANYONS_MAP;
export const FRONTIER_GAMMA_MAP = WORLD_03_FROSTMARCH_MAP;
export const CITADEL_DELTA_MAP = WORLD_04_EMBER_HIGHLANDS_MAP;

export function findSpawnPoint(
  map: WorldMap,
  spawnId: string,
): SpawnPoint | undefined {
  return map.spawnPoints.find((spawn) => spawn.id === spawnId);
}
