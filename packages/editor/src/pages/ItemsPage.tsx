import { useCallback, useState } from "react";
import {
  type ItemDefinition,
  createItem,
  deleteItem,
  listItems,
  updateItem,
} from "../api/adminApi";
import { useAsyncData } from "../hooks/useAsyncData";

const ITEM_TYPES = ["weapon", "armor", "potion", "misc"] as const;
const CLASSES = ["knight", "mage"] as const;

const EMPTY_ITEM: Omit<ItemDefinition, "id"> & { id: string } = {
  id: "",
  name: "Unnamed",
  iconKey: "",
  type: "misc",
  classRequirement: null,
  minLevelToEquip: null,
  weaponDamageFlat: null,
  weaponRangeFlat: null,
  weaponSpeedPercent: null,
};

const TYPE_COLORS: Record<string, string> = {
  weapon: "text-vec-magenta",
  armor: "text-vec-cyan",
  potion: "text-vec-green",
  misc: "text-muted",
};

export function ItemsPage() {
  const { data: items, loading, error, refetch } = useAsyncData(listItems);
  const [selected, setSelected] = useState<ItemDefinition | null>(null);
  const [editing, setEditing] = useState<ItemDefinition | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSelect = useCallback((item: ItemDefinition) => {
    setSelected(item);
    setEditing({ ...item });
    setIsNew(false);
    setSaveError(null);
  }, []);

  const handleNew = useCallback(() => {
    setSelected(null);
    setEditing({ ...EMPTY_ITEM } as ItemDefinition);
    setIsNew(true);
    setSaveError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editing) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (isNew) {
        const created = await createItem(editing);
        setSelected(created);
        setEditing(created);
        setIsNew(false);
      } else {
        const updated = await updateItem(editing.id, editing);
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
    if (!confirm(`Delete item "${selected.name}"?`)) return;
    try {
      await deleteItem(selected.id);
      setSelected(null);
      setEditing(null);
      refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Delete failed");
    }
  }, [selected, refetch]);

  const updateField = useCallback(
    <K extends keyof ItemDefinition>(key: K, value: ItemDefinition[K]) => {
      setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  const isWeapon = editing?.type === "weapon";

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: List */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-vec-cyan text-xs uppercase tracking-wider">
            Item Definitions
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
          {items?.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`w-full text-left px-4 py-2.5 border-b border-border/50 flex items-center gap-3 transition-colors hover:bg-white/[0.02] ${
                selected?.id === item.id
                  ? "bg-vec-green/[0.06] border-l-2 border-l-vec-green"
                  : "border-l-2 border-l-transparent"
              }`}
              onClick={() => handleSelect(item)}
            >
              <div className="min-w-0 flex-1">
                <div className="text-text-bright text-xs truncate">
                  {item.name}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className={`text-[10px] uppercase ${TYPE_COLORS[item.type] ?? "text-muted"}`}
                  >
                    {item.type}
                  </span>
                  {item.classRequirement && (
                    <span className="text-[10px] text-vec-gold-dim">
                      {item.classRequirement}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="flex-1 overflow-y-auto p-6">
        {!editing ? (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            Select an item or create a new one
          </div>
        ) : (
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-text-bright text-lg font-display">
                  {isNew ? "New Item" : editing.name}
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

            <div className="flex flex-col gap-4">
              {/* Identity */}
              <div className="editor-panel p-4">
                <h3 className="text-vec-green-dim text-[10px] uppercase tracking-widest mb-3">
                  Identity
                </h3>
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
                  <Field label="Icon Key">
                    <input
                      type="text"
                      value={editing.iconKey}
                      onChange={(e) => updateField("iconKey", e.target.value)}
                      className="w-full"
                    />
                  </Field>
                  <Field label="Type">
                    <select
                      value={editing.type}
                      onChange={(e) => updateField("type", e.target.value)}
                      className="w-full"
                    >
                      {ITEM_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              {/* Requirements */}
              <div className="editor-panel p-4">
                <h3 className="text-vec-green-dim text-[10px] uppercase tracking-widest mb-3">
                  Requirements
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Class Requirement">
                    <select
                      value={editing.classRequirement ?? ""}
                      onChange={(e) =>
                        updateField("classRequirement", e.target.value || null)
                      }
                      className="w-full"
                    >
                      <option value="">None</option>
                      {CLASSES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Min Level">
                    <input
                      type="number"
                      min={0}
                      value={editing.minLevelToEquip ?? ""}
                      onChange={(e) =>
                        updateField(
                          "minLevelToEquip",
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      className="w-full"
                    />
                  </Field>
                </div>
              </div>

              {/* Weapon Stats (conditional) */}
              {isWeapon && (
                <div className="editor-panel p-4 animate-fade-in">
                  <h3 className="text-vec-magenta-dim text-[10px] uppercase tracking-widest mb-3">
                    Weapon Stats
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Damage">
                      <input
                        type="number"
                        min={0}
                        value={editing.weaponDamageFlat ?? ""}
                        onChange={(e) =>
                          updateField(
                            "weaponDamageFlat",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="w-full"
                      />
                    </Field>
                    <Field label="Range">
                      <input
                        type="number"
                        min={0}
                        value={editing.weaponRangeFlat ?? ""}
                        onChange={(e) =>
                          updateField(
                            "weaponRangeFlat",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="w-full"
                      />
                    </Field>
                    <Field label="Speed %">
                      <input
                        type="number"
                        min={0}
                        value={editing.weaponSpeedPercent ?? ""}
                        onChange={(e) =>
                          updateField(
                            "weaponSpeedPercent",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="w-full"
                      />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
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
