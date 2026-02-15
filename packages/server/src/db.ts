import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MAX_CHARACTER_LEVEL, getLevelProgressionTable } from "@mmo/shared";

const CONTENT_SEED_TIMESTAMP = "2026-02-15T21:00:00Z";

const ITEM_DEFINITION_SEEDS = [
  {
    id: "w_kn_001_rusty_sword",
    name: "Rusty Sword",
    iconKey: "weapon_sword_rusty",
    classRequirement: "knight",
    minLevelToEquip: 1,
    weaponDamageFlat: 1.5,
    weaponRangeFlat: 1.8,
    weaponSpeedPercent: 0,
  },
  {
    id: "w_kn_006_iron_sword",
    name: "Iron Sword",
    iconKey: "weapon_sword_iron",
    classRequirement: "knight",
    minLevelToEquip: 6,
    weaponDamageFlat: 6.0,
    weaponRangeFlat: 1.9,
    weaponSpeedPercent: 2,
  },
  {
    id: "w_kn_011_steel_blade",
    name: "Steel Blade",
    iconKey: "weapon_sword_steel",
    classRequirement: "knight",
    minLevelToEquip: 11,
    weaponDamageFlat: 14.0,
    weaponRangeFlat: 2.0,
    weaponSpeedPercent: 3,
  },
  {
    id: "w_kn_016_knight_sabre",
    name: "Knight Sabre",
    iconKey: "weapon_sabre",
    classRequirement: "knight",
    minLevelToEquip: 16,
    weaponDamageFlat: 28.0,
    weaponRangeFlat: 2.1,
    weaponSpeedPercent: 4,
  },
  {
    id: "w_kn_021_war_axe",
    name: "War Axe",
    iconKey: "weapon_axe",
    classRequirement: "knight",
    minLevelToEquip: 21,
    weaponDamageFlat: 52.0,
    weaponRangeFlat: 2.0,
    weaponSpeedPercent: -3,
  },
  {
    id: "w_kn_026_greatsword",
    name: "Greatsword",
    iconKey: "weapon_greatsword",
    classRequirement: "knight",
    minLevelToEquip: 26,
    weaponDamageFlat: 92.0,
    weaponRangeFlat: 2.3,
    weaponSpeedPercent: -5,
  },
  {
    id: "w_kn_031_crusader_blade",
    name: "Crusader Blade",
    iconKey: "weapon_sword_crusader",
    classRequirement: "knight",
    minLevelToEquip: 31,
    weaponDamageFlat: 160.0,
    weaponRangeFlat: 2.2,
    weaponSpeedPercent: 2,
  },
  {
    id: "w_kn_036_drake_cleaver",
    name: "Drake Cleaver",
    iconKey: "weapon_cleaver_drake",
    classRequirement: "knight",
    minLevelToEquip: 36,
    weaponDamageFlat: 270.0,
    weaponRangeFlat: 2.3,
    weaponSpeedPercent: -2,
  },
  {
    id: "w_kn_041_obsidian_edge",
    name: "Obsidian Edge",
    iconKey: "weapon_sword_obsidian",
    classRequirement: "knight",
    minLevelToEquip: 41,
    weaponDamageFlat: 440.0,
    weaponRangeFlat: 2.2,
    weaponSpeedPercent: 3,
  },
  {
    id: "w_kn_046_titan_slayer",
    name: "Titan Slayer",
    iconKey: "weapon_greatsword_titan",
    classRequirement: "knight",
    minLevelToEquip: 46,
    weaponDamageFlat: 720.0,
    weaponRangeFlat: 2.4,
    weaponSpeedPercent: -3,
  },
  {
    id: "w_kn_051_void_brand",
    name: "Void Brand",
    iconKey: "weapon_sword_void",
    classRequirement: "knight",
    minLevelToEquip: 51,
    weaponDamageFlat: 1120.0,
    weaponRangeFlat: 2.3,
    weaponSpeedPercent: 4,
  },
  {
    id: "w_kn_056_kingbreaker",
    name: "Kingbreaker",
    iconKey: "weapon_sword_kingbreaker",
    classRequirement: "knight",
    minLevelToEquip: 56,
    weaponDamageFlat: 1700.0,
    weaponRangeFlat: 2.5,
    weaponSpeedPercent: 0,
  },
  {
    id: "w_mg_001_apprentice_staff",
    name: "Apprentice Staff",
    iconKey: "weapon_staff_apprentice",
    classRequirement: "mage",
    minLevelToEquip: 1,
    weaponDamageFlat: 1.2,
    weaponRangeFlat: 7.0,
    weaponSpeedPercent: 0,
  },
  {
    id: "w_mg_006_oak_wand",
    name: "Oak Wand",
    iconKey: "weapon_wand_oak",
    classRequirement: "mage",
    minLevelToEquip: 6,
    weaponDamageFlat: 5.0,
    weaponRangeFlat: 7.5,
    weaponSpeedPercent: 4,
  },
  {
    id: "w_mg_011_focus_rod",
    name: "Focus Rod",
    iconKey: "weapon_rod_focus",
    classRequirement: "mage",
    minLevelToEquip: 11,
    weaponDamageFlat: 12.0,
    weaponRangeFlat: 8.0,
    weaponSpeedPercent: 5,
  },
  {
    id: "w_mg_016_arcane_staff",
    name: "Arcane Staff",
    iconKey: "weapon_staff_arcane",
    classRequirement: "mage",
    minLevelToEquip: 16,
    weaponDamageFlat: 24.0,
    weaponRangeFlat: 8.5,
    weaponSpeedPercent: 6,
  },
  {
    id: "w_mg_021_frost_scepter",
    name: "Frost Scepter",
    iconKey: "weapon_scepter_frost",
    classRequirement: "mage",
    minLevelToEquip: 21,
    weaponDamageFlat: 46.0,
    weaponRangeFlat: 9.0,
    weaponSpeedPercent: 3,
  },
  {
    id: "w_mg_026_storm_wand",
    name: "Storm Wand",
    iconKey: "weapon_wand_storm",
    classRequirement: "mage",
    minLevelToEquip: 26,
    weaponDamageFlat: 84.0,
    weaponRangeFlat: 9.5,
    weaponSpeedPercent: 6,
  },
  {
    id: "w_mg_031_sunfire_staff",
    name: "Sunfire Staff",
    iconKey: "weapon_staff_sunfire",
    classRequirement: "mage",
    minLevelToEquip: 31,
    weaponDamageFlat: 150.0,
    weaponRangeFlat: 10.0,
    weaponSpeedPercent: 4,
  },
  {
    id: "w_mg_036_eldritch_tome",
    name: "Eldritch Tome",
    iconKey: "weapon_tome_eldritch",
    classRequirement: "mage",
    minLevelToEquip: 36,
    weaponDamageFlat: 260.0,
    weaponRangeFlat: 10.5,
    weaponSpeedPercent: 2,
  },
  {
    id: "w_mg_041_astral_wand",
    name: "Astral Wand",
    iconKey: "weapon_wand_astral",
    classRequirement: "mage",
    minLevelToEquip: 41,
    weaponDamageFlat: 430.0,
    weaponRangeFlat: 11.0,
    weaponSpeedPercent: 5,
  },
  {
    id: "w_mg_046_lich_baton",
    name: "Lich Baton",
    iconKey: "weapon_baton_lich",
    classRequirement: "mage",
    minLevelToEquip: 46,
    weaponDamageFlat: 700.0,
    weaponRangeFlat: 11.5,
    weaponSpeedPercent: 3,
  },
  {
    id: "w_mg_051_void_orb",
    name: "Void Orb",
    iconKey: "weapon_orb_void",
    classRequirement: "mage",
    minLevelToEquip: 51,
    weaponDamageFlat: 1100.0,
    weaponRangeFlat: 12.0,
    weaponSpeedPercent: 4,
  },
  {
    id: "w_mg_056_worldspark_staff",
    name: "Worldspark Staff",
    iconKey: "weapon_staff_worldspark",
    classRequirement: "mage",
    minLevelToEquip: 56,
    weaponDamageFlat: 1680.0,
    weaponRangeFlat: 12.5,
    weaponSpeedPercent: 2,
  },
] as const;

