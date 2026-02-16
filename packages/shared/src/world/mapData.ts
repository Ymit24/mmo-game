import world01GreenfieldsMapJson from "../maps/world_01_greenfields.json";
import world02DustyCanyonsMapJson from "../maps/world_02_dusty_canyons.json";
import world03FrostmarchMapJson from "../maps/world_03_frostmarch.json";
import world04EmberHighlandsMapJson from "../maps/world_04_ember_highlands.json";
import world05DreadmoorMapJson from "../maps/world_05_dreadmoor.json";
import world06VoidCitadelMapJson from "../maps/world_06_void_citadel.json";

import type { SpawnPoint, WorldMap } from "./map";
import { parseWorldMap } from "./mapValidation";

export const WORLD_01_GREENFIELDS_MAP: WorldMap = parseWorldMap(
  world01GreenfieldsMapJson,
  "world_01_greenfields.json",
);

export const WORLD_02_DUSTY_CANYONS_MAP: WorldMap = parseWorldMap(
  world02DustyCanyonsMapJson,
  "world_02_dusty_canyons.json",
);

export const WORLD_03_FROSTMARCH_MAP: WorldMap = parseWorldMap(
  world03FrostmarchMapJson,
  "world_03_frostmarch.json",
);

export const WORLD_04_EMBER_HIGHLANDS_MAP: WorldMap = parseWorldMap(
  world04EmberHighlandsMapJson,
  "world_04_ember_highlands.json",
);

export const WORLD_05_DREADMOOR_MAP: WorldMap = parseWorldMap(
  world05DreadmoorMapJson,
  "world_05_dreadmoor.json",
);

export const WORLD_06_VOID_CITADEL_MAP: WorldMap = parseWorldMap(
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
