import { useCallback, useEffect, useRef, useState } from "react";
import {
  type MapData,
  createMap,
  deleteMap,
  getMap,
  listMaps,
  updateMap,
} from "../api/adminApi";
import { useAsyncData } from "../hooks/useAsyncData";

interface Viewport {
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

const TOOL_CONFIG: Record<ToolMode, { label: string; color: string }> = {
  select: { label: "Select", color: "#a0a8b8" },
  collision: { label: "Collision", color: "#ff2244" },
  spawn: { label: "Spawn Pt", color: "#00ff41" },
  portal: { label: "Portal", color: "#00e5ff" },
  spawner: { label: "Spawner", color: "#ff9500" },
  region: { label: "Region", color: "#ffd700" },
};

const GRID_SIZE = 32;

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

export function MapsPage() {
  const { data: mapList, loading, error, refetch } = useAsyncData(listMaps);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loadingMap, setLoadingMap] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tool, setTool] = useState<ToolMode>("select");
  const [viewport, setViewport] = useState<Viewport>({
    x: 0,
    y: 0,
    zoom: 1,
  });
  const [selectedEntity, setSelectedEntity] = useState<{
    type: string;
    index: number;
  } | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newMapId, setNewMapId] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const isDrawingRef = useRef(false);
  const drawStartRef = useRef({ x: 0, y: 0 });
  const drawCurrentRef = useRef({ x: 0, y: 0 });

  // Load map data
  useEffect(() => {
    if (!selectedMapId) {
      setMapData(null);
      return;
    }
    setLoadingMap(true);
    setSaveError(null);
    getMap(selectedMapId)
      .then((data) => {
        setMapData(data);
        setDirty(false);
        setViewport({ x: 0, y: 0, zoom: 0.5 });
        setSelectedEntity(null);
      })
      .catch((err) => {
        setSaveError(err instanceof Error ? err.message : "Failed to load map");
      })
      .finally(() => setLoadingMap(false));
  }, [selectedMapId]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !mapData) return;

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

    const { x: vx, y: vy, zoom } = viewport;

    // Background
    ctx.fillStyle = mapData.background || "#0a0a12";
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.save();
    ctx.translate(-vx * zoom, -vy * zoom);
    ctx.scale(zoom, zoom);

    // Grid
    ctx.strokeStyle = "rgba(42, 42, 58, 0.4)";
    ctx.lineWidth = 0.5 / zoom;
    const gridStep = GRID_SIZE;
    const startX = Math.floor(vx / gridStep) * gridStep;
    const startY = Math.floor(vy / gridStep) * gridStep;
    const endX = vx + rect.width / zoom;
    const endY = vy + rect.height / zoom;
    for (let gx = startX; gx <= endX; gx += gridStep) {
      ctx.beginPath();
      ctx.moveTo(gx, startY);
      ctx.lineTo(gx, endY);
      ctx.stroke();
    }
    for (let gy = startY; gy <= endY; gy += gridStep) {
      ctx.beginPath();
      ctx.moveTo(startX, gy);
      ctx.lineTo(endX, gy);
      ctx.stroke();
    }

    // Map bounds
    ctx.strokeStyle = "rgba(0, 255, 65, 0.3)";
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(0, 0, mapData.width, mapData.height);

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
        ctx.font = `${11 / zoom}px "Share Tech Mono"`;
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
        ctx.font = `${10 / zoom}px "Share Tech Mono"`;
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
        ctx.font = `${9 / zoom}px "Share Tech Mono"`;
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
      // Center dot
      ctx.fillStyle = "rgba(255, 149, 0, 0.9)";
      ctx.beginPath();
      ctx.arc(es.x, es.y, 4 / zoom, 0, Math.PI * 2);
      ctx.fill();
      if (es.archetypeId) {
        ctx.fillStyle = "rgba(255, 149, 0, 0.8)";
        ctx.font = `${9 / zoom}px "Share Tech Mono"`;
        ctx.fillText(es.archetypeId, es.x + 8 / zoom, es.y - 8 / zoom);
      }
    }

    // Draw preview for current drawing operation
    if (isDrawingRef.current && tool !== "select") {
      const ds = drawStartRef.current;
      const dc = drawCurrentRef.current;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.strokeStyle = TOOL_CONFIG[tool].color;
      ctx.lineWidth = 1.5 / zoom;

      if (tool === "collision" || tool === "region" || tool === "portal") {
        const dx = Math.min(ds.x, dc.x);
        const dy = Math.min(ds.y, dc.y);
        const dw = Math.abs(dc.x - ds.x);
        const dh = Math.abs(dc.y - ds.y);
        ctx.strokeRect(dx, dy, dw, dh);
      }

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
        if ("width" in ent && "height" in ent) {
          ctx.strokeRect(
            ent.x as number,
            ent.y as number,
            ent.width as number,
            ent.height as number,
          );
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
        } else {
          const size = 16 / zoom;
          ctx.strokeRect(
            (ent.x as number) - size / 2,
            (ent.y as number) - size / 2,
            size,
            size,
          );
        }
      }

      ctx.setLineDash([]);
    }

    ctx.restore();
  }, [mapData, viewport, tool, selectedEntity]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      // Trigger re-render
      setViewport((v) => ({ ...v }));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // World coords from screen
  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const wx = viewport.x + (sx - rect.left) / viewport.zoom;
      const wy = viewport.y + (sy - rect.top) / viewport.zoom;
      return { x: wx, y: wy };
    },
    [viewport],
  );

  const snapToGrid = useCallback((val: number) => {
    return Math.round(val / GRID_SIZE) * GRID_SIZE;
  }, []);

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        // Middle click or alt+click: pan
        isPanningRef.current = true;
        panStartRef.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
      }

      if (e.button !== 0 || !mapData) return;

      const world = screenToWorld(e.clientX, e.clientY);

      if (tool === "select") {
        // Try to find entity under cursor
        const found = findEntityAt(mapData, world.x, world.y);
        setSelectedEntity(found);
        return;
      }

      if (tool === "spawn") {
        // Place spawn point immediately
        const newSpawn = {
          id: `spawn-${mapData.spawnPoints.length}`,
          x: snapToGrid(world.x),
          y: snapToGrid(world.y),
        };
        setMapData((prev) =>
          prev
            ? { ...prev, spawnPoints: [...prev.spawnPoints, newSpawn] }
            : prev,
        );
        setDirty(true);
        return;
      }

      if (tool === "spawner") {
        const newSpawner = {
          id: `spawner-${mapData.enemySpawners.length}`,
          x: snapToGrid(world.x),
          y: snapToGrid(world.y),
          radius: 100,
          archetypeId: "slime_scout",
          maxCount: 3,
          respawnMs: 10000,
        };
        setMapData((prev) =>
          prev
            ? {
                ...prev,
                enemySpawners: [...prev.enemySpawners, newSpawner],
              }
            : prev,
        );
        setDirty(true);
        return;
      }

      // Rectangle drawing tools
      if (tool === "collision" || tool === "region" || tool === "portal") {
        isDrawingRef.current = true;
        const snapped = {
          x: snapToGrid(world.x),
          y: snapToGrid(world.y),
        };
        drawStartRef.current = snapped;
        drawCurrentRef.current = snapped;
      }
    },
    [mapData, tool, screenToWorld, snapToGrid],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanningRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        panStartRef.current = { x: e.clientX, y: e.clientY };
        setViewport((v) => ({
          ...v,
          x: v.x - dx / v.zoom,
          y: v.y - dy / v.zoom,
        }));
        return;
      }

      if (isDrawingRef.current) {
        const world = screenToWorld(e.clientX, e.clientY);
        drawCurrentRef.current = {
          x: snapToGrid(world.x),
          y: snapToGrid(world.y),
        };
        // Force re-render for preview
        setViewport((v) => ({ ...v }));
      }
    },
    [screenToWorld, snapToGrid],
  );

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;

    if (isDrawingRef.current && mapData) {
      isDrawingRef.current = false;
      const ds = drawStartRef.current;
      const dc = drawCurrentRef.current;
      const x = Math.min(ds.x, dc.x);
      const y = Math.min(ds.y, dc.y);
      const width = Math.abs(dc.x - ds.x);
      const height = Math.abs(dc.y - ds.y);

      if (width < GRID_SIZE || height < GRID_SIZE) return; // too small

      if (tool === "collision") {
        const newColl = { x, y, width, height };
        setMapData((prev) =>
          prev ? { ...prev, collisions: [...prev.collisions, newColl] } : prev,
        );
        setDirty(true);
      } else if (tool === "region") {
        const newRegion = {
          id: `region-${mapData.regions.length}`,
          x,
          y,
          width,
          height,
          type: "safe",
        };
        setMapData((prev) =>
          prev ? { ...prev, regions: [...prev.regions, newRegion] } : prev,
        );
        setDirty(true);
      } else if (tool === "portal") {
        const newPortal = {
          id: `portal-${mapData.portals.length}`,
          x,
          y,
          width,
          height,
          targetMapId: "",
          targetSpawnId: "",
        };
        setMapData((prev) =>
          prev ? { ...prev, portals: [...prev.portals, newPortal] } : prev,
        );
        setDirty(true);
      }
    }
  }, [mapData, tool]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setViewport((v) => ({
      ...v,
      zoom: Math.max(0.1, Math.min(4, v.zoom * factor)),
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!mapData || !selectedMapId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateMap(selectedMapId, mapData);
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

  const deleteSelectedEntity = useCallback(() => {
    if (!selectedEntity || !mapData) return;
    const { type, index } = selectedEntity;
    setMapData((prev) => {
      if (!prev) return prev;
      const removeAt = <T,>(arr: T[], i: number) =>
        arr.filter((_, j) => j !== i);
      if (type === "collision")
        return { ...prev, collisions: removeAt(prev.collisions, index) };
      if (type === "region")
        return { ...prev, regions: removeAt(prev.regions, index) };
      if (type === "portal")
        return { ...prev, portals: removeAt(prev.portals, index) };
      if (type === "spawn")
        return { ...prev, spawnPoints: removeAt(prev.spawnPoints, index) };
      if (type === "spawner")
        return { ...prev, enemySpawners: removeAt(prev.enemySpawners, index) };
      return prev;
    });
    setSelectedEntity(null);
    setDirty(true);
  }, [selectedEntity, mapData]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (
          document.activeElement?.tagName === "INPUT" ||
          document.activeElement?.tagName === "TEXTAREA"
        )
          return;
        deleteSelectedEntity();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deleteSelectedEntity]);

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
            <div className="px-4 py-2 border-b border-border flex items-center gap-2 shrink-0 bg-abyss">
              {/* Tool buttons */}
              {(Object.keys(TOOL_CONFIG) as ToolMode[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`px-3 py-1 text-[11px] uppercase tracking-wider border transition-colors ${
                    tool === t
                      ? "border-vec-green bg-vec-green/10 text-vec-green"
                      : "border-border text-muted hover:text-text hover:border-border-bright"
                  }`}
                  onClick={() => setTool(t)}
                >
                  {TOOL_CONFIG[t].label}
                </button>
              ))}

              <div className="flex-1" />

              {/* Map info */}
              <span className="text-muted text-[10px] mr-2">
                {mapData.width}x{mapData.height} |{" "}
                {Math.round(viewport.zoom * 100)}%
              </span>

              {dirty && (
                <span className="text-vec-amber text-[10px] uppercase tracking-wider mr-2">
                  Unsaved
                </span>
              )}

              {selectedEntity && (
                <button
                  type="button"
                  className="btn-danger text-[10px] px-2 py-0.5 mr-2"
                  onClick={deleteSelectedEntity}
                >
                  Del Entity
                </button>
              )}

              <button
                type="button"
                className="btn-danger text-[10px] px-2 py-0.5 mr-2"
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

            {saveError && (
              <div className="mx-4 mt-2 p-2 border border-danger/30 bg-danger/5 text-danger text-xs">
                {saveError}
              </div>
            )}

            {/* Canvas */}
            <div
              ref={containerRef}
              className="flex-1 relative overflow-hidden cursor-crosshair"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            >
              <canvas ref={canvasRef} className="absolute inset-0" />
            </div>

            {/* Properties panel */}
            {selectedEntity && (
              <PropertiesPanel
                mapData={mapData}
                entity={selectedEntity}
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

function findEntityAt(
  mapData: MapData,
  wx: number,
  wy: number,
): { type: string; index: number } | null {
  // Check spawn points first (small targets)
  for (let i = mapData.spawnPoints.length - 1; i >= 0; i--) {
    const sp = mapData.spawnPoints[i] as { x: number; y: number } | undefined;
    if (!sp) continue;
    const dist = Math.hypot(wx - sp.x, wy - sp.y);
    if (dist < 16) return { type: "spawn", index: i };
  }

  // Spawners
  for (let i = mapData.enemySpawners.length - 1; i >= 0; i--) {
    const es = mapData.enemySpawners[i] as
      | { x: number; y: number; radius?: number }
      | undefined;
    if (!es) continue;
    const dist = Math.hypot(wx - es.x, wy - es.y);
    if (dist < (es.radius ?? 50)) return { type: "spawner", index: i };
  }

  // Portals
  for (let i = mapData.portals.length - 1; i >= 0; i--) {
    const p = mapData.portals[i] as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    if (!p) continue;
    if (wx >= p.x && wx <= p.x + p.width && wy >= p.y && wy <= p.y + p.height) {
      return { type: "portal", index: i };
    }
  }

  // Regions
  for (let i = mapData.regions.length - 1; i >= 0; i--) {
    const r = mapData.regions[i] as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    if (!r) continue;
    if (wx >= r.x && wx <= r.x + r.width && wy >= r.y && wy <= r.y + r.height) {
      return { type: "region", index: i };
    }
  }

  // Collisions
  for (let i = mapData.collisions.length - 1; i >= 0; i--) {
    const c = mapData.collisions[i] as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    if (!c) continue;
    if (wx >= c.x && wx <= c.x + c.width && wy >= c.y && wy <= c.y + c.height) {
      return { type: "collision", index: i };
    }
  }

  return null;
}

function PropertiesPanel({
  mapData,
  entity,
  onChange,
}: {
  mapData: MapData;
  entity: { type: string; index: number };
  onChange: (updated: MapData) => void;
}) {
  const getArr = (): Array<Record<string, unknown>> => {
    if (entity.type === "collision")
      return mapData.collisions as Array<Record<string, unknown>>;
    if (entity.type === "region")
      return mapData.regions as Array<Record<string, unknown>>;
    if (entity.type === "portal")
      return mapData.portals as Array<Record<string, unknown>>;
    if (entity.type === "spawn")
      return mapData.spawnPoints as Array<Record<string, unknown>>;
    if (entity.type === "spawner")
      return mapData.enemySpawners as Array<Record<string, unknown>>;
    return [];
  };

  const arr = getArr();
  const data = arr[entity.index];
  if (!data) return null;

  const updateProp = (key: string, value: unknown) => {
    const newArr = [...arr];
    newArr[entity.index] = { ...data, [key]: value };

    const field =
      entity.type === "collision"
        ? "collisions"
        : entity.type === "region"
          ? "regions"
          : entity.type === "portal"
            ? "portals"
            : entity.type === "spawn"
              ? "spawnPoints"
              : "enemySpawners";

    onChange({ ...mapData, [field]: newArr });
  };

  return (
    <div className="border-t border-border bg-abyss px-4 py-3 shrink-0">
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
          <PropInput
            label="Archetype"
            value={String(data.archetypeId)}
            onChange={(v) => updateProp("archetypeId", v)}
          />
        )}
        {data.targetMapId !== undefined && (
          <PropInput
            label="Target Map"
            value={String(data.targetMapId)}
            onChange={(v) => updateProp("targetMapId", v)}
          />
        )}
        {data.targetSpawnId !== undefined && (
          <PropInput
            label="Target Spawn"
            value={String(data.targetSpawnId)}
            onChange={(v) => updateProp("targetSpawnId", v)}
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted text-[10px] uppercase">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 text-[11px] px-1.5 py-0.5"
      />
    </div>
  );
}
