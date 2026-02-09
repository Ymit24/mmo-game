import { describe, expect, test } from "bun:test";
import { isWorldSnapshotPayload } from "@mmo/shared";

describe("world snapshot payload guard", () => {
  test("rejects payloads with malformed players", () => {
    const payload = {
      worldId: "hub-alpha",
      serverTimeMs: Date.now(),
      players: [
        {
          id: "player-a",
          nickname: "Alpha",
          class: "knight",
          colorHex: "#E8A832",
          position: { x: 120, y: 220 },
          velocity: { x: 0, y: 0 },
          lastProcessedInputSequence: 3,
        },
        {
          id: "player-b",
          nickname: "Broken",
          class: "mage",
          colorHex: "#22D3EE",
          position: { x: 200, y: 220 },
          velocity: { x: Number.NaN, y: 0 },
          lastProcessedInputSequence: 1,
        },
      ],
      enemies: [],
    };

    expect(isWorldSnapshotPayload(payload)).toBe(false);
  });
});