const ENEMY_ARCHETYPE_SEEDS = [
  {
    id: "e_001_slime",
    name: "Green Slime",
    level: 1,
    xpReward: 10,
    maxHealth: 12,
    damage: 1.2,
    speed: 52,
    detectionRadius: 100,
    leashRadius: 180,
    attackSpeedMs: 1200,
    meleeRange: 26,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 20,
    visualHeight: 18,
    colorHex: "#43c76b",
  },
  {
    id: "e_003_wolf",
    name: "Wild Wolf",
    level: 3,
    xpReward: 18,
    maxHealth: 34,
    damage: 2.4,
    speed: 68,
    detectionRadius: 120,
    leashRadius: 220,
    attackSpeedMs: 1000,
    meleeRange: 32,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 24,
    visualHeight: 16,
    colorHex: "#8a8f99",
  },
  {
    id: "e_006_bandit",
    name: "Road Bandit",
    level: 6,
    xpReward: 32,
    maxHealth: 95,
    damage: 4.6,
    speed: 60,
    detectionRadius: 140,
    leashRadius: 260,
    attackSpeedMs: 900,
    meleeRange: 34,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 20,
    visualHeight: 36,
    colorHex: "#6b4e3d",
  },
  {
    id: "e_008_bandit_archer",
    name: "Bandit Archer",
    level: 8,
    xpReward: 45,
    maxHealth: 125,
    damage: 4.0,
    speed: 56,
    detectionRadius: 160,
    leashRadius: 280,
    attackSpeedMs: 1200,
    meleeRange: 30,
    rangedRange: 170,
    canMelee: 0,
    canRanged: 1,
    visualWidth: 20,
    visualHeight: 36,
    colorHex: "#7a5a44",
  },
  {
    id: "e_010_forest_ogre",
    name: "Forest Ogre (Boss)",
    level: 10,
    xpReward: 140,
    maxHealth: 320,
    damage: 8.5,
    speed: 44,
    detectionRadius: 180,
    leashRadius: 340,
    attackSpeedMs: 1400,
    meleeRange: 44,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 52,
    visualHeight: 52,
    colorHex: "#2f6f3a",
  },
  {
    id: "e_012_scorpion",
    name: "Canyon Scorpion",
    level: 12,
    xpReward: 75,
    maxHealth: 520,
    damage: 11.5,
    speed: 60,
    detectionRadius: 160,
    leashRadius: 280,
    attackSpeedMs: 1100,
    meleeRange: 32,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 24,
    visualHeight: 16,
    colorHex: "#b07d2a",
  },
  {
    id: "e_015_marauder",
    name: "Canyon Marauder",
    level: 15,
    xpReward: 100,
    maxHealth: 820,
    damage: 15.5,
    speed: 60,
    detectionRadius: 180,
    leashRadius: 300,
    attackSpeedMs: 950,
    meleeRange: 36,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 22,
    visualHeight: 38,
    colorHex: "#8c3b2f",
  },
  {
    id: "e_018_rock_golem",
    name: "Rock Golem",
    level: 18,
    xpReward: 140,
    maxHealth: 1350,
    damage: 21.0,
    speed: 42,
    detectionRadius: 180,
    leashRadius: 340,
    attackSpeedMs: 1500,
    meleeRange: 42,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 44,
    visualHeight: 48,
    colorHex: "#7a6f66",
  },
  {
    id: "e_019_sharpshooter",
    name: "Desert Sharpshooter",
    level: 19,
    xpReward: 170,
    maxHealth: 1200,
    damage: 18.0,
    speed: 54,
    detectionRadius: 220,
    leashRadius: 400,
    attackSpeedMs: 1100,
    meleeRange: 30,
    rangedRange: 200,
    canMelee: 0,
    canRanged: 1,
    visualWidth: 20,
    visualHeight: 38,
    colorHex: "#a06a2a",
  },
  {
    id: "e_020_sand_wyrm",
    name: "Sand Wyrm (Boss)",
    level: 20,
    xpReward: 420,
    maxHealth: 2600,
    damage: 28.0,
    speed: 48,
    detectionRadius: 220,
    leashRadius: 400,
    attackSpeedMs: 1300,
    meleeRange: 48,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 64,
    visualHeight: 44,
    colorHex: "#caa24a",
  },
  {
    id: "e_022_ice_imp",
    name: "Ice Imp",
    level: 22,
    xpReward: 220,
    maxHealth: 3800,
    damage: 34.0,
    speed: 62,
    detectionRadius: 200,
    leashRadius: 360,
    attackSpeedMs: 950,
    meleeRange: 32,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 20,
    visualHeight: 22,
    colorHex: "#87c7ff",
  },
  {
    id: "e_025_frostwolf",
    name: "Frostwolf",
    level: 25,
    xpReward: 280,
    maxHealth: 5600,
    damage: 42.0,
    speed: 68,
    detectionRadius: 220,
    leashRadius: 400,
    attackSpeedMs: 900,
    meleeRange: 34,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 26,
    visualHeight: 18,
    colorHex: "#b8d6ff",
  },
  {
    id: "e_028_snow_knight",
    name: "Snowbound Knight",
    level: 28,
    xpReward: 360,
    maxHealth: 8200,
    damage: 55.0,
    speed: 56,
    detectionRadius: 220,
    leashRadius: 420,
    attackSpeedMs: 950,
    meleeRange: 36,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 24,
    visualHeight: 40,
    colorHex: "#d2d7df",
  },
  {
    id: "e_029_ice_mage",
    name: "Ice Channeler",
    level: 29,
    xpReward: 420,
    maxHealth: 7600,
    damage: 52.0,
    speed: 52,
    detectionRadius: 240,
    leashRadius: 460,
    attackSpeedMs: 1200,
    meleeRange: 28,
    rangedRange: 230,
    canMelee: 0,
    canRanged: 1,
    visualWidth: 22,
    visualHeight: 40,
    colorHex: "#7aa7ff",
  },
  {
    id: "e_030_yeti",
    name: "Ancient Yeti (Boss)",
    level: 30,
    xpReward: 950,
    maxHealth: 15500,
    damage: 72.0,
    speed: 52,
    detectionRadius: 240,
    leashRadius: 460,
    attackSpeedMs: 1400,
    meleeRange: 46,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 60,
    visualHeight: 60,
    colorHex: "#ffffff",
  },
  {
    id: "e_032_ash_sprite",
    name: "Ash Sprite",
    level: 32,
    xpReward: 560,
    maxHealth: 22000,
    damage: 86.0,
    speed: 64,
    detectionRadius: 240,
    leashRadius: 460,
    attackSpeedMs: 900,
    meleeRange: 30,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 20,
    visualHeight: 20,
    colorHex: "#ff6b3d",
  },
  {
    id: "e_035_lava_hound",
    name: "Lava Hound",
    level: 35,
    xpReward: 680,
    maxHealth: 31000,
    damage: 102.0,
    speed: 68,
    detectionRadius: 260,
    leashRadius: 500,
    attackSpeedMs: 900,
    meleeRange: 34,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 28,
    visualHeight: 20,
    colorHex: "#ff3b2f",
  },
  {
    id: "e_038_flame_legion",
    name: "Flame Legionnaire",
    level: 38,
    xpReward: 850,
    maxHealth: 46000,
    damage: 125.0,
    speed: 60,
    detectionRadius: 260,
    leashRadius: 520,
    attackSpeedMs: 950,
    meleeRange: 38,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 24,
    visualHeight: 42,
    colorHex: "#d14a3a",
  },
  {
    id: "e_039_pyromancer",
    name: "Pyromancer",
    level: 39,
    xpReward: 980,
    maxHealth: 42000,
    damage: 120.0,
    speed: 56,
    detectionRadius: 280,
    leashRadius: 560,
    attackSpeedMs: 1150,
    meleeRange: 28,
    rangedRange: 240,
    canMelee: 0,
    canRanged: 1,
    visualWidth: 22,
    visualHeight: 40,
    colorHex: "#ff915e",
  },
  {
    id: "e_040_magma_titan",
    name: "Magma Titan (Boss)",
    level: 40,
    xpReward: 2100,
    maxHealth: 90000,
    damage: 170.0,
    speed: 46,
    detectionRadius: 280,
    leashRadius: 560,
    attackSpeedMs: 1500,
    meleeRange: 52,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 72,
    visualHeight: 72,
    colorHex: "#6b1d1d",
  },
  {
    id: "e_042_swamp_ghoul",
    name: "Swamp Ghoul",
    level: 42,
    xpReward: 1250,
    maxHealth: 125000,
    damage: 205.0,
    speed: 60,
    detectionRadius: 280,
    leashRadius: 560,
    attackSpeedMs: 950,
    meleeRange: 36,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 24,
    visualHeight: 40,
    colorHex: "#4b6b3d",
  },
  {
    id: "e_045_wraith",
    name: "Marsh Wraith",
    level: 45,
    xpReward: 1500,
    maxHealth: 175000,
    damage: 240.0,
    speed: 64,
    detectionRadius: 300,
    leashRadius: 600,
    attackSpeedMs: 1000,
    meleeRange: 32,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 22,
    visualHeight: 42,
    colorHex: "#6f7a8f",
  },
  {
    id: "e_048_bog_knight",
    name: "Bog Knight",
    level: 48,
    xpReward: 1850,
    maxHealth: 250000,
    damage: 290.0,
    speed: 56,
    detectionRadius: 300,
    leashRadius: 600,
    attackSpeedMs: 950,
    meleeRange: 38,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 26,
    visualHeight: 44,
    colorHex: "#2f3b3f",
  },
  {
    id: "e_049_hex_shaman",
    name: "Hex Shaman",
    level: 49,
    xpReward: 2100,
    maxHealth: 235000,
    damage: 280.0,
    speed: 54,
    detectionRadius: 320,
    leashRadius: 660,
    attackSpeedMs: 1100,
    meleeRange: 28,
    rangedRange: 260,
    canMelee: 0,
    canRanged: 1,
    visualWidth: 22,
    visualHeight: 40,
    colorHex: "#8a4b9f",
  },
  {
    id: "e_050_mire_hydra",
    name: "Mire Hydra (Boss)",
    level: 50,
    xpReward: 4200,
    maxHealth: 520000,
    damage: 390.0,
    speed: 48,
    detectionRadius: 320,
    leashRadius: 660,
    attackSpeedMs: 1450,
    meleeRange: 50,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 80,
    visualHeight: 60,
    colorHex: "#1e5a3a",
  },
  {
    id: "e_052_voidling",
    name: "Voidling",
    level: 52,
    xpReward: 2600,
    maxHealth: 720000,
    damage: 460.0,
    speed: 66,
    detectionRadius: 320,
    leashRadius: 660,
    attackSpeedMs: 900,
    meleeRange: 34,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 20,
    visualHeight: 24,
    colorHex: "#3a2a6b",
  },
  {
    id: "e_055_cult_enforcer",
    name: "Cult Enforcer",
    level: 55,
    xpReward: 3100,
    maxHealth: 980000,
    damage: 520.0,
    speed: 60,
    detectionRadius: 340,
    leashRadius: 700,
    attackSpeedMs: 950,
    meleeRange: 38,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 24,
    visualHeight: 44,
    colorHex: "#5a2a3a",
  },
  {
    id: "e_058_void_sentinel",
    name: "Void Sentinel",
    level: 58,
    xpReward: 3800,
    maxHealth: 1350000,
    damage: 610.0,
    speed: 54,
    detectionRadius: 340,
    leashRadius: 720,
    attackSpeedMs: 1050,
    meleeRange: 42,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 32,
    visualHeight: 52,
    colorHex: "#2a2a2a",
  },
  {
    id: "e_059_void_binder",
    name: "Void Binder",
    level: 59,
    xpReward: 4200,
    maxHealth: 1280000,
    damage: 590.0,
    speed: 56,
    detectionRadius: 360,
    leashRadius: 760,
    attackSpeedMs: 1100,
    meleeRange: 28,
    rangedRange: 280,
    canMelee: 0,
    canRanged: 1,
    visualWidth: 24,
    visualHeight: 44,
    colorHex: "#3d2a5f",
  },
  {
    id: "e_060_citadel_overlord",
    name: "Citadel Overlord (Boss)",
    level: 60,
    xpReward: 9000,
    maxHealth: 2600000,
    damage: 820.0,
    speed: 50,
    detectionRadius: 360,
    leashRadius: 800,
    attackSpeedMs: 1400,
    meleeRange: 56,
    rangedRange: 20,
    canMelee: 1,
    canRanged: 0,
    visualWidth: 88,
    visualHeight: 88,
    colorHex: "#6b2ad1",
  },
] as const;

