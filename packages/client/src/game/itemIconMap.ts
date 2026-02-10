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
};

export function resolveItemIconUrl(iconKey: string): string | null {
  return ITEM_ICON_URLS[iconKey] ?? null;
}
