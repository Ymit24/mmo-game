import { useCallback, useEffect, useRef, useState } from "react";
import {
  type EnemyArchetype,
  type MapData,
  type MapSummary,
  createMap,
  deleteMap,
  getMap,
  listEnemies,
  listMaps,
  updateMap,
} from "../api/adminApi";
import { useAsyncData } from "../hooks/useAsyncData";

/* ─── Types ─────────────────────────────────────────────────────── */

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

type ToolMode =
  | "select"
  | "collision"
  | "spawn"
  | "portal"
  | "spawner"
  | "region";

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type InteractionState =
  | { kind: "idle" }
  | { kind: "panning"; lastScreenX: number; lastScreenY: number }
  | {
      kind: "drawing";
      startWorldX: number;
      startWorldY: number;
      currentWorldX: number;
      currentWorldY: number;
    }
  | {
      kind: "dragging";
      entityType: string;
      entityIndex: number;
      offsetX: number;
      offsetY: number;
    }
  | {
      kind: "resizing";
      entityType: string;
      entityIndex: number;
      handle: ResizeHandle;
      startX: number;
      startY: number;
      startW: number;
      startH: number;
      originWorldX: number;
      originWorldY: number;
    };

const TOOL_CONFIG: Record<
  ToolMode,
  { label: string; shortcut: string; color: string }
> = {
  select: { label: "Select", shortcut: "V", color: "#a0a8b8" },
  collision: { label: "Collision", shortcut: "C", color: "#ff2244" },
  spawn: { label: "Spawn Pt", shortcut: "S", color: "#00ff41" },
  portal: { label: "Portal", shortcut: "P", color: "#00e5ff" },
  spawner: { label: "Spawner", shortcut: "E", color: "#ff9500" },
  region: { label: "Region", shortcut: "R", color: "#ffd700" },
};

const GRID_SIZE = 32;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 6;
const TRACKPAD_ZOOM_SENSITIVITY = 0.008;
const WHEEL_ZOOM_SENSITIVITY = 0.002;

const NEW_MAP_TEMPLATE: MapData = {
  id: "",
  name: "New Map",
  width: 2000,
  height: 2000,
  background: "#0a0a12",
  spawnPoints: [],
  collisions: [],
  regions: [],
  portals: [],
  enemySpawners: [],
};

/* ─── Map data normalization ────────────────────────────────────
 *
 * The raw map JSON files use nested `shape` objects for portals/regions,
 * `targetWorldId` for portals (not `targetMapId`), and spawner fields
 * like `spawnRadius`/`maxAlive`/`respawnSeconds`. The editor expects
 * flat x/y/width/height, `targetMapId`, and `radius`/`maxCount`/`respawnMs`.
 *
 * normalizeMapData()  → called after loading from API
 * denormalizeMapData() → called before saving back to API
 * ─────────────────────────────────────────────────────────────── */

function normalizeMapData(raw: MapData): MapData {
  return {
    ...raw,
    portals: (raw.portals ?? []).map((p: Record<string, unknown>) => {
      const shape = p.shape as
        | { x: number; y: number; width: number; height: number }
        | undefined;
      return {
        id: p.id,
        name: p.name,
        x: shape?.x ?? (p.x as number) ?? 0,
        y: shape?.y ?? (p.y as number) ?? 0,
        width: shape?.width ?? (p.width as number) ?? 64,
        height: shape?.height ?? (p.height as number) ?? 64,
        targetMapId:
          (p.targetMapId as string) ?? (p.targetWorldId as string) ?? "",
        targetSpawnId: (p.targetSpawnId as string) ?? "",
        // Preserve extra fields for round-tripping
        ...(p.exitOffset ? { exitOffset: p.exitOffset } : {}),
      };
    }),
    regions: (raw.regions ?? []).map((r: Record<string, unknown>) => {
      const shape = r.shape as
        | { x: number; y: number; width: number; height: number }
        | undefined;
      return {
        id: r.id,
        name: r.name,
        x: shape?.x ?? (r.x as number) ?? 0,
        y: shape?.y ?? (r.y as number) ?? 0,
        width: shape?.width ?? (r.width as number) ?? 64,
        height: shape?.height ?? (r.height as number) ?? 64,
        type: (r.type as string) ?? "safe",
      };
    }),
    collisions: (raw.collisions ?? []).map((c: Record<string, unknown>) => ({
      x: (c.x as number) ?? 0,
      y: (c.y as number) ?? 0,
      width: (c.width as number) ?? 32,
      height: (c.height as number) ?? 32,
    })),
    enemySpawners: (raw.enemySpawners ?? []).map(
      (s: Record<string, unknown>) => ({
        id: s.id,
        archetypeId: s.archetypeId,
        x: (s.x as number) ?? 0,
        y: (s.y as number) ?? 0,
        radius: (s.radius as number) ?? (s.spawnRadius as number) ?? 100,
        maxCount: (s.maxCount as number) ?? (s.maxAlive as number) ?? 3,
        respawnMs:
          (s.respawnMs as number) ??
          ((s.respawnSeconds as number) ?? 10) * 1000,
      }),
    ),
  };
}

function denormalizeMapData(editor: MapData): MapData {
  return {
    ...editor,
    portals: (editor.portals ?? []).map((p: Record<string, unknown>) => ({
      id: p.id,
      name: p.name,
      shape: {
        type: "rect",
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
      },
      targetWorldId: p.targetMapId,
      targetSpawnId: p.targetSpawnId,
      ...(p.exitOffset ? { exitOffset: p.exitOffset } : {}),
    })),
    regions: (editor.regions ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      shape: {
        type: "rect",
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      },
    })),
    collisions: (editor.collisions ?? []).map((c: Record<string, unknown>) => ({
      type: "rect",
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
    })),
    enemySpawners: (editor.enemySpawners ?? []).map(
      (s: Record<string, unknown>) => ({
        id: s.id,
        archetypeId: s.archetypeId,
        x: s.x,
        y: s.y,
        spawnRadius: s.radius,
        maxAlive: s.maxCount,
        respawnSeconds: Math.round(((s.respawnMs as number) ?? 10000) / 1000),
      }),
    ),
  };
}

/* ─── Helpers ───────────────────────────────────────────────────── */

