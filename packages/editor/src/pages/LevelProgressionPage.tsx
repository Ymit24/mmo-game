import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type EnemyArchetype,
  type LevelProgressionRow,
  getLevelProgression,
  listEnemies,
  updateLevelProgression,
} from "../api/adminApi";
import { useAsyncData } from "../hooks/useAsyncData";

type Tab = "table" | "charts" | "grind";

export function LevelProgressionPage() {
  const {
    data: serverData,
    loading,
    error,
    refetch,
  } = useAsyncData(getLevelProgression);
  const { data: enemies } = useAsyncData(listEnemies);

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
            <button
              type="button"
              className={`px-3 py-1 text-[11px] uppercase tracking-wider transition-colors border-l border-border ${
                tab === "grind"
                  ? "bg-vec-green/10 text-vec-green"
                  : "text-muted hover:text-text"
              }`}
              onClick={() => setTab("grind")}
            >
              Grind Calc
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
            <table className="editor-table">
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
          <div className="p-6 flex flex-col gap-6">
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
              enemyOverlay={enemies?.map((e) => ({
                x: e.level,
                y: e.maxHealth,
                label: e.name,
                color: e.colorHex,
              }))}
              enemyYLabel="Enemy HP"
            />
            <CurveChart
              title="Damage Multiplier"
              data={progression.map((r) => ({
                x: r.level,
                y: r.damageMultiplier,
              }))}
              color="var(--color-vec-magenta)"
              yLabel="Mult"
              enemyOverlay={enemies?.map((e) => ({
                x: e.level,
                y: e.damage,
                label: e.name,
                color: e.colorHex,
              }))}
              enemyYLabel="Enemy Dmg"
            />
          </div>
        )}

        {!loading && !error && tab === "grind" && (
          <div className="p-6">
            <XpGrindCalculator
              progression={progression}
              enemies={enemies ?? []}
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
  enemyOverlay,
  enemyYLabel,
}: {
  title: string;
  data: Array<{ x: number; y: number }>;
  color: string;
  yLabel: string;
  enemyOverlay?: Array<{
    x: number;
    y: number;
    label: string;
    color: string;
  }>;
  enemyYLabel?: string;
}) {
  if (data.length === 0) return null;

  const hasOverlay = enemyOverlay && enemyOverlay.length > 0;
  const W = 700;
  const H = hasOverlay ? 220 : 180;
  const PAD_L = 56;
  const PAD_R = hasOverlay ? 56 : 16;
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

        {/* Enemy overlay data points */}
        {hasOverlay &&
          (() => {
            const enemyMaxY = Math.max(...enemyOverlay.map((e) => e.y), 1);
            return (
              <>
                {/* Right Y-axis labels for enemy values */}
                {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                  const val = Math.round(enemyMaxY * frac);
                  const y = PAD_T + chartH - frac * chartH;
                  return (
                    <text
                      key={`ey-${frac}`}
                      x={W - PAD_R + 6}
                      y={y + 3}
                      textAnchor="start"
                      fontSize={8}
                      fill="var(--color-muted)"
                      fontFamily="var(--font-mono)"
                    >
                      {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                    </text>
                  );
                })}
                {/* Enemy data points */}
                {enemyOverlay.map((e) => {
                  const ex = PAD_L + ((e.x - minX) / rangeX) * chartW;
                  const ey = PAD_T + chartH - (e.y / enemyMaxY) * chartH;
                  return (
                    <g key={`${e.label}-${e.x}`}>
                      <circle
                        cx={ex}
                        cy={ey}
                        r={4}
                        fill={e.color}
                        stroke="var(--color-surface)"
                        strokeWidth={1.5}
                      />
                      <text
                        x={ex}
                        y={ey - 7}
                        textAnchor="middle"
                        fontSize={7}
                        fill={e.color}
                        fontFamily="var(--font-mono)"
                      >
                        {e.label.length > 12
                          ? `${e.label.slice(0, 10)}..`
                          : e.label}
                      </text>
                    </g>
                  );
                })}
              </>
            );
          })()}
      </svg>
      <div className="flex justify-between text-[10px] text-muted mt-1 px-2">
        <span>Level</span>
        <div className="flex gap-4">
          <span>{yLabel}</span>
          {hasOverlay && enemyYLabel && (
            <span className="text-vec-amber">{enemyYLabel}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── XP Grind Calculator ────────────────────────────────────────── */

function computeKillsForRange(
  fromLevel: number,
  toLevel: number,
  enemyXpReward: number,
  enemyLevel: number,
  progression: LevelProgressionRow[],
): { totalXp: number; totalKills: number; killsByLevel: number[] } {
  let totalXp = 0;
  let totalKills = 0;
  const killsByLevel: number[] = [];

  for (let lvl = fromLevel; lvl < toLevel; lvl++) {
    const row = progression.find((r) => r.level === lvl);
    const xpNeeded = row?.xpToNextLevel ?? 0;
    if (xpNeeded <= 0) continue;

    // XP scaling: as player levels, XP from this enemy changes
    const mult = Math.max(0.25, Math.min(1.75, 1 + (enemyLevel - lvl) * 0.12));
    const adjustedXp = Math.max(1, Math.round(enemyXpReward * mult));
    const kills = Math.ceil(xpNeeded / adjustedXp);
    totalXp += xpNeeded;
    totalKills += kills;
    killsByLevel.push(kills);
  }
  return { totalXp, totalKills, killsByLevel };
}

function XpGrindCalculator({
  progression,
  enemies,
}: {
  progression: LevelProgressionRow[];
  enemies: EnemyArchetype[];
}) {
  const [fromLevel, setFromLevel] = useState(1);
  const [toLevel, setToLevel] = useState(10);
  const [selectedEnemyId, setSelectedEnemyId] = useState<string>("");

  // Default to first enemy
  const effectiveEnemyId = selectedEnemyId || enemies[0]?.id || "";
  const selectedEnemy = enemies.find((e) => e.id === effectiveEnemyId);

  const result = useMemo(() => {
    if (!selectedEnemy || fromLevel >= toLevel) return null;
    return computeKillsForRange(
      fromLevel,
      toLevel,
      selectedEnemy.xpReward,
      selectedEnemy.level,
      progression,
    );
  }, [fromLevel, toLevel, selectedEnemy, progression]);

  // All-enemy comparison
  const comparison = useMemo(() => {
    if (fromLevel >= toLevel) return [];
    return enemies
      .map((e) => {
        const r = computeKillsForRange(
          fromLevel,
          toLevel,
          e.xpReward,
          e.level,
          progression,
        );
        return { enemy: e, ...r };
      })
      .sort((a, b) => a.totalKills - b.totalKills);
  }, [fromLevel, toLevel, enemies, progression]);

  const maxKills = Math.max(...comparison.map((c) => c.totalKills), 1);

  // Estimate time: assume ~2 seconds per kill average
  const estimateTime = (kills: number): string => {
    const seconds = kills * 2;
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="editor-panel p-4">
        <h3 className="text-vec-green-dim text-[10px] uppercase tracking-widest mb-4">
          Grind Parameters
        </h3>
        <div className="flex items-end gap-4 flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="text-muted text-[10px] uppercase tracking-wider">
              From Level
            </span>
            <input
              type="number"
              min={1}
              max={59}
              value={fromLevel}
              onChange={(e) => {
                const v = Number(e.target.value) || 1;
                setFromLevel(Math.max(1, Math.min(59, v)));
              }}
              className="w-20 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted text-[10px] uppercase tracking-wider">
              To Level
            </span>
            <input
              type="number"
              min={2}
              max={60}
              value={toLevel}
              onChange={(e) => {
                const v = Number(e.target.value) || 2;
                setToLevel(Math.max(2, Math.min(60, v)));
              }}
              className="w-20 text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted text-[10px] uppercase tracking-wider">
              Enemy
            </span>
            <select
              value={effectiveEnemyId}
              onChange={(e) => setSelectedEnemyId(e.target.value)}
              className="text-xs bg-surface border border-border px-2 py-1 text-text"
            >
              {enemies.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} (Lv{e.level})
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Result summary */}
      {result && selectedEnemy && (
        <div className="editor-panel p-4">
          <h3 className="text-vec-green-dim text-[10px] uppercase tracking-widest mb-3">
            Grinding {selectedEnemy.name} — Level {fromLevel} to {toLevel}
          </h3>
          <div className="grid grid-cols-4 gap-4">
            <div className="flex flex-col">
              <span className="text-muted text-[10px] uppercase tracking-wider">
                Total XP
              </span>
              <span className="text-text text-sm font-display">
                {result.totalXp.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted text-[10px] uppercase tracking-wider">
                Kills Required
              </span>
              <span className="text-vec-green text-sm font-display">
                {result.totalKills.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted text-[10px] uppercase tracking-wider">
                XP per Kill (Lv{fromLevel})
              </span>
              <span className="text-vec-cyan text-sm font-display">
                {Math.max(
                  1,
                  Math.round(
                    selectedEnemy.xpReward *
                      Math.max(
                        0.25,
                        Math.min(
                          1.75,
                          1 + (selectedEnemy.level - fromLevel) * 0.12,
                        ),
                      ),
                  ),
                )}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted text-[10px] uppercase tracking-wider">
                Est. Time
              </span>
              <span className="text-vec-magenta text-sm font-display">
                {estimateTime(result.totalKills)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Comparison chart */}
      {comparison.length > 0 && (
        <div className="editor-panel p-4">
          <h3 className="text-vec-green-dim text-[10px] uppercase tracking-widest mb-3">
            All Enemies — Kills to Reach Level {toLevel} from {fromLevel}
          </h3>
          <div className="flex flex-col gap-1">
            {comparison.map((c) => {
              const pct = (c.totalKills / maxKills) * 100;
              const isSelected = c.enemy.id === effectiveEnemyId;
              return (
                <button
                  type="button"
                  key={c.enemy.id}
                  className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer transition-colors w-full text-left ${
                    isSelected ? "bg-vec-green/8" : "hover:bg-surface-hover/50"
                  }`}
                  onClick={() => setSelectedEnemyId(c.enemy.id)}
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: c.enemy.colorHex }}
                  />
                  <span className="text-[11px] text-text w-32 truncate shrink-0">
                    {c.enemy.name}
                  </span>
                  <span className="text-[10px] text-muted w-10 shrink-0">
                    Lv{c.enemy.level}
                  </span>
                  <div className="flex-1 h-3 bg-surface-hover/30 rounded overflow-hidden">
                    <div
                      className="h-full rounded transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        background: isSelected
                          ? "var(--color-vec-green)"
                          : c.enemy.colorHex,
                        opacity: isSelected ? 1 : 0.6,
                      }}
                    />
                  </div>
                  <span
                    className={`text-[11px] w-16 text-right shrink-0 font-mono ${
                      isSelected ? "text-vec-green" : "text-muted"
                    }`}
                  >
                    {c.totalKills.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-muted w-12 text-right shrink-0">
                    {estimateTime(c.totalKills)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {fromLevel >= toLevel && (
        <div className="editor-panel p-4 text-muted text-xs text-center">
          Set "From Level" lower than "To Level" to calculate grind
          requirements.
        </div>
      )}
    </div>
  );
}