const ENEMY_ARCHETYPE_PROGRESSION_SEEDS = ENEMY_ARCHETYPE_SEEDS.map((seed) => ({
  id: seed.id,
  level: seed.level,
  xpReward: seed.xpReward,
}));

const ENEMY_LOOT_TABLE_SEEDS = [
  { enemyArchetypeId: "e_001_slime", dropChance: 0 },
  { enemyArchetypeId: "e_003_wolf", dropChance: 0 },
  { enemyArchetypeId: "e_006_bandit", dropChance: 0 },
  { enemyArchetypeId: "e_008_bandit_archer", dropChance: 0 },
  { enemyArchetypeId: "e_010_forest_ogre", dropChance: 1 },
  { enemyArchetypeId: "e_012_scorpion", dropChance: 0 },
  { enemyArchetypeId: "e_015_marauder", dropChance: 0 },
  { enemyArchetypeId: "e_018_rock_golem", dropChance: 0 },
  { enemyArchetypeId: "e_019_sharpshooter", dropChance: 0 },
  { enemyArchetypeId: "e_020_sand_wyrm", dropChance: 1 },
  { enemyArchetypeId: "e_022_ice_imp", dropChance: 0 },
  { enemyArchetypeId: "e_025_frostwolf", dropChance: 0 },
  { enemyArchetypeId: "e_028_snow_knight", dropChance: 0 },
  { enemyArchetypeId: "e_029_ice_mage", dropChance: 0 },
  { enemyArchetypeId: "e_030_yeti", dropChance: 1 },
  { enemyArchetypeId: "e_032_ash_sprite", dropChance: 0 },
  { enemyArchetypeId: "e_035_lava_hound", dropChance: 0 },
  { enemyArchetypeId: "e_038_flame_legion", dropChance: 0 },
  { enemyArchetypeId: "e_039_pyromancer", dropChance: 0 },
  { enemyArchetypeId: "e_040_magma_titan", dropChance: 1 },
  { enemyArchetypeId: "e_042_swamp_ghoul", dropChance: 0 },
  { enemyArchetypeId: "e_045_wraith", dropChance: 0 },
  { enemyArchetypeId: "e_048_bog_knight", dropChance: 0 },
  { enemyArchetypeId: "e_049_hex_shaman", dropChance: 0 },
  { enemyArchetypeId: "e_050_mire_hydra", dropChance: 1 },
  { enemyArchetypeId: "e_052_voidling", dropChance: 0 },
  { enemyArchetypeId: "e_055_cult_enforcer", dropChance: 0 },
  { enemyArchetypeId: "e_058_void_sentinel", dropChance: 0 },
  { enemyArchetypeId: "e_059_void_binder", dropChance: 0 },
  { enemyArchetypeId: "e_060_citadel_overlord", dropChance: 1 },
] as const;

