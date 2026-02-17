import { isItemIconKey } from "@mmo/shared";
import { resolveItemIconAssetUrl } from "@mmo/shared/item-icon-assets";
import { useMemo, useState } from "react";
import {
  type ItemIconDefinition,
  createItemIcon,
  deleteItemIcon,
  listItemIcons,
  updateItemIcon,
} from "../api/adminApi";
import { useAsyncData } from "../hooks/useAsyncData";

const EMPTY_ICON: ItemIconDefinition = {
  key: "",
  name: "",
  itemUsageCount: 0,
};

function IconPreview({ iconKey }: { iconKey: string }) {
  const iconUrl = resolveItemIconAssetUrl(iconKey);
  if (!iconUrl) {
    return (
      <div className="w-8 h-8 border border-border rounded bg-deep flex items-center justify-center text-[10px] text-danger">
        !
      </div>
    );
  }

  return (
    <img
      src={iconUrl}
      alt={iconKey}
      className="w-8 h-8 rounded border border-border bg-deep object-contain"
    />
  );
}

export function IconsPage() {
  const { data: icons, loading, error, refetch } = useAsyncData(listItemIcons);
  const [selected, setSelected] = useState<ItemIconDefinition | null>(null);
  const [editing, setEditing] = useState<ItemIconDefinition | null>(null);
  const [search, setSearch] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const filteredIcons = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = icons ?? [];
    if (!query) {
      return rows;
    }

    return rows.filter(
      (icon) =>
        icon.key.toLowerCase().includes(query) ||
        icon.name.toLowerCase().includes(query),
    );
  }, [icons, search]);

  const handleSelect = (icon: ItemIconDefinition) => {
    setSelected(icon);
    setEditing({ ...icon });
    setIsNew(false);
    setSaveError(null);
  };

  const handleNew = () => {
    setSelected(null);
    setEditing({ ...EMPTY_ICON });
    setIsNew(true);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!editing) {
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      if (isNew) {
        const created = await createItemIcon({
          key: editing.key.trim(),
          name: editing.name.trim(),
        });
        setSelected(created);
        setEditing(created);
        setIsNew(false);
      } else {
        const updated = await updateItemIcon(editing.key, {
          name: editing.name.trim(),
        });
        setSelected(updated);
        setEditing(updated);
      }
      refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) {
      return;
    }

    if (!confirm(`Delete icon "${selected.name}"?`)) {
      return;
    }

    try {
      await deleteItemIcon(selected.key);
      setSelected(null);
      setEditing(null);
      refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const missingAsset = editing?.key
    ? resolveItemIconAssetUrl(editing.key.trim()) === null
    : false;

  const keyInvalid =
    isNew && editing?.key ? !isItemIconKey(editing.key.trim()) : false;

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-80 shrink-0 border-r border-border flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
          <h2 className="text-vec-cyan text-xs uppercase tracking-wider">
            Item Icons
          </h2>
          <button
            type="button"
            className="btn-primary text-[11px] px-3 py-1"
            onClick={handleNew}
          >
            + New
          </button>
        </div>
        <div className="p-3 border-b border-border">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
            placeholder="Search icons"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-4 text-muted text-xs">Loading...</div>}
          {error && <div className="p-4 text-danger text-xs">{error}</div>}
          {filteredIcons.map((icon) => (
            <button
              type="button"
              key={icon.key}
              className={`w-full text-left px-4 py-2.5 border-b border-border/50 flex items-center gap-3 transition-colors hover:bg-white/[0.02] ${
                selected?.key === icon.key
                  ? "bg-vec-green/[0.06] border-l-2 border-l-vec-green"
                  : "border-l-2 border-l-transparent"
              }`}
              onClick={() => handleSelect(icon)}
            >
              <IconPreview iconKey={icon.key} />
              <div className="min-w-0 flex-1">
                <div className="text-text-bright text-xs truncate">
                  {icon.name}
                </div>
                <div className="text-muted text-[10px] mt-0.5 truncate">
                  {icon.key}
                </div>
              </div>
              <div className="text-[10px] text-muted tabular-nums">
                {icon.itemUsageCount}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {!editing ? (
          <div className="flex items-center justify-center h-32 text-muted text-sm">
            Select an icon or create a new one
          </div>
        ) : (
          <div className="max-w-xl flex flex-col gap-4">
            <div className="editor-panel p-4">
              <h3 className="text-vec-green-dim text-[10px] uppercase tracking-widest mb-3">
                Icon Details
              </h3>

              {saveError && (
                <div className="mb-3 p-3 border border-danger/30 bg-danger/5 text-danger text-xs">
                  {saveError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Key">
                  <input
                    type="text"
                    value={editing.key}
                    onChange={(e) =>
                      setEditing((prev) =>
                        prev ? { ...prev, key: e.target.value } : prev,
                      )
                    }
                    disabled={!isNew}
                    className="w-full disabled:opacity-40"
                  />
                </Field>

                <Field label="Name">
                  <input
                    type="text"
                    value={editing.name}
                    onChange={(e) =>
                      setEditing((prev) =>
                        prev ? { ...prev, name: e.target.value } : prev,
                      )
                    }
                    className="w-full"
                  />
                </Field>
              </div>

              {keyInvalid && (
                <p className="text-danger text-[11px] mt-2">
                  Key must be snake_case (lowercase letters, numbers,
                  underscores).
                </p>
              )}

              <div className="mt-3 flex items-center gap-3 text-xs text-muted">
                <IconPreview iconKey={editing.key} />
                <span>
                  Usage:{" "}
                  <span className="tabular-nums">{editing.itemUsageCount}</span>
                </span>
                {missingAsset && (
                  <span className="text-danger">Missing SVG asset</span>
                )}
              </div>

              <div className="mt-4 flex gap-2">
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
                  disabled={saving || keyInvalid || !editing.name.trim()}
                >
                  {saving ? "Saving..." : isNew ? "Create" : "Save"}
                </button>
              </div>
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
