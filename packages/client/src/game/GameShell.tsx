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

function slotRefKey(slot: InventorySlotRef): string {
  if (slot.kind === "bag") {
    return `bag:${slot.index}`;
  }
  return `equip:${slot.slot}`;
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
  const [activeDropSlotKey, setActiveDropSlotKey] = useState<string | null>(
    null,
  );
  const [isDraggingInventoryItem, setIsDraggingInventoryItem] =
    useState<boolean>(false);
  const [hoveredSlotKey, setHoveredSlotKey] = useState<string | null>(null);
  const dragInProgressRef = useRef<boolean>(false);
  const dropHighlightedSlotKey = isDraggingInventoryItem
    ? activeDropSlotKey
    : null;

  useEffect(() => {
    return bridge.subscribe((nextState) => {
      setUiState(nextState);
    });
  }, [bridge]);

  useEffect(() => {
    if (isDraggingInventoryItem) {
      return;
    }
    setActiveDropSlotKey(null);
  }, [isDraggingInventoryItem]);

  useEffect(() => {
    function clearDragUiState(): void {
      dragInProgressRef.current = false;
      setIsDraggingInventoryItem(false);
      setActiveDropSlotKey(null);
    }

    window.addEventListener("dragend", clearDragUiState);
    window.addEventListener("drop", clearDragUiState);
    return () => {
      window.removeEventListener("dragend", clearDragUiState);
      window.removeEventListener("drop", clearDragUiState);
    };
  }, []);

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
    setActiveDropSlotKey(null);
    setHoveredSlotKey(null);
    setIsDraggingInventoryItem(true);
    dragInProgressRef.current = true;
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
    setActiveDropSlotKey(null);
    setIsDraggingInventoryItem(false);
    dragInProgressRef.current = false;
    const from = getDraggedSlot(event);
    if (!from) {
      return;
    }

    bridge.requestInventoryMove({ from, to });
    setHoveredSlotKey(slotRefKey(to));
  }

  function onSlotDragOver(
    event: DragEvent<HTMLElement>,
    to: InventorySlotRef,
  ): void {
    if (!dragInProgressRef.current) {
      return;
    }
    event.preventDefault();
    setActiveDropSlotKey(slotRefKey(to));
  }

  function onSlotDragLeave(to: InventorySlotRef): void {
    const key = slotRefKey(to);
    setActiveDropSlotKey((current) => (current === key ? null : current));
  }

  function onSlotDragEnd(): void {
    setActiveDropSlotKey(null);
    setIsDraggingInventoryItem(false);
    dragInProgressRef.current = false;
  }

  function onGroundDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setActiveDropSlotKey(null);
    setIsDraggingInventoryItem(false);
    dragInProgressRef.current = false;
    const from = getDraggedSlot(event);
    if (!from) {
      return;
    }

    bridge.requestInventoryDrop({ from });
  }

  function onSlotMouseEnter(slot: InventorySlotRef): void {
    if (isDraggingInventoryItem) {
      return;
    }
    setHoveredSlotKey(slotRefKey(slot));
  }

  function onSlotMouseLeave(slot: InventorySlotRef): void {
    const key = slotRefKey(slot);
    setHoveredSlotKey((current) => (current === key ? null : current));
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-void text-text flex flex-col">
      {/* Top bar - minimal world info */}
      {isReady ? (
        <header className="flex items-center justify-between border-b border-border/40 bg-void/80 px-3 py-1.5 shrink-0 z-20">
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-muted">{uiState.worldId ?? "---"}</span>
            <span className="text-muted">{uiState.players.length} online</span>
          </div>
          <button
            type="button"
            onClick={() => navigate("/play", { replace: true })}
            className="border border-border px-2 py-0.5 text-[10px] text-muted hover:border-vec-magenta/40 hover:text-vec-magenta transition-colors duration-100"
          >
            Leave
          </button>
        </header>
      ) : null}

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Phaser canvas container - does NOT extend under sidebar */}
        <div
          ref={containerRef}
          className="flex-1 relative min-w-0"
          onDragOver={(event) => event.preventDefault()}
          onDrop={onGroundDrop}
        />

        {/* Right sidebar (RotMG-style) */}
        {isReady ? (
          <aside className="w-48 md:w-56 shrink-0 flex flex-col border-l border-border/40 bg-void/85 z-20">
            {/* Stats: Level + HP + XP */}
            <div className="border-b border-border/40 p-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-display text-xs text-vec-green text-glow-green">
                  Lv.{localLevel}
                </span>
                {uiState.lastCombatDeniedReason === "safe_zone" ? (
                  <span className="text-[8px] text-vec-cyan border border-vec-cyan/30 px-1 py-0.5 leading-none">
                    SAFE
                  </span>
                ) : null}
              </div>

              {/* HP bar */}
              <div
                className={`mb-1.5 ${isLowHealth ? "hud-health-shell-danger" : ""}`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[8px] text-vec-green/70 uppercase">
                    HP
                  </span>
                  <span
                    className={`text-[8px] ${isLowHealth ? "text-vec-magenta" : "text-muted"}`}
                  >
                    {Math.round(localHealthCurrent)}/
                    {Math.round(localHealthMax)}
                  </span>
                </div>
                <div className="hud-health-track h-2.5">
                  <div
                    className={`hud-health-fill h-full ${
                      isLowHealth ? "hud-health-fill-danger" : ""
                    }`}
                    style={{
                      width: `${Math.max(2, healthRatio * 100)}%`,
                    }}
                  />
                </div>
              </div>

              {/* XP bar */}
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[8px] text-vec-cyan/70 uppercase">
                    XP
                  </span>
                  <span className="text-[8px] text-muted">
                    {xpToNextLevel === null
                      ? "MAX"
                      : `${Math.round(localXp)}/${Math.round(xpToNextLevel)}`}
                  </span>
                </div>
                <div className="hud-xp-track h-1.5">
                  <div
                    className="hud-xp-fill h-full"
                    style={{
                      width: `${Math.max(2, xpRatio * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Minimap */}
            <div className="border-b border-border/40 p-2">
              <div className="relative aspect-square w-full overflow-hidden border border-border bg-void">
                {uiState.players.map((player) => {
                  const x = (player.x / uiState.mapSize.width) * 100;
                  const y = (player.y / uiState.mapSize.height) * 100;

                  return (
                    <span
                      key={player.id}
                      className={`absolute h-1.5 w-1.5 -translate-x-0.5 -translate-y-0.5 ${
                        player.isLocal ? "bg-vec-gold" : "bg-vec-green"
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
                      className="absolute h-1 w-1 -translate-x-0.5 -translate-y-0.5 bg-vec-magenta"
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
                      className="absolute h-0.5 w-0.5 bg-vec-cyan"
                      style={{ left: `${x}%`, top: `${y}%` }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Equipment slots */}
            <div className="border-b border-border/40 p-2">
              <div className="grid grid-cols-2 gap-1">
                {(["weapon", "armor"] as const).map((equipSlot) => {
                  const slotRef: InventorySlotRef = {
                    kind: "equip",
                    slot: equipSlot,
                  };
                  const key = slotRefKey(slotRef);
                  const instance = equipSlots[equipSlot];
                  const definition = instance
                    ? (definitions[instance.itemDefinitionId] ?? null)
                    : null;
                  const iconUrl = definition
                    ? resolveItemIconUrl(definition.iconKey)
                    : null;

                  return (
                    <button
                      key={equipSlot}
                      type="button"
                      aria-label={`${slotRefLabel(slotRef)} Slot${definition ? `: ${definition.name}` : ""}`}
                      draggable={!!instance}
                      onDragStart={(event) => {
                        if (!instance) {
                          return;
                        }
                        onSlotDragStart(event, slotRef);
                      }}
                      onDragEnd={onSlotDragEnd}
                      onDragOver={(event) => onSlotDragOver(event, slotRef)}
                      onDragLeave={() => onSlotDragLeave(slotRef)}
                      onDrop={(event) => onSlotDrop(event, slotRef)}
                      onMouseEnter={() => onSlotMouseEnter(slotRef)}
                      onMouseLeave={() => onSlotMouseLeave(slotRef)}
                      className={`flex flex-col items-center justify-center border p-1.5 aspect-square ${
                        dropHighlightedSlotKey === key
                          ? "border-vec-gold bg-vec-gold/10"
                          : hoveredSlotKey === key
                            ? "border-vec-green/60"
                            : "border-border bg-deep"
                      }`}
                    >
                      {instance && definition ? (
                        <>
                          {iconUrl ? (
                            <img
                              src={iconUrl}
                              alt={definition.name}
                              className="h-8 w-8 p-0.5"
                              style={{ imageRendering: "pixelated" }}
                            />
                          ) : (
                            <span className="text-[9px] text-muted">
                              {definition.type}
                            </span>
                          )}
                          <span className="mt-0.5 text-[8px] text-text-bright truncate w-full text-center">
                            {definition.name}
                          </span>
                        </>
                      ) : (
                        <span className="text-[8px] text-muted/40 uppercase">
                          {equipSlot}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bag slots */}
            <div className="flex-1 overflow-y-auto p-2">
              <div className="grid grid-cols-3 gap-1">
                {bagSlots.map((instance, index) => {
                  const slotRef: InventorySlotRef = {
                    kind: "bag",
                    index,
                  };
                  const key = slotRefKey(slotRef);
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
                      onDragEnd={onSlotDragEnd}
                      onDragOver={(event) => onSlotDragOver(event, slotRef)}
                      onDragLeave={() => onSlotDragLeave(slotRef)}
                      onDrop={(event) => onSlotDrop(event, slotRef)}
                      onMouseEnter={() => onSlotMouseEnter(slotRef)}
                      onMouseLeave={() => onSlotMouseLeave(slotRef)}
                      className={`flex flex-col items-center justify-center border aspect-square p-1 ${
                        dropHighlightedSlotKey === key
                          ? "border-vec-gold bg-vec-gold/10"
                          : hoveredSlotKey === key
                            ? "border-vec-green/60"
                            : "border-border bg-deep"
                      }`}
                    >
                      {instance && definition ? (
                        <>
                          {iconUrl ? (
                            <img
                              src={iconUrl}
                              alt={definition.name}
                              className="h-7 w-7 p-0.5"
                              style={{ imageRendering: "pixelated" }}
                            />
                          ) : (
                            <span className="text-[8px] text-muted">
                              {definition.type}
                            </span>
                          )}
                          <span className="mt-0.5 text-[7px] text-text-bright truncate w-full text-center leading-tight">
                            {definition.name}
                          </span>
                        </>
                      ) : (
                        <span className="text-[8px] text-muted/30">
                          {index + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={onGroundDrop}
                className="mt-2 border border-dashed border-vec-magenta/30 bg-void/40 py-2 text-center text-[9px] text-vec-magenta/50"
              >
                Drop to discard
              </div>

              {uiState.inventoryError ? (
                <p className="mt-1 text-[9px] text-vec-magenta">
                  {uiState.inventoryError}
                </p>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      {/* Connection / modal overlay */}
      {showConnectionModal ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-void/95 p-4">
          <div className="w-full max-w-xs border border-vec-green/30 bg-void p-5">
            <p className="font-display text-sm text-vec-green mb-2">
              {uiState.modal?.kind === "conflict"
                ? "Session Conflict"
                : uiState.modal?.kind === "kicked"
                  ? "Session Replaced"
                  : "Connecting..."}
            </p>
            <p className="text-xs text-muted mb-4">
              {uiState.modal?.message ?? "Joining world..."}
            </p>
            <div className="flex flex-wrap gap-2">
              {uiState.modal?.kind === "conflict" ? (
                <button
                  type="button"
                  onClick={() => bridge.requestTakeover()}
                  className="border border-vec-green bg-vec-green/10 px-3 py-1.5 text-xs font-display text-vec-green hover:bg-vec-green/20"
                >
                  Take Over
                </button>
              ) : (
                <button
                  type="button"
                  onClick={reconnect}
                  className="border border-vec-green bg-vec-green/10 px-3 py-1.5 text-xs font-display text-vec-green hover:bg-vec-green/20"
                >
                  Reconnect
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate("/play", { replace: true })}
                className="border border-border px-3 py-1.5 text-xs text-muted hover:border-border-bright"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Transition message */}
      {uiState.transitionMessage ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-void">
          <p className="font-display text-xs text-vec-green animate-flicker">
            {uiState.transitionMessage}
          </p>
        </div>
      ) : null}
    </div>
  );
}