const ENEMY_LOOT_ENTRY_SEEDS = [
  {
    id: "lte_001",
    enemyArchetypeId: "e_001_slime",
    itemDefinitionId: "w_kn_001_rusty_sword",
    weight: 1.0,
    classAffinity: "knight",
  },
  {
    id: "lte_002",
    enemyArchetypeId: "e_001_slime",
    itemDefinitionId: "w_mg_001_apprentice_staff",
    weight: 1.0,
    classAffinity: "mage",
  },
  {
    id: "lte_003",
    enemyArchetypeId: "e_006_bandit",
    itemDefinitionId: "w_kn_006_iron_sword",
    weight: 1.0,
    classAffinity: "knight",
  },
  {
    id: "lte_004",
    enemyArchetypeId: "e_008_bandit_archer",
    itemDefinitionId: "w_mg_006_oak_wand",
    weight: 1.0,
    classAffinity: "mage",
  },
  {
    id: "lte_005",
    enemyArchetypeId: "e_010_forest_ogre",
    itemDefinitionId: "w_kn_006_iron_sword",
    weight: 1.5,
    classAffinity: "knight",
  },
  {
    id: "lte_006",
    enemyArchetypeId: "e_010_forest_ogre",
    itemDefinitionId: "w_mg_006_oak_wand",
    weight: 1.5,
    classAffinity: "mage",
  },
  {
    id: "lte_011",
    enemyArchetypeId: "e_012_scorpion",
    itemDefinitionId: "w_kn_011_steel_blade",
    weight: 1.0,
    classAffinity: "knight",
  },
  {
    id: "lte_012",
    enemyArchetypeId: "e_015_marauder",
    itemDefinitionId: "w_mg_011_focus_rod",
    weight: 1.0,
    classAffinity: "mage",
  },
  {
    id: "lte_013",
    enemyArchetypeId: "e_018_rock_golem",
    itemDefinitionId: "w_kn_016_knight_sabre",
    weight: 1.0,
    classAffinity: "knight",
  },
  {
    id: "lte_014",
    enemyArchetypeId: "e_019_sharpshooter",
    itemDefinitionId: "w_mg_016_arcane_staff",
    weight: 1.0,
    classAffinity: "mage",
  },
  {
    id: "lte_015",
    enemyArchetypeId: "e_020_sand_wyrm",
    itemDefinitionId: "w_kn_016_knight_sabre",
    weight: 1.5,
    classAffinity: "knight",
  },
  {
    id: "lte_016",
    enemyArchetypeId: "e_020_sand_wyrm",
    itemDefinitionId: "w_mg_016_arcane_staff",
    weight: 1.5,
    classAffinity: "mage",
  },
  {
    id: "lte_021",
    enemyArchetypeId: "e_022_ice_imp",
    itemDefinitionId: "w_mg_021_frost_scepter",
    weight: 1.0,
    classAffinity: "mage",
  },
  {
    id: "lte_022",
    enemyArchetypeId: "e_025_frostwolf",
    itemDefinitionId: "w_kn_021_war_axe",
    weight: 1.0,
    classAffinity: "knight",
  },
  {
    id: "lte_023",
    enemyArchetypeId: "e_028_snow_knight",
    itemDefinitionId: "w_kn_026_greatsword",
    weight: 1.0,
    classAffinity: "knight",
  },
  {
    id: "lte_024",
    enemyArchetypeId: "e_029_ice_mage",
    itemDefinitionId: "w_mg_026_storm_wand",
    weight: 1.0,
    classAffinity: "mage",
  },
  {
    id: "lte_025",
    enemyArchetypeId: "e_030_yeti",
    itemDefinitionId: "w_kn_026_greatsword",
    weight: 1.5,
    classAffinity: "knight",
  },
  {
    id: "lte_026",
    enemyArchetypeId: "e_030_yeti",
    itemDefinitionId: "w_mg_026_storm_wand",
    weight: 1.5,
    classAffinity: "mage",
  },
  {
    id: "lte_031",
    enemyArchetypeId: "e_032_ash_sprite",
    itemDefinitionId: "w_mg_031_sunfire_staff",
    weight: 1.0,
    classAffinity: "mage",
  },
  {
    id: "lte_032",
    enemyArchetypeId: "e_035_lava_hound",
    itemDefinitionId: "w_kn_031_crusader_blade",
    weight: 1.0,
    classAffinity: "knight",
  },
  {
    id: "lte_033",
    enemyArchetypeId: "e_038_flame_legion",
    itemDefinitionId: "w_kn_036_drake_cleaver",
    weight: 1.0,
    classAffinity: "knight",
  },
  {
    id: "lte_034",
    enemyArchetypeId: "e_039_pyromancer",
    itemDefinitionId: "w_mg_036_eldritch_tome",
    weight: 1.0,
    classAffinity: "mage",
  },
  {
    id: "lte_035",
    enemyArchetypeId: "e_040_magma_titan",
    itemDefinitionId: "w_kn_036_drake_cleaver",
    weight: 1.5,
    classAffinity: "knight",
  },
  {
    id: "lte_036",
    enemyArchetypeId: "e_040_magma_titan",
    itemDefinitionId: "w_mg_036_eldritch_tome",
    weight: 1.5,
    classAffinity: "mage",
  },
  {
    id: "lte_041",
    enemyArchetypeId: "e_042_swamp_ghoul",
    itemDefinitionId: "w_kn_041_obsidian_edge",
    weight: 1.0,
    classAffinity: "knight",
  },
  {
    id: "lte_042",
    enemyArchetypeId: "e_045_wraith",
    itemDefinitionId: "w_mg_041_astral_wand",
    weight: 1.0,
    classAffinity: "mage",
  },
  {
    id: "lte_043",
    enemyArchetypeId: "e_048_bog_knight",
    itemDefinitionId: "w_kn_046_titan_slayer",
    weight: 1.0,
    classAffinity: "knight",
  },
  {
    id: "lte_044",
    enemyArchetypeId: "e_049_hex_shaman",
    itemDefinitionId: "w_mg_046_lich_baton",
    weight: 1.0,
    classAffinity: "mage",
  },
  {
    id: "lte_045",
    enemyArchetypeId: "e_050_mire_hydra",
    itemDefinitionId: "w_kn_046_titan_slayer",
    weight: 1.5,
    classAffinity: "knight",
  },
  {
    id: "lte_046",
    enemyArchetypeId: "e_050_mire_hydra",
    itemDefinitionId: "w_mg_046_lich_baton",
    weight: 1.5,
    classAffinity: "mage",
  },
  {
    id: "lte_051",
    enemyArchetypeId: "e_052_voidling",
    itemDefinitionId: "w_mg_051_void_orb",
    weight: 1.0,
    classAffinity: "mage",
  },
  {
    id: "lte_052",
    enemyArchetypeId: "e_055_cult_enforcer",
    itemDefinitionId: "w_kn_051_void_brand",
    weight: 1.0,
    classAffinity: "knight",
  },
  {
    id: "lte_053",
    enemyArchetypeId: "e_058_void_sentinel",
    itemDefinitionId: "w_kn_056_kingbreaker",
    weight: 1.0,
    classAffinity: "knight",
  },
  {
    id: "lte_054",
    enemyArchetypeId: "e_059_void_binder",
    itemDefinitionId: "w_mg_056_worldspark_staff",
    weight: 1.0,
    classAffinity: "mage",
  },
  {
    id: "lte_055",
    enemyArchetypeId: "e_060_citadel_overlord",
    itemDefinitionId: "w_kn_056_kingbreaker",
    weight: 1.5,
    classAffinity: "knight",
  },
  {
    id: "lte_056",
    enemyArchetypeId: "e_060_citadel_overlord",
    itemDefinitionId: "w_mg_056_worldspark_staff",
    weight: 1.5,
    classAffinity: "mage",
  },
] as const;

