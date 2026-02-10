import { describe, expect, test } from "bun:test";
import { parseWorldMap } from "@mmo/shared";

describe("world map validation", () => {
  test("accepts enemy spawner payloads and rejects malformed spawners", () => {
    const valid = {
      id: "test:map",
      name: "Test Map",
      width: 1000,
      height: 800,
      background: {
        color: "#000000",
        gridSize: 32,
      },
      combat: {
        allowCombat: true,
        pvpEnabled: false,
      },
      playerSpawnId: "spawn",
      spawnPoints: [{ id: "spawn", x: 100, y: 100 }],
      collisions: [],
      regions: [],
      portals: [],
      enemySpawners: [
        {
          id: "spawner-a",
          archetypeId: "slime_scout",
          x: 300,
          y: 300,
          spawnRadius: 80,
          maxAlive: 2,
          respawnSeconds: 1.5,
        },
      ],
    };

    expect(() => parseWorldMap(valid, "valid-map")).not.toThrow();

    const invalid = {
      ...valid,
      enemySpawners: [
        {
          ...valid.enemySpawners[0],
          maxAlive: 0,
        },
      ],
    };

    expect(() => parseWorldMap(invalid, "invalid-map")).toThrow();
  });
});
