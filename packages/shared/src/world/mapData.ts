import citadelDeltaMapJson from "../maps/citadel-delta.json";
import frontierGammaMapJson from "../maps/frontier-gamma.json";
import hubAlphaMapJson from "../maps/hub-alpha.json";
import wildsBetaMapJson from "../maps/wilds-beta.json";

import type { SpawnPoint, WorldMap } from "./map";
import { parseWorldMap } from "./mapValidation";

export const HUB_ALPHA_MAP: WorldMap = parseWorldMap(
  hubAlphaMapJson,
  "hub-alpha.json",
);

export const WILDS_BETA_MAP: WorldMap = parseWorldMap(
  wildsBetaMapJson,
  "wilds-beta.json",
);

export const FRONTIER_GAMMA_MAP: WorldMap = parseWorldMap(
  frontierGammaMapJson,
  "frontier-gamma.json",
);

export const CITADEL_DELTA_MAP: WorldMap = parseWorldMap(
  citadelDeltaMapJson,
  "citadel-delta.json",
);

export const WORLD_MAPS_BY_ID = new Map<string, WorldMap>([
  [HUB_ALPHA_MAP.id, HUB_ALPHA_MAP],
  [WILDS_BETA_MAP.id, WILDS_BETA_MAP],
  [FRONTIER_GAMMA_MAP.id, FRONTIER_GAMMA_MAP],
  [CITADEL_DELTA_MAP.id, CITADEL_DELTA_MAP],
]);

export const DEFAULT_WORLD_ID = HUB_ALPHA_MAP.id;

export function findSpawnPoint(
  map: WorldMap,
  spawnId: string,
): SpawnPoint | undefined {
  return map.spawnPoints.find((spawn) => spawn.id === spawnId);
}