function ensureDatabaseDirectory(dbPath: string): void {
  if (dbPath === ":memory:" || dbPath.startsWith("file:")) {
    return;
  }

  const directory = dirname(dbPath);
  if (directory === ".") {
    return;
  }

  mkdirSync(directory, { recursive: true });
}

export function createDatabase(dbPath: string): Database {
  ensureDatabaseDirectory(dbPath);
  const db = new Database(dbPath, { create: true, strict: true });
  bootstrapDatabase(db);
  return db;
}

export function bootstrapDatabase(db: Database): void {
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      last_used_character_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  ensureUsersLastUsedCharacterColumn(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nickname TEXT NOT NULL,
      nickname_normalized TEXT NOT NULL,
      class TEXT NOT NULL CHECK (class IN ('knight', 'mage')),
      level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= ${MAX_CHARACTER_LEVEL}),
      xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
      max_hp REAL NOT NULL CHECK (max_hp > 0),
      base_damage REAL NOT NULL CHECK (base_damage >= 0),
      base_attack_speed_ms INTEGER NOT NULL CHECK (base_attack_speed_ms > 0),
      base_attack_range REAL NOT NULL CHECK (base_attack_range > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, nickname_normalized)
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_characters_user_id
    ON characters (user_id);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_characters_user_updated_at
    ON characters (user_id, updated_at DESC);
  `);
  ensureCharacterProgressionColumns(db);
  ensureItemDefinitionsTable(db);
  ensureCharacterInventoryTable(db);
  ensureItemDefinitionSeeds(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS enemy_archetypes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
      xp_reward INTEGER NOT NULL DEFAULT 10 CHECK (xp_reward >= 0),
      max_health REAL NOT NULL CHECK (max_health > 0),
      damage REAL NOT NULL CHECK (damage >= 0),
      speed REAL NOT NULL CHECK (speed > 0),
      detection_radius REAL NOT NULL CHECK (detection_radius > 0),
      leash_radius REAL NOT NULL CHECK (leash_radius > 0),
      attack_speed_ms INTEGER NOT NULL CHECK (attack_speed_ms > 0),
      melee_range REAL NOT NULL CHECK (melee_range > 0),
      ranged_range REAL NOT NULL CHECK (ranged_range > 0),
      can_melee INTEGER NOT NULL CHECK (can_melee IN (0, 1)),
      can_ranged INTEGER NOT NULL CHECK (can_ranged IN (0, 1)),
      visual_width REAL NOT NULL CHECK (visual_width > 0),
      visual_height REAL NOT NULL CHECK (visual_height > 0),
      color_hex TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (can_melee = 1 OR can_ranged = 1)
    );
  `);
  ensureEnemyArchetypeRangeColumns(db);
  ensureEnemyArchetypeProgressionColumns(db);
  backfillLegacyEnemyArchetypeProgression(db);
  ensureLevelProgressionTable(db);
  ensureLevelProgressionSeed(db);
  ensureEnemyArchetypeSeeds(db);
  ensureEnemyLootTables(db);
  ensureEnemyLootSeed(db);
}

