import trainingSwordUrl from "../assets/items/training-sword.svg";
import trainingWandUrl from "../assets/items/training-wand.svg";

const ITEM_ICON_URLS: Record<string, string> = {
  training_sword: trainingSwordUrl,
  training_wand: trainingWandUrl,
};

export function resolveItemIconUrl(iconKey: string): string | null {
  return ITEM_ICON_URLS[iconKey] ?? null;
}
