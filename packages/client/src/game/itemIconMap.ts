import { resolveItemIconAssetUrl } from "@mmo/shared/item-icon-assets";

export function resolveItemIconUrl(iconKey: string): string | null {
  return resolveItemIconAssetUrl(iconKey);
}
