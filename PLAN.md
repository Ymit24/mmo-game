Below is a drop-in, data-first progression for levels 1–60 that matches the “old Roblox RPG” feel:


- Soft locks via EHP/time-to-kill: enemies a region ahead have big HP jumps + higher damage so grinding “too far” is technically possible but miserable.

- Intra-region progression: each region spans ~10 levels and includes enemies a bit below/above the region band.

- Weapon jumps every ~5 levels (alternating Knight/Mage), so your DPS spikes align with enemy HP spikes.

- Numbers are tuned so: early game hits are 2–3 dmg; by mid game you’re doing tens→hundreds; late game thousands, with enemies in 5+ figure HP.

You asked for actual table rows for:


- level_progression

- enemy_archetypes

- item_definitions

- (optional but recommended) enemy_loot_tables + enemy_loot_table_entries

- plus world JSONs (one file per world)

I’m going to:


1. Give you SQL inserts for progression, enemies, items, loot.

2. Give you 6 world JSON files (levels 1–60 in 6 worlds, each world has multiple rectangular regions + portals + spawners).

All timestamps use a fixed ISO string; change as you like.


---

1) Level progression (1–60)


Design:


- hp_multiplier and damage_multiplier are multipliers applied to your class base stats each level.

- This curve creates noticeable power growth, with bigger “feel” coming mostly from weapons, not just multipliers.

- xp_to_next_level ramps steadily (you can later adjust with playtest data).


	INSERT INTO level_progression (level, xp_to_next_level, hp_multiplier, damage_multiplier) VALUES
	(1,  60,  1.00, 1.00),
	(2,  70,  1.06, 1.05),
	(3,  80,  1.12, 1.10),
	(4,  90,  1.18, 1.15),
	(5,  110, 1.25, 1.20),
	(6,  130, 1.33, 1.26),
	(7,  150, 1.41, 1.32),
	(8,  175, 1.50, 1.38),
	(9,  200, 1.60, 1.44),
	(10, 230, 1.72, 1.52),
	
	(11, 270, 1.86, 1.60),
	(12, 310, 2.02, 1.69),
	(13, 360, 2.20, 1.78),
	(14, 410, 2.40, 1.88),
	(15, 470, 2.62, 1.98),
	(16, 540, 2.86, 2.09),
	(17, 620, 3.13, 2.20),
	(18, 710, 3.42, 2.32),
	(19, 810, 3.74, 2.45),
	(20, 920, 4.10, 2.60),
	
	(21, 1050, 4.48, 2.75),
	(22, 1200, 4.90, 2.92),
	(23, 1370, 5.36, 3.10),
	(24, 1560, 5.86, 3.29),
	(25, 1780, 6.40, 3.50),
	(26, 2030, 6.99, 3.72),
	(27, 2310, 7.63, 3.95),
	(28, 2630, 8.32, 4.19),
	(29, 2990, 9.08, 4.45),
	(30, 3400, 9.90, 4.73),
	
	(31, 3870, 10.80, 5.02),
	(32, 4410, 11.78, 5.33),
	(33, 5020, 12.85, 5.66),
	(34, 5710, 14.02, 6.01),
	(35, 6500, 15.30, 6.38),
	(36, 7390, 16.71, 6.78),
	(37, 8410, 18.26, 7.20),
	(38, 9570, 19.96, 7.65),
	(39, 10900, 21.82, 8.12),
	(40, 12420, 23.87, 8.63),
	
	(41, 14150, 26.12, 9.16),
	(42, 16120, 28.60, 9.73),
	(43, 18370, 31.33, 10.33),
	(44, 20940, 34.34, 10.97),
	(45, 23870, 37.66, 11.65),
	(46, 27210, 41.32, 12.37),
	(47, 31020, 45.36, 13.14),
	(48, 35360, 49.81, 13.95),
	(49, 40310, 54.72, 14.82),
	(50, 45940, 60.14, 15.74),
	
	(51, 52340, 66.12, 16.71),
	(52, 59610, 72.72, 17.75),
	(53, 67860, 80.00, 18.86),
	(54, 77210, 88.04, 20.04),
	(55, 87790, 96.92, 21.30),
	(56, 99750, 106.72, 22.64),
	(57, 113270, 117.55, 24.08),
	(58, 128540, 129.50, 25.61),
	(59, 145780, 142.69, 27.24),
	(60, NULL, 157.23, 28.98);


---

2) Item definitions (weapons only; Knight + Mage)


Assumptions:


- You compute final DPS roughly as:
	- final_damage = base_damage * damage_multiplier + weapon_damage_flat

	- final_attack_speed_ms = base_attack_speed_ms * (1 - weapon_speed_percent) (or similar)


- I’m using speed_percent as positive = faster (e.g. 0.10 = 10% faster). If your code interprets differently, flip the sign.

