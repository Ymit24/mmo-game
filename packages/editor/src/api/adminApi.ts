const BASE = "/api/admin";
const ADMIN_BEARER_TOKEN =
  import.meta.env.VITE_ADMIN_API_BEARER_TOKEN?.trim() ?? "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  headers.set("Content-Type", "application/json");
  if (ADMIN_BEARER_TOKEN) {
    headers.set("Authorization", `Bearer ${ADMIN_BEARER_TOKEN}`);
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Types ───────────────────────────────────────────────────────────

export interface EnemyArchetype {
  id: string;
  name: string;
  level: number;
  xpReward: number;
  maxHealth: number;
  damage: number;
  speed: number;
  detectionRadius: number;
  leashRadius: number;
  attackSpeedMs: number;
  meleeRange: number;
  rangedRange: number;
  canMelee: boolean;
  canRanged: boolean;
  visualWidth: number;
  visualHeight: number;
  colorHex: string;
}

export interface ItemDefinition {
  id: string;
  name: string;
  iconKey: string;
  type: string;
  classRequirement: string | null;
  minLevelToEquip: number | null;
  weaponDamageFlat: number | null;
  weaponRangeFlat: number | null;
  weaponSpeedPercent: number | null;
}

export interface LootEntry {
  id: string;
  itemDefinitionId: string;
  weight: number;
  classAffinity: string | null;
}

export interface LootTable {
  enemyArchetypeId: string;
  dropChance: number;
  entries: LootEntry[];
}

export interface LevelProgressionRow {
  level: number;
  xpToNextLevel: number | null;
  hpMultiplier: number;
  damageMultiplier: number;
}

export interface MapSummary {
  id: string;
  name: string;
}

export interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  background: {
    color: string;
    gridSize: number;
  };
  combat: {
    allowCombat: boolean;
    pvpEnabled: boolean;
  };
  playerSpawnId: string;
  spawnPoints: Array<Record<string, unknown>>;
  collisions: Array<Record<string, unknown>>;
  regions: Array<Record<string, unknown>>;
  portals: Array<Record<string, unknown>>;
  enemySpawners: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

// ─── Enemies ─────────────────────────────────────────────────────────

export async function listEnemies(): Promise<EnemyArchetype[]> {
  const res = await request<{ enemies: EnemyArchetype[] }>("/enemies");
  return res.enemies;
}

export async function getEnemy(id: string): Promise<EnemyArchetype> {
  const res = await request<{ enemy: EnemyArchetype }>(
    `/enemies/${encodeURIComponent(id)}`,
  );
  return res.enemy;
}

export async function createEnemy(
  data: Partial<EnemyArchetype> & { id: string },
): Promise<EnemyArchetype> {
  const res = await request<{ enemy: EnemyArchetype }>("/enemies", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.enemy;
}

export async function updateEnemy(
  id: string,
  data: Partial<EnemyArchetype>,
): Promise<EnemyArchetype> {
  const res = await request<{ enemy: EnemyArchetype }>(
    `/enemies/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(data) },
  );
  return res.enemy;
}

export async function deleteEnemy(id: string): Promise<void> {
  await request<void>(`/enemies/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ─── Items ───────────────────────────────────────────────────────────

export async function listItems(): Promise<ItemDefinition[]> {
  const res = await request<{ items: ItemDefinition[] }>("/items");
  return res.items;
}

export async function getItem(id: string): Promise<ItemDefinition> {
  const res = await request<{ item: ItemDefinition }>(
    `/items/${encodeURIComponent(id)}`,
  );
  return res.item;
}

export async function createItem(
  data: Partial<ItemDefinition> & { id: string },
): Promise<ItemDefinition> {
  const res = await request<{ item: ItemDefinition }>("/items", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.item;
}

export async function updateItem(
  id: string,
  data: Partial<ItemDefinition>,
): Promise<ItemDefinition> {
  const res = await request<{ item: ItemDefinition }>(
    `/items/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(data) },
  );
  return res.item;
}

export async function deleteItem(id: string): Promise<void> {
  await request<void>(`/items/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ─── Loot Tables ─────────────────────────────────────────────────────

export async function listLootTables(): Promise<LootTable[]> {
  const res = await request<{ lootTables: LootTable[] }>("/loot-tables");
  return res.lootTables;
}

export async function getLootTable(enemyId: string): Promise<LootTable> {
  const res = await request<{ lootTable: LootTable }>(
    `/loot-tables/${encodeURIComponent(enemyId)}`,
  );
  return res.lootTable;
}

export async function upsertLootTable(
  enemyId: string,
  data: { dropChance: number; entries: Omit<LootEntry, "id">[] },
): Promise<LootTable> {
  const res = await request<{ lootTable: LootTable }>(
    `/loot-tables/${encodeURIComponent(enemyId)}`,
    { method: "PUT", body: JSON.stringify(data) },
  );
  return res.lootTable;
}

export async function deleteLootTable(enemyId: string): Promise<void> {
  await request<void>(`/loot-tables/${encodeURIComponent(enemyId)}`, {
    method: "DELETE",
  });
}

// ─── Level Progression ───────────────────────────────────────────────

export async function getLevelProgression(): Promise<LevelProgressionRow[]> {
  const res = await request<{ progression: LevelProgressionRow[] }>(
    "/level-progression",
  );
  return res.progression;
}

export async function updateLevelProgression(
  progression: LevelProgressionRow[],
): Promise<LevelProgressionRow[]> {
  const res = await request<{ progression: LevelProgressionRow[] }>(
    "/level-progression",
    { method: "PUT", body: JSON.stringify({ progression }) },
  );
  return res.progression;
}

// ─── Maps ────────────────────────────────────────────────────────────

export async function listMaps(): Promise<MapSummary[]> {
  const res = await request<{ maps: MapSummary[] }>("/maps");
  return res.maps;
}

export async function getMap(id: string): Promise<MapData> {
  const res = await request<{ map: MapData }>(
    `/maps/${encodeURIComponent(id)}`,
  );
  return res.map;
}

export async function createMap(
  data: Partial<MapData> & { id: string },
): Promise<MapData> {
  const res = await request<{ map: MapData }>("/maps", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.map;
}

export async function updateMap(id: string, data: MapData): Promise<MapData> {
  const res = await request<{ map: MapData }>(
    `/maps/${encodeURIComponent(id)}`,
    { method: "PUT", body: JSON.stringify(data) },
  );
  return res.map;
}

export async function deleteMap(id: string): Promise<void> {
  await request<void>(`/maps/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
