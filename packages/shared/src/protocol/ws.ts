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
  email: string;
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
      email: string;
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
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isVector2(value: unknown): value is Vector2 {
  if (!isObject(value)) {
    return false;
  }

  return typeof value.x === "number" && typeof value.y === "number";
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
      if (typeof parsed.token !== "string" || parsed.token.length === 0) {
        return null;
      }
      return {
        type: "auth.hello",
        token: parsed.token,
      };

    case "world.join":
      if (typeof parsed.worldId !== "string" || parsed.worldId.length === 0) {
        return null;
      }
      return {
        type: "world.join",
        worldId: parsed.worldId,
      };

    case "player.input":
      if (
        typeof parsed.sequence !== "number" ||
        typeof parsed.dtMs !== "number" ||
        !isPlayerInputState(parsed.input)
      ) {
        return null;
      }

      return {
        type: "player.input",
        sequence: parsed.sequence,
        dtMs: parsed.dtMs,
        input: parsed.input,
      };

    case "inventory.drop": {
      const payload = parsed.payload;
      if (
        !isObject(payload) ||
        typeof payload.itemId !== "string" ||
        typeof payload.quantity !== "number" ||
        !isVector2(payload.position)
      ) {
        return null;
      }

      return {
        type: "inventory.drop",
        payload: {
          itemId: payload.itemId,
          quantity: payload.quantity,
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
