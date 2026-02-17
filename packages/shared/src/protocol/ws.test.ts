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

  test("parses optional stack move count", () => {
    const parsed = parseClientMessage(
      JSON.stringify({
        type: "inventory.move",
        payload: {
          from: { kind: "bag", index: 0 },
          to: { kind: "bag", index: 1 },
          count: 2,
        },
      }),
    );

    expect(parsed).toEqual({
      type: "inventory.move",
      payload: {
        from: { kind: "bag", index: 0 },
        to: { kind: "bag", index: 1 },
        count: 2,
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

  test("rejects invalid stack move count", () => {
    const parsed = parseClientMessage(
      JSON.stringify({
        type: "inventory.move",
        payload: {
          from: { kind: "bag", index: 0 },
          to: { kind: "bag", index: 1 },
          count: 0,
        },
      }),
    );
    expect(parsed).toBeNull();
  });
});