function ensureUsersLastUsedCharacterColumn(db: Database): void {
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(users);")
    .all();
  const hasColumn = columns.some(
    (column) => column.name === "last_used_character_id",
  );
  if (!hasColumn) {
    db.exec("ALTER TABLE users ADD COLUMN last_used_character_id TEXT;");
  }
}

function ensureEnemyArchetypeSeeds(db: Database): void {
  const timestamp = CONTENT_SEED_TIMESTAMP;
  const seedStatement = db.query(
    `INSERT INTO enemy_archetypes (
      id,
      name,
      level,
      xp_reward,
      max_health,
      damage,
      speed,
      detection_radius,
      leash_radius,
      attack_speed_ms,
      melee_range,
      ranged_range,
      can_melee,
      can_ranged,
      visual_width,
      visual_height,
      color_hex,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       level = excluded.level,
       xp_reward = excluded.xp_reward,
       max_health = excluded.max_health,
       damage = excluded.damage,
       speed = excluded.speed,
       detection_radius = excluded.detection_radius,
       leash_radius = excluded.leash_radius,
       attack_speed_ms = excluded.attack_speed_ms,
       melee_range = excluded.melee_range,
       ranged_range = excluded.ranged_range,
       can_melee = excluded.can_melee,
       can_ranged = excluded.can_ranged,
       visual_width = excluded.visual_width,
       visual_height = excluded.visual_height,
       color_hex = excluded.color_hex,
       updated_at = excluded.updated_at`,
  );

  for (const seed of ENEMY_ARCHETYPE_SEEDS) {
    seedStatement.run(
      seed.id,
      seed.name,
      seed.level,
      seed.xpReward,
      seed.maxHealth,
      seed.damage,
      seed.speed,
      seed.detectionRadius,
      seed.leashRadius,
      seed.attackSpeedMs,
      seed.meleeRange,
      seed.rangedRange,
      seed.canMelee,
      seed.canRanged,
      seed.visualWidth,
      seed.visualHeight,
      seed.colorHex,
      timestamp,
      timestamp,
    );
  }
}

