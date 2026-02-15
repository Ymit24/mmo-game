import adeptFocusWandUrl from "../assets/items/adept-focus-wand.svg";
import arcaneScepterUrl from "../assets/items/arcane-scepter.svg";
import dragonboneBladeUrl from "../assets/items/dragonbone-blade.svg";
import ironBroadswordUrl from "../assets/items/iron-broadsword.svg";
import runedGreatswordUrl from "../assets/items/runed-greatsword.svg";
import stormweaveRodUrl from "../assets/items/stormweave-rod.svg";
import trainingSwordUrl from "../assets/items/training-sword.svg";
import trainingWandUrl from "../assets/items/training-wand.svg";

const ITEM_ICON_URLS: Record<string, string> = {
  adept_focus_wand: adeptFocusWandUrl,
  arcane_scepter: arcaneScepterUrl,
  dragonbone_blade: dragonboneBladeUrl,
  iron_broadsword: ironBroadswordUrl,
  runed_greatsword: runedGreatswordUrl,
  stormweave_rod: stormweaveRodUrl,
  training_sword: trainingSwordUrl,
  training_wand: trainingWandUrl,
  weapon_sword_rusty: trainingSwordUrl,
  weapon_sword_iron: ironBroadswordUrl,
  weapon_sword_steel: ironBroadswordUrl,
  weapon_sabre: runedGreatswordUrl,
  weapon_axe: runedGreatswordUrl,
  weapon_greatsword: runedGreatswordUrl,
  weapon_sword_crusader: dragonboneBladeUrl,
  weapon_cleaver_drake: dragonboneBladeUrl,
  weapon_sword_obsidian: dragonboneBladeUrl,
  weapon_greatsword_titan: dragonboneBladeUrl,
  weapon_sword_void: dragonboneBladeUrl,
  weapon_sword_kingbreaker: dragonboneBladeUrl,
  weapon_staff_apprentice: trainingWandUrl,
  weapon_wand_oak: adeptFocusWandUrl,
  weapon_rod_focus: adeptFocusWandUrl,
  weapon_staff_arcane: arcaneScepterUrl,
  weapon_scepter_frost: arcaneScepterUrl,
  weapon_wand_storm: stormweaveRodUrl,
  weapon_staff_sunfire: stormweaveRodUrl,
  weapon_tome_eldritch: arcaneScepterUrl,
  weapon_wand_astral: arcaneScepterUrl,
  weapon_baton_lich: arcaneScepterUrl,
  weapon_orb_void: stormweaveRodUrl,
  weapon_staff_worldspark: arcaneScepterUrl,
};

export function resolveItemIconUrl(iconKey: string): string | null {
  return ITEM_ICON_URLS[iconKey] ?? null;
}
