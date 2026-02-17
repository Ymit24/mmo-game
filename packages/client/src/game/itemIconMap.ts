import adeptFocusWandUrl from "../assets/items/adept-focus-wand.svg";
import aegisPlateUrl from "../assets/items/aegis-plate.svg";
import arcaneScepterUrl from "../assets/items/arcane-scepter.svg";
import astralWardRaimentUrl from "../assets/items/astral-ward-raiment.svg";
import dragonboneBladeUrl from "../assets/items/dragonbone-blade.svg";
import glyphweaveRobeUrl from "../assets/items/glyphweave-robe.svg";
import ironBroadswordUrl from "../assets/items/iron-broadsword.svg";
import runedGreatswordUrl from "../assets/items/runed-greatsword.svg";
import steelBulwarkArmorUrl from "../assets/items/steel-bulwark-armor.svg";
import stormweaveRodUrl from "../assets/items/stormweave-rod.svg";
import trainingHauberkUrl from "../assets/items/training-hauberk.svg";
import trainingRobeUrl from "../assets/items/training-robe.svg";
import trainingSwordUrl from "../assets/items/training-sword.svg";
import trainingWandUrl from "../assets/items/training-wand.svg";

const ITEM_ICON_URLS: Record<string, string> = {
  adept_focus_wand: adeptFocusWandUrl,
  aegis_plate: aegisPlateUrl,
  arcane_scepter: arcaneScepterUrl,
  astral_ward_raiment: astralWardRaimentUrl,
  dragonbone_blade: dragonboneBladeUrl,
  glyphweave_robe: glyphweaveRobeUrl,
  iron_broadsword: ironBroadswordUrl,
  runed_greatsword: runedGreatswordUrl,
  steel_bulwark_armor: steelBulwarkArmorUrl,
  stormweave_rod: stormweaveRodUrl,
  training_hauberk: trainingHauberkUrl,
  training_robe: trainingRobeUrl,
  training_sword: trainingSwordUrl,
  training_wand: trainingWandUrl,
};

export function resolveItemIconUrl(iconKey: string): string | null {
  return ITEM_ICON_URLS[iconKey] ?? null;
}