function ensureEnemyArchetypeRangeColumns(db: Database): void {
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(enemy_archetypes);")
    .all();
  const hasMeleeRange = columns.some((column) => column.name === "melee_range");
  const hasRangedRange = columns.some(
    (column) => column.name === "ranged_range",
  );

  if (!hasMeleeRange) {
    db.exec(
      "ALTER TABLE enemy_archetypes ADD COLUMN melee_range REAL NOT NULL DEFAULT 42;",
    );
  }

  if (!hasRangedRange) {
    db.exec(
      "ALTER TABLE enemy_archetypes ADD COLUMN ranged_range REAL NOT NULL DEFAULT 220;",
    );
  }
}

function ensureCharacterProgressionColumns(db: Database): void {
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(characters);")
    .all();
  const hasLevel = columns.some((column) => column.name === "level");
  const hasXp = columns.some((column) => column.name === "xp");

  if (!hasLevel) {
    db.exec(
      `ALTER TABLE characters ADD COLUMN level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= ${MAX_CHARACTER_LEVEL});`,
    );
  }

  if (!hasXp) {
    db.exec(
      "ALTER TABLE characters ADD COLUMN xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0);",
    );
  }
}

function ensureItemDefinitionsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS item_definitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon_key TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('weapon', 'armor', 'potion', 'misc')),
      class_requirement TEXT CHECK (class_requirement IS NULL OR class_requirement IN ('knight', 'mage')),
      min_level_to_equip INTEGER CHECK (min_level_to_equip IS NULL OR min_level_to_equip >= 1),
      weapon_damage_flat REAL,
      weapon_range_flat REAL,
      weapon_speed_percent REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function ensureCharacterInventoryTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS character_inventory (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      item_definition_id TEXT NOT NULL REFERENCES item_definitions(id),
      slot_kind TEXT NOT NULL CHECK (slot_kind IN ('bag', 'weapon', 'armor')),
      slot_index INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        (slot_kind = 'bag' AND slot_index IS NOT NULL AND slot_index >= 0 AND slot_index < 9)
        OR
        (slot_kind IN ('weapon', 'armor') AND slot_index IS NULL)
      )
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_character_inventory_character_id
    ON character_inventory (character_id);
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_character_inventory_bag_slot_unique
    ON character_inventory (character_id, slot_index)
    WHERE slot_kind = 'bag';
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_character_inventory_weapon_slot_unique
    ON character_inventory (character_id)
    WHERE slot_kind = 'weapon';
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_character_inventory_armor_slot_unique
    ON character_inventory (character_id)
    WHERE slot_kind = 'armor';
  `);
}

function ensureItemDefinitionSeeds(db: Database): void {
  const timestamp = CONTENT_SEED_TIMESTAMP;
  const statement = db.query(
    `INSERT INTO item_definitions (
      id,
      name,
      icon_key,
      type,
      class_requirement,
      min_level_to_equip,
      weapon_damage_flat,
      weapon_range_flat,
      weapon_speed_percent,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       icon_key = excluded.icon_key,
       type = excluded.type,
       class_requirement = excluded.class_requirement,
       min_level_to_equip = excluded.min_level_to_equip,
       weapon_damage_flat = excluded.weapon_damage_flat,
       weapon_range_flat = excluded.weapon_range_flat,
       weapon_speed_percent = excluded.weapon_speed_percent,
       updated_at = excluded.updated_at`,
  );

  for (const seed of ITEM_DEFINITION_SEEDS) {
    statement.run(
      seed.id,
      seed.name,
      seed.iconKey,
      "weapon",
      seed.classRequirement,
      seed.minLevelToEquip,
      seed.weaponDamageFlat,
      seed.weaponRangeFlat,
      seed.weaponSpeedPercent,
      timestamp,
      timestamp,
    );
  }
}

function ensureEnemyArchetypeProgressionColumns(db: Database): void {
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(enemy_archetypes);")
    .all();
  const hasLevel = columns.some((column) => column.name === "level");
  const hasXpReward = columns.some((column) => column.name === "xp_reward");

  if (!hasLevel) {
    db.exec(
      "ALTER TABLE enemy_archetypes ADD COLUMN level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1);",
    );
  }

  if (!hasXpReward) {
    db.exec(
      "ALTER TABLE enemy_archetypes ADD COLUMN xp_reward INTEGER NOT NULL DEFAULT 10 CHECK (xp_reward >= 0);",
    );
  }
}

function backfillLegacyEnemyArchetypeProgression(db: Database): void {
  const statement = db.query(
    `UPDATE enemy_archetypes
     SET level = ?2,
         xp_reward = ?3
     WHERE id = ?1
       AND level = 1
       AND xp_reward = 10`,
  );

  for (const row of ENEMY_ARCHETYPE_PROGRESSION_SEEDS) {
    statement.run(row.id, row.level, row.xpReward);
  }
}

function ensureLevelProgressionTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS level_progression (
      level INTEGER PRIMARY KEY,
      xp_to_next_level INTEGER,
      hp_multiplier REAL NOT NULL CHECK (hp_multiplier > 0),
      damage_multiplier REAL NOT NULL CHECK (damage_multiplier > 0)
    );
  `);
}

