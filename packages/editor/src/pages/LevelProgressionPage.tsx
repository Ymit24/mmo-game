import { useCallback, useEffect, useState } from "react";
import {
  type LevelProgressionRow,
  getLevelProgression,
  updateLevelProgression,
} from "../api/adminApi";
import { useAsyncData } from "../hooks/useAsyncData";

type Tab = "table" | "charts";

export function LevelProgressionPage() {
  const {
    data: serverData,
    loading,
    error,
    refetch,
  } = useAsyncData(getLevelProgression);

  const [progression, setProgression] = useState<LevelProgressionRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>("table");

  useEffect(() => {
    if (serverData) {
      setProgression(serverData);
      setDirty(false);
    }
  }, [serverData]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await updateLevelProgression(progression);
      setProgression(result);
      setDirty(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [progression]);

  const updateRow = useCallback(
    (level: number, field: keyof LevelProgressionRow, value: number | null) => {
      setProgression((prev) =>
        prev.map((row) =>
          row.level === level ? { ...row, [field]: value } : row,
        ),
      );
      setDirty(true);
    },
    [],
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-vec-cyan text-xs uppercase tracking-wider">
            Level Progression
          </h2>
          <div className="flex border border-border">
            <button
              type="button"
              className={`px-3 py-1 text-[11px] uppercase tracking-wider transition-colors ${
                tab === "table"
                  ? "bg-vec-green/10 text-vec-green"
                  : "text-muted hover:text-text"
              }`}
              onClick={() => setTab("table")}
            >
              Table
            </button>
            <button
              type="button"
              className={`px-3 py-1 text-[11px] uppercase tracking-wider transition-colors border-l border-border ${
                tab === "charts"
                  ? "bg-vec-green/10 text-vec-green"
                  : "text-muted hover:text-text"
              }`}
              onClick={() => setTab("charts")}
            >
              Charts
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="text-vec-amber text-[10px] uppercase tracking-wider">
              Unsaved
            </span>
          )}
          <button
            type="button"
            className="btn-primary text-[11px]"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="mx-6 mt-3 p-3 border border-danger/30 bg-danger/5 text-danger text-xs">
          {saveError}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && <div className="p-6 text-muted text-xs">Loading...</div>}
        {error && <div className="p-6 text-danger text-xs">{error}</div>}

        {!loading && !error && tab === "table" && (
          <div className="p-6">
            <table className="editor-table max-w-3xl">
              <thead>
                <tr>
                  <th className="w-16">Level</th>
                  <th className="w-32">XP to Next</th>
                  <th className="w-28">Cumul. XP</th>
                  <th className="w-32">HP Multiplier</th>
                  <th className="w-32">Dmg Multiplier</th>
                </tr>
              </thead>
              <tbody>
                {progression.map((row) => {
                  const cumulXp = progression
                    .filter(
                      (r) => r.level < row.level && r.xpToNextLevel !== null,
                    )
                    .reduce((sum, r) => sum + (r.xpToNextLevel ?? 0), 0);
                  return (
                    <tr key={row.level} className="cursor-default">
                      <td className="text-vec-green text-xs font-display">
                        {row.level}
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={row.xpToNextLevel ?? ""}
                          onChange={(e) =>
                            updateRow(
                              row.level,
                              "xpToNextLevel",
                              e.target.value ? Number(e.target.value) : null,
                            )
                          }
                          className="w-full text-xs"
                        />
                      </td>
                      <td className="text-muted text-xs">
                        {cumulXp.toLocaleString()}
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={row.hpMultiplier}
                          onChange={(e) =>
                            updateRow(
                              row.level,
                              "hpMultiplier",
                              Number(e.target.value) || 1,
                            )
                          }
                          className="w-full text-xs"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={row.damageMultiplier}
                          onChange={(e) =>
                            updateRow(
                              row.level,
                              "damageMultiplier",
                              Number(e.target.value) || 1,
                            )
                          }
                          className="w-full text-xs"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && tab === "charts" && (
          <div className="p-6 flex flex-col gap-6 max-w-4xl">
            <CurveChart
              title="XP Required Per Level"
              data={progression.map((r) => ({
                x: r.level,
                y: r.xpToNextLevel ?? 0,
              }))}
              color="var(--color-vec-cyan)"
              yLabel="XP"
            />
            <CurveChart
              title="HP Multiplier"
              data={progression.map((r) => ({
                x: r.level,
                y: r.hpMultiplier,
              }))}
              color="var(--color-vec-green)"
              yLabel="Mult"
            />
            <CurveChart
              title="Damage Multiplier"
              data={progression.map((r) => ({
                x: r.level,
                y: r.damageMultiplier,
              }))}
              color="var(--color-vec-magenta)"
              yLabel="Mult"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function CurveChart({
  title,
  data,
  color,
  yLabel,
}: {
  title: string;
  data: Array<{ x: number; y: number }>;
  color: string;
  yLabel: string;
}) {
  if (data.length === 0) return null;

  const W = 700;
  const H = 180;
  const PAD_L = 56;
  const PAD_R = 16;
  const PAD_T = 8;
  const PAD_B = 28;

  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const maxY = Math.max(...data.map((d) => d.y), 1);
  const minX = Math.min(...data.map((d) => d.x));
  const maxX = Math.max(...data.map((d) => d.x));
  const rangeX = maxX - minX || 1;

  const toSvg = (d: { x: number; y: number }) => ({
    sx: PAD_L + ((d.x - minX) / rangeX) * chartW,
    sy: PAD_T + chartH - (d.y / maxY) * chartH,
  });

  const points = data.map(toSvg);
  const polyline = points.map((p) => `${p.sx},${p.sy}`).join(" ");

  // Y-axis ticks
  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) =>
    Math.round((maxY / yTicks) * i),
  );

  return (
    <div className="editor-panel p-4">
      <h3 className="text-vec-green-dim text-[10px] uppercase tracking-widest mb-3">
        {title}
      </h3>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxHeight: `${H}px` }}
        role="img"
        aria-label={title}
      >
        {/* Grid lines */}
        {yTickValues.map((val) => {
          const y = PAD_T + chartH - (val / maxY) * chartH;
          return (
            <g key={val}>
              <line
                x1={PAD_L}
                y1={y}
                x2={W - PAD_R}
                y2={y}
                stroke="var(--color-border)"
                strokeWidth={0.5}
              />
              <text
                x={PAD_L - 6}
                y={y + 3}
                textAnchor="end"
                fontSize={9}
                fill="var(--color-muted)"
                fontFamily="var(--font-mono)"
              >
                {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {[1, 10, 20, 30, 40, 50, 60].map((lvl) => {
          const x = PAD_L + ((lvl - minX) / rangeX) * chartW;
          return (
            <text
              key={lvl}
              x={x}
              y={H - 4}
              textAnchor="middle"
              fontSize={9}
              fill="var(--color-muted)"
              fontFamily="var(--font-mono)"
            >
              {lvl}
            </text>
          );
        })}

        {/* Curve fill */}
        <polygon
          points={`${PAD_L},${PAD_T + chartH} ${polyline} ${W - PAD_R},${PAD_T + chartH}`}
          fill={color}
          opacity={0.08}
        />

        {/* Curve line */}
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
        />
      </svg>
      <div className="flex justify-between text-[10px] text-muted mt-1 px-2">
        <span>Level</span>
        <span>{yLabel}</span>
      </div>
    </div>
  );
}
