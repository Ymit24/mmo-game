import {
  ATTACK_PATTERN_IDS,
  ATTACK_PATTERN_METADATA,
  type CharacterClass,
  MAX_ARMOR_DAMAGE_REDUCTION_PERCENT,
  WEAPON_STYLES,
  estimatePatternDps,
  resolveWeaponAttackConfig,
} from "@mmo/shared";
import { resolveItemIconAssetUrl } from "@mmo/shared/item-icon-assets";
import { useCallback, useMemo, useState } from "react";
import {
  type ItemDefinition,
  createItem,
  deleteItem,
  listItemIcons,
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
  potionHealFlat: null,
  armorMaxHpFlat: null,
  armorDamageReductionPercent: null,
  weaponDamageFlat: null,
  weaponRangeFlat: null,
  weaponSpeedPercent: null,
  weaponStyle: null,
  attackPatternId: null,
  attackDamageMultiplier: null,
  attackProjectileCount: null,
  attackSpreadDegrees: null,
  attackBurstCount: null,
  attackBurstIntervalMs: null,
  attackAoeRadius: null,
  attackAoeDelayMs: null,
};

const TYPE_COLORS: Record<string, string> = {
  weapon: "text-vec-magenta",
  armor: "text-vec-cyan",
  potion: "text-vec-green",
  misc: "text-muted",
};

/* ─── Weapon SVG Icon ──────────────────────────────────────────── */

function WeaponIcon({
  iconKey,
  classReq,
  size = 32,
}: {
  iconKey: string;
  classReq: string | null;
  size?: number;
}) {
  const isMage = classReq === "mage";
  const key = iconKey.toLowerCase();

  // Determine weapon style from icon key
  const isGreatsword =
    key.includes("great") || key.includes("dragon") || key.includes("broad");
  const isWand = key.includes("wand") || key.includes("focus");
  const isRod = key.includes("rod") || key.includes("stormweave");
  const isScepter = key.includes("scepter");
  const isStaff = isWand || isRod || isScepter;

  const accentColor = isMage || isStaff ? "#60a5fa" : "#f59e0b";
  const bladeColor = isMage || isStaff ? "#93c5fd" : "#d4d4d8";
  const handleColor = isMage || isStaff ? "#6366f1" : "#78716c";

  if (isStaff) {
    // Wand / Rod / Scepter shape
    const orbSize = isScepter ? 6 : isRod ? 5 : 4;
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        role="img"
        aria-label={iconKey}
      >
        {/* Shaft */}
        <line
          x1="16"
          y1="28"
          x2="16"
          y2={10}
          stroke={handleColor}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* Orb glow */}
        <circle
          cx="16"
          cy={8}
          r={orbSize + 2}
          fill={accentColor}
          opacity="0.2"
        />
        {/* Orb */}
        <circle cx="16" cy={8} r={orbSize} fill={accentColor} />
        <circle
          cx="16"
          cy={8}
          r={orbSize}
          fill="none"
          stroke={bladeColor}
          strokeWidth="0.5"
        />
        {/* Highlight */}
        <circle cx="14.5" cy="6.5" r="1.5" fill="white" opacity="0.5" />
        {/* Crossguard */}
        {isScepter && (
          <path
            d="M12 12 L20 12"
            stroke={accentColor}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        )}
        {isRod && (
          <>
            <circle cx="13" cy="11" r="1.5" fill={accentColor} opacity="0.6" />
            <circle cx="19" cy="11" r="1.5" fill={accentColor} opacity="0.6" />
          </>
        )}
      </svg>
    );
  }

  // Sword shapes
  const bladeWidth = isGreatsword ? 5 : 3;
  const bladeTop = isGreatsword ? 4 : 6;
  const guardWidth = isGreatsword ? 14 : 10;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label={iconKey}
    >
      {/* Blade glow */}
      <rect
        x={16 - bladeWidth / 2 - 1}
        y={bladeTop - 1}
        width={bladeWidth + 2}
        height={22 - bladeTop + 2}
        rx="1"
        fill={accentColor}
        opacity="0.15"
      />
      {/* Blade */}
      <path
        d={`M${16 - bladeWidth / 2} 20 L${16 - bladeWidth / 2} ${bladeTop + 2} L16 ${bladeTop} L${16 + bladeWidth / 2} ${bladeTop + 2} L${16 + bladeWidth / 2} 20 Z`}
        fill={bladeColor}
        stroke={bladeColor}
        strokeWidth="0.5"
      />
      {/* Fuller line */}
      <line
        x1="16"
        y1={bladeTop + 3}
        x2="16"
        y2="18"
        stroke={accentColor}
        strokeWidth="0.8"
        opacity="0.6"
      />
      {/* Crossguard */}
      <rect
        x={16 - guardWidth / 2}
        y="20"
        width={guardWidth}
        height="2.5"
        rx="1"
        fill={handleColor}
      />
      {/* Grip */}
      <rect
        x="14.5"
        y="22.5"
        width="3"
        height="5"
        rx="0.5"
        fill={handleColor}
      />
      {/* Pommel */}
      <circle cx="16" cy="28.5" r="2" fill={accentColor} />
      <circle cx="16" cy="28.5" r="1" fill="white" opacity="0.3" />
    </svg>
  );
}

