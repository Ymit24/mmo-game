import {
  type EquipSlot,
  INVENTORY_BAG_SLOT_COUNT,
  type InventorySlotRef,
} from "@mmo/shared";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { type GameBridgeState, createGameBridge } from "./bridge";
import { resolveItemIconUrl } from "./itemIconMap";
import { mountGameRuntime } from "./phaser/runtime";

interface GameShellProps {
  characterId: string;
}

const DRAG_SLOT_MIME = "application/x.mmo.inventory-slot";

const EMPTY_EQUIP_SLOTS: Record<EquipSlot, null> = {
  weapon: null,
  armor: null,
};

function slotRefLabel(slot: InventorySlotRef): string {
  if (slot.kind === "bag") {
    return `Slot ${slot.index + 1}`;
  }
  return slot.slot === "weapon" ? "Weapon" : "Armor";
}

function encodeSlotRef(slot: InventorySlotRef): string {
  return JSON.stringify(slot);
}

function decodeSlotRef(raw: string): InventorySlotRef | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as InventorySlotRef;
    if (parsed.kind === "bag") {
      if (
        Number.isSafeInteger(parsed.index) &&
        parsed.index >= 0 &&
        parsed.index < INVENTORY_BAG_SLOT_COUNT
      ) {
        return parsed;
      }
      return null;
    }
    if (
      parsed.kind === "equip" &&
      (parsed.slot === "weapon" || parsed.slot === "armor")
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function getDraggedSlot(
  event: DragEvent<HTMLElement>,
): InventorySlotRef | null {
  const custom = event.dataTransfer.getData(DRAG_SLOT_MIME);
  const fallback = event.dataTransfer.getData("text/plain");
  return decodeSlotRef(custom || fallback);
}

export function GameShell({ characterId }: GameShellProps) {
  const auth = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  const bridge = useMemo(() => createGameBridge(), []);

  const [uiState, setUiState] = useState<GameBridgeState>(() =>
    bridge.getState(),
  );

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

  const isReady = uiState.isInWorld;
  const isTransitioning =
    !uiState.isInWorld &&
    uiState.connectionStatus === "connected" &&
    !!uiState.transitionMessage;
  const showConnectionModal =
    !!uiState.modal ||
    (uiState.connectionStatus !== "connected" && !isTransitioning);
  const localHealthMax = Math.max(1, uiState.localHealthMax ?? 1);
  const localHealthCurrent = Math.max(
    0,
    Math.min(localHealthMax, uiState.localHealthCurrent ?? localHealthMax),
  );
  const healthRatio = localHealthCurrent / localHealthMax;
  const isLowHealth = healthRatio <= 0.3;
  const localLevel = Math.max(1, uiState.localLevel ?? 1);
  const xpToNextLevel = uiState.localXpToNextLevel;
  const localXp =
    xpToNextLevel === null
      ? 0
      : Math.max(0, Math.min(xpToNextLevel, uiState.localXp ?? 0));
  const xpRatio =
    xpToNextLevel === null || xpToNextLevel <= 0
      ? 1
      : Math.max(0, Math.min(1, localXp / xpToNextLevel));

  const bagSlots =
    uiState.inventory?.bagSlots ??
    Array.from({ length: INVENTORY_BAG_SLOT_COUNT }, () => null);
  const equipSlots = uiState.inventory?.equipSlots ?? EMPTY_EQUIP_SLOTS;
  const definitions = uiState.inventory?.definitions ?? {};

  function reconnect(): void {
    window.location.reload();
  }

  function onSlotDragStart(
    event: DragEvent<HTMLButtonElement>,
    from: InventorySlotRef,
  ): void {
    const encoded = encodeSlotRef(from);
    event.dataTransfer.setData(DRAG_SLOT_MIME, encoded);
    event.dataTransfer.setData("text/plain", encoded);
    event.dataTransfer.effectAllowed = "move";
  }

  function onSlotDrop(
    event: DragEvent<HTMLElement>,
    to: InventorySlotRef,
  ): void {
    event.preventDefault();
    const from = getDraggedSlot(event);
    if (!from) {
      return;
    }

    bridge.requestInventoryMove({ from, to });
  }

  function onGroundDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    const from = getDraggedSlot(event);
    if (!from) {
      return;
    }

    bridge.requestInventoryDrop({ from });
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-void text-text">
      <div ref={containerRef} className="absolute inset-0" />

      {showConnectionModal ? (
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

      {uiState.transitionMessage ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-void p-4">
          <div className="rounded-lg border border-cyan/40 bg-abyss/90 px-5 py-3 shadow-xl shadow-cyan/10">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-cyan">
              {uiState.transitionMessage}
            </p>
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
                {uiState.enemies.map((enemy) => {
                  const x = (enemy.x / uiState.mapSize.width) * 100;
                  const y = (enemy.y / uiState.mapSize.height) * 100;

                  return (
                    <span
                      key={enemy.id}
                      className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-rose-100/40 bg-rose-400/90"
                      style={{ left: `${x}%`, top: `${y}%` }}
                    />
                  );
                })}
                {uiState.projectiles.map((projectile) => {
                  const x = (projectile.x / uiState.mapSize.width) * 100;
                  const y = (projectile.y / uiState.mapSize.height) * 100;

                  return (
                    <span
                      key={projectile.id}
                      className="absolute h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-glow/90 shadow-[0_0_8px_rgba(103,232,249,0.7)]"
                      style={{ left: `${x}%`, top: `${y}%` }}
                    />
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted">
                Enemies tracked: {uiState.enemies.length} | Cursor world:{" "}
                {Math.round(uiState.pointerWorld.x)},{" "}
                {Math.round(uiState.pointerWorld.y)}
              </p>
            </aside>

            <aside className="pointer-events-auto rounded-lg border border-border/80 bg-abyss/85 p-3 backdrop-blur-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan">
                  Inventory
                </p>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  9 slots
                </span>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2">
                {(["weapon", "armor"] as const).map((equipSlot) => {
                  const slotRef: InventorySlotRef = {
                    kind: "equip",
                    slot: equipSlot,
                  };
                  const instance = equipSlots[equipSlot];
                  const definition = instance
                    ? (definitions[instance.itemDefinitionId] ?? null)
                    : null;
                  const iconUrl = definition
                    ? resolveItemIconUrl(definition.iconKey)
                    : null;

                  return (
                    <div key={equipSlot}>
                      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                        {equipSlot}
                      </p>
                      <button
                        type="button"
                        aria-label={`${slotRefLabel(slotRef)} Slot${definition ? `: ${definition.name}` : ""}`}
                        draggable={!!instance}
                        onDragStart={(event) => {
                          if (!instance) {
                            return;
                          }
                          onSlotDragStart(event, slotRef);
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => onSlotDrop(event, slotRef)}
                        className="flex h-20 w-full items-center gap-2 rounded border border-border bg-deep/80 px-2 text-left hover:border-amber/60"
                      >
                        {instance && definition ? (
                          <>
                            {iconUrl ? (
                              <img
                                src={iconUrl}
                                alt={definition.name}
                                className="h-10 w-10 rounded border border-border/70 bg-void/60 p-1"
                              />
                            ) : (
                              <span className="flex h-10 w-10 items-center justify-center rounded border border-border/70 bg-void/60 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                                icon
                              </span>
                            )}
                            <span className="min-w-0">
                              <span className="block truncate text-xs text-text-bright">
                                {definition.name}
                              </span>
                              <span className="block text-[10px] uppercase tracking-[0.12em] text-muted">
                                {definition.type}
                              </span>
                            </span>
                          </>
                        ) : (
                          <span className="w-full text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                            Empty {equipSlot}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {bagSlots.map((instance, index) => {
                  const slotRef: InventorySlotRef = {
                    kind: "bag",
                    index,
                  };
                  const definition = instance
                    ? (definitions[instance.itemDefinitionId] ?? null)
                    : null;
                  const iconUrl = definition
                    ? resolveItemIconUrl(definition.iconKey)
                    : null;

                  return (
                    <button
                      key={`bag-slot-${index + 1}`}
                      type="button"
                      aria-label={`Bag Slot ${index + 1}${definition ? `: ${definition.name}` : ""}`}
                      draggable={!!instance}
                      onDragStart={(event) => {
                        if (!instance) {
                          return;
                        }
                        onSlotDragStart(event, slotRef);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => onSlotDrop(event, slotRef)}
                      className="flex h-24 flex-col items-center justify-center rounded border border-border bg-deep px-2 text-center hover:border-amber/60"
                    >
                      {instance && definition ? (
                        <>
                          {iconUrl ? (
                            <img
                              src={iconUrl}
                              alt={definition.name}
                              className="h-9 w-9 rounded border border-border/70 bg-void/60 p-1"
                            />
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center rounded border border-border/70 bg-void/60 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                              icon
                            </span>
                          )}
                          <span className="mt-1 line-clamp-2 text-[10px] leading-tight text-text-bright">
                            {definition.name}
                          </span>
                        </>
                      ) : (
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                          {index + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={onGroundDrop}
                className="mt-3 rounded border border-dashed border-amber/60 bg-void/40 px-3 py-4 text-center text-xs text-amber"
              >
                Drag an item here to drop it on the ground
              </div>

              {uiState.inventoryError ? (
                <p className="mt-2 rounded border border-danger/40 bg-danger/10 px-2 py-1 text-xs text-danger">
                  {uiState.inventoryError}
                </p>
              ) : null}

              <p className="mt-2 min-h-5 text-xs text-muted">
                {uiState.lastMessage ??
                  `Move items between ${slotRefLabel({ kind: "bag", index: 0 })}..${slotRefLabel({ kind: "bag", index: 8 })}`}
              </p>
            </aside>
          </div>

          <footer className="pointer-events-auto flex items-end justify-between gap-4">
            <section
              className={`hud-health-shell w-full max-w-[460px] rounded-xl border border-border/80 px-4 py-3 ${
                isLowHealth ? "hud-health-shell-danger" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cyan">
                    Aegis Core
                  </p>
                  <p className="text-xs text-muted">
                    {Math.round(localHealthCurrent)} /{" "}
                    {Math.round(localHealthMax)} vitality
                  </p>
                </div>
                <div className="rounded border border-border/70 bg-void/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-amber">
                  {Math.round(healthRatio * 100)}%
                </div>
                <div className="rounded border border-cyan/40 bg-cyan/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-cyan">
                  Lv. {localLevel}
                </div>
              </div>

              <div className="mt-3">
                <div className="hud-health-track relative h-4 overflow-hidden rounded-sm border border-border/70 bg-void/80">
                  <div
                    className={`hud-health-fill h-full rounded-sm ${
                      isLowHealth ? "hud-health-fill-danger" : ""
                    }`}
                    style={{
                      width: `${Math.max(4, healthRatio * 100)}%`,
                    }}
                  />
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-glow">
                    Experience
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    {xpToNextLevel === null
                      ? "MAX LEVEL"
                      : `${Math.round(localXp)} / ${Math.round(xpToNextLevel)}`}
                  </p>
                </div>
                <div className="hud-xp-track relative mt-2 h-3 overflow-hidden rounded-sm border border-cyan/35 bg-void/80">
                  <div
                    className="hud-xp-fill h-full rounded-sm"
                    style={{
                      width: `${Math.max(4, xpRatio * 100)}%`,
                    }}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-[0.12em] text-muted">
                <span className="rounded border border-border/70 bg-void/50 px-2 py-1">
                  attack: click / space
                </span>
                {uiState.lastCombatDeniedReason === "safe_zone" ? (
                  <span className="rounded border border-cyan/50 bg-cyan/10 px-2 py-1 text-cyan">
                    safe zone active
                  </span>
                ) : null}
              </div>
            </section>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
