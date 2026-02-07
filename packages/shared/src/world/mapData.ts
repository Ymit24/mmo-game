import hubAlphaMapJson from "../maps/hub-alpha.json";

import type { SpawnPoint, WorldMap } from "./map";
import { parseWorldMap } from "./mapValidation";

export const HUB_ALPHA_MAP: WorldMap = parseWorldMap(
  hubAlphaMapJson,
  "hub-alpha.json",
);

export function findSpawnPoint(
  map: WorldMap,
  spawnId: string,
): SpawnPoint | undefined {
  return map.spawnPoints.find((spawn) => spawn.id === spawnId);
}
