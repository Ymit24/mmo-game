import type { Database } from "bun:sqlite";
import type { EnemyArchetype } from "@mmo/shared";

interface EnemyArchetypeRow {
  id: string;
  name: string;
  max_health: number;
  damage: number;
  speed: number;
  detection_radius: number;
  leash_radius: number;
  attack_speed_ms: number;
  can_melee: number;
  can_ranged: number;
  visual_width: number;
  visual_height: number;
  color_hex: string;
}

function mapEnemyArchetype(row: EnemyArchetypeRow): EnemyArchetype {
  return {
    id: row.id,
    name: row.name,
    maxHealth: row.max_health,
    damage: row.damage,
    speed: row.speed,
    detectionRadius: row.detection_radius,
    leashRadius: row.leash_radius,
    attackSpeedMs: row.attack_speed_ms,
    canMelee: row.can_melee === 1,
    canRanged: row.can_ranged === 1,
    visualWidth: row.visual_width,
    visualHeight: row.visual_height,
    colorHex: row.color_hex,
  };
}

export function findEnemyArchetypeById(
  db: Database,
  archetypeId: string,
): EnemyArchetype | null {
  const row = db
    .query<EnemyArchetypeRow, [string]>(
      `SELECT
         id,
         name,
         max_health,
         damage,
         speed,
         detection_radius,
         leash_radius,
         attack_speed_ms,
         can_melee,
         can_ranged,
         visual_width,
         visual_height,
         color_hex
       FROM enemy_archetypes
       WHERE id = ?1
       LIMIT 1`,
    )
    .get(archetypeId);

  return row ? mapEnemyArchetype(row) : null;
}
