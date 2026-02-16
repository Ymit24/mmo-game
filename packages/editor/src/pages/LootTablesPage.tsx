import { useCallback, useEffect, useState } from "react";
import {
  type EnemyArchetype,
  type ItemDefinition,
  type LootEntry,
  type LootTable,
  getLootTable,
  listEnemies,
  listItems,
  upsertLootTable,
} from "../api/adminApi";
import { useAsyncData } from "../hooks/useAsyncData";

export function LootTablesPage() {
  const { data: enemies } = useAsyncData(listEnemies);
  const { data: items } = useAsyncData(listItems);
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null);
  const [lootTable, setLootTable] = useState<LootTable | null>(null);
  const [loadingTable, setLoadingTable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!selectedEnemyId) {
      setLootTable(null);
      return;
    }
    setLoadingTable(true);
    setSaveError(null);
    getLootTable(selectedEnemyId)
      .then((table) => {
        setLootTable(table);
        setDirty(false);
      })
      .catch((err) => {
        setSaveError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => setLoadingTable(false));
  }, [selectedEnemyId]);

  const handleSave = useCallback(async () => {
    if (!selectedEnemyId || !lootTable) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await upsertLootTable(selectedEnemyId, {
        dropChance: lootTable.dropChance,
        entries: lootTable.entries,
      });
      setLootTable(result);
      setDirty(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [selectedEnemyId, lootTable]);

  const updateDropChance = useCallback((value: number) => {
    setLootTable((prev) => (prev ? { ...prev, dropChance: value } : prev));
    setDirty(true);
  }, []);

  const addEntry = useCallback(() => {
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
    setDirty(true);
  }, [items]);

  const removeEntry = useCallback((entryId: string) => {
    setLootTable((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        entries: prev.entries.filter((e) => e.id !== entryId),
      };
    });
    setDirty(true);
  }, []);

  const updateEntry = useCallback(
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
      setDirty(true);
    },
    [],
  );

  const totalWeight = lootTable?.entries.reduce((s, e) => s + e.weight, 0) ?? 0;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: Enemy selector */}
      <div className="w-64 shrink-0 border-r border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-vec-cyan text-xs uppercase tracking-wider">
            Enemy Loot Tables
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {enemies?.map((enemy) => (
            <button
              type="button"
              key={enemy.id}
              className={`w-full text-left px-4 py-2.5 border-b border-border/50 flex items-center gap-3 transition-colors hover:bg-white/[0.02] ${
                selectedEnemyId === enemy.id
                  ? "bg-vec-green/[0.06] border-l-2 border-l-vec-green"
                  : "border-l-2 border-l-transparent"
              }`}
              onClick={() => setSelectedEnemyId(enemy.id)}
            >
              <div
                className="w-4 h-4 shrink-0"
                style={{ backgroundColor: enemy.colorHex }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-text-bright text-xs truncate">
                  {enemy.name}
                </div>
                <div className="text-muted text-[10px]">Lv.{enemy.level}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Loot table editor */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedEnemyId ? (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            Select an enemy to edit its loot table
          </div>
        ) : loadingTable ? (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            Loading...
          </div>
        ) : !lootTable ? (
          <div className="flex items-center justify-center h-full text-danger text-sm">
            {saveError ?? "Failed to load loot table"}
          </div>
        ) : (
          <div className="max-w-3xl animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-text-bright text-lg font-display">
                  {enemies?.find((e) => e.id === selectedEnemyId)?.name ??
                    selectedEnemyId}
                </h2>
                <p className="text-muted text-xs mt-1">Loot Configuration</p>
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
              <div className="mb-4 p-3 border border-danger/30 bg-danger/5 text-danger text-xs">
                {saveError}
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
                  onChange={(e) => updateDropChance(Number(e.target.value))}
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
                          {items?.find((it) => it.id === entry.itemDefinitionId)
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
                  onClick={addEntry}
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
                                updateEntry(
                                  entry.id,
                                  "itemDefinitionId",
                                  e.target.value,
                                )
                              }
                              className="w-full bg-deep border border-border text-xs"
                            >
                              {items?.map((item) => (
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
                                updateEntry(
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
                                updateEntry(
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
                              onClick={() => removeEntry(entry.id)}
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
        )}
      </div>
    </div>
  );
}
