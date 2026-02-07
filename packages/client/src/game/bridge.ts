import type { Vector2 } from "@mmo/shared";

export interface OverlayPlayer {
  id: string;
  x: number;
  y: number;
  isLocal: boolean;
}

export interface DropRequest {
  itemId: string;
  quantity: number;
}

export interface GameBridgeState {
  connectionStatus: "idle" | "connecting" | "connected" | "error";
  worldId: string | null;
  localPlayerId: string | null;
  localPosition: Vector2 | null;
  pointerWorld: Vector2;
  mapSize: {
    width: number;
    height: number;
  };
  players: OverlayPlayer[];
  lastMessage: string | null;
}

type StateListener = (state: GameBridgeState) => void;
type DropListener = (request: DropRequest) => void;

const DEFAULT_STATE: GameBridgeState = {
  connectionStatus: "idle",
  worldId: null,
  localPlayerId: null,
  localPosition: null,
  pointerWorld: { x: 0, y: 0 },
  mapSize: {
    width: 1,
    height: 1,
  },
  players: [],
  lastMessage: null,
};

export class GameBridge {
  private state: GameBridgeState;
  private stateListeners = new Set<StateListener>();
  private dropListeners = new Set<DropListener>();

  constructor(initialState: Partial<GameBridgeState> = {}) {
    this.state = {
      ...DEFAULT_STATE,
      ...initialState,
    };
  }

  subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  getState(): GameBridgeState {
    return this.state;
  }

  updateState(nextState: Partial<GameBridgeState>): void {
    this.state = {
      ...this.state,
      ...nextState,
    };

    for (const listener of this.stateListeners) {
      listener(this.state);
    }
  }

  onDropRequest(listener: DropListener): () => void {
    this.dropListeners.add(listener);
    return () => {
      this.dropListeners.delete(listener);
    };
  }

  requestDrop(request: DropRequest): void {
    for (const listener of this.dropListeners) {
      listener(request);
    }
  }
}

export function createGameBridge(
  initialState: Partial<GameBridgeState> = {},
): GameBridge {
  return new GameBridge(initialState);
}
