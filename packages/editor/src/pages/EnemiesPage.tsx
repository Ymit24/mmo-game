import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type EnemyArchetype,
  type ItemDefinition,
  type LevelProgressionRow,
  type LootEntry,
  type LootTable,
  createEnemy,
  deleteEnemy,
  getLevelProgression,
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

type DetailTab = "stats" | "loot" | "combat";

/* ─── Combat simulation helpers ────────────────────────────────── */

const CLASS_BASE_STATS: Record<
  string,
  { maxHp: number; damage: number; speedMs: number; range: number }
> = {
  knight: { maxHp: 180, damage: 24, speedMs: 600, range: 60 },
  mage: { maxHp: 110, damage: 18, speedMs: 820, range: 360 },
};

function computePlayerStats(
  characterClass: string,
  level: number,
  weapon: ItemDefinition | null,
  progression: LevelProgressionRow[],
): {
  maxHp: number;
  damage: number;
  speedMs: number;
  range: number;
  dps: number;
} {
  const base = CLASS_BASE_STATS[characterClass];
  if (!base) return { maxHp: 0, damage: 0, speedMs: 0, range: 0, dps: 0 };

  // Level scaling
  const row = progression.find((r) => r.level === level);
  const hpMult = row?.hpMultiplier ?? 1;
  const dmgMult = row?.damageMultiplier ?? 1;

  const scaledHp = Math.max(1, Math.round(base.maxHp * hpMult));
  const scaledDmg = Math.max(0, Math.round(base.damage * dmgMult * 100) / 100);

  // Weapon modifiers
  const weaponDmg =
    weapon?.type === "weapon" ? (weapon.weaponDamageFlat ?? 0) : 0;
  const weaponRange =
    weapon?.type === "weapon" ? (weapon.weaponRangeFlat ?? 0) : 0;
  const weaponSpeed =
    weapon?.type === "weapon" ? (weapon.weaponSpeedPercent ?? 0) : 0;

  const totalDmg = Math.max(0, scaledDmg + weaponDmg);
  const totalRange = Math.max(1, base.range + weaponRange);
  const speedFactor = 1 - weaponSpeed / 100;
  const totalSpeedMs = Math.max(
    200,
    Math.round(base.speedMs * Math.max(0.05, speedFactor)),
  );
  const dps = totalSpeedMs > 0 ? (totalDmg / totalSpeedMs) * 1000 : 0;

  return {
    maxHp: scaledHp,
    damage: totalDmg,
    speedMs: totalSpeedMs,
    range: totalRange,
    dps,
  };
}

function computeSimResults(
  player: { maxHp: number; damage: number; speedMs: number; dps: number },
  enemy: EnemyArchetype,
): {
  playerDps: number;
  enemyDps: number;
  hitsToKillEnemy: number;
  hitsToKillPlayer: number;
  timeToKillEnemy: number;
  timeToKillPlayer: number;
  playerWins: boolean;
  overkillHpPercent: number;
} {
  const enemyDps =
    enemy.attackSpeedMs > 0 ? (enemy.damage / enemy.attackSpeedMs) * 1000 : 0;
  const hitsToKillEnemy =
    player.damage > 0
      ? Math.ceil(enemy.maxHealth / player.damage)
      : Number.POSITIVE_INFINITY;
  const hitsToKillPlayer =
    enemy.damage > 0
      ? Math.ceil(player.maxHp / enemy.damage)
      : Number.POSITIVE_INFINITY;
  const timeToKillEnemy =
    player.damage > 0 && player.speedMs > 0
      ? (hitsToKillEnemy - 1) * player.speedMs
      : Number.POSITIVE_INFINITY;
  const timeToKillPlayer =
    enemy.damage > 0 && enemy.attackSpeedMs > 0
      ? (hitsToKillPlayer - 1) * enemy.attackSpeedMs
      : Number.POSITIVE_INFINITY;
  const playerWins =
    timeToKillEnemy < timeToKillPlayer ||
    (timeToKillEnemy === timeToKillPlayer && true);

  // How much HP the player has left (or is overkilled by) as %
  const damageTakenDuringFight =
    timeToKillEnemy !== Number.POSITIVE_INFINITY && enemy.attackSpeedMs > 0
      ? Math.floor(timeToKillEnemy / enemy.attackSpeedMs + 1) * enemy.damage
      : 0;
  const playerHpRemaining = player.maxHp - damageTakenDuringFight;
  const overkillHpPercent =
    player.maxHp > 0 ? (playerHpRemaining / player.maxHp) * 100 : 0;

  return {
    playerDps: player.dps,
    enemyDps,
    hitsToKillEnemy,
    hitsToKillPlayer,
    timeToKillEnemy,
    timeToKillPlayer,
    playerWins,
    overkillHpPercent,
  };
}