function ensureLevelProgressionSeed(db: Database): void {
  const statement = db.query(
    `INSERT OR IGNORE INTO level_progression (
      level,
      xp_to_next_level,
      hp_multiplier,
      damage_multiplier
    ) VALUES (?1, ?2, ?3, ?4)`,
  );

  for (const row of getLevelProgressionTable()) {
    statement.run(
      row.level,
      row.xpToNextLevel,
      row.hpMultiplier,
      row.damageMultiplier,
    );
  }
}

function ensureEnemyLootTables(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS enemy_loot_tables (
      enemy_archetype_id TEXT PRIMARY KEY REFERENCES enemy_archetypes(id) ON DELETE CASCADE,
      drop_chance REAL NOT NULL CHECK (drop_chance >= 0 AND drop_chance <= 1),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS enemy_loot_table_entries (
      id TEXT PRIMARY KEY,
      enemy_archetype_id TEXT NOT NULL REFERENCES enemy_loot_tables(enemy_archetype_id) ON DELETE CASCADE,
      item_definition_id TEXT NOT NULL REFERENCES item_definitions(id),
      weight REAL NOT NULL CHECK (weight > 0),
      class_affinity TEXT CHECK (class_affinity IS NULL OR class_affinity IN ('knight', 'mage')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_enemy_loot_entries_archetype
    ON enemy_loot_table_entries (enemy_archetype_id);
  `);
}

function ensureEnemyLootSeed(db: Database): void {
  const timestamp = CONTENT_SEED_TIMESTAMP;

  const lootTableStatement = db.query(
    `INSERT INTO enemy_loot_tables (
      enemy_archetype_id,
      drop_chance,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(enemy_archetype_id) DO UPDATE SET
       drop_chance = excluded.drop_chance,
       updated_at = excluded.updated_at`,
  );

  for (const seed of ENEMY_LOOT_TABLE_SEEDS) {
    lootTableStatement.run(
      seed.enemyArchetypeId,
      seed.dropChance,
      timestamp,
      timestamp,
    );
  }

  const lootEntryStatement = db.query(
    `INSERT INTO enemy_loot_table_entries (
      id,
      enemy_archetype_id,
      item_definition_id,
      weight,
      class_affinity,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(id) DO UPDATE SET
       enemy_archetype_id = excluded.enemy_archetype_id,
       item_definition_id = excluded.item_definition_id,
       weight = excluded.weight,
       class_affinity = excluded.class_affinity,
       updated_at = excluded.updated_at`,
  );

  for (const seed of ENEMY_LOOT_ENTRY_SEEDS) {
    lootEntryStatement.run(
      seed.id,
      seed.enemyArchetypeId,
      seed.itemDefinitionId,
      seed.weight,
      seed.classAffinity,
      timestamp,
      timestamp,
    );
  }
}