We add 12 weapons per class (every 5 levels from 1 to 56). That’s enough to create the “every region or two” power spikes.


	INSERT INTO item_definitions
	(id, name, icon_key, type, class_requirement, min_level_to_equip,
	 weapon_damage_flat, weapon_range_flat, weapon_speed_percent,
	 created_at, updated_at)
	VALUES
	-- KNIGHT weapons (melee)
	('w_kn_001_rusty_sword', 'Rusty Sword', 'weapon_sword_rusty', 'weapon', 'knight', 1,  1.5, 1.8, 0.00, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_kn_006_iron_sword', 'Iron Sword', 'weapon_sword_iron', 'weapon', 'knight', 6,  6.0, 1.9, 0.02, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_kn_011_steel_blade', 'Steel Blade', 'weapon_sword_steel', 'weapon', 'knight', 11, 14.0, 2.0, 0.03, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_kn_016_knight_sabre', 'Knight Sabre', 'weapon_sabre', 'weapon', 'knight', 16, 28.0, 2.1, 0.04, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_kn_021_war_axe', 'War Axe', 'weapon_axe', 'weapon', 'knight', 21, 52.0, 2.0, -0.03, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_kn_026_greatsword', 'Greatsword', 'weapon_greatsword', 'weapon', 'knight', 26, 92.0, 2.3, -0.05, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_kn_031_crusader_blade', 'Crusader Blade', 'weapon_sword_crusader', 'weapon', 'knight', 31, 160.0, 2.2, 0.02, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_kn_036_drake_cleaver', 'Drake Cleaver', 'weapon_cleaver_drake', 'weapon', 'knight', 36, 270.0, 2.3, -0.02, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_kn_041_obsidian_edge', 'Obsidian Edge', 'weapon_sword_obsidian', 'weapon', 'knight', 41, 440.0, 2.2, 0.03, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_kn_046_titan_slayer', 'Titan Slayer', 'weapon_greatsword_titan', 'weapon', 'knight', 46, 720.0, 2.4, -0.03, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_kn_051_void_brand', 'Void Brand', 'weapon_sword_void', 'weapon', 'knight', 51, 1120.0, 2.3, 0.04, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_kn_056_kingbreaker', 'Kingbreaker', 'weapon_sword_kingbreaker', 'weapon', 'knight', 56, 1700.0, 2.5, 0.00, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	
	-- MAGE weapons (ranged)
	('w_mg_001_apprentice_staff', 'Apprentice Staff', 'weapon_staff_apprentice', 'weapon', 'mage', 1,  1.2, 7.0, 0.00, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_mg_006_oak_wand', 'Oak Wand', 'weapon_wand_oak', 'weapon', 'mage', 6,  5.0, 7.5, 0.04, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_mg_011_focus_rod', 'Focus Rod', 'weapon_rod_focus', 'weapon', 'mage', 11, 12.0, 8.0, 0.05, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_mg_016_arcane_staff', 'Arcane Staff', 'weapon_staff_arcane', 'weapon', 'mage', 16, 24.0, 8.5, 0.06, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_mg_021_frost_scepter', 'Frost Scepter', 'weapon_scepter_frost', 'weapon', 'mage', 21, 46.0, 9.0, 0.03, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_mg_026_storm_wand', 'Storm Wand', 'weapon_wand_storm', 'weapon', 'mage', 26, 84.0, 9.5, 0.06, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_mg_031_sunfire_staff', 'Sunfire Staff', 'weapon_staff_sunfire', 'weapon', 'mage', 31, 150.0, 10.0, 0.04, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_mg_036_eldritch_tome', 'Eldritch Tome', 'weapon_tome_eldritch', 'weapon', 'mage', 36, 260.0, 10.5, 0.02, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_mg_041_astral_wand', 'Astral Wand', 'weapon_wand_astral', 'weapon', 'mage', 41, 430.0, 11.0, 0.05, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_mg_046_lich_baton', 'Lich Baton', 'weapon_baton_lich', 'weapon', 'mage', 46, 700.0, 11.5, 0.03, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_mg_051_void_orb', 'Void Orb', 'weapon_orb_void', 'weapon', 'mage', 51, 1100.0, 12.0, 0.04, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('w_mg_056_worldspark_staff', 'Worldspark Staff', 'weapon_staff_worldspark', 'weapon', 'mage', 56, 1680.0, 12.5, 0.02, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z');


---

3) Enemy archetypes (level 1–60 banded)


We’ll do 5 archetypes per 10-level world (30 total):


- 3 “core” mobs (low/mid/high within band)

- 1 “elite” (harder, better XP)

- 1 “boss” (checkpoint / end-of-world)

Stats philosophy:


- HP grows in chunky steps each band (your “lvl10 enemy has ~150 HP” vibe).

- Damage increases so “sequence breaking” is painful.

- Attack speeds/ranges vary to keep combat interesting.


	INSERT INTO enemy_archetypes
	(id, name, level, xp_reward, max_health, damage, speed, detection_radius, leash_radius,
	 attack_speed_ms, melee_range, ranged_range, can_melee, can_ranged,
	 visual_width, visual_height, color_hex, created_at, updated_at)
	VALUES
	-- WORLD 1 (levels 1-10) - Greenfields
	('e_001_slime', 'Green Slime', 1,  10,   12,  1.2, 2.6, 10, 18, 1200, 1.3, 0.0, 1, 0, 1.0, 0.9, '#43c76b', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_003_wolf', 'Wild Wolf',   3,  18,   34,  2.4, 3.4, 12, 22, 1000, 1.6, 0.0, 1, 0, 1.2, 0.8, '#8a8f99', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_006_bandit', 'Road Bandit', 6, 32,  95,  4.6, 3.0, 14, 26, 900,  1.7, 0.0, 1, 0, 1.0, 1.8, '#6b4e3d', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_008_bandit_archer', 'Bandit Archer', 8, 45, 125, 4.0, 2.8, 16, 28, 1200, 1.5, 8.5, 0, 1, 1.0, 1.8, '#7a5a44', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_010_forest_ogre', 'Forest Ogre (Boss)', 10, 140, 320, 8.5, 2.2, 18, 34, 1400, 2.2, 0.0, 1, 0, 2.6, 2.6, '#2f6f3a', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	
	-- WORLD 2 (levels 11-20) - Dusty Canyons
	('e_012_scorpion', 'Canyon Scorpion', 12, 75,  520, 11.5, 3.0, 16, 28, 1100, 1.6, 0.0, 1, 0, 1.2, 0.8, '#b07d2a', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_015_marauder', 'Canyon Marauder', 15, 100, 820, 15.5, 3.0, 18, 30, 950,  1.8, 0.0, 1, 0, 1.1, 1.9, '#8c3b2f', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_018_rock_golem', 'Rock Golem', 18, 140, 1350, 21.0, 2.1, 18, 34, 1500, 2.1, 0.0, 1, 0, 2.2, 2.4, '#7a6f66', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_019_sharpshooter', 'Desert Sharpshooter', 19, 170, 1200, 18.0, 2.7, 22, 40, 1100, 1.5, 10.0, 0, 1, 1.0, 1.9, '#a06a2a', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_020_sand_wyrm', 'Sand Wyrm (Boss)', 20, 420, 2600, 28.0, 2.4, 22, 40, 1300, 2.4, 0.0, 1, 0, 3.2, 2.2, '#caa24a', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	
	-- WORLD 3 (levels 21-30) - Frostmarch
	('e_022_ice_imp', 'Ice Imp', 22, 220, 3800, 34.0, 3.1, 20, 36, 950,  1.6, 0.0, 1, 0, 1.0, 1.1, '#87c7ff', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_025_frostwolf', 'Frostwolf', 25, 280, 5600, 42.0, 3.4, 22, 40, 900,  1.7, 0.0, 1, 0, 1.3, 0.9, '#b8d6ff', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_028_snow_knight', 'Snowbound Knight', 28, 360, 8200, 55.0, 2.8, 22, 42, 950,  1.8, 0.0, 1, 0, 1.2, 2.0, '#d2d7df', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_029_ice_mage', 'Ice Channeler', 29, 420, 7600, 52.0, 2.6, 24, 46, 1200, 1.4, 11.5, 0, 1, 1.1, 2.0, '#7aa7ff', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_030_yeti', 'Ancient Yeti (Boss)', 30, 950, 15500, 72.0, 2.6, 24, 46, 1400, 2.3, 0.0, 1, 0, 3.0, 3.0, '#ffffff', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	
	-- WORLD 4 (levels 31-40) - Ember Highlands
	('e_032_ash_sprite', 'Ash Sprite', 32, 560, 22000, 86.0, 3.2, 24, 46, 900,  1.5, 0.0, 1, 0, 1.0, 1.0, '#ff6b3d', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_035_lava_hound', 'Lava Hound', 35, 680, 31000, 102.0, 3.4, 26, 50, 900, 1.7, 0.0, 1, 0, 1.4, 1.0, '#ff3b2f', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_038_flame_legion', 'Flame Legionnaire', 38, 850, 46000, 125.0, 3.0, 26, 52, 950, 1.9, 0.0, 1, 0, 1.2, 2.1, '#d14a3a', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_039_pyromancer', 'Pyromancer', 39, 980, 42000, 120.0, 2.8, 28, 56, 1150, 1.4, 12.0, 0, 1, 1.1, 2.0, '#ff915e', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_040_magma_titan', 'Magma Titan (Boss)', 40, 2100, 90000, 170.0, 2.3, 28, 56, 1500, 2.6, 0.0, 1, 0, 3.6, 3.6, '#6b1d1d', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	
	-- WORLD 5 (levels 41-50) - Dreadmoor
	('e_042_swamp_ghoul', 'Swamp Ghoul', 42, 1250, 125000, 205.0, 3.0, 28, 56, 950, 1.8, 0.0, 1, 0, 1.2, 2.0, '#4b6b3d', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_045_wraith', 'Marsh Wraith', 45, 1500, 175000, 240.0, 3.2, 30, 60, 1000, 1.6, 0.0, 1, 0, 1.1, 2.1, '#6f7a8f', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_048_bog_knight', 'Bog Knight', 48, 1850, 250000, 290.0, 2.8, 30, 60, 950, 1.9, 0.0, 1, 0, 1.3, 2.2, '#2f3b3f', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_049_hex_shaman', 'Hex Shaman', 49, 2100, 235000, 280.0, 2.7, 32, 66, 1100, 1.4, 13.0, 0, 1, 1.1, 2.0, '#8a4b9f', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_050_mire_hydra', 'Mire Hydra (Boss)', 50, 4200, 520000, 390.0, 2.4, 32, 66, 1450, 2.5, 0.0, 1, 0, 4.0, 3.0, '#1e5a3a', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	
	-- WORLD 6 (levels 51-60) - Void Citadel
	('e_052_voidling', 'Voidling', 52, 2600, 720000, 460.0, 3.3, 32, 66, 900, 1.7, 0.0, 1, 0, 1.0, 1.2, '#3a2a6b', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_055_cult_enforcer', 'Cult Enforcer', 55, 3100, 980000, 520.0, 3.0, 34, 70, 950, 1.9, 0.0, 1, 0, 1.2, 2.2, '#5a2a3a', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_058_void_sentinel', 'Void Sentinel', 58, 3800, 1350000, 610.0, 2.7, 34, 72, 1050, 2.1, 0.0, 1, 0, 1.6, 2.6, '#2a2a2a', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_059_void_binder', 'Void Binder', 59, 4200, 1280000, 590.0, 2.8, 36, 76, 1100, 1.4, 14.0, 0, 1, 1.2, 2.2, '#3d2a5f', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_060_citadel_overlord', 'Citadel Overlord (Boss)', 60, 9000, 2600000, 820.0, 2.5, 36, 80, 1400, 2.8, 0.0, 1, 0, 4.4, 4.4, '#6b2ad1', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z');


---

4) Loot tables (simple, region-appropriate weapon drops)


Mechanic:


- Each enemy archetype gets a loot table with a drop_chance (chance anything drops).

- Entries are weighted. I’m making:
	- Common mobs: 10–18% drop chance, mostly misc later (you can add misc/armor/potions later)

	- Elites: 25%

	- Boss: 60% (feels rewarding)


Here we only drop weapons (since we defined those). You can expand later.


	INSERT INTO enemy_loot_tables (enemy_archetype_id, drop_chance, created_at, updated_at) VALUES
	('e_001_slime', 0.10, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_003_wolf', 0.12, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_006_bandit', 0.15, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_008_bandit_archer', 0.18, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_010_forest_ogre', 0.60, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	
	('e_012_scorpion', 0.12, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_015_marauder', 0.15, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_018_rock_golem', 0.18, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_019_sharpshooter', 0.18, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_020_sand_wyrm', 0.60, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	
	('e_022_ice_imp', 0.15, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_025_frostwolf', 0.15, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_028_snow_knight', 0.18, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_029_ice_mage', 0.18, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_030_yeti', 0.60, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	
	('e_032_ash_sprite', 0.15, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_035_lava_hound', 0.15, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_038_flame_legion', 0.18, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_039_pyromancer', 0.18, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_040_magma_titan', 0.60, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	
	('e_042_swamp_ghoul', 0.15, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_045_wraith', 0.15, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_048_bog_knight', 0.18, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_049_hex_shaman', 0.18, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_050_mire_hydra', 0.60, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	
	('e_052_voidling', 0.15, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_055_cult_enforcer', 0.18, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_058_void_sentinel', 0.18, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_059_void_binder', 0.18, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('e_060_citadel_overlord', 0.60, '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z');

Loot entries (a few per world; class affinity biases which weapons drop where):


	INSERT INTO enemy_loot_table_entries
	(id, enemy_archetype_id, item_definition_id, weight, class_affinity, created_at, updated_at)
	VALUES
	-- World 1 drops (lvl 1/6 weapons)
	('lte_001', 'e_001_slime', 'w_kn_001_rusty_sword', 1.0, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_002', 'e_001_slime', 'w_mg_001_apprentice_staff', 1.0, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_003', 'e_006_bandit', 'w_kn_006_iron_sword', 1.0, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_004', 'e_008_bandit_archer', 'w_mg_006_oak_wand', 1.0, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_005', 'e_010_forest_ogre', 'w_kn_006_iron_sword', 1.5, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_006', 'e_010_forest_ogre', 'w_mg_006_oak_wand', 1.5, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	
	-- World 2 drops (lvl 11/16 weapons)
	('lte_011', 'e_012_scorpion', 'w_kn_011_steel_blade', 1.0, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_012', 'e_015_marauder', 'w_mg_011_focus_rod', 1.0, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_013', 'e_018_rock_golem', 'w_kn_016_knight_sabre', 1.0, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_014', 'e_019_sharpshooter', 'w_mg_016_arcane_staff', 1.0, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_015', 'e_020_sand_wyrm', 'w_kn_016_knight_sabre', 1.5, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_016', 'e_020_sand_wyrm', 'w_mg_016_arcane_staff', 1.5, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	
	-- World 3 drops (lvl 21/26)
	('lte_021', 'e_022_ice_imp', 'w_mg_021_frost_scepter', 1.0, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_022', 'e_025_frostwolf', 'w_kn_021_war_axe', 1.0, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_023', 'e_028_snow_knight', 'w_kn_026_greatsword', 1.0, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_024', 'e_029_ice_mage', 'w_mg_026_storm_wand', 1.0, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_025', 'e_030_yeti', 'w_kn_026_greatsword', 1.5, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_026', 'e_030_yeti', 'w_mg_026_storm_wand', 1.5, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	
	-- World 4 drops (lvl 31/36)
	('lte_031', 'e_032_ash_sprite', 'w_mg_031_sunfire_staff', 1.0, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_032', 'e_035_lava_hound', 'w_kn_031_crusader_blade', 1.0, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_033', 'e_038_flame_legion', 'w_kn_036_drake_cleaver', 1.0, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_034', 'e_039_pyromancer', 'w_mg_036_eldritch_tome', 1.0, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_035', 'e_040_magma_titan', 'w_kn_036_drake_cleaver', 1.5, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_036', 'e_040_magma_titan', 'w_mg_036_eldritch_tome', 1.5, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	
	-- World 5 drops (lvl 41/46)
	('lte_041', 'e_042_swamp_ghoul', 'w_kn_041_obsidian_edge', 1.0, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_042', 'e_045_wraith', 'w_mg_041_astral_wand', 1.0, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_043', 'e_048_bog_knight', 'w_kn_046_titan_slayer', 1.0, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_044', 'e_049_hex_shaman', 'w_mg_046_lich_baton', 1.0, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_045', 'e_050_mire_hydra', 'w_kn_046_titan_slayer', 1.5, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_046', 'e_050_mire_hydra', 'w_mg_046_lich_baton', 1.5, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	
	-- World 6 drops (lvl 51/56)
	('lte_051', 'e_052_voidling', 'w_mg_051_void_orb', 1.0, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_052', 'e_055_cult_enforcer', 'w_kn_051_void_brand', 1.0, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_053', 'e_058_void_sentinel', 'w_kn_056_kingbreaker', 1.0, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_054', 'e_059_void_binder', 'w_mg_056_worldspark_staff', 1.0, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_055', 'e_060_citadel_overlord', 'w_kn_056_kingbreaker', 1.5, 'knight', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z'),
	('lte_056', 'e_060_citadel_overlord', 'w_mg_056_worldspark_staff', 1.5, 'mage', '2026-02-15T21:00:00Z', '2026-02-15T21:00:00Z');


---

5) World JSON files (6 worlds, each with 2–3 rectangular regions)


These are intentionally simple rectangles so you can iterate quickly. Each world has:


- spawnPoints (start + a mid checkpoint)

- regions (level-banded zones)

- portals to next/prev world

- enemySpawners distributed by region

world_01_greenfields.json

	{
	  "id": "world_01_greenfields",
	  "name": "Greenfields",
	  "width": 220,
	  "height": 140,
	  "background": { "color": "#2b6f3a", "gridSize": 10 },
	  "combat": { "allowCombat": true, "pvpEnabled": false },
	  "playerSpawnId": "sp_greenfields_start",
	  "spawnPoints": [
	    { "id": "sp_greenfields_start", "x": 18, "y": 70 },
	    { "id": "sp_greenfields_mid", "x": 120, "y": 70 }
	  ],
	  "collisions": [
	    { "type": "rect", "x": 0, "y": 0, "width": 220, "height": 6 },
	    { "type": "rect", "x": 0, "y": 134, "width": 220, "height": 6 },
	    { "type": "rect", "x": 0, "y": 0, "width": 6, "height": 140 },
	    { "type": "rect", "x": 214, "y": 0, "width": 6, "height": 140 }
	  ],
	  "regions": [
	    {
	      "id": "r_gf_01_meadow",
	      "name": "Starter Meadow (Lv 1-3)",
	      "shape": { "type": "rect", "x": 6, "y": 6, "width": 70, "height": 128 }
	    },
	    {
	      "id": "r_gf_02_woods",
	      "name": "Winding Woods (Lv 3-7)",
	      "shape": { "type": "rect", "x": 76, "y": 6, "width": 78, "height": 128 }
	    },
	    {
	      "id": "r_gf_03_road",
	      "name": "Bandit Road (Lv 7-10)",
	      "shape": { "type": "rect", "x": 154, "y": 6, "width": 60, "height": 128 }
	    }
	  ],
	  "portals": [
	    {
	      "id": "p_gf_to_canyons",
	      "name": "Trail to Dusty Canyons",
	      "shape": { "type": "rect", "x": 206, "y": 62, "width": 8, "height": 16 },
	      "targetWorldId": "world_02_dusty_canyons",
	      "targetSpawnId": "sp_canyons_start",
	      "exitOffset": { "x": 2, "y": 0 }
	    }
	  ],
	  "enemySpawners": [
	    { "id": "s_gf_slime_1", "archetypeId": "e_001_slime", "x": 28, "y": 40, "spawnRadius": 14, "maxAlive": 6, "respawnSeconds": 7 },
	    { "id": "s_gf_slime_2", "archetypeId": "e_001_slime", "x": 40, "y": 92, "spawnRadius": 14, "maxAlive": 6, "respawnSeconds": 7 },
	
	    { "id": "s_gf_wolf_1", "archetypeId": "e_003_wolf", "x": 96, "y": 40, "spawnRadius": 18, "maxAlive": 5, "respawnSeconds": 9 },
	    { "id": "s_gf_wolf_2", "archetypeId": "e_003_wolf", "x": 108, "y": 96, "spawnRadius": 18, "maxAlive": 5, "respawnSeconds": 9 },
	
	    { "id": "s_gf_bandit_1", "archetypeId": "e_006_bandit", "x": 170, "y": 42, "spawnRadius": 16, "maxAlive": 4, "respawnSeconds": 11 },
	    { "id": "s_gf_archer_1", "archetypeId": "e_008_bandit_archer", "x": 184, "y": 96, "spawnRadius": 16, "maxAlive": 3, "respawnSeconds": 12 },
	
	    { "id": "s_gf_boss_ogre", "archetypeId": "e_010_forest_ogre", "x": 196, "y": 70, "spawnRadius": 10, "maxAlive": 1, "respawnSeconds": 55 }
	  ]
	}

world_02_dusty_canyons.json

	{
	  "id": "world_02_dusty_canyons",
	  "name": "Dusty Canyons",
	  "width": 240,
	  "height": 150,
	  "background": { "color": "#b07d2a", "gridSize": 10 },
	  "combat": { "allowCombat": true, "pvpEnabled": false },
	  "playerSpawnId": "sp_canyons_start",
	  "spawnPoints": [
	    { "id": "sp_canyons_start", "x": 16, "y": 75 },
	    { "id": "sp_canyons_mid", "x": 132, "y": 75 }
	  ],
	  "collisions": [
	    { "type": "rect", "x": 0, "y": 0, "width": 240, "height": 6 },
	    { "type": "rect", "x": 0, "y": 144, "width": 240, "height": 6 },
	    { "type": "rect", "x": 0, "y": 0, "width": 6, "height": 150 },
	    { "type": "rect", "x": 234, "y": 0, "width": 6, "height": 150 }
	  ],
	  "regions": [
	    {
	      "id": "r_dc_01_rim",
	      "name": "Canyon Rim (Lv 11-14)",
	      "shape": { "type": "rect", "x": 6, "y": 6, "width": 80, "height": 138 }
	    },
	    {
	      "id": "r_dc_02_pass",
	      "name": "Narrow Pass (Lv 14-18)",
	      "shape": { "type": "rect", "x": 86, "y": 6, "width": 90, "height": 138 }
	    },
	    {
	      "id": "r_dc_03_sinkhole",
	      "name": "Sinkhole Approach (Lv 18-20)",
	      "shape": { "type": "rect", "x": 176, "y": 6, "width": 58, "height": 138 }
	    }
	  ],
	  "portals": [
	    {
	      "id": "p_dc_to_greenfields",
	      "name": "Back to Greenfields",
	      "shape": { "type": "rect", "x": 6, "y": 68, "width": 8, "height": 16 },
	      "targetWorldId": "world_01_greenfields",
	      "targetSpawnId": "sp_greenfields_mid",
	      "exitOffset": { "x": 2, "y": 0 }
	    },
	    {
	      "id": "p_dc_to_frostmarch",
	      "name": "Path to Frostmarch",
	      "shape": { "type": "rect", "x": 226, "y": 68, "width": 8, "height": 16 },
	      "targetWorldId": "world_03_frostmarch",
	      "targetSpawnId": "sp_frostmarch_start",
	      "exitOffset": { "x": 2, "y": 0 }
	    }
	  ],
	  "enemySpawners": [
	    { "id": "s_dc_scorp_1", "archetypeId": "e_012_scorpion", "x": 34, "y": 42, "spawnRadius": 18, "maxAlive": 6, "respawnSeconds": 9 },
	    { "id": "s_dc_scorp_2", "archetypeId": "e_012_scorpion", "x": 50, "y": 110, "spawnRadius": 18, "maxAlive": 6, "respawnSeconds": 9 },
	
	    { "id": "s_dc_maraud_1", "archetypeId": "e_015_marauder", "x": 112, "y": 44, "spawnRadius": 18, "maxAlive": 5, "respawnSeconds": 10 },
	    { "id": "s_dc_maraud_2", "archetypeId": "e_015_marauder", "x": 128, "y": 110, "spawnRadius": 18, "maxAlive": 5, "respawnSeconds": 10 },
	
	    { "id": "s_dc_golem_1", "archetypeId": "e_018_rock_golem", "x": 196, "y": 50, "spawnRadius": 16, "maxAlive": 3, "respawnSeconds": 14 },
	    { "id": "s_dc_sharp_1", "archetypeId": "e_019_sharpshooter", "x": 208, "y": 104, "spawnRadius": 18, "maxAlive": 3, "respawnSeconds": 14 },
	
	    { "id": "s_dc_boss_wyrm", "archetypeId": "e_020_sand_wyrm", "x": 220, "y": 75, "spawnRadius": 10, "maxAlive": 1, "respawnSeconds": 70 }
	  ]
	}
world_03_frostmarch.json

	{
	  "id": "world_03_frostmarch",
	  "name": "Frostmarch",
	  "width": 260,
	  "height": 160,
	  "background": { "color": "#7aa7ff", "gridSize": 10 },
	  "combat": { "allowCombat": true, "pvpEnabled": false },
	  "playerSpawnId": "sp_frostmarch_start",
	  "spawnPoints": [
	    { "id": "sp_frostmarch_start", "x": 16, "y": 80 },
	    { "id": "sp_frostmarch_mid", "x": 140, "y": 80 }
	  ],
	  "collisions": [
	    { "type": "rect", "x": 0, "y": 0, "width": 260, "height": 6 },
	    { "type": "rect", "x": 0, "y": 154, "width": 260, "height": 6 },
	    { "type": "rect", "x": 0, "y": 0, "width": 6, "height": 160 },
	    { "type": "rect", "x": 254, "y": 0, "width": 6, "height": 160 }
	  ],
	  "regions": [
	    {
	      "id": "r_fm_01_glacier_edge",
	      "name": "Glacier Edge (Lv 21-24)",
	      "shape": { "type": "rect", "x": 6, "y": 6, "width": 90, "height": 148 }
	    },
	    {
	      "id": "r_fm_02_snowfields",
	      "name": "Snowfields (Lv 24-28)",
	      "shape": { "type": "rect", "x": 96, "y": 6, "width": 100, "height": 148 }
	    },
	    {
	      "id": "r_fm_03_ice_cavern",
	      "name": "Ice Cavern Mouth (Lv 28-30)",
	      "shape": { "type": "rect", "x": 196, "y": 6, "width": 58, "height": 148 }
	    }
	  ],
	  "portals": [
	    {
	      "id": "p_fm_to_canyons",
	      "name": "Back to Dusty Canyons",
	      "shape": { "type": "rect", "x": 6, "y": 72, "width": 8, "height": 16 },
	      "targetWorldId": "world_02_dusty_canyons",
	      "targetSpawnId": "sp_canyons_mid",
	      "exitOffset": { "x": 2, "y": 0 }
	    },
	    {
	      "id": "p_fm_to_ember",
	      "name": "Pass to Ember Highlands",
	      "shape": { "type": "rect", "x": 246, "y": 72, "width": 8, "height": 16 },
	      "targetWorldId": "world_04_ember_highlands",
	      "targetSpawnId": "sp_ember_start",
	      "exitOffset": { "x": 2, "y": 0 }
	    }
	  ],
	  "enemySpawners": [
	    {
	      "id": "s_fm_imp_1",
	      "archetypeId": "e_022_ice_imp",
	      "x": 34,
	      "y": 46,
	      "spawnRadius": 18,
	      "maxAlive": 6,
	      "respawnSeconds": 10
	    },
	    {
	      "id": "s_fm_imp_2",
	      "archetypeId": "e_022_ice_imp",
	      "x": 52,
	      "y": 114,
	      "spawnRadius": 18,
	      "maxAlive": 6,
	      "respawnSeconds": 10
	    },
	    {
	      "id": "s_fm_wolf_1",
	      "archetypeId": "e_025_frostwolf",
	      "x": 120,
	      "y": 46,
	      "spawnRadius": 20,
	      "maxAlive": 5,
	      "respawnSeconds": 12
	    },
	    {
	      "id": "s_fm_wolf_2",
	      "archetypeId": "e_025_frostwolf",
	      "x": 138,
	      "y": 116,
	      "spawnRadius": 20,
	      "maxAlive": 5,
	      "respawnSeconds": 12
	    },
	    {
	      "id": "s_fm_knight_1",
	      "archetypeId": "e_028_snow_knight",
	      "x": 214,
	      "y": 50,
	      "spawnRadius": 16,
	      "maxAlive": 4,
	      "respawnSeconds": 14
	    },
	    {
	      "id": "s_fm_mage_1",
	      "archetypeId": "e_029_ice_mage",
	      "x": 226,
	      "y": 110,
	      "spawnRadius": 18,
	      "maxAlive": 3,
	      "respawnSeconds": 15
	    },
	    {
	      "id": "s_fm_boss_yeti",
	      "archetypeId": "e_030_yeti",
	      "x": 238,
	      "y": 80,
	      "spawnRadius": 10,
	      "maxAlive": 1,
	      "respawnSeconds": 85
	    }
	  ]
	}


---

world_04_ember_highlands.json

	{
	  "id": "world_04_ember_highlands",
	  "name": "Ember Highlands",
	  "width": 280,
	  "height": 170,
	  "background": { "color": "#6b1d1d", "gridSize": 10 },
	  "combat": { "allowCombat": true, "pvpEnabled": false },
	  "playerSpawnId": "sp_ember_start",
	  "spawnPoints": [
	    { "id": "sp_ember_start", "x": 18, "y": 85 },
	    { "id": "sp_ember_mid", "x": 152, "y": 85 }
	  ],
	  "collisions": [
	    { "type": "rect", "x": 0, "y": 0, "width": 280, "height": 6 },
	    { "type": "rect", "x": 0, "y": 164, "width": 280, "height": 6 },
	    { "type": "rect", "x": 0, "y": 0, "width": 6, "height": 170 },
	    { "type": "rect", "x": 274, "y": 0, "width": 6, "height": 170 }
	  ],
	  "regions": [
	    {
	      "id": "r_eh_01_ashlands",
	      "name": "Ashlands (Lv 31-34)",
	      "shape": { "type": "rect", "x": 6, "y": 6, "width": 96, "height": 158 }
	    },
	    {
	      "id": "r_eh_02_scorched_ridge",
	      "name": "Scorched Ridge (Lv 34-38)",
	      "shape": { "type": "rect", "x": 102, "y": 6, "width": 110, "height": 158 }
	    },
	    {
	      "id": "r_eh_03_magma_gate",
	      "name": "Magma Gate (Lv 38-40)",
	      "shape": { "type": "rect", "x": 212, "y": 6, "width": 62, "height": 158 }
	    }
	  ],
	  "portals": [
	    {
	      "id": "p_eh_to_frostmarch",
	      "name": "Back to Frostmarch",
	      "shape": { "type": "rect", "x": 6, "y": 77, "width": 8, "height": 16 },
	      "targetWorldId": "world_03_frostmarch",
	      "targetSpawnId": "sp_frostmarch_mid",
	      "exitOffset": { "x": 2, "y": 0 }
	    },
	    {
	      "id": "p_eh_to_dreadmoor",
	      "name": "Road to Dreadmoor",
	      "shape": { "type": "rect", "x": 266, "y": 77, "width": 8, "height": 16 },
	      "targetWorldId": "world_05_dreadmoor",
	      "targetSpawnId": "sp_dreadmoor_start",
	      "exitOffset": { "x": 2, "y": 0 }
	    }
	  ],
	  "enemySpawners": [
	    {
	      "id": "s_eh_sprite_1",
	      "archetypeId": "e_032_ash_sprite",
	      "x": 38,
	      "y": 48,
	      "spawnRadius": 18,
	      "maxAlive": 7,
	      "respawnSeconds": 11
	    },
	    {
	      "id": "s_eh_sprite_2",
	      "archetypeId": "e_032_ash_sprite",
	      "x": 56,
	      "y": 126,
	      "spawnRadius": 18,
	      "maxAlive": 7,
	      "respawnSeconds": 11
	    },
	    {
	      "id": "s_eh_hound_1",
	      "archetypeId": "e_035_lava_hound",
	      "x": 132,
	      "y": 52,
	      "spawnRadius": 22,
	      "maxAlive": 6,
	      "respawnSeconds": 13
	    },
	    {
	      "id": "s_eh_hound_2",
	      "archetypeId": "e_035_lava_hound",
	      "x": 150,
	      "y": 126,
	      "spawnRadius": 22,
	      "maxAlive": 6,
	      "respawnSeconds": 13
	    },
	    {
	      "id": "s_eh_legion_1",
	      "archetypeId": "e_038_flame_legion",
	      "x": 232,
	      "y": 52,
	      "spawnRadius": 18,
	      "maxAlive": 4,
	      "respawnSeconds": 16
	    },
	    {
	      "id": "s_eh_pyro_1",
	      "archetypeId": "e_039_pyromancer",
	      "x": 246,
	      "y": 122,
	      "spawnRadius": 20,
	      "maxAlive": 3,
	      "respawnSeconds": 17
	    },
	    {
	      "id": "s_eh_boss_titan",
	      "archetypeId": "e_040_magma_titan",
	      "x": 258,
	      "y": 85,
	      "spawnRadius": 10,
	      "maxAlive": 1,
	      "respawnSeconds": 110
	    }
	  ]
	}


---

world_05_dreadmoor.json

	{
	  "id": "world_05_dreadmoor",
	  "name": "Dreadmoor",
	  "width": 300,
	  "height": 180,
	  "background": { "color": "#1e5a3a", "gridSize": 10 },
	  "combat": { "allowCombat": true, "pvpEnabled": false },
	  "playerSpawnId": "sp_dreadmoor_start",
	  "spawnPoints": [
	    { "id": "sp_dreadmoor_start", "x": 18, "y": 90 },
	    { "id": "sp_dreadmoor_mid", "x": 168, "y": 90 }
	  ],
	  "collisions": [
	    { "type": "rect", "x": 0, "y": 0, "width": 300, "height": 6 },
	    { "type": "rect", "x": 0, "y": 174, "width": 300, "height": 6 },
	    { "type": "rect", "x": 0, "y": 0, "width": 6, "height": 180 },
	    { "type": "rect", "x": 294, "y": 0, "width": 6, "height": 180 }
	  ],
	  "regions": [
	    {
	      "id": "r_dm_01_fen",
	      "name": "Rotfen (Lv 41-44)",
	      "shape": { "type": "rect", "x": 6, "y": 6, "width": 110, "height": 168 }
	    },
	    {
	      "id": "r_dm_02_murkwood",
	      "name": "Murkwood (Lv 44-48)",
	      "shape": { "type": "rect", "x": 116, "y": 6, "width": 124, "height": 168 }
	    },
	    {
	      "id": "r_dm_03_hydra_lair",
	      "name": "Hydra Mire (Lv 48-50)",
	      "shape": { "type": "rect", "x": 240, "y": 6, "width": 54, "height": 168 }
	    }
	  ],
	  "portals": [
	    {
	      "id": "p_dm_to_ember",
	      "name": "Back to Ember Highlands",
	      "shape": { "type": "rect", "x": 6, "y": 82, "width": 8, "height": 16 },
	      "targetWorldId": "world_04_ember_highlands",
	      "targetSpawnId": "sp_ember_mid",
	      "exitOffset": { "x": 2, "y": 0 }
	    },
	    {
	      "id": "p_dm_to_void",
	      "name": "Gate to Void Citadel",
	      "shape": { "type": "rect", "x": 286, "y": 82, "width": 8, "height": 16 },
	      "targetWorldId": "world_06_void_citadel",
	      "targetSpawnId": "sp_void_start",
	      "exitOffset": { "x": 2, "y": 0 }
	    }
	  ],
	  "enemySpawners": [
	    {
	      "id": "s_dm_ghoul_1",
	      "archetypeId": "e_042_swamp_ghoul",
	      "x": 44,
	      "y": 54,
	      "spawnRadius": 22,
	      "maxAlive": 7,
	      "respawnSeconds": 14
	    },
	    {
	      "id": "s_dm_ghoul_2",
	      "archetypeId": "e_042_swamp_ghoul",
	      "x": 64,
	      "y": 134,
	      "spawnRadius": 22,
	      "maxAlive": 7,
	      "respawnSeconds": 14
	    },
	    {
	      "id": "s_dm_wraith_1",
	      "archetypeId": "e_045_wraith",
	      "x": 150,
	      "y": 52,
	      "spawnRadius": 20,
	      "maxAlive": 6,
	      "respawnSeconds": 16
	    },
	    {
	      "id": "s_dm_wraith_2",
	      "archetypeId": "e_045_wraith",
	      "x": 170,
	      "y": 132,
	      "spawnRadius": 20,
	      "maxAlive": 6,
	      "respawnSeconds": 16
	    },
	    {
	      "id": "s_dm_bogknight_1",
	      "archetypeId": "e_048_bog_knight",
	      "x": 256,
	      "y": 56,
	      "spawnRadius": 18,
	      "maxAlive": 4,
	      "respawnSeconds": 18
	    },
	    {
	      "id": "s_dm_shaman_1",
	      "archetypeId": "e_049_hex_shaman",
	      "x": 270,
	      "y": 128,
	      "spawnRadius": 20,
	      "maxAlive": 3,
	      "respawnSeconds": 19
	    },
	    {
	      "id": "s_dm_boss_hydra",
	      "archetypeId": "e_050_mire_hydra",
	      "x": 280,
	      "y": 90,
	      "spawnRadius": 10,
	      "maxAlive": 1,
	      "respawnSeconds": 140
	    }
	  ]
	}


---

world_06_void_citadel.json

	{
	  "id": "world_06_void_citadel",
	  "name": "Void Citadel",
	  "width": 320,
	  "height": 190,
	  "background": { "color": "#2a1445", "gridSize": 10 },
	  "combat": { "allowCombat": true, "pvpEnabled": false },
	  "playerSpawnId": "sp_void_start",
	  "spawnPoints": [
	    { "id": "sp_void_start", "x": 18, "y": 95 },
	    { "id": "sp_void_mid", "x": 184, "y": 95 }
	  ],
	  "collisions": [
	    { "type": "rect", "x": 0, "y": 0, "width": 320, "height": 6 },
	    { "type": "rect", "x": 0, "y": 184, "width": 320, "height": 6 },
	    { "type": "rect", "x": 0, "y": 0, "width": 6, "height": 190 },
	    { "type": "rect", "x": 314, "y": 0, "width": 6, "height": 190 }
	  ],
	  "regions": [
	    {
	      "id": "r_vc_01_ruins",
	      "name": "Outer Ruins (Lv 51-54)",
	      "shape": { "type": "rect", "x": 6, "y": 6, "width": 120, "height": 178 }
	    },
	    {
	      "id": "r_vc_02_halls",
	      "name": "Twilight Halls (Lv 54-58)",
	      "shape": { "type": "rect", "x": 126, "y": 6, "width": 138, "height": 178 }
	    },
	    {
	      "id": "r_vc_03_throne",
	      "name": "Throne Approach (Lv 58-60)",
	      "shape": { "type": "rect", "x": 264, "y": 6, "width": 50, "height": 178 }
	    }
	  ],
	  "portals": [
	    {
	      "id": "p_vc_to_dreadmoor",
	      "name": "Back to Dreadmoor",
	      "shape": { "type": "rect", "x": 6, "y": 87, "width": 8, "height": 16 },
	      "targetWorldId": "world_05_dreadmoor",
	      "targetSpawnId": "sp_dreadmoor_mid",
	      "exitOffset": { "x": 2, "y": 0 }
	    }
	  ],
	  "enemySpawners": [
	    {
	      "id": "s_vc_voidling_1",
	      "archetypeId": "e_052_voidling",
	      "x": 46,
	      "y": 56,
	      "spawnRadius": 22,
	      "maxAlive": 7,
	      "respawnSeconds": 16
	    },
	    {
	      "id": "s_vc_voidling_2",
	      "archetypeId": "e_052_voidling",
	      "x": 70,
	      "y": 140,
	      "spawnRadius": 22,
	      "maxAlive": 7,
	      "respawnSeconds": 16
	    },
	    {
	      "id": "s_vc_enforcer_1",
	      "archetypeId": "e_055_cult_enforcer",
	      "x": 166,
	      "y": 56,
	      "spawnRadius": 20,
	      "maxAlive": 6,
	      "respawnSeconds": 18
	    },
	    {
	      "id": "s_vc_enforcer_2",
	      "archetypeId": "e_055_cult_enforcer",
	      "x": 190,
	      "y": 140,
	      "spawnRadius": 20,
	      "maxAlive": 6,
	      "respawnSeconds": 18
	    },
	    {
	      "id": "s_vc_sentinel_1",
	      "archetypeId": "e_058_void_sentinel",
	      "x": 276,
	      "y": 58,
	      "spawnRadius": 18,
	      "maxAlive": 4,
	      "respawnSeconds": 22
	    },
	    {
	      "id": "s_vc_binder_1",
	      "archetypeId": "e_059_void_binder",
	      "x": 292,
	      "y": 138,
	      "spawnRadius": 20,
	      "maxAlive": 3,
	      "respawnSeconds": 23
	    },
	    {
	      "id": "s_vc_boss_overlord",
	      "archetypeId": "e_060_citadel_overlord",
	      "x": 302,
	      "y": 95,
	      "spawnRadius": 10,
	      "maxAlive": 1,
	      "respawnSeconds": 180
	    }
	  ]
	}
