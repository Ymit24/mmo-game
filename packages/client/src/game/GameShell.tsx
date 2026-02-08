import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { type GameBridgeState, createGameBridge } from "./bridge";
import { mountGameRuntime } from "./phaser/runtime";

interface InventoryItem {
  id: string;
  label: string;
  quantity: number;
}

const INVENTORY_SEED: InventoryItem[] = [
  { id: "health_potion", label: "Health Potion", quantity: 3 },
  { id: "mana_cube", label: "Mana Cube", quantity: 2 },
];

interface GameShellProps {
  characterId: string;
}

export function GameShell({ characterId }: GameShellProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const bridge = useMemo(() => createGameBridge(), []);

  const [uiState, setUiState] = useState<GameBridgeState>(() =>
    bridge.getState(),
  );
  const [inventory, setInventory] = useState<InventoryItem[]>(INVENTORY_SEED);

  useEffect(() => {
    return bridge.subscribe((nextState) => {
      setUiState(nextState);
    });
  }, [bridge]);

  useEffect(() => {
    if (!containerRef.current || !auth.token) {
      return;
    }

    return mountGameRuntime({
      container: containerRef.current,
      token: auth.token,
      characterId,
      bridge,
    });
  }, [auth.token, bridge, characterId]);

  const isReady = uiState.connectionStatus === "connected" && !!uiState.worldId;

  function reconnect(): void {
    window.location.reload();
  }

  function handleDropToGround(itemId: string): void {
    setInventory((prev) =>
      prev
        .map((item) =>
          item.id === itemId
            ? {
                ...item,
                quantity: Math.max(0, item.quantity - 1),
              }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );

    bridge.requestDrop({
      itemId,
      quantity: 1,
    });
  }

  function onInventoryDragStart(
    event: DragEvent<HTMLButtonElement>,
    itemId: string,
  ): void {
    event.dataTransfer.setData("text/plain", itemId);
    event.dataTransfer.effectAllowed = "move";
  }

  function onGroundDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    const itemId = event.dataTransfer.getData("text/plain");
    if (!itemId) {
      return;
    }

    handleDropToGround(itemId);
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-void text-text">
      <div ref={containerRef} className="absolute inset-0" />

      {!isReady || uiState.modal ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-void/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-abyss/95 p-5 shadow-xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan">
              Connection
            </p>
            <h2 className="mt-2 text-lg text-text-bright">
              {uiState.modal?.kind === "conflict"
                ? "Session Already Active"
                : uiState.modal?.kind === "kicked"
                  ? "Session Replaced"
                  : "Joining World"}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {uiState.modal?.message ??
                "Connecting to the realtime world and syncing player state..."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {uiState.modal?.kind === "conflict" ? (
                <button
                  type="button"
                  onClick={() => bridge.requestTakeover()}
                  className="rounded bg-amber px-3 py-1.5 text-sm font-display text-void hover:bg-amber-glow"
                >
                  Disconnect Other Session
                </button>
              ) : (
                <button
                  type="button"
                  onClick={reconnect}
                  className="rounded bg-amber px-3 py-1.5 text-sm font-display text-void hover:bg-amber-glow"
                >
                  Reconnect
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate("/play", { replace: true })}
                className="rounded border border-border px-3 py-1.5 text-sm text-text hover:border-amber/60"
              >
                Back to Characters
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isReady ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-4 md:p-6">
          <header className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/80 bg-abyss/85 p-3 backdrop-blur-sm">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan">
                Live Session
              </p>
              <p className="text-sm text-text-bright">Authenticated Session</p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="rounded border border-border px-2 py-1 font-mono uppercase tracking-[0.15em] text-muted">
                {uiState.connectionStatus}
              </span>
              <span className="rounded border border-border px-2 py-1 font-mono uppercase tracking-[0.15em] text-muted">
                {uiState.worldId ?? "no-world"}
              </span>
              <span className="rounded border border-border px-2 py-1 font-mono uppercase tracking-[0.15em] text-muted">
                players {uiState.players.length}
              </span>
              <button
                type="button"
                onClick={() => navigate("/play", { replace: true })}
                className="rounded bg-amber px-3 py-1 font-display text-void hover:bg-amber-glow"
              >
                Disconnect
              </button>
            </div>
          </header>

          <div className="grid pointer-events-none gap-4 md:grid-cols-[1fr_320px]">
            <aside className="pointer-events-auto rounded-lg border border-border/80 bg-abyss/85 p-3 backdrop-blur-sm md:max-w-sm">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-cyan">
                Minimap
              </p>
              <div className="relative h-36 w-full overflow-hidden rounded border border-border bg-deep">
                {uiState.players.map((player) => {
                  const x = (player.x / uiState.mapSize.width) * 100;
                  const y = (player.y / uiState.mapSize.height) * 100;

                  return (
                    <span
                      key={player.id}
                      className={`absolute h-2 w-2 -translate-x-1 -translate-y-1 rounded-full ${
                        player.isLocal ? "bg-amber" : "bg-cyan"
                      }`}
                      style={{ left: `${x}%`, top: `${y}%` }}
                    />
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted">
                Cursor world: {Math.round(uiState.pointerWorld.x)},{" "}
                {Math.round(uiState.pointerWorld.y)}
              </p>
            </aside>

            <aside className="pointer-events-auto rounded-lg border border-border/80 bg-abyss/85 p-3 backdrop-blur-sm">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-cyan">
                Inventory
              </p>
              <div className="grid gap-2">
                {inventory.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    draggable
                    onDragStart={(event) =>
                      onInventoryDragStart(event, item.id)
                    }
                    onClick={() => handleDropToGround(item.id)}
                    className="flex items-center justify-between rounded border border-border bg-deep px-3 py-2 text-left hover:border-amber/60"
                  >
                    <span className="text-sm text-text-bright">
                      {item.label}
                    </span>
                    <span className="font-mono text-xs text-muted">
                      x{item.quantity}
                    </span>
                  </button>
                ))}
              </div>

              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={onGroundDrop}
                className="mt-3 rounded border border-dashed border-amber/60 bg-void/40 px-3 py-4 text-center text-xs text-amber"
              >
                Drag item here to drop on ground at cursor
              </div>

              <p className="mt-2 min-h-5 text-xs text-muted">
                {uiState.lastMessage ?? "No events yet."}
              </p>
            </aside>
          </div>
        </div>
      ) : null}
    </div>
  );
}
