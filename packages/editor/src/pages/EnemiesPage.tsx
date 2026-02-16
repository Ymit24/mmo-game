import { useCallback, useState } from "react";
import {
  type EnemyArchetype,
  createEnemy,
  deleteEnemy,
  listEnemies,
  updateEnemy,
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

export function EnemiesPage() {
  const { data: enemies, loading, error, refetch } = useAsyncData(listEnemies);
  const [selected, setSelected] = useState<EnemyArchetype | null>(null);
  const [editing, setEditing] = useState<EnemyArchetype | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSelect = useCallback((enemy: EnemyArchetype) => {
    setSelected(enemy);
    setEditing({ ...enemy });
    setIsNew(false);
    setSaveError(null);
  }, []);

  const handleNew = useCallback(() => {
    const newEnemy = { ...EMPTY_ENEMY } as EnemyArchetype;
    setSelected(null);
    setEditing(newEnemy);
    setIsNew(true);
    setSaveError(null);
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
          <div className="max-w-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-6">
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

            <div className="grid grid-cols-2 gap-4">
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
          </div>
        )}
      </div>
    </div>
  );
}

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