function ItemIconThumb({
  iconKey,
  size = 24,
}: {
  iconKey: string;
  size?: number;
}) {
  const iconUrl = resolveItemIconAssetUrl(iconKey);
  if (!iconUrl) {
    return (
      <div
        className="rounded border border-border bg-deep text-[10px] text-muted flex items-center justify-center"
        style={{ width: size, height: size }}
        title={`Missing icon asset: ${iconKey}`}
      >
        ?
      </div>
    );
  }

  return (
    <img
      src={iconUrl}
      alt={iconKey}
      width={size}
      height={size}
      className="rounded border border-border bg-deep object-contain"
    />
  );
}

/* ─── DPS Calculator ───────────────────────────────────────────── */

const CLASS_BASE_STATS: Record<string, { damage: number; speedMs: number }> = {
  knight: { damage: 24, speedMs: 600 },
  mage: { damage: 18, speedMs: 820 },
};

function computeWeaponDps(
  item: ItemDefinition,
  characterClass: string,
): number {
  const base = CLASS_BASE_STATS[characterClass];
  if (!base || item.type !== "weapon") return 0;
  const totalDamage = base.damage + (item.weaponDamageFlat ?? 0);
  const speedFactor = 1 - (item.weaponSpeedPercent ?? 0) / 100;
  const effectiveSpeedMs = Math.max(
    200,
    Math.round(base.speedMs * Math.max(0.05, speedFactor)),
  );
  const resolvedClass: CharacterClass =
    characterClass === "mage" ? "mage" : "knight";
  const attackConfig = resolveWeaponAttackConfig(item, resolvedClass);
  return estimatePatternDps(totalDamage, effectiveSpeedMs, attackConfig, 1);
}

