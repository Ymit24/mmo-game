export interface Vector2 {
  x: number;
  y: number;
}

export interface PlayerInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface PlayerSnapshot {
  id: string;
  position: Vector2;
  velocity: Vector2;
  lastProcessedInputSequence: number;
}

export interface WorldSnapshotPayload {
  worldId: string;
  serverTimeMs: number;
  players: PlayerSnapshot[];
}

export interface InventoryDropPayload {
  itemId: string;
  quantity: number;
  position: Vector2;
}

export type ClientToServerMessage =
  | {
      type: "auth.hello";
      token: string;
      forceTakeover?: boolean;
    }
  | {
      type: "world.join";
      worldId: string;
    }
  | {
      type: "player.input";
      sequence: number;
      dtMs: number;
      input: PlayerInputState;
    }
  | {
      type: "inventory.drop";
      payload: InventoryDropPayload;
    };

export type ServerToClientMessage =
  | {
      type: "auth.ok";
      playerId: string;
    }
  | {
      type: "auth.error";
      error: string;
    }
  | {
      type: "world.joined";
      worldId: string;
      playerId: string;
      spawn: Vector2;
    }
  | {
      type: "world.playerJoined";
      worldId: string;
      player: PlayerSnapshot;
    }
  | {
      type: "world.playerLeft";
      worldId: string;
      playerId: string;
    }
  | {
      type: "world.snapshot";
      payload: WorldSnapshotPayload;
    }
  | {
      type: "player.state";
      position: Vector2;
      velocity: Vector2;
      lastProcessedInputSequence: number;
    }
  | {
      type: "inventory.drop.ack";
      itemId: string;
      quantity: number;
      position: Vector2;
    }
  | {
      type: "error";
      error: string;
    }
  | {
      type: "session.kicked";
      reason: string;
    }
  | {
      type: "session.conflict";
      reason: string;
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isVector2(value: unknown): value is Vector2 {
  if (!isObject(value)) {
    return false;
  }

  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

function isPlayerInputState(value: unknown): value is PlayerInputState {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.up === "boolean" &&
    typeof value.down === "boolean" &&
    typeof value.left === "boolean" &&
    typeof value.right === "boolean"
  );
}

export function parseClientMessage(raw: string): ClientToServerMessage | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  if (!isObject(parsed) || typeof parsed.type !== "string") {
    return null;
  }

  switch (parsed.type) {
    case "auth.hello":
      if (
        typeof parsed.token !== "string" ||
        parsed.token.length === 0 ||
        (parsed.forceTakeover !== undefined &&
          typeof parsed.forceTakeover !== "boolean")
      ) {
        return null;
      }
      return {
        type: "auth.hello",
        token: parsed.token,
        forceTakeover: parsed.forceTakeover,
      };

    case "world.join":
      if (typeof parsed.worldId !== "string" || parsed.worldId.length === 0) {
        return null;
      }
      return {
        type: "world.join",
        worldId: parsed.worldId,
      };

    case "player.input": {
      const sequence = parsed.sequence;
      const dtMs = parsed.dtMs;
      if (
        typeof sequence !== "number" ||
        !Number.isSafeInteger(sequence) ||
        sequence < 0 ||
        typeof dtMs !== "number" ||
        !Number.isFinite(dtMs) ||
        dtMs < 0 ||
        dtMs > 1_000 ||
        !isPlayerInputState(parsed.input)
      ) {
        return null;
      }

      return {
        type: "player.input",
        sequence,
        dtMs,
        input: parsed.input,
      };
    }

    case "inventory.drop": {
      const payload = parsed.payload;
      const quantity = isObject(payload) ? payload.quantity : undefined;
      if (
        !isObject(payload) ||
        typeof payload.itemId !== "string" ||
        typeof quantity !== "number" ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 9_999 ||
        !isVector2(payload.position)
      ) {
        return null;
      }

      return {
        type: "inventory.drop",
        payload: {
          itemId: payload.itemId,
          quantity,
          position: payload.position,
        },
      };
    }

    default:
      return null;
  }
}

export function stringifyServerMessage(message: ServerToClientMessage): string {
  return JSON.stringify(message);
}
