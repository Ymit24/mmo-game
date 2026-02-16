import { useCallback, useEffect, useState } from "react";
import {
  type EnemyArchetype,
  type ItemDefinition,
  type LootEntry,
  type LootTable,
  createEnemy,
  deleteEnemy,
  getLootTable,
  listEnemies,
  listItems,
  updateEnemy,
  upsertLootTable,
} from "../api/adminApi";
import { useAsyncData } from "../hooks/useAsyncData";

const EMPTY_ENEMY: Omit<EnemyArchetype, "id"> & { id: string } = {
  id: "",
  name: "Unnamed",
  level: 1,
  xpReward: 10,
  maxHealth: 100,
  damage: 10,
  speed: 100,
  detectionRadius: 280,
  leashRadius: 420,
  attackSpeedMs: 1000,
  meleeRange: 42,
  rangedRange: 220,
  canMelee: true,
  canRanged: false,
  visualWidth: 36,
  visualHeight: 36,
  colorHex: "#ff4444",
};

type DetailTab = "stats" | "loot";

export function EnemiesPage() {
  const { data: enemies, loading, error, refetch } = useAsyncData(listEnemies);
  const { data: items } = useAsyncData(listItems);
  const [selected, setSelected] = useState<EnemyArchetype | null>(null);
  const [editing, setEditing] = useState<EnemyArchetype | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("stats");

  // Loot table state
  const [lootTable, setLootTable] = useState<LootTable | null>(null);
  const [loadingLoot, setLoadingLoot] = useState(false);
  const [lootDirty, setLootDirty] = useState(false);
  const [savingLoot, setSavingLoot] = useState(false);
  const [lootError, setLootError] = useState<string | null>(null);

  // Load loot table when enemy is selected
  useEffect(() => {
    if (!selected) {
      setLootTable(null);
      return;
    }
    setLoadingLoot(true);
    setLootError(null);
    getLootTable(selected.id)
      .then((table) => {
        setLootTable(table);
        setLootDirty(false);
      })
      .catch((err) => {
        setLootError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => setLoadingLoot(false));
  }, [selected]);

  const handleSelect = useCallback((enemy: EnemyArchetype) => {
    setSelected(enemy);
    setEditing({ ...enemy });
    setIsNew(false);
    setSaveError(null);
    setDetailTab("stats");
  }, []);

  const handleNew = useCallback(() => {
    const newEnemy = { ...EMPTY_ENEMY } as EnemyArchetype;
    setSelected(null);
    setEditing(newEnemy);
    setIsNew(true);
    setSaveError(null);
    setDetailTab("stats");
  }, []);

  const handleSave = useCallback(async () => {
    if (!editing) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (isNew) {
        const created = await createEnemy(editing);
        setSelected(created);
        setEditing(created);
        setIsNew(false);
      } else {
        const updated = await updateEnemy(editing.id, editing);
        setSelected(updated);
        setEditing(updated);
      }
      refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [editing, isNew, refetch]);

  const handleDelete = useCallback(async () => {
    if (!selected) return;
    if (!confirm(`Delete enemy "${selected.name}"?`)) return;
    try {
      await deleteEnemy(selected.id);
      setSelected(null);
      setEditing(null);
      refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Delete failed");
    }
  }, [selected, refetch]);

  const updateField = useCallback(
    <K extends keyof EnemyArchetype>(key: K, value: EnemyArchetype[K]) => {
      setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  // Loot table handlers
  const handleSaveLoot = useCallback(async () => {
    if (!selected || !lootTable) return;
    setSavingLoot(true);
    setLootError(null);
    try {
      const result = await upsertLootTable(selected.id, {
        dropChance: lootTable.dropChance,
        entries: lootTable.entries,
      });
      setLootTable(result);
      setLootDirty(false);
    } catch (err) {
      setLootError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingLoot(false);
    }
  }, [selected, lootTable]);

  const updateDropChance = useCallback((value: number) => {
    setLootTable((prev) => (prev ? { ...prev, dropChance: value } : prev));
    setLootDirty(true);
  }, []);

  const addLootEntry = useCallback(() => {
    if (!items?.length) return;
    const firstItem = items[0];
    if (!firstItem) return;
    setLootTable((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        entries: [
          ...prev.entries,
          {
            id: crypto.randomUUID(),
            itemDefinitionId: firstItem.id,
            weight: 1,
            classAffinity: null,
          },
        ],
      };
    });
    setLootDirty(true);
  }, [items]);

  const removeLootEntry = useCallback((entryId: string) => {
    setLootTable((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        entries: prev.entries.filter((e) => e.id !== entryId),
      };
    });
    setLootDirty(true);
  }, []);

  const updateLootEntry = useCallback(
    (entryId: string, field: keyof LootEntry, value: unknown) => {
      setLootTable((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          entries: prev.entries.map((e) =>
            e.id === entryId ? { ...e, [field]: value } : e,
          ),
        };
      });
      setLootDirty(true);
    },
    [],
  );

  const totalWeight = lootTable?.entries.reduce((s, e) => s + e.weight, 0) ?? 0;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: List */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-vec-cyan text-xs uppercase tracking-wider">
            Enemy Archetypes
          </h2>
          <button
            type="button"
            className="btn-primary text-[11px] px-3 py-1"
            onClick={handleNew}
          >
            + New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-4 text-muted text-xs">Loading...</div>}
          {error && <div className="p-4 text-danger text-xs">{error}</div>}
          {enemies?.map((enemy) => (
            <button
              type="button"
              key={enemy.id}
              className={`w-full text-left px-4 py-2.5 border-b border-border/50 flex items-center gap-3 transition-colors hover:bg-white/[0.02] ${
                selected?.id === enemy.id
                  ? "bg-vec-green/[0.06] border-l-2 border-l-vec-green"
                  : "border-l-2 border-l-transparent"
              }`}
              onClick={() => handleSelect(enemy)}
            >
              <div
                className="w-5 h-5 shrink-0"
                style={{ backgroundColor: enemy.colorHex }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-text-bright text-xs truncate">
                  {enemy.name}
                </div>
                <div className="text-muted text-[10px]">
                  Lv.{enemy.level} · {enemy.id}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Detail / Form */}
      <div className="flex-1 overflow-y-auto p-6">
        {!editing ? (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            Select an enemy or create a new one
          </div>
        ) : (
          <div className="animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-text-bright text-lg font-display">
                  {isNew ? "New Enemy" : editing.name}
                </h2>
                {!isNew && (
                  <p className="text-muted text-xs mt-1">{editing.id}</p>
                )}
              </div>
              <div className="flex gap-2">
                {!isNew && (
                  <button
                    type="button"
                    className="btn-danger text-[11px]"
                    onClick={handleDelete}
                  >
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  className="btn-primary text-[11px]"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : isNew ? "Create" : "Save"}
                </button>
              </div>
            </div>

            {saveError && (
              <div className="mb-4 p-3 border border-danger/30 bg-danger/5 text-danger text-xs">
                {saveError}
              </div>
            )}

            {/* Tabs: Stats / Loot */}
            {!isNew && (
              <div className="flex border-b border-border mb-5">
                <button
                  type="button"
                  className={`px-4 py-2 text-[11px] uppercase tracking-wider transition-colors border-b-2 -mb-px ${
                    detailTab === "stats"
                      ? "border-b-vec-green text-vec-green"
                      : "border-b-transparent text-muted hover:text-text"
                  }`}
                  onClick={() => setDetailTab("stats")}
                >
                  Stats
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 text-[11px] uppercase tracking-wider transition-colors border-b-2 -mb-px flex items-center gap-2 ${
                    detailTab === "loot"
                      ? "border-b-vec-gold text-vec-gold"
                      : "border-b-transparent text-muted hover:text-text"
                  }`}
                  onClick={() => setDetailTab("loot")}
                >
                  Loot Table
                  {lootDirty && (
                    <span className="w-1.5 h-1.5 rounded-full bg-vec-amber" />
                  )}
                </button>
              </div>
            )}

            {/* Stats Tab */}
            {(isNew || detailTab === "stats") && (
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                {/* Identity */}
                <FieldGroup label="Identity" span={2}>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="ID">
                      <input
                        type="text"
                        value={editing.id}
                        onChange={(e) => updateField("id", e.target.value)}
                        disabled={!isNew}
                        className="w-full disabled:opacity-40"
                      />
                    </Field>
                    <Field label="Name">
                      <input
                        type="text"
                        value={editing.name}
                        onChange={(e) => updateField("name", e.target.value)}
                        className="w-full"
                      />
                    </Field>
                  </div>
                </FieldGroup>

                {/* Core Stats */}
                <FieldGroup label="Core Stats">
                  <Field label="Level">
                    <input
                      type="number"
                      min={1}
                      value={editing.level}
                      onChange={(e) =>
                        updateField("level", Number(e.target.value))
                      }
                      className="w-full"
                    />
                  </Field>
                  <Field label="XP Reward">
                    <input
                      type="number"
                      min={0}
                      value={editing.xpReward}
                      onChange={(e) =>
                        updateField("xpReward", Number(e.target.value))
                      }
                      className="w-full"
                    />
                  </Field>
                  <Field label="Max Health">
                    <input
                      type="number"
                      min={1}
                      value={editing.maxHealth}
                      onChange={(e) =>
                        updateField("maxHealth", Number(e.target.value))
                      }
                      className="w-full"
                    />
                  </Field>
                  <Field label="Damage">
                    <input
                      type="number"
                      min={0}
                      value={editing.damage}
                      onChange={(e) =>
                        updateField("damage", Number(e.target.value))
                      }
                      className="w-full"
                    />
                  </Field>
                  <Field label="Speed">
                    <input
                      type="number"
                      min={0}
                      value={editing.speed}
                      onChange={(e) =>
                        updateField("speed", Number(e.target.value))
                      }
                      className="w-full"
                    />
                  </Field>
                </FieldGroup>

                {/* AI Behavior */}
                <FieldGroup label="AI Behavior">
                  <Field label="Detection Radius">
                    <input
                      type="number"
                      min={0}
                      value={editing.detectionRadius}
                      onChange={(e) =>
                        updateField("detectionRadius", Number(e.target.value))
                      }
                      className="w-full"
                    />
                  </Field>
                  <Field label="Leash Radius">
                    <input
                      type="number"
                      min={0}
                      value={editing.leashRadius}
                      onChange={(e) =>
                        updateField("leashRadius", Number(e.target.value))
                      }
                      className="w-full"
                    />
                  </Field>
                  <Field label="Attack Speed (ms)">
                    <input
                      type="number"
                      min={100}
                      step={50}
                      value={editing.attackSpeedMs}
                      onChange={(e) =>
                        updateField("attackSpeedMs", Number(e.target.value))
                      }
                      className="w-full"
                    />
                  </Field>
                </FieldGroup>

                {/* Combat */}
                <FieldGroup label="Combat" span={2}>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Melee Range">
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min={0}
                          value={editing.meleeRange}
                          onChange={(e) =>
                            updateField("meleeRange", Number(e.target.value))
                          }
                          className="flex-1"
                        />
                        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editing.canMelee}
                            onChange={(e) =>
                              updateField("canMelee", e.target.checked)
                            }
                            className="accent-vec-green"
                          />
                          Enabled
                        </label>
                      </div>
                    </Field>
                    <Field label="Ranged Range">
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min={0}
                          value={editing.rangedRange}
                          onChange={(e) =>
                            updateField("rangedRange", Number(e.target.value))
                          }
                          className="flex-1"
                        />
                        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editing.canRanged}
                            onChange={(e) =>
                              updateField("canRanged", e.target.checked)
                            }
                            className="accent-vec-green"
                          />
                          Enabled
                        </label>
                      </div>
                    </Field>
                  </div>
                </FieldGroup>

                {/* Visuals */}
                <FieldGroup label="Visuals" span={2}>
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <Field label="Width">
                      <input
                        type="number"
                        min={1}
                        value={editing.visualWidth}
                        onChange={(e) =>
                          updateField("visualWidth", Number(e.target.value))
                        }
                        className="w-full"
                      />
                    </Field>
                    <Field label="Height">
                      <input
                        type="number"
                        min={1}
                        value={editing.visualHeight}
                        onChange={(e) =>
                          updateField("visualHeight", Number(e.target.value))
                        }
                        className="w-full"
                      />
                    </Field>
                    <Field label="Color">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={editing.colorHex}
                          onChange={(e) =>
                            updateField("colorHex", e.target.value)
                          }
                        />
                        <input
                          type="text"
                          value={editing.colorHex}
                          onChange={(e) =>
                            updateField("colorHex", e.target.value)
                          }
                          className="flex-1"
                        />
                      </div>
                    </Field>
                  </div>
                  {/* Preview */}
                  <div className="mt-4 flex items-center gap-4">
                    <div className="text-xs text-muted uppercase">Preview:</div>
                    <div
                      className="border border-border"
                      style={{
                        width: Math.min(editing.visualWidth * 2, 120),
                        height: Math.min(editing.visualHeight * 2, 120),
                        backgroundColor: editing.colorHex,
                        boxShadow: `0 0 12px ${editing.colorHex}44`,
                      }}
                    />
                  </div>
                </FieldGroup>
              </div>
            )}

            {/* Loot Tab */}
            {!isNew && detailTab === "loot" && (
              <LootSection
                lootTable={lootTable}
                loadingLoot={loadingLoot}
                lootError={lootError}
                lootDirty={lootDirty}
                savingLoot={savingLoot}
                items={items ?? []}
                totalWeight={totalWeight}
                onSave={handleSaveLoot}
                onUpdateDropChance={updateDropChance}
                onAddEntry={addLootEntry}
                onRemoveEntry={removeLootEntry}
                onUpdateEntry={updateLootEntry}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Loot Section ──────────────────────────────────────────────── */

function LootSection({
  lootTable,
  loadingLoot,
  lootError,
  lootDirty,
  savingLoot,
  items,
  totalWeight,
  onSave,
  onUpdateDropChance,
  onAddEntry,
  onRemoveEntry,
  onUpdateEntry,
}: {
  lootTable: LootTable | null;
  loadingLoot: boolean;
  lootError: string | null;
  lootDirty: boolean;
  savingLoot: boolean;
  items: ItemDefinition[];
  totalWeight: number;
  onSave: () => void;
  onUpdateDropChance: (value: number) => void;
  onAddEntry: () => void;
  onRemoveEntry: (entryId: string) => void;
  onUpdateEntry: (
    entryId: string,
    field: keyof LootEntry,
    value: unknown,
  ) => void;
}) {
  if (loadingLoot) {
    return (
      <div className="text-muted text-xs py-8 text-center">
        Loading loot table...
      </div>
    );
  }

  if (!lootTable) {
    return (
      <div className="text-danger text-xs py-8 text-center">
        {lootError ?? "Failed to load loot table"}
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Save bar */}
      <div className="flex items-center justify-end gap-3 mb-4">
        {lootDirty && (
          <span className="text-vec-amber text-[10px] uppercase tracking-wider">
            Unsaved
          </span>
        )}
        <button
          type="button"
          className="btn-primary text-[11px]"
          onClick={onSave}
          disabled={savingLoot}
        >
          {savingLoot ? "Saving..." : "Save Loot"}
        </button>
      </div>

      {lootError && (
        <div className="mb-4 p-3 border border-danger/30 bg-danger/5 text-danger text-xs">
          {lootError}
        </div>
      )}

      {/* Drop Chance */}
      <div className="editor-panel p-4 mb-4">
        <h3 className="text-vec-green-dim text-[10px] uppercase tracking-widest mb-3">
          Drop Chance
        </h3>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={lootTable.dropChance}
            onChange={(e) => onUpdateDropChance(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-text-bright text-sm w-16 text-right">
            {(lootTable.dropChance * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Probability visualization */}
      {lootTable.entries.length > 0 && totalWeight > 0 && (
        <div className="editor-panel p-4 mb-4">
          <h3 className="text-vec-green-dim text-[10px] uppercase tracking-widest mb-3">
            Drop Distribution
          </h3>
          <div className="flex h-6 overflow-hidden border border-border">
            {lootTable.entries.map((entry, i) => {
              const pct = (entry.weight / totalWeight) * 100;
              const hue = (i * 137) % 360;
              return (
                <div
                  key={entry.id}
                  className="h-full relative group"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: `hsl(${hue}, 60%, 45%)`,
                    minWidth: "2px",
                  }}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-surface border border-border px-2 py-1 text-[10px] text-text-bright whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                    {items.find((it) => it.id === entry.itemDefinitionId)
                      ?.name ?? entry.itemDefinitionId}{" "}
                    ({pct.toFixed(1)}%)
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Entries */}
      <div className="editor-panel p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-vec-green-dim text-[10px] uppercase tracking-widest">
            Loot Entries
          </h3>
          <button
            type="button"
            className="btn-primary text-[11px] px-3 py-1"
            onClick={onAddEntry}
          >
            + Add
          </button>
        </div>

        {lootTable.entries.length === 0 ? (
          <div className="text-muted text-xs py-4 text-center">
            No loot entries. Click + Add to create one.
          </div>
        ) : (
          <table className="editor-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="w-24">Weight</th>
                <th className="w-20">Prob.</th>
                <th className="w-28">Class Affinity</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {lootTable.entries.map((entry) => {
                const pct =
                  totalWeight > 0
                    ? ((entry.weight / totalWeight) * 100).toFixed(1)
                    : "0.0";
                return (
                  <tr key={entry.id} className="cursor-default">
                    <td>
                      <select
                        value={entry.itemDefinitionId}
                        onChange={(e) =>
                          onUpdateEntry(
                            entry.id,
                            "itemDefinitionId",
                            e.target.value,
                          )
                        }
                        className="w-full bg-deep border border-border text-xs"
                      >
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.type})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={entry.weight}
                        onChange={(e) =>
                          onUpdateEntry(
                            entry.id,
                            "weight",
                            Number(e.target.value) || 1,
                          )
                        }
                        className="w-full text-xs"
                      />
                    </td>
                    <td className="text-vec-cyan text-xs text-center">
                      {pct}%
                    </td>
                    <td>
                      <select
                        value={entry.classAffinity ?? ""}
                        onChange={(e) =>
                          onUpdateEntry(
                            entry.id,
                            "classAffinity",
                            e.target.value || null,
                          )
                        }
                        className="w-full bg-deep border border-border text-xs"
                      >
                        <option value="">Any</option>
                        <option value="knight">Knight</option>
                        <option value="mage">Mage</option>
                      </select>
                    </td>
                    <td className="text-center">
                      <button
                        type="button"
                        className="text-danger/60 hover:text-danger text-xs transition-colors"
                        onClick={() => onRemoveEntry(entry.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ─── Shared field components ───────────────────────────────────── */

function FieldGroup({
  label,
  span = 1,
  children,
}: {
  label: string;
  span?: number;
  children: React.ReactNode;
}) {
  return (
    <div className={`editor-panel p-4 ${span === 2 ? "col-span-2" : ""}`}>
      <h3 className="text-vec-green-dim text-[10px] uppercase tracking-widest mb-3">
        {label}
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-muted text-[11px] mb-1 uppercase tracking-wider">
        {label}
      </div>
      {children}
    </div>
  );
}