function DpsComparisonChart({ items }: { items: ItemDefinition[] }) {
  const weapons = useMemo(
    () => items.filter((i) => i.type === "weapon"),
    [items],
  );

  const chartData = useMemo(() => {
    return weapons
      .map((w) => {
        const knightDps = computeWeaponDps(w, "knight");
        const mageDps = computeWeaponDps(w, "mage");
        // Use relevant DPS: class-restricted weapons only show their class
        const effectiveClass = w.classRequirement;
        return {
          item: w,
          knightDps: effectiveClass === "mage" ? 0 : knightDps,
          mageDps: effectiveClass === "knight" ? 0 : mageDps,
          maxDps: Math.max(
            effectiveClass === "mage" ? 0 : knightDps,
            effectiveClass === "knight" ? 0 : mageDps,
          ),
        };
      })
      .sort((a, b) => b.maxDps - a.maxDps);
  }, [weapons]);

  if (chartData.length === 0) return null;

  const overallMax = Math.max(...chartData.map((d) => d.maxDps), 1);

  return (
    <div className="editor-panel p-4">
      <h3 className="text-vec-green-dim text-[10px] uppercase tracking-widest mb-4">
        Weapon DPS Comparison (Level 1, No Scaling)
      </h3>
      <div className="flex flex-col gap-2">
        {chartData.map((d) => (
          <div key={d.item.id} className="flex items-center gap-3">
            <div className="w-28 shrink-0 flex items-center gap-2">
              <WeaponIcon
                iconKey={d.item.iconKey}
                classReq={d.item.classRequirement}
                size={18}
              />
              <span className="text-text-bright text-[11px] truncate">
                {d.item.name}
              </span>
            </div>
            <div className="flex-1 flex flex-col gap-0.5">
              {d.knightDps > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-vec-green w-10 shrink-0 uppercase">
                    KNT
                  </span>
                  <div className="flex-1 h-3 bg-deep border border-border/50 overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${(d.knightDps / overallMax) * 100}%`,
                        backgroundColor: "#f59e0b",
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-muted w-12 text-right tabular-nums">
                    {d.knightDps.toFixed(1)}
                  </span>
                </div>
              )}
              {d.mageDps > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-vec-cyan w-10 shrink-0 uppercase">
                    MAG
                  </span>
                  <div className="flex-1 h-3 bg-deep border border-border/50 overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${(d.mageDps / overallMax) * 100}%`,
                        backgroundColor: "#60a5fa",
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-muted w-12 text-right tabular-nums">
                    {d.mageDps.toFixed(1)}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[10px] text-muted">
        DPS = (BaseDmg + WeaponDmg) / EffectiveAttackSpeed. Base stats at Level
        1 with no level scaling applied.
      </div>
    </div>
  );
}

function normalizeCharacterClassForItem(item: ItemDefinition): CharacterClass {
  return item.classRequirement === "mage" ? "mage" : "knight";
}

function withResolvedItemDefaults(item: ItemDefinition): ItemDefinition {
  const withPotionDefaults: ItemDefinition =
    item.type !== "potion"
      ? {
          ...item,
          potionHealFlat: null,
        }
      : {
          ...item,
          potionHealFlat:
            item.potionHealFlat === null
              ? null
              : Math.max(1, item.potionHealFlat),
        };

  const withArmorDefaults: ItemDefinition =
    item.type !== "armor"
      ? {
          ...withPotionDefaults,
          armorMaxHpFlat: null,
          armorDamageReductionPercent: null,
        }
      : {
          ...withPotionDefaults,
          armorMaxHpFlat:
            item.armorMaxHpFlat === null
              ? null
              : Math.max(0, item.armorMaxHpFlat),
          armorDamageReductionPercent:
            item.armorDamageReductionPercent === null
              ? null
              : Math.max(
                  0,
                  Math.min(
                    MAX_ARMOR_DAMAGE_REDUCTION_PERCENT,
                    item.armorDamageReductionPercent,
                  ),
                ),
        };

  if (withArmorDefaults.type !== "weapon") {
    return {
      ...withArmorDefaults,
      weaponStyle: null,
      attackPatternId: null,
      attackDamageMultiplier: null,
      attackProjectileCount: null,
      attackSpreadDegrees: null,
      attackBurstCount: null,
      attackBurstIntervalMs: null,
      attackAoeRadius: null,
      attackAoeDelayMs: null,
    };
  }

  const resolved = resolveWeaponAttackConfig(
    withArmorDefaults,
    normalizeCharacterClassForItem(withArmorDefaults),
  );
  return {
    ...withArmorDefaults,
    weaponStyle: resolved.weaponStyle,
    attackPatternId: resolved.attackPatternId,
    attackDamageMultiplier: resolved.damageMultiplier,
    attackProjectileCount: resolved.projectileCount,
    attackSpreadDegrees: resolved.spreadDegrees,
    attackBurstCount: resolved.burstCount,
    attackBurstIntervalMs: resolved.burstIntervalMs,
    attackAoeRadius: resolved.aoeRadius,
    attackAoeDelayMs: resolved.aoeDelayMs,
  };
}

/* ─── Main Component ───────────────────────────────────────────── */

export function ItemsPage() {
  const { data: items, loading, error, refetch } = useAsyncData(listItems);
  const { data: itemIcons, loading: loadingIcons } =
    useAsyncData(listItemIcons);
  const [selected, setSelected] = useState<ItemDefinition | null>(null);
  const [editing, setEditing] = useState<ItemDefinition | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [iconSearch, setIconSearch] = useState("");

  const handleSelect = useCallback((item: ItemDefinition) => {
    setSelected(item);
    setEditing(withResolvedItemDefaults({ ...item }));
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
        setEditing(withResolvedItemDefaults(created));
        setIsNew(false);
      } else {
        const updated = await updateItem(editing.id, editing);
        setSelected(updated);
        setEditing(withResolvedItemDefaults(updated));
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
      setEditing((prev) => {
        if (!prev) {
          return prev;
        }
        return { ...prev, [key]: value };
      });
    },
    [],
  );

  const updateWeaponField = useCallback(
    <K extends keyof ItemDefinition>(key: K, value: ItemDefinition[K]) => {
      setEditing((prev) => {
        if (!prev) {
          return prev;
        }
        return withResolvedItemDefaults({
          ...prev,
          [key]: value,
        } as ItemDefinition);
      });
    },
    [],
  );

  const isWeapon = editing?.type === "weapon";
  const isArmor = editing?.type === "armor";
  const isPotion = editing?.type === "potion";
  const resolvedEditingAttack = useMemo(() => {
    if (!editing || editing.type !== "weapon") {
      return null;
    }
    return resolveWeaponAttackConfig(
      editing,
      normalizeCharacterClassForItem(editing),
    );
  }, [editing]);
  const activePatternId = resolvedEditingAttack?.attackPatternId ?? null;
  const isMultishotPattern = activePatternId === "wand_multishot";
  const isBurstPattern = activePatternId === "wand_burst";
  const isAoePattern = activePatternId === "staff_ground_aoe";
  const filteredItemIcons = useMemo(() => {
    const icons = itemIcons ?? [];
    const query = iconSearch.trim().toLowerCase();
    if (!query) {
      return icons;
    }
    return icons.filter(
      (icon) =>
        icon.key.toLowerCase().includes(query) ||
        icon.name.toLowerCase().includes(query),
    );
  }, [itemIcons, iconSearch]);

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
              <div className="shrink-0">
                <ItemIconThumb iconKey={item.iconKey} size={28} />
              </div>
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
                  {item.weaponStyle && (
                    <span className="text-[10px] text-vec-cyan capitalize">
                      {item.weaponStyle}
                    </span>
                  )}
                  {item.attackPatternId && (
                    <span className="text-[10px] text-vec-magenta-dim">
                      {ATTACK_PATTERN_METADATA[item.attackPatternId].shortLabel}
                    </span>
                  )}
                  {item.type === "armor" &&
                    item.armorDamageReductionPercent !== null && (
                      <span className="text-[10px] text-vec-green">
                        {item.armorDamageReductionPercent}%
                      </span>
                    )}
                  {item.type === "armor" && item.armorMaxHpFlat !== null && (
                    <span className="text-[10px] text-vec-cyan">
                      +{item.armorMaxHpFlat} HP
                    </span>
                  )}
                  {item.type === "potion" && item.potionHealFlat !== null && (
                    <span className="text-[10px] text-vec-green">
                      +{item.potionHealFlat} HP
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
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-center h-32 text-muted text-sm">
              Select an item or create a new one
            </div>
            {/* Show DPS chart even without selection */}
            {items && items.length > 0 && <DpsComparisonChart items={items} />}
          </div>
        ) : (
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-surface border border-border">
                  <ItemIconThumb iconKey={editing.iconKey} size={48} />
                </div>
                <div>
                  <h2 className="text-text-bright text-lg font-display">
                    {isNew ? "New Item" : editing.name}
                  </h2>
                  {!isNew && (
                    <p className="text-muted text-xs mt-1">{editing.id}</p>
                  )}
                </div>
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
                  <Field label="Icon">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <ItemIconThumb iconKey={editing.iconKey} size={24} />
                        <span className="text-xs text-muted">
                          {editing.iconKey}
                        </span>
                      </div>
                      <input
                        type="text"
                        placeholder="Search icons by key or name"
                        value={iconSearch}
                        onChange={(e) => setIconSearch(e.target.value)}
                        className="w-full"
                      />
                      <select
                        value={editing.iconKey}
                        onChange={(e) => updateField("iconKey", e.target.value)}
                        className="w-full"
                        disabled={loadingIcons}
                      >
                        <option value="" disabled>
                          {loadingIcons ? "Loading icons..." : "Select an icon"}
                        </option>
                        {filteredItemIcons.map((icon) => (
                          <option key={icon.key} value={icon.key}>
                            {icon.name} ({icon.key})
                          </option>
                        ))}
                      </select>
                      {editing.iconKey &&
                        resolveItemIconAssetUrl(editing.iconKey) === null && (
                          <p className="text-[10px] text-danger">
                            Missing icon asset for key "{editing.iconKey}".
                          </p>
                        )}
                    </div>
                  </Field>
                  <Field label="Type">
                    <select
                      value={editing.type}
                      onChange={(e) =>
                        setEditing((prev) => {
                          if (!prev) {
                            return prev;
                          }
                          return withResolvedItemDefaults({
                            ...prev,
                            type: e.target.value as ItemDefinition["type"],
                          });
                        })
                      }
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
                      onChange={(e) => {
                        const nextValue = (e.target.value ||
                          null) as ItemDefinition["classRequirement"];
                        if (editing.type === "weapon") {
                          updateWeaponField("classRequirement", nextValue);
                          return;
                        }
                        updateField("classRequirement", nextValue);
                      }}
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
                        min={-95}
                        max={95}
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

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Field label="Weapon Style">
                      <select
                        value={
                          editing.weaponStyle ??
                          resolvedEditingAttack?.weaponStyle ??
                          ""
                        }
                        onChange={(e) =>
                          updateWeaponField(
                            "weaponStyle",
                            (e.target.value ||
                              null) as ItemDefinition["weaponStyle"],
                          )
                        }
                        className="w-full"
                      >
                        <option value="">Auto</option>
                        {WEAPON_STYLES.map((style) => (
                          <option key={style} value={style}>
                            {style}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Attack Pattern">
                      <select
                        value={
                          editing.attackPatternId ??
                          resolvedEditingAttack?.attackPatternId ??
                          ""
                        }
                        onChange={(e) =>
                          updateWeaponField(
                            "attackPatternId",
                            (e.target.value ||
                              null) as ItemDefinition["attackPatternId"],
                          )
                        }
                        className="w-full"
                      >
                        <option value="">Auto</option>
                        {ATTACK_PATTERN_IDS.map((patternId) => (
                          <option key={patternId} value={patternId}>
                            {ATTACK_PATTERN_METADATA[patternId].label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <Field label="Damage Mult">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={editing.attackDamageMultiplier ?? ""}
                        onChange={(e) =>
                          updateWeaponField(
                            "attackDamageMultiplier",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="w-full"
                      />
                    </Field>
                    <Field label="Projectile Count">
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={editing.attackProjectileCount ?? ""}
                        onChange={(e) =>
                          updateWeaponField(
                            "attackProjectileCount",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="w-full disabled:opacity-40"
                        disabled={!isMultishotPattern}
                      />
                    </Field>
                    <Field label="Spread Degrees">
                      <input
                        type="number"
                        min={0}
                        max={180}
                        value={editing.attackSpreadDegrees ?? ""}
                        onChange={(e) =>
                          updateWeaponField(
                            "attackSpreadDegrees",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="w-full disabled:opacity-40"
                        disabled={!isMultishotPattern}
                      />
                    </Field>
                    <Field label="Burst Count">
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={editing.attackBurstCount ?? ""}
                        onChange={(e) =>
                          updateWeaponField(
                            "attackBurstCount",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="w-full disabled:opacity-40"
                        disabled={!isBurstPattern}
                      />
                    </Field>
                    <Field label="Burst Interval (ms)">
                      <input
                        type="number"
                        min={0}
                        max={5000}
                        value={editing.attackBurstIntervalMs ?? ""}
                        onChange={(e) =>
                          updateWeaponField(
                            "attackBurstIntervalMs",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="w-full disabled:opacity-40"
                        disabled={!isBurstPattern}
                      />
                    </Field>
                    <Field label="AOE Radius">
                      <input
                        type="number"
                        min={0}
                        max={1200}
                        value={editing.attackAoeRadius ?? ""}
                        onChange={(e) =>
                          updateWeaponField(
                            "attackAoeRadius",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="w-full disabled:opacity-40"
                        disabled={!isAoePattern}
                      />
                    </Field>
                    <Field label="AOE Delay (ms)">
                      <input
                        type="number"
                        min={0}
                        max={10000}
                        value={editing.attackAoeDelayMs ?? ""}
                        onChange={(e) =>
                          updateWeaponField(
                            "attackAoeDelayMs",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="w-full disabled:opacity-40"
                        disabled={!isAoePattern}
                      />
                    </Field>
                  </div>

                  {resolvedEditingAttack && (
                    <p className="mt-3 text-[10px] text-muted">
                      {
                        ATTACK_PATTERN_METADATA[
                          resolvedEditingAttack.attackPatternId
                        ].description
                      }
                    </p>
                  )}
                </div>
              )}

              {/* Armor Stats (conditional) */}
              {isArmor && (
                <div className="editor-panel p-4 animate-fade-in">
                  <h3 className="text-vec-cyan text-[10px] uppercase tracking-widest mb-3">
                    Armor Stats
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Max HP Bonus">
                      <input
                        type="number"
                        min={0}
                        value={editing.armorMaxHpFlat ?? ""}
                        onChange={(e) =>
                          updateField(
                            "armorMaxHpFlat",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="w-full"
                      />
                    </Field>
                    <Field
                      label={`Damage Reduction % (0-${MAX_ARMOR_DAMAGE_REDUCTION_PERCENT})`}
                    >
                      <input
                        type="number"
                        min={0}
                        max={MAX_ARMOR_DAMAGE_REDUCTION_PERCENT}
                        value={editing.armorDamageReductionPercent ?? ""}
                        onChange={(e) =>
                          updateField(
                            "armorDamageReductionPercent",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="w-full"
                      />
                    </Field>
                  </div>
                </div>
              )}

              {isPotion && (
                <div className="editor-panel p-4 animate-fade-in">
                  <h3 className="text-vec-green text-[10px] uppercase tracking-widest mb-3">
                    Potion Stats
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="HP Restore">
                      <input
                        type="number"
                        min={1}
                        value={editing.potionHealFlat ?? ""}
                        onChange={(e) =>
                          updateField(
                            "potionHealFlat",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="w-full"
                      />
                    </Field>
                  </div>
                </div>
              )}

              {/* DPS Comparison */}
              {items && items.length > 0 && (
                <DpsComparisonChart items={items} />
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