function snapToGrid(val: number): number {
  return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

function screenToWorld(
  screenX: number,
  screenY: number,
  canvasRect: DOMRect,
  camera: Camera,
): { x: number; y: number } {
  return {
    x: (screenX - canvasRect.left) / camera.zoom + camera.x,
    y: (screenY - canvasRect.top) / camera.zoom + camera.y,
  };
}

function getCursorStyle(
  tool: ToolMode,
  interaction: InteractionState,
  spaceHeld: boolean,
): string {
  if (interaction.kind === "panning") return "grabbing";
  if (interaction.kind === "dragging") return "grabbing";
  if (interaction.kind === "resizing") {
    return HANDLE_CURSORS[interaction.handle] ?? "nwse-resize";
  }
  if (spaceHeld) return "grab";
  if (tool === "select") return "default";
  return "crosshair";
}

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

const HANDLE_SIZE = 8;

function findResizeHandle(
  mapData: MapData,
  entity: { type: string; index: number },
  wx: number,
  wy: number,
  zoom: number,
): ResizeHandle | null {
  // Only rect entities support resize
  if (
    entity.type !== "collision" &&
    entity.type !== "region" &&
    entity.type !== "portal"
  )
    return null;

  const field = entityFieldName(entity.type);
  const arr = mapData[field] as Array<Record<string, unknown>>;
  const ent = arr[entity.index];
  if (
    !ent ||
    typeof ent.x !== "number" ||
    typeof ent.y !== "number" ||
    typeof ent.width !== "number" ||
    typeof ent.height !== "number"
  )
    return null;

  const ex = ent.x as number;
  const ey = ent.y as number;
  const ew = ent.width as number;
  const eh = ent.height as number;
  const tolerance = Math.max(HANDLE_SIZE / zoom, 6);

  // Check each handle corner/edge midpoint
  const handles: Array<{ handle: ResizeHandle; hx: number; hy: number }> = [
    { handle: "nw", hx: ex, hy: ey },
    { handle: "n", hx: ex + ew / 2, hy: ey },
    { handle: "ne", hx: ex + ew, hy: ey },
    { handle: "e", hx: ex + ew, hy: ey + eh / 2 },
    { handle: "se", hx: ex + ew, hy: ey + eh },
    { handle: "s", hx: ex + ew / 2, hy: ey + eh },
    { handle: "sw", hx: ex, hy: ey + eh },
    { handle: "w", hx: ex, hy: ey + eh / 2 },
  ];

  for (const { handle, hx, hy } of handles) {
    if (Math.abs(wx - hx) <= tolerance && Math.abs(wy - hy) <= tolerance) {
      return handle;
    }
  }
  return null;
}

function findEntityAt(
  mapData: MapData,
  wx: number,
  wy: number,
  zoom: number,
): { type: string; index: number } | null {
  const hitPadding = 8 / zoom;

  // Check spawn points first (small targets - most specific)
  for (let i = mapData.spawnPoints.length - 1; i >= 0; i--) {
    const sp = mapData.spawnPoints[i] as { x: number; y: number } | undefined;
    if (!sp) continue;
    const dist = Math.hypot(wx - sp.x, wy - sp.y);
    if (dist < 16 / zoom + hitPadding) return { type: "spawn", index: i };
  }

  // Spawners (center dot hit test)
  for (let i = mapData.enemySpawners.length - 1; i >= 0; i--) {
    const es = mapData.enemySpawners[i] as
      | { x: number; y: number; radius?: number }
      | undefined;
    if (!es) continue;
    const dist = Math.hypot(wx - es.x, wy - es.y);
    if (dist < (es.radius ?? 50) + hitPadding)
      return { type: "spawner", index: i };
  }

  // Portals
  for (let i = mapData.portals.length - 1; i >= 0; i--) {
    const p = mapData.portals[i] as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    if (!p) continue;
    if (
      wx >= p.x - hitPadding &&
      wx <= p.x + p.width + hitPadding &&
      wy >= p.y - hitPadding &&
      wy <= p.y + p.height + hitPadding
    ) {
      return { type: "portal", index: i };
    }
  }

  // Regions
  for (let i = mapData.regions.length - 1; i >= 0; i--) {
    const r = mapData.regions[i] as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    if (!r) continue;
    if (
      wx >= r.x - hitPadding &&
      wx <= r.x + r.width + hitPadding &&
      wy >= r.y - hitPadding &&
      wy <= r.y + r.height + hitPadding
    ) {
      return { type: "region", index: i };
    }
  }

  // Collisions
  for (let i = mapData.collisions.length - 1; i >= 0; i--) {
    const c = mapData.collisions[i] as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    if (!c) continue;
    if (
      wx >= c.x - hitPadding &&
      wx <= c.x + c.width + hitPadding &&
      wy >= c.y - hitPadding &&
      wy <= c.y + c.height + hitPadding
    ) {
      return { type: "collision", index: i };
    }
  }

  return null;
}

function getEntityPosition(
  mapData: MapData,
  type: string,
  index: number,
): { x: number; y: number } | null {
  let arr: Array<Record<string, unknown>> = [];
  if (type === "collision")
    arr = mapData.collisions as Array<Record<string, unknown>>;
  else if (type === "region")
    arr = mapData.regions as Array<Record<string, unknown>>;
  else if (type === "portal")
    arr = mapData.portals as Array<Record<string, unknown>>;
  else if (type === "spawn")
    arr = mapData.spawnPoints as Array<Record<string, unknown>>;
  else if (type === "spawner")
    arr = mapData.enemySpawners as Array<Record<string, unknown>>;
  const ent = arr[index];
  if (!ent || typeof ent.x !== "number" || typeof ent.y !== "number")
    return null;
  return { x: ent.x, y: ent.y };
}

function entityFieldName(type: string): string {
  if (type === "collision") return "collisions";
  if (type === "region") return "regions";
  if (type === "portal") return "portals";
  if (type === "spawn") return "spawnPoints";
  return "enemySpawners";
}

/* ─── Canvas renderer ───────────────────────────────────────────── */

function renderCanvas(
  canvas: HTMLCanvasElement,
  container: HTMLDivElement,
  mapData: MapData,
  camera: Camera,
  selectedEntity: { type: string; index: number } | null,
  interaction: InteractionState,
  tool: ToolMode,
) {
  const dpr = window.devicePixelRatio || 1;
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const { x: cx, y: cy, zoom } = camera;

  // Off-canvas background
  ctx.fillStyle = "#020204";
  ctx.fillRect(0, 0, rect.width, rect.height);

  ctx.save();
  ctx.translate(-cx * zoom, -cy * zoom);
  ctx.scale(zoom, zoom);

  // Map background fill
  ctx.fillStyle = mapData.background || "#0a0a12";
  ctx.fillRect(0, 0, mapData.width, mapData.height);

  // Grid (only render when reasonably zoomed in)
  if (zoom > 0.15) {
    const gridAlpha = Math.min(0.4, (zoom - 0.15) * 1.5);
    ctx.strokeStyle = `rgba(42, 42, 58, ${gridAlpha})`;
    ctx.lineWidth = 0.5 / zoom;
    const startX = Math.max(0, Math.floor(cx / GRID_SIZE) * GRID_SIZE);
    const startY = Math.max(0, Math.floor(cy / GRID_SIZE) * GRID_SIZE);
    const endX = Math.min(mapData.width, cx + rect.width / zoom);
    const endY = Math.min(mapData.height, cy + rect.height / zoom);

    ctx.beginPath();
    for (let gx = startX; gx <= endX; gx += GRID_SIZE) {
      ctx.moveTo(gx, startY);
      ctx.lineTo(gx, endY);
    }
    for (let gy = startY; gy <= endY; gy += GRID_SIZE) {
      ctx.moveTo(startX, gy);
      ctx.lineTo(endX, gy);
    }
    ctx.stroke();
  }

  // Map bounds
  ctx.strokeStyle = "rgba(0, 255, 65, 0.25)";
  ctx.lineWidth = 2 / zoom;
  ctx.setLineDash([8 / zoom, 4 / zoom]);
  ctx.strokeRect(0, 0, mapData.width, mapData.height);
  ctx.setLineDash([]);

  // Collisions
  ctx.fillStyle = "rgba(255, 34, 68, 0.2)";
  ctx.strokeStyle = "rgba(255, 34, 68, 0.6)";
  ctx.lineWidth = 1 / zoom;
  for (const coll of mapData.collisions) {
    const c = coll as { x: number; y: number; width: number; height: number };
    ctx.fillRect(c.x, c.y, c.width, c.height);
    ctx.strokeRect(c.x, c.y, c.width, c.height);
  }

  // Regions
  ctx.lineWidth = 1 / zoom;
  for (const reg of mapData.regions) {
    const r = reg as {
      x: number;
      y: number;
      width: number;
      height: number;
      id?: string;
    };
    ctx.fillStyle = "rgba(255, 215, 0, 0.08)";
    ctx.strokeStyle = "rgba(255, 215, 0, 0.5)";
    ctx.fillRect(r.x, r.y, r.width, r.height);
    ctx.strokeRect(r.x, r.y, r.width, r.height);
    if (r.id) {
      ctx.fillStyle = "rgba(255, 215, 0, 0.7)";
      ctx.font = `${11 / zoom}px "IBM Plex Mono"`;
      ctx.fillText(r.id, r.x + 4, r.y + 14 / zoom);
    }
  }

  // Portals
  for (const portal of mapData.portals) {
    const p = portal as {
      x: number;
      y: number;
      width: number;
      height: number;
      id?: string;
    };
    ctx.fillStyle = "rgba(0, 229, 255, 0.15)";
    ctx.strokeStyle = "rgba(0, 229, 255, 0.7)";
    ctx.lineWidth = 1.5 / zoom;
    ctx.fillRect(p.x, p.y, p.width, p.height);
    ctx.strokeRect(p.x, p.y, p.width, p.height);
    if (p.id) {
      ctx.fillStyle = "rgba(0, 229, 255, 0.9)";
      ctx.font = `${10 / zoom}px "IBM Plex Mono"`;
      ctx.fillText(p.id, p.x + 3, p.y + 12 / zoom);
    }
  }

  // Spawn points
  for (const sp of mapData.spawnPoints) {
    const s = sp as { x: number; y: number; id?: string };
    const size = 12 / zoom;
    ctx.fillStyle = "rgba(0, 255, 65, 0.8)";
    ctx.beginPath();
    ctx.arc(s.x, s.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#00ff41";
    ctx.lineWidth = 1.5 / zoom;
    ctx.stroke();
    if (s.id) {
      ctx.fillStyle = "#00ff41";
      ctx.font = `${9 / zoom}px "IBM Plex Mono"`;
      ctx.fillText(s.id, s.x + size, s.y + 3 / zoom);
    }
  }

  // Enemy spawners
  for (const spawner of mapData.enemySpawners) {
    const es = spawner as {
      x: number;
      y: number;
      radius?: number;
      archetypeId?: string;
    };
    const r = es.radius ?? 50;
    ctx.fillStyle = "rgba(255, 149, 0, 0.08)";
    ctx.strokeStyle = "rgba(255, 149, 0, 0.5)";
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    ctx.arc(es.x, es.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 149, 0, 0.9)";
    ctx.beginPath();
    ctx.arc(es.x, es.y, 4 / zoom, 0, Math.PI * 2);
    ctx.fill();
    if (es.archetypeId) {
      ctx.fillStyle = "rgba(255, 149, 0, 0.8)";
      ctx.font = `${9 / zoom}px "IBM Plex Mono"`;
      ctx.fillText(es.archetypeId, es.x + 8 / zoom, es.y - 8 / zoom);
    }
  }

  // Drawing preview
  if (interaction.kind === "drawing") {
    const { startWorldX, startWorldY, currentWorldX, currentWorldY } =
      interaction;
    ctx.setLineDash([4 / zoom, 4 / zoom]);
    ctx.strokeStyle = TOOL_CONFIG[tool]?.color ?? "#ffffff";
    ctx.fillStyle = `${TOOL_CONFIG[tool]?.color ?? "#ffffff"}22`;
    ctx.lineWidth = 1.5 / zoom;
    const dx = Math.min(startWorldX, currentWorldX);
    const dy = Math.min(startWorldY, currentWorldY);
    const dw = Math.abs(currentWorldX - startWorldX);
    const dh = Math.abs(currentWorldY - startWorldY);
    ctx.fillRect(dx, dy, dw, dh);
    ctx.strokeRect(dx, dy, dw, dh);
    ctx.setLineDash([]);
  }

  // Selected entity highlight
  if (selectedEntity && mapData) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2 / zoom;
    ctx.setLineDash([6 / zoom, 3 / zoom]);

    let arr: Array<Record<string, unknown>> = [];
    if (selectedEntity.type === "collision")
      arr = mapData.collisions as Array<Record<string, unknown>>;
    else if (selectedEntity.type === "region")
      arr = mapData.regions as Array<Record<string, unknown>>;
    else if (selectedEntity.type === "portal")
      arr = mapData.portals as Array<Record<string, unknown>>;
    else if (selectedEntity.type === "spawn")
      arr = mapData.spawnPoints as Array<Record<string, unknown>>;
    else if (selectedEntity.type === "spawner")
      arr = mapData.enemySpawners as Array<Record<string, unknown>>;

    const ent = arr[selectedEntity.index];
    if (ent) {
      const isRect = "width" in ent && "height" in ent;
      if (isRect) {
        const ex = ent.x as number;
        const ey = ent.y as number;
        const ew = ent.width as number;
        const eh = ent.height as number;
        ctx.strokeRect(ex, ey, ew, eh);
        ctx.setLineDash([]);

        // Draw resize handles
        const hs = HANDLE_SIZE / zoom;
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1 / zoom;
        const handlePositions = [
          { hx: ex, hy: ey },
          { hx: ex + ew / 2, hy: ey },
          { hx: ex + ew, hy: ey },
          { hx: ex + ew, hy: ey + eh / 2 },
          { hx: ex + ew, hy: ey + eh },
          { hx: ex + ew / 2, hy: ey + eh },
          { hx: ex, hy: ey + eh },
          { hx: ex, hy: ey + eh / 2 },
        ];
        for (const { hx, hy } of handlePositions) {
          ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
          ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
        }
      } else if ("radius" in ent) {
        ctx.beginPath();
        ctx.arc(
          ent.x as number,
          ent.y as number,
          ent.radius as number,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        const size = 16 / zoom;
        ctx.strokeRect(
          (ent.x as number) - size / 2,
          (ent.y as number) - size / 2,
          size,
          size,
        );
        ctx.setLineDash([]);
      }
    } else {
      ctx.setLineDash([]);
    }
  }

  ctx.restore();
}

/* ─── Main component ────────────────────────────────────────────── */

export function MapsPage() {
  const { data: mapList, loading, error, refetch } = useAsyncData(listMaps);
  const { data: enemiesList } = useAsyncData(listEnemies);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loadingMap, setLoadingMap] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tool, setTool] = useState<ToolMode>("select");
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 0.5 });
  const [selectedEntity, setSelectedEntity] = useState<{
    type: string;
    index: number;
  } | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newMapId, setNewMapId] = useState("");
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [showDimensions, setShowDimensions] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<InteractionState>({ kind: "idle" });
  const cameraRef = useRef(camera);
  const mapDataRef = useRef(mapData);
  const toolRef = useRef(tool);
  const spaceHeldRef = useRef(false);
  const selectedEntityRef = useRef(selectedEntity);
  const rafRef = useRef<number>(0);

  // Keep refs in sync
  cameraRef.current = camera;
  mapDataRef.current = mapData;
  toolRef.current = tool;
  spaceHeldRef.current = spaceHeld;
  selectedEntityRef.current = selectedEntity;

  // Load map data
  useEffect(() => {
    if (!selectedMapId) {
      setMapData(null);
      return;
    }
    setLoadingMap(true);
    setSaveError(null);
    getMap(selectedMapId)
      .then((raw) => {
        const data = normalizeMapData(raw);
        setMapData(data);
        setDirty(false);
        // Center the map in view
        const container = containerRef.current;
        if (container) {
          const rect = container.getBoundingClientRect();
          const fitZoom = Math.min(
            (rect.width * 0.8) / data.width,
            (rect.height * 0.8) / data.height,
            1,
          );
          setCamera({
            x: data.width / 2 - rect.width / (2 * fitZoom),
            y: data.height / 2 - rect.height / (2 * fitZoom),
            zoom: fitZoom,
          });
        } else {
          setCamera({ x: 0, y: 0, zoom: 0.5 });
        }
        setSelectedEntity(null);
      })
      .catch((err) => {
        setSaveError(err instanceof Error ? err.message : "Failed to load map");
      })
      .finally(() => setLoadingMap(false));
  }, [selectedMapId]);

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !mapData) return;

    const render = () => {
      const currentMap = mapDataRef.current;
      if (!currentMap) return;
      renderCanvas(
        canvas,
        container,
        currentMap,
        cameraRef.current,
        selectedEntityRef.current,
        interactionRef.current,
        toolRef.current,
      );
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mapData]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      // Camera ref is always current, RAF loop handles redraw
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  /* ── Zoom-to-cursor ─────────────────────────────────────────── */
  const zoomToPoint = useCallback(
    (screenX: number, screenY: number, zoomDelta: number) => {
      setCamera((prev) => {
        const canvas = canvasRef.current;
        if (!canvas) return prev;
        const rect = canvas.getBoundingClientRect();

        // World position under cursor before zoom
        const worldX = (screenX - rect.left) / prev.zoom + prev.x;
        const worldY = (screenY - rect.top) / prev.zoom + prev.y;

        const newZoom = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, prev.zoom * (1 + zoomDelta)),
        );

        // Adjust camera so the same world point stays under cursor
        const newX = worldX - (screenX - rect.left) / newZoom;
        const newY = worldY - (screenY - rect.top) / newZoom;

        return { x: newX, y: newY, zoom: newZoom };
      });
    },
    [],
  );

  /* ── Wheel handler (zoom + pan) ─────────────────────────────── */
  useEffect(() => {
    // Container only renders when mapData is loaded
    if (!mapData) return;
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Pinch-to-zoom (trackpad sends ctrlKey) or ctrl/meta+wheel
      if (e.ctrlKey || e.metaKey) {
        const sensitivity =
          Math.abs(e.deltaY) < 10
            ? TRACKPAD_ZOOM_SENSITIVITY
            : WHEEL_ZOOM_SENSITIVITY;
        const zoomDelta = -e.deltaY * sensitivity;
        zoomToPoint(e.clientX, e.clientY, zoomDelta);
        return;
      }

      // Two-finger trackpad scroll has a horizontal component → pan
      if (Math.abs(e.deltaX) > 2) {
        setCamera((prev) => ({
          ...prev,
          x: prev.x + e.deltaX / prev.zoom,
          y: prev.y + e.deltaY / prev.zoom,
        }));
        return;
      }

      // Mouse wheel (pure vertical, no modifier) → zoom
      const zoomDelta = -e.deltaY * WHEEL_ZOOM_SENSITIVITY;
      zoomToPoint(e.clientX, e.clientY, zoomDelta);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [zoomToPoint, mapData]);

  /* ── Pointer handlers ───────────────────────────────────────── */
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    const map = mapDataRef.current;
    if (!canvas || !map) return;

    const rect = canvas.getBoundingClientRect();
    const cam = cameraRef.current;

    // Middle-click or space+click = pan
    if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
      interactionRef.current = {
        kind: "panning",
        lastScreenX: e.clientX,
        lastScreenY: e.clientY,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return;

    const world = screenToWorld(e.clientX, e.clientY, rect, cam);
    const currentTool = toolRef.current;

    if (currentTool === "select") {
      // Check if clicking on a resize handle of the currently selected entity
      const sel = selectedEntityRef.current;
      if (sel) {
        const handle = findResizeHandle(map, sel, world.x, world.y, cam.zoom);
        if (handle) {
          const field = entityFieldName(sel.type);
          const arr = map[field] as Array<Record<string, unknown>>;
          const ent = arr[sel.index];
          if (ent) {
            interactionRef.current = {
              kind: "resizing",
              entityType: sel.type,
              entityIndex: sel.index,
              handle,
              startX: ent.x as number,
              startY: ent.y as number,
              startW: ent.width as number,
              startH: ent.height as number,
              originWorldX: world.x,
              originWorldY: world.y,
            };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            return;
          }
        }
      }

      const found = findEntityAt(map, world.x, world.y, cam.zoom);
      setSelectedEntity(found);

      // If we found an entity, start dragging
      if (found) {
        const pos = getEntityPosition(map, found.type, found.index);
        if (pos) {
          interactionRef.current = {
            kind: "dragging",
            entityType: found.type,
            entityIndex: found.index,
            offsetX: world.x - pos.x,
            offsetY: world.y - pos.y,
          };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }
      }
      return;
    }

    if (currentTool === "spawn") {
      const newSpawn = {
        id: `spawn-${map.spawnPoints.length}`,
        x: snapToGrid(world.x),
        y: snapToGrid(world.y),
      };
      setMapData((prev) =>
        prev ? { ...prev, spawnPoints: [...prev.spawnPoints, newSpawn] } : prev,
      );
      setDirty(true);
      return;
    }

    if (currentTool === "spawner") {
      const newSpawner = {
        id: `spawner-${map.enemySpawners.length}`,
        x: snapToGrid(world.x),
        y: snapToGrid(world.y),
        radius: 100,
        archetypeId: "slime_scout",
        maxCount: 3,
        respawnMs: 10000,
      };
      setMapData((prev) =>
        prev
          ? { ...prev, enemySpawners: [...prev.enemySpawners, newSpawner] }
          : prev,
      );
      setDirty(true);
      return;
    }

    // Rectangle drawing tools
    if (
      currentTool === "collision" ||
      currentTool === "region" ||
      currentTool === "portal"
    ) {
      const snappedX = snapToGrid(world.x);
      const snappedY = snapToGrid(world.y);
      interactionRef.current = {
        kind: "drawing",
        startWorldX: snappedX,
        startWorldY: snappedY,
        currentWorldX: snappedX,
        currentWorldY: snappedY,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const interaction = interactionRef.current;

    if (interaction.kind === "panning") {
      const dx = e.clientX - interaction.lastScreenX;
      const dy = e.clientY - interaction.lastScreenY;
      interaction.lastScreenX = e.clientX;
      interaction.lastScreenY = e.clientY;
      setCamera((prev) => ({
        ...prev,
        x: prev.x - dx / prev.zoom,
        y: prev.y - dy / prev.zoom,
      }));
      return;
    }

    if (interaction.kind === "drawing") {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const world = screenToWorld(
        e.clientX,
        e.clientY,
        rect,
        cameraRef.current,
      );
      interaction.currentWorldX = snapToGrid(world.x);
      interaction.currentWorldY = snapToGrid(world.y);
      return;
    }

    if (interaction.kind === "dragging") {
      const canvas = canvasRef.current;
      const map = mapDataRef.current;
      if (!canvas || !map) return;
      const rect = canvas.getBoundingClientRect();
      const world = screenToWorld(
        e.clientX,
        e.clientY,
        rect,
        cameraRef.current,
      );
      const newX = snapToGrid(world.x - interaction.offsetX);
      const newY = snapToGrid(world.y - interaction.offsetY);

      const field = entityFieldName(interaction.entityType);
      const arr = [...(map[field] as Array<Record<string, unknown>>)];
      const ent = arr[interaction.entityIndex];
      if (ent) {
        arr[interaction.entityIndex] = { ...ent, x: newX, y: newY };
        const updated = { ...map, [field]: arr };
        setMapData(updated);
        setDirty(true);
      }
    }

    if (interaction.kind === "resizing") {
      const canvas = canvasRef.current;
      const map = mapDataRef.current;
      if (!canvas || !map) return;
      const rect = canvas.getBoundingClientRect();
      const world = screenToWorld(
        e.clientX,
        e.clientY,
        rect,
        cameraRef.current,
      );

      const dx = snapToGrid(world.x - interaction.originWorldX);
      const dy = snapToGrid(world.y - interaction.originWorldY);
      const { startX, startY, startW, startH, handle } = interaction;

      let newX = startX;
      let newY = startY;
      let newW = startW;
      let newH = startH;

      // Adjust based on which handle is being dragged
      if (handle === "nw" || handle === "n" || handle === "ne") {
        newY = startY + dy;
        newH = startH - dy;
      }
      if (handle === "sw" || handle === "s" || handle === "se") {
        newH = startH + dy;
      }
      if (handle === "nw" || handle === "w" || handle === "sw") {
        newX = startX + dx;
        newW = startW - dx;
      }
      if (handle === "ne" || handle === "e" || handle === "se") {
        newW = startW + dx;
      }

      // Enforce minimum size
      if (newW < GRID_SIZE) {
        if (handle === "nw" || handle === "w" || handle === "sw") {
          newX = startX + startW - GRID_SIZE;
        }
        newW = GRID_SIZE;
      }
      if (newH < GRID_SIZE) {
        if (handle === "nw" || handle === "n" || handle === "ne") {
          newY = startY + startH - GRID_SIZE;
        }
        newH = GRID_SIZE;
      }

      const field = entityFieldName(interaction.entityType);
      const arr = [...(map[field] as Array<Record<string, unknown>>)];
      const ent = arr[interaction.entityIndex];
      if (ent) {
        arr[interaction.entityIndex] = {
          ...ent,
          x: newX,
          y: newY,
          width: newW,
          height: newH,
        };
        const updated = { ...map, [field]: arr };
        setMapData(updated);
        setDirty(true);
      }
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    const interaction = interactionRef.current;

    if (interaction.kind === "drawing" && mapDataRef.current) {
      const { startWorldX, startWorldY, currentWorldX, currentWorldY } =
        interaction;
      const x = Math.min(startWorldX, currentWorldX);
      const y = Math.min(startWorldY, currentWorldY);
      const width = Math.abs(currentWorldX - startWorldX);
      const height = Math.abs(currentWorldY - startWorldY);
      const map = mapDataRef.current;
      const currentTool = toolRef.current;

      if (width >= GRID_SIZE && height >= GRID_SIZE) {
        if (currentTool === "collision") {
          setMapData({
            ...map,
            collisions: [...map.collisions, { x, y, width, height }],
          });
          setDirty(true);
        } else if (currentTool === "region") {
          setMapData({
            ...map,
            regions: [
              ...map.regions,
              {
                id: `region-${map.regions.length}`,
                name: `Region ${map.regions.length}`,
                x,
                y,
                width,
                height,
                type: "safe",
              },
            ],
          });
          setDirty(true);
        } else if (currentTool === "portal") {
          setMapData({
            ...map,
            portals: [
              ...map.portals,
              {
                id: `portal-${map.portals.length}`,
                name: `Portal ${map.portals.length}`,
                x,
                y,
                width,
                height,
                targetMapId: "",
                targetSpawnId: "",
              },
            ],
          });
          setDirty(true);
        }
      }
    }

    interactionRef.current = { kind: "idle" };
  }, []);

  /* ── Keyboard shortcuts ─────────────────────────────────────── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === " " && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
        spaceHeldRef.current = true;
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        const sel = selectedEntityRef.current;
        const map = mapDataRef.current;
        if (!sel || !map) return;
        e.preventDefault();
        const field = entityFieldName(sel.type);
        const arr = (map[field] as unknown[]).filter((_, j) => j !== sel.index);
        setMapData({ ...map, [field]: arr });
        setSelectedEntity(null);
        setDirty(true);
        return;
      }

      // Arrow key nudge (Shift = 1px fine-tune, default = grid snap)
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight"
      ) {
        const sel = selectedEntityRef.current;
        const map = mapDataRef.current;
        if (!sel || !map) return;
        e.preventDefault();
        const step = e.shiftKey ? 1 : GRID_SIZE;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowUp") dy = -step;
        if (e.key === "ArrowDown") dy = step;
        if (e.key === "ArrowLeft") dx = -step;
        if (e.key === "ArrowRight") dx = step;

        const field = entityFieldName(sel.type);
        const arr = [...(map[field] as Array<Record<string, unknown>>)];
        const ent = arr[sel.index];
        if (ent && typeof ent.x === "number" && typeof ent.y === "number") {
          arr[sel.index] = { ...ent, x: ent.x + dx, y: ent.y + dy };
          const updated = { ...map, [field]: arr };
          setMapData(updated);
          setDirty(true);
        }
        return;
      }

      // Tool shortcuts
      const keyLower = e.key.toLowerCase();
      for (const [toolKey, config] of Object.entries(TOOL_CONFIG)) {
        if (config.shortcut.toLowerCase() === keyLower) {
          setTool(toolKey as ToolMode);
          return;
        }
      }

      // Fit map to view
      if (keyLower === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const container = containerRef.current;
        const map = mapDataRef.current;
        if (!container || !map) return;
        const rect = container.getBoundingClientRect();
        const fitZoom = Math.min(
          (rect.width * 0.8) / map.width,
          (rect.height * 0.8) / map.height,
          1,
        );
        setCamera({
          x: map.width / 2 - rect.width / (2 * fitZoom),
          y: map.height / 2 - rect.height / (2 * fitZoom),
          zoom: fitZoom,
        });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setSpaceHeld(false);
        spaceHeldRef.current = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  /* ── Save / Create / Delete ─────────────────────────────────── */
  const handleSave = useCallback(async () => {
    if (!mapData || !selectedMapId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateMap(selectedMapId, denormalizeMapData(mapData));
      setDirty(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [mapData, selectedMapId]);

  const handleCreateMap = useCallback(async () => {
    if (!newMapId.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const created = await createMap({
        ...NEW_MAP_TEMPLATE,
        id: newMapId.trim(),
        name: newMapId.trim(),
      });
      setIsCreatingNew(false);
      setNewMapId("");
      refetch();
      setSelectedMapId(created.id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }, [newMapId, refetch]);

  const handleDeleteMap = useCallback(async () => {
    if (!selectedMapId) return;
    if (!confirm(`Delete map "${selectedMapId}"?`)) return;
    try {
      await deleteMap(selectedMapId);
      setSelectedMapId(null);
      setMapData(null);
      refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Delete failed");
    }
  }, [selectedMapId, refetch]);

  /* ── Map dimension update ───────────────────────────────────── */
  const updateMapDimension = useCallback(
    (
      field: "width" | "height" | "name" | "background",
      value: string | number,
    ) => {
      setMapData((prev) => {
        if (!prev) return prev;
        return { ...prev, [field]: value };
      });
      setDirty(true);
    },
    [],
  );

  const cursorStyle = getCursorStyle(tool, interactionRef.current, spaceHeld);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: Map list */}
      <div className="w-56 shrink-0 border-r border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-vec-cyan text-xs uppercase tracking-wider">
            Maps
          </h2>
          <button
            type="button"
            className="btn-primary text-[11px] px-3 py-1"
            onClick={() => setIsCreatingNew(true)}
          >
            + New
          </button>
        </div>

        {isCreatingNew && (
          <div className="px-4 py-3 border-b border-border bg-surface-light">
            <input
              type="text"
              placeholder="Map ID (e.g. my-map)"
              value={newMapId}
              onChange={(e) => setNewMapId(e.target.value)}
              className="w-full mb-2 text-xs"
              onKeyDown={(e) => e.key === "Enter" && handleCreateMap()}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary text-[10px] px-2 py-0.5"
                onClick={handleCreateMap}
              >
                Create
              </button>
              <button
                type="button"
                className="btn-secondary text-[10px] px-2 py-0.5"
                onClick={() => {
                  setIsCreatingNew(false);
                  setNewMapId("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-4 text-muted text-xs">Loading...</div>}
          {error && <div className="p-4 text-danger text-xs">{error}</div>}
          {mapList?.map((m) => (
            <button
              type="button"
              key={m.id}
              className={`w-full text-left px-4 py-2.5 border-b border-border/50 transition-colors hover:bg-white/[0.02] ${
                selectedMapId === m.id
                  ? "bg-vec-green/[0.06] border-l-2 border-l-vec-green"
                  : "border-l-2 border-l-transparent"
              }`}
              onClick={() => setSelectedMapId(m.id)}
            >
              <div className="text-text-bright text-xs">{m.name}</div>
              <div className="text-muted text-[10px]">{m.id}</div>
            </button>
          ))}
        </div>

        {/* Map stats dashboard */}
        {mapData && selectedMapId && (
          <div className="border-t border-border px-4 py-3 shrink-0">
            <h3 className="text-vec-green-dim text-[9px] uppercase tracking-widest mb-2">
              Entities
            </h3>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <MapStatRow
                label="Spawns"
                count={(mapData.spawnPoints ?? []).length}
                color="var(--color-success)"
              />
              <MapStatRow
                label="Spawners"
                count={(mapData.enemySpawners ?? []).length}
                color="var(--color-vec-magenta)"
              />
              <MapStatRow
                label="Collisions"
                count={(mapData.collisions ?? []).length}
                color="var(--color-muted)"
              />
              <MapStatRow
                label="Portals"
                count={(mapData.portals ?? []).length}
                color="var(--color-vec-cyan)"
              />
              <MapStatRow
                label="Regions"
                count={(mapData.regions ?? []).length}
                color="var(--color-vec-green)"
              />
            </div>
            <div className="mt-2 pt-2 border-t border-border/50 flex justify-between text-[10px]">
              <span className="text-muted">Size</span>
              <span className="text-text tabular-nums">
                {mapData.width} x {mapData.height}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Right: Canvas editor */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedMapId ? (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            Select a map or create a new one
          </div>
        ) : loadingMap ? (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            Loading...
          </div>
        ) : !mapData ? (
          <div className="flex items-center justify-center h-full text-danger text-sm">
            {saveError ?? "Failed to load"}
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="px-3 py-1.5 border-b border-border flex items-center gap-1.5 shrink-0 bg-abyss">
              {/* Tool buttons */}
              {(Object.keys(TOOL_CONFIG) as ToolMode[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  title={`${TOOL_CONFIG[t].label} (${TOOL_CONFIG[t].shortcut})`}
                  className={`px-2.5 py-1 text-[11px] uppercase tracking-wider border transition-colors ${
                    tool === t
                      ? "border-vec-green bg-vec-green/10 text-vec-green"
                      : "border-border text-muted hover:text-text hover:border-border-bright"
                  }`}
                  onClick={() => setTool(t)}
                >
                  {TOOL_CONFIG[t].label}
                </button>
              ))}

              <div className="w-px h-5 bg-border mx-1" />

              {/* Map dimensions toggle */}
              <button
                type="button"
                className={`px-2.5 py-1 text-[11px] uppercase tracking-wider border transition-colors ${
                  showDimensions
                    ? "border-vec-cyan bg-vec-cyan/10 text-vec-cyan"
                    : "border-border text-muted hover:text-text hover:border-border-bright"
                }`}
                onClick={() => setShowDimensions((v) => !v)}
              >
                Dimensions
              </button>

              <div className="flex-1" />

              {/* Zoom indicator */}
              <span className="text-muted text-[10px] mr-2 tabular-nums">
                {Math.round(camera.zoom * 100)}%
              </span>

              {dirty && (
                <span className="text-vec-amber text-[10px] uppercase tracking-wider mr-2">
                  Unsaved
                </span>
              )}

              {selectedEntity && (
                <button
                  type="button"
                  className="btn-danger text-[10px] px-2 py-0.5 mr-1.5"
                  onClick={() => {
                    if (!selectedEntity || !mapData) return;
                    const field = entityFieldName(selectedEntity.type);
                    const arr = (mapData[field] as unknown[]).filter(
                      (_, j) => j !== selectedEntity.index,
                    );
                    setMapData({ ...mapData, [field]: arr });
                    setSelectedEntity(null);
                    setDirty(true);
                  }}
                >
                  Del Entity
                </button>
              )}

              <button
                type="button"
                className="btn-danger text-[10px] px-2 py-0.5 mr-1.5"
                onClick={handleDeleteMap}
              >
                Delete Map
              </button>

              <button
                type="button"
                className="btn-primary text-[11px]"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>

            {/* Map dimensions panel */}
            {showDimensions && (
              <div className="px-4 py-2 border-b border-border bg-surface flex items-center gap-4 flex-wrap shrink-0 animate-fade-in">
                <span className="text-vec-cyan-dim text-[10px] uppercase tracking-widest">
                  Map Settings
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted text-[10px] uppercase">Name</span>
                  <input
                    type="text"
                    value={mapData.name}
                    onChange={(e) => updateMapDimension("name", e.target.value)}
                    className="w-40 text-[11px] px-1.5 py-0.5"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted text-[10px] uppercase">W</span>
                  <input
                    type="number"
                    min={100}
                    step={100}
                    value={mapData.width}
                    onChange={(e) =>
                      updateMapDimension("width", Number(e.target.value) || 100)
                    }
                    className="w-20 text-[11px] px-1.5 py-0.5"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted text-[10px] uppercase">H</span>
                  <input
                    type="number"
                    min={100}
                    step={100}
                    value={mapData.height}
                    onChange={(e) =>
                      updateMapDimension(
                        "height",
                        Number(e.target.value) || 100,
                      )
                    }
                    className="w-20 text-[11px] px-1.5 py-0.5"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted text-[10px] uppercase">BG</span>
                  <input
                    type="color"
                    value={mapData.background}
                    onChange={(e) =>
                      updateMapDimension("background", e.target.value)
                    }
                  />
                  <input
                    type="text"
                    value={mapData.background}
                    onChange={(e) =>
                      updateMapDimension("background", e.target.value)
                    }
                    className="w-20 text-[11px] px-1.5 py-0.5"
                  />
                </div>
              </div>
            )}

            {saveError && (
              <div className="mx-4 mt-2 p-2 border border-danger/30 bg-danger/5 text-danger text-xs">
                {saveError}
              </div>
            )}

            {/* Canvas */}
            <div
              ref={containerRef}
              className="flex-1 relative overflow-hidden"
              style={{ cursor: cursorStyle }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <canvas ref={canvasRef} className="absolute inset-0" />

              {/* Status bar overlay */}
              <div className="absolute bottom-0 left-0 right-0 px-3 py-1 bg-abyss/80 border-t border-border/50 flex items-center gap-4 text-[10px] text-muted pointer-events-none">
                <span>
                  {mapData.width} x {mapData.height}
                </span>
                <span>Grid: {GRID_SIZE}px</span>
                <span className="flex-1" />
                <span>Space+Drag = Pan</span>
                <span>Scroll = Zoom</span>
                <span>Arrows = Nudge</span>
                <span>Del = Remove</span>
              </div>
            </div>

            {/* Properties panel */}
            {selectedEntity && (
              <PropertiesPanel
                mapData={mapData}
                entity={selectedEntity}
                enemiesList={enemiesList ?? []}
                mapsList={mapList ?? []}
                onChange={(updated) => {
                  setMapData(updated);
                  setDirty(true);
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Properties Panel ──────────────────────────────────────────── */

const REGION_TYPES = ["safe", "combat", "pvp", "quest", "boss"];

function PropertiesPanel({
  mapData,
  entity,
  enemiesList,
  mapsList,
  onChange,
}: {
  mapData: MapData;
  entity: { type: string; index: number };
  enemiesList: EnemyArchetype[];
  mapsList: MapSummary[];
  onChange: (updated: MapData) => void;
}) {
  const field = entityFieldName(entity.type);
  const arr = mapData[field] as Array<Record<string, unknown>>;
  const data = arr[entity.index];

  // Load target map spawn points for portal editing
  const targetMapId =
    entity.type === "portal" && data ? String(data.targetMapId ?? "") : "";
  const [targetMapSpawns, setTargetMapSpawns] = useState<Array<{ id: string }>>(
    [],
  );

  useEffect(() => {
    if (!targetMapId) {
      setTargetMapSpawns([]);
      return;
    }
    getMap(targetMapId)
      .then((m) => {
        const spawns = (m.spawnPoints ?? [])
          .map((sp) => ({
            id: String((sp as { id?: string }).id ?? ""),
          }))
          .filter((s) => s.id);
        setTargetMapSpawns(spawns);
      })
      .catch(() => setTargetMapSpawns([]));
  }, [targetMapId]);

  if (!data) return null;

  const updateProp = (key: string, value: unknown) => {
    const newArr = [...arr];
    newArr[entity.index] = { ...data, [key]: value };
    onChange({ ...mapData, [field]: newArr });
  };

  return (
    <div className="border-t border-border bg-abyss px-4 py-2.5 shrink-0">
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-vec-green-dim text-[10px] uppercase tracking-widest">
          {entity.type} #{entity.index}
        </span>
        {data.id !== undefined && (
          <PropInput
            label="ID"
            value={String(data.id)}
            onChange={(v) => updateProp("id", v)}
          />
        )}
        {data.name !== undefined && (
          <PropInput
            label="Name"
            value={String(data.name)}
            onChange={(v) => updateProp("name", v)}
            wide
          />
        )}
        {data.x !== undefined && (
          <PropInput
            label="X"
            type="number"
            value={String(data.x)}
            onChange={(v) => updateProp("x", Number(v))}
          />
        )}
        {data.y !== undefined && (
          <PropInput
            label="Y"
            type="number"
            value={String(data.y)}
            onChange={(v) => updateProp("y", Number(v))}
          />
        )}
        {data.width !== undefined && (
          <PropInput
            label="W"
            type="number"
            value={String(data.width)}
            onChange={(v) => updateProp("width", Number(v))}
          />
        )}
        {data.height !== undefined && (
          <PropInput
            label="H"
            type="number"
            value={String(data.height)}
            onChange={(v) => updateProp("height", Number(v))}
          />
        )}
        {data.radius !== undefined && (
          <PropInput
            label="Radius"
            type="number"
            value={String(data.radius)}
            onChange={(v) => updateProp("radius", Number(v))}
          />
        )}
        {data.archetypeId !== undefined && (
          <PropSelect
            label="Archetype"
            value={String(data.archetypeId)}
            onChange={(v) => updateProp("archetypeId", v)}
            options={enemiesList.map((e) => ({
              value: e.id,
              label: `${e.name} (Lv.${e.level})`,
            }))}
            placeholder="Select archetype..."
          />
        )}
        {data.maxCount !== undefined && (
          <PropInput
            label="Max"
            type="number"
            value={String(data.maxCount)}
            onChange={(v) => updateProp("maxCount", Number(v))}
          />
        )}
        {data.respawnMs !== undefined && (
          <PropInput
            label="Respawn ms"
            type="number"
            value={String(data.respawnMs)}
            onChange={(v) => updateProp("respawnMs", Number(v))}
          />
        )}
        {data.targetMapId !== undefined && (
          <PropSelect
            label="Target Map"
            value={String(data.targetMapId)}
            onChange={(v) => updateProp("targetMapId", v)}
            options={mapsList.map((m) => ({
              value: m.id,
              label: m.name,
            }))}
            placeholder="Select map..."
          />
        )}
        {data.targetSpawnId !== undefined && (
          <PropSelect
            label="Target Spawn"
            value={String(data.targetSpawnId)}
            onChange={(v) => updateProp("targetSpawnId", v)}
            options={targetMapSpawns.map((s) => ({
              value: s.id,
              label: s.id,
            }))}
            placeholder={
              targetMapId ? "Select spawn..." : "Choose target map first"
            }
          />
        )}
        {data.type !== undefined && entity.type === "region" && (
          <PropSelect
            label="Type"
            value={String(data.type)}
            onChange={(v) => updateProp("type", v)}
            options={REGION_TYPES.map((t) => ({
              value: t,
              label: t,
            }))}
          />
        )}
      </div>
    </div>
  );
}

function PropInput({
  label,
  value,
  onChange,
  type = "text",
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  wide?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted text-[10px] uppercase">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${wide ? "w-36" : "w-20"} text-[11px] px-1.5 py-0.5`}
      />
    </div>
  );
}

function PropSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted text-[10px] uppercase">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-44 text-[11px] px-1.5 py-0.5 bg-deep border border-border"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ─── Map Stat Row ─────────────────────────────────────────────── */

function MapStatRow({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted text-[10px]">{label}</span>
      <span className="text-[11px] tabular-nums font-mono" style={{ color }}>
        {count}
      </span>
    </div>
  );
}