export function EnemiesPage() {
  const { data: enemies, loading, error, refetch } = useAsyncData(listEnemies);
  const { data: items } = useAsyncData(listItems);
  const { data: progression } = useAsyncData(getLevelProgression);
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
                <button
                  type="button"
                  className={`px-4 py-2 text-[11px] uppercase tracking-wider transition-colors border-b-2 -mb-px ${
                    detailTab === "combat"
                      ? "border-b-danger text-danger"
                      : "border-b-transparent text-muted hover:text-text"
                  }`}
                  onClick={() => setDetailTab("combat")}
                >
                  Combat Sim
                </button>
              </div>
            )}

            {/* Stats Tab */}
            {(isNew || detailTab === "stats") && (
              <>
                {/* Identity + Visual preview: compact header row */}
                <div className="editor-panel p-4 mb-4">
                  <div className="flex items-start gap-6">
                    {/* Preview block */}
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <div
                        className="border border-border"
                        style={{
                          width: Math.min(editing.visualWidth * 2, 96),
                          height: Math.min(editing.visualHeight * 2, 96),
                          backgroundColor: editing.colorHex,
                          boxShadow: `0 0 12px ${editing.colorHex}44`,
                        }}
                      />
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={editing.colorHex}
                          onChange={(e) =>
                            updateField("colorHex", e.target.value)
                          }
                          className="w-5 h-5 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={editing.colorHex}
                          onChange={(e) =>
                            updateField("colorHex", e.target.value)
                          }
                          className="w-20 text-[10px] px-1 py-0.5"
                        />
                      </div>
                    </div>

                    {/* Identity + visual size fields */}
                    <div className="flex-1 grid grid-cols-2 gap-3">
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
                      <Field label="Visual Width">
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
                      <Field label="Visual Height">
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
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
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
                </div>
              </>
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

            {/* Combat Simulator Tab */}
            {!isNew && detailTab === "combat" && selected && (
              <CombatSimulator
                enemy={selected}
                items={items ?? []}
                progression={progression ?? []}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Combat Simulator ──────────────────────────────────────────── */

function CombatSimulator({
  enemy,
  items,
  progression,
}: {
  enemy: EnemyArchetype;
  items: ItemDefinition[];
  progression: LevelProgressionRow[];
}) {
  const [playerClass, setPlayerClass] = useState<string>("knight");
  const [playerLevel, setPlayerLevel] = useState<number>(enemy.level);
  const [weaponId, setWeaponId] = useState<string>("");

  // Reset player level when enemy changes
  useEffect(() => {
    setPlayerLevel(enemy.level);
  }, [enemy.level]);

  const availableWeapons = useMemo(
    () =>
      items.filter(
        (i) =>
          i.type === "weapon" &&
          (!i.classRequirement || i.classRequirement === playerClass),
      ),
    [items, playerClass],
  );

  const weapon = useMemo(
    () => availableWeapons.find((w) => w.id === weaponId) ?? null,
    [availableWeapons, weaponId],
  );

  const playerStats = useMemo(
    () => computePlayerStats(playerClass, playerLevel, weapon, progression),
    [playerClass, playerLevel, weapon, progression],
  );

  const sim = useMemo(
    () => computeSimResults(playerStats, enemy),
    [playerStats, enemy],
  );

  // Sweep across levels 1-60 to find breakpoints
  const levelSweep = useMemo(() => {
    const results: Array<{
      level: number;
      wins: boolean;
      ttk: number;
      hpPercent: number;
    }> = [];
    for (let lv = 1; lv <= 60; lv++) {
      const ps = computePlayerStats(playerClass, lv, weapon, progression);
      const sr = computeSimResults(ps, enemy);
      results.push({
        level: lv,
        wins: sr.playerWins,
        ttk:
          sr.timeToKillEnemy === Number.POSITIVE_INFINITY
            ? 0
            : sr.timeToKillEnemy / 1000,
        hpPercent: sr.overkillHpPercent,
      });
    }
    return results;
  }, [playerClass, weapon, enemy, progression]);

  const minWinLevel = levelSweep.find((r) => r.wins)?.level ?? null;

  return (
    <div className="animate-fade-in flex flex-col gap-4">
      {/* Player config */}
      <div className="editor-panel p-4">
        <h3 className="text-danger text-[10px] uppercase tracking-widest mb-3">
          Player Configuration
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Class">
            <select
              value={playerClass}
              onChange={(e) => {
                setPlayerClass(e.target.value);
                setWeaponId("");
              }}
              className="w-full"
            >
              <option value="knight">Knight</option>
              <option value="mage">Mage</option>
            </select>
          </Field>
          <Field label="Level">
            <input
              type="number"
              min={1}
              max={60}
              value={playerLevel}
              onChange={(e) =>
                setPlayerLevel(
                  Math.max(1, Math.min(60, Number(e.target.value) || 1)),
                )
              }
              className="w-full"
            />
          </Field>
          <Field label="Weapon">
            <select
              value={weaponId}
              onChange={(e) => setWeaponId(e.target.value)}
              className="w-full"
            >
              <option value="">Unarmed</option>
              {availableWeapons.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.minLevelToEquip ? ` (Lv.${w.minLevelToEquip}+)` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* Result cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Player stats card */}
        <div className="editor-panel p-4">
          <h3 className="text-vec-green-dim text-[10px] uppercase tracking-widest mb-3">
            Player Stats ({playerClass} Lv.{playerLevel})
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <StatRow label="Max HP" value={playerStats.maxHp.toString()} />
            <StatRow label="Damage" value={playerStats.damage.toFixed(1)} />
            <StatRow label="Atk Speed" value={`${playerStats.speedMs}ms`} />
            <StatRow label="DPS" value={playerStats.dps.toFixed(1)} highlight />
          </div>
        </div>

        {/* Enemy stats card */}
        <div className="editor-panel p-4">
          <h3 className="text-vec-green-dim text-[10px] uppercase tracking-widest mb-3">
            Enemy Stats ({enemy.name} Lv.{enemy.level})
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <StatRow label="Max HP" value={enemy.maxHealth.toString()} />
            <StatRow label="Damage" value={enemy.damage.toString()} />
            <StatRow label="Atk Speed" value={`${enemy.attackSpeedMs}ms`} />
            <StatRow label="DPS" value={sim.enemyDps.toFixed(1)} highlight />
          </div>
        </div>
      </div>

      {/* Combat outcome */}
      <div
        className={`editor-panel p-4 border-l-4 ${sim.playerWins ? "border-l-success" : "border-l-danger"}`}
      >
        <div className="flex items-center justify-between mb-3">
          <h3
            className={`text-[10px] uppercase tracking-widest ${sim.playerWins ? "text-success" : "text-danger"}`}
          >
            {sim.playerWins ? "Player Wins" : "Player Loses"}
          </h3>
          {minWinLevel !== null && !sim.playerWins && (
            <span className="text-[10px] text-muted">
              Min win level:{" "}
              <span className="text-vec-green">{minWinLevel}</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div>
            <div className="text-muted text-[10px] uppercase mb-1">
              Hits to Kill
            </div>
            <div className="text-text-bright text-sm font-display">
              {sim.hitsToKillEnemy === Number.POSITIVE_INFINITY
                ? "--"
                : sim.hitsToKillEnemy}
            </div>
          </div>
          <div>
            <div className="text-muted text-[10px] uppercase mb-1">
              Time to Kill
            </div>
            <div className="text-text-bright text-sm font-display">
              {sim.timeToKillEnemy === Number.POSITIVE_INFINITY
                ? "--"
                : `${(sim.timeToKillEnemy / 1000).toFixed(1)}s`}
            </div>
          </div>
          <div>
            <div className="text-muted text-[10px] uppercase mb-1">
              Enemy TTK You
            </div>
            <div className="text-text-bright text-sm font-display">
              {sim.timeToKillPlayer === Number.POSITIVE_INFINITY
                ? "--"
                : `${(sim.timeToKillPlayer / 1000).toFixed(1)}s`}
            </div>
          </div>
          <div>
            <div className="text-muted text-[10px] uppercase mb-1">
              HP Remaining
            </div>
            <div
              className={`text-sm font-display ${sim.overkillHpPercent > 0 ? "text-success" : "text-danger"}`}
            >
              {sim.overkillHpPercent > 0
                ? `${Math.round(sim.overkillHpPercent)}%`
                : "Dead"}
            </div>
          </div>
        </div>

        {/* HP bar visual */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] text-muted w-12 shrink-0">Your HP</span>
          <div className="flex-1 h-3 bg-deep border border-border/50 overflow-hidden rounded-sm">
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${Math.max(0, Math.min(100, sim.overkillHpPercent))}%`,
                backgroundColor:
                  sim.overkillHpPercent > 50
                    ? "#34d399"
                    : sim.overkillHpPercent > 20
                      ? "#fbbf24"
                      : "#ef4444",
              }}
            />
          </div>
        </div>
      </div>

      {/* Level sweep chart: TTK and HP remaining across levels */}
      <div className="editor-panel p-4">
        <h3 className="text-vec-green-dim text-[10px] uppercase tracking-widest mb-3">
          Level Sweep vs {enemy.name}
        </h3>
        <LevelSweepChart
          data={levelSweep}
          enemyLevel={enemy.level}
          currentLevel={playerLevel}
        />
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/30">
      <span className="text-muted text-[10px] uppercase">{label}</span>
      <span
        className={`tabular-nums ${highlight ? "text-vec-green text-xs font-display" : "text-text-bright text-[11px]"}`}
      >
        {value}
      </span>
    </div>
  );
}

function LevelSweepChart({
  data,
  enemyLevel,
  currentLevel,
}: {
  data: Array<{
    level: number;
    wins: boolean;
    ttk: number;
    hpPercent: number;
  }>;
  enemyLevel: number;
  currentLevel: number;
}) {
  const W = 600;
  const H = 140;
  const PAD_L = 40;
  const PAD_R = 12;
  const PAD_T = 8;
  const PAD_B = 24;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const maxTtk = Math.max(...data.map((d) => d.ttk), 0.1);

  const toX = (level: number) => PAD_L + ((level - 1) / 59) * chartW;
  const ttkToY = (ttk: number) => PAD_T + chartH - (ttk / maxTtk) * chartH;
  const hpToY = (hp: number) =>
    PAD_T + chartH - (Math.max(-100, Math.min(100, hp)) / 100) * chartH;

  const ttkLine = data.map((d) => `${toX(d.level)},${ttkToY(d.ttk)}`).join(" ");
  const hpLine = data
    .map((d) => `${toX(d.level)},${hpToY(d.hpPercent)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ maxHeight: `${H}px` }}
      role="img"
      aria-label="Level sweep chart"
    >
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = PAD_T + chartH * (1 - frac);
        return (
          <line
            key={frac}
            x1={PAD_L}
            y1={y}
            x2={W - PAD_R}
            y2={y}
            stroke="var(--color-border)"
            strokeWidth={0.5}
          />
        );
      })}

      {/* Enemy level marker */}
      <line
        x1={toX(enemyLevel)}
        y1={PAD_T}
        x2={toX(enemyLevel)}
        y2={PAD_T + chartH}
        stroke="var(--color-danger)"
        strokeWidth={1}
        strokeDasharray="3,3"
        opacity={0.5}
      />
      <text
        x={toX(enemyLevel)}
        y={H - 2}
        textAnchor="middle"
        fontSize={8}
        fill="var(--color-danger)"
        fontFamily="var(--font-mono)"
      >
        E:{enemyLevel}
      </text>

      {/* Current player level marker */}
      <line
        x1={toX(currentLevel)}
        y1={PAD_T}
        x2={toX(currentLevel)}
        y2={PAD_T + chartH}
        stroke="var(--color-vec-green)"
        strokeWidth={1}
        strokeDasharray="3,3"
        opacity={0.5}
      />

      {/* X-axis labels */}
      {[1, 10, 20, 30, 40, 50, 60].map((lvl) => (
        <text
          key={lvl}
          x={toX(lvl)}
          y={H - 2}
          textAnchor="middle"
          fontSize={8}
          fill="var(--color-muted)"
          fontFamily="var(--font-mono)"
        >
          {lvl}
        </text>
      ))}

      {/* Win/loss zone coloring */}
      {data.map((d, i) => {
        if (i === 0) return null;
        const prev = data[i - 1];
        if (!prev) return null;
        return (
          <rect
            key={d.level}
            x={toX(prev.level)}
            y={PAD_T}
            width={chartW / 59}
            height={chartH}
            fill={d.wins ? "#34d399" : "#ef4444"}
            opacity={0.04}
          />
        );
      })}

      {/* TTK line */}
      <polyline
        points={ttkLine}
        fill="none"
        stroke="var(--color-vec-cyan)"
        strokeWidth={1.5}
      />

      {/* HP remaining line */}
      <polyline
        points={hpLine}
        fill="none"
        stroke="var(--color-success)"
        strokeWidth={1.5}
        strokeDasharray="4,2"
      />

      {/* Zero line for HP */}
      <line
        x1={PAD_L}
        y1={hpToY(0)}
        x2={W - PAD_R}
        y2={hpToY(0)}
        stroke="var(--color-muted)"
        strokeWidth={0.5}
        strokeDasharray="2,2"
      />
    </svg>
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
