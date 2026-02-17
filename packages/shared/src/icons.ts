export interface ItemIconDefinition {
  key: string;
  name: string;
}

export const ITEM_ICON_KEY_REGEX = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

export const DEFAULT_ITEM_ICONS: ItemIconDefinition[] = [
  { key: "training_sword", name: "Training Sword" },
  { key: "training_wand", name: "Training Wand" },
  { key: "training_hauberk", name: "Training Hauberk" },
  { key: "training_robe", name: "Training Robe" },
  { key: "iron_broadsword", name: "Iron Broadsword" },
  { key: "steel_bulwark_armor", name: "Steel Bulwark Armor" },
  { key: "runed_greatsword", name: "Runed Greatsword" },
  { key: "adept_focus_wand", name: "Adept Focus Wand" },
  { key: "glyphweave_robe", name: "Glyphweave Robe" },
  { key: "stormweave_rod", name: "Stormweave Rod" },
  { key: "aegis_plate", name: "Aegis Plate" },
  { key: "arcane_scepter", name: "Arcane Scepter" },
  { key: "astral_ward_raiment", name: "Astral Ward Raiment" },
  { key: "dragonbone_blade", name: "Dragonbone Blade" },
  { key: "basic_health_potion", name: "Basic Health Potion" },
  { key: "greater_health_potion", name: "Greater Health Potion" },
];

export function isItemIconKey(value: string): boolean {
  return ITEM_ICON_KEY_REGEX.test(value);
}
