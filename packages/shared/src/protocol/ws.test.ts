import { describe, expect, test } from "bun:test";

import { parseClientMessage } from "./ws";

describe("ws protocol parsing", () => {
  test("parses inventory.consume payloads", () => {
    const parsed = parseClientMessage(
      JSON.stringify({
        type: "inventory.consume",
        payload: {
          from: { kind: "bag", index: 0 },
        },
      }),
    );

    expect(parsed).toEqual({
      type: "inventory.consume",
      payload: {
        from: { kind: "bag", index: 0 },
      },
    });
  });

  test("rejects malformed inventory.consume payloads", () => {
    const parsed = parseClientMessage(
      JSON.stringify({
        type: "inventory.consume",
        payload: {
          from: { kind: "bag", index: -1 },
        },
      }),
    );
    expect(parsed).toBeNull();
  });
});
