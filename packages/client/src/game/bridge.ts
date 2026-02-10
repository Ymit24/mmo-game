import type {
  InventorySlotRef,
  InventoryStatePayload,
  Vector2,
} from "@mmo/shared";

export interface OverlayPlayer {
  id: string;
  nickname: string;
  className: string;
  colorHex: string;
  x: number;
  y: number;
  isLocal: boolean;
}

export interface OverlayEnemy {
  id: string;
  colorHex: string;
  x: number;
  y: number;
}

export interface OverlayProjectile {
  id: string;
  colorHex: string;
  x: number;
  y: number;
}

export interface InventoryMoveRequest {
  from: InventorySlotRef;
  to: InventorySlotRef;
}

export interface InventoryDropRequest {
  from: InventorySlotRef;
}

export type GameModalKind = "conflict" | "kicked" | "error";

export interface GameModalState {
  kind: GameModalKind;
  message: string;
}

export interface GameBridgeState {
  connectionStatus: "idle" | "connecting" | "connected" | "error";
  modal: GameModalState | null;
  isInWorld: boolean;
  transitionMessage: string | null;
  worldId: string | null;
  localPlayerId: string | null;
  localPosition: Vector2 | null;
  pointerWorld: Vector2;
  mapSize: {
    width: number;
    height: number;
  };
  players: OverlayPlayer[];
  enemies: OverlayEnemy[];
  projectiles: OverlayProjectile[];
  localHealthCurrent: number | null;
  localHealthMax: number | null;
  localLevel: number | null;
  localXp: number | null;
  localXpToNextLevel: number | null;
  lastCombatDeniedReason: "safe_zone" | "cooldown" | "dead" | null;
  inventory: InventoryStatePayload | null;
  inventoryError: string | null;
  lastMessage: string | null;
}

type StateListener = (state: GameBridgeState) => void;
type InventoryMoveListener = (request: InventoryMoveRequest) => void;
type InventoryDropListener = (request: InventoryDropRequest) => void;
type TakeoverListener = () => void;

const DEFAULT_STATE: GameBridgeState = {
  connectionStatus: "idle",
  modal: null,
  isInWorld: false,
  transitionMessage: null,
  worldId: null,
  localPlayerId: null,
  localPosition: null,
  pointerWorld: { x: 0, y: 0 },
  mapSize: {
    width: 1,
    height: 1,
  },
  players: [],
  enemies: [],
  projectiles: [],
  localHealthCurrent: null,
  localHealthMax: null,
  localLevel: null,
  localXp: null,
  localXpToNextLevel: null,
  lastCombatDeniedReason: null,
  inventory: null,
  inventoryError: null,
  lastMessage: null,
};

export class GameBridge {
  private state: GameBridgeState;
  private stateListeners = new Set<StateListener>();
  private inventoryMoveListeners = new Set<InventoryMoveListener>();
  private inventoryDropListeners = new Set<InventoryDropListener>();
  private takeoverListeners = new Set<TakeoverListener>();

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

  onInventoryMoveRequest(listener: InventoryMoveListener): () => void {
    this.inventoryMoveListeners.add(listener);
    return () => {
      this.inventoryMoveListeners.delete(listener);
    };
  }

  requestInventoryMove(request: InventoryMoveRequest): void {
    for (const listener of this.inventoryMoveListeners) {
      listener(request);
    }
  }

  onInventoryDropRequest(listener: InventoryDropListener): () => void {
    this.inventoryDropListeners.add(listener);
    return () => {
      this.inventoryDropListeners.delete(listener);
    };
  }

  requestInventoryDrop(request: InventoryDropRequest): void {
    for (const listener of this.inventoryDropListeners) {
      listener(request);
    }
  }

  onTakeoverRequest(listener: TakeoverListener): () => void {
    this.takeoverListeners.add(listener);
    return () => {
      this.takeoverListeners.delete(listener);
    };
  }

  requestTakeover(): void {
    for (const listener of this.takeoverListeners) {
      listener();
    }
  }

  resetForReconnect(): void {
    this.updateState(DEFAULT_STATE);
  }
}

export function createGameBridge(
  initialState: Partial<GameBridgeState> = {},
): GameBridge {
  return new GameBridge(initialState);
}
