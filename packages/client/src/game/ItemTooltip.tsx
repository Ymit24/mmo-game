import type {
  EquipSlot,
  InventoryItemInstance,
  ItemDefinition,
} from "@mmo/shared";
import { itemDefinitionToWeaponModifiers } from "@mmo/shared";
import { resolveItemIconUrl } from "./itemIconMap";

interface ItemTooltipProps {
  item: InventoryItemInstance;
  definition: ItemDefinition;
  equippedWeaponDefinition?: ItemDefinition | null;
  slotType: "bag" | EquipSlot;
}

export function ItemTooltip({
  item,
  definition,
  equippedWeaponDefinition,
  slotType,
}: ItemTooltipProps) {
  const iconUrl = resolveItemIconUrl(definition.iconKey);
  const isWeapon = definition.type === "weapon";

  // Get weapon stats for comparison
  const hoveredWeaponStats = isWeapon
    ? itemDefinitionToWeaponModifiers(definition)
    : null;
  const equippedWeaponStats = equippedWeaponDefinition
    ? itemDefinitionToWeaponModifiers(equippedWeaponDefinition)
    : null;

  return (
    <div className="pointer-events-none z-50 min-w-[200px] max-w-[260px] border border-vec-gold/40 bg-void/95 p-2.5 shadow-lg">
      {/* Header: Icon + Name */}
      <div className="mb-2 flex items-start gap-2">
        {iconUrl ? (
          <img
            src={iconUrl}
            alt={definition.name}
            className="h-10 w-10 shrink-0 border border-border bg-deep p-0.5"
            style={{ imageRendering: "pixelated" }}
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-deep text-[8px] text-muted">
            {definition.type.slice(0, 3)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-xs text-vec-gold leading-tight">
            {definition.name}
          </p>
          <p className="mt-0.5 text-[9px] text-muted capitalize">
            {definition.type}
          </p>
        </div>
      </div>

      {/* Requirements */}
      {(definition.minLevelToEquip || definition.classRequirement) && (
        <div className="mb-2 border-t border-border/40 pt-1.5">
          {definition.minLevelToEquip && (
            <p className="text-[9px] text-vec-cyan">
              Requires Level {definition.minLevelToEquip}
            </p>
          )}
          {definition.classRequirement && (
            <p className="text-[9px] text-vec-cyan capitalize">
              {definition.classRequirement} Only
            </p>
          )}
        </div>
      )}

      {/* Weapon Stats */}
      {isWeapon && hoveredWeaponStats && (
        <div className="mb-2 border-t border-border/40 pt-1.5">
          <p className="mb-1 text-[9px] text-muted uppercase">Weapon Stats</p>

          {/* Damage */}
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-text">Damage</span>
            <div className="flex items-center gap-1.5">
              <span className="text-vec-gold">
                {hoveredWeaponStats.damageFlat > 0 ? "+" : ""}
                {hoveredWeaponStats.damageFlat}
              </span>
              {equippedWeaponStats && slotType !== "weapon" && (
                <StatComparison
                  hovered={hoveredWeaponStats.damageFlat}
                  equipped={equippedWeaponStats.damageFlat}
                />
              )}
            </div>
          </div>

          {/* Range */}
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-text">Range</span>
            <div className="flex items-center gap-1.5">
              <span className="text-vec-gold">
                {hoveredWeaponStats.rangeFlat > 0 ? "+" : ""}
                {hoveredWeaponStats.rangeFlat}
              </span>
              {equippedWeaponStats && slotType !== "weapon" && (
                <StatComparison
                  hovered={hoveredWeaponStats.rangeFlat}
                  equipped={equippedWeaponStats.rangeFlat}
                />
              )}
            </div>
          </div>

          {/* Speed */}
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-text">Speed</span>
            <div className="flex items-center gap-1.5">
              <span className="text-vec-gold">
                {hoveredWeaponStats.speedPercent > 0 ? "+" : ""}
                {hoveredWeaponStats.speedPercent}%
              </span>
              {equippedWeaponStats && slotType !== "weapon" && (
                <StatComparison
                  hovered={hoveredWeaponStats.speedPercent}
                  equipped={equippedWeaponStats.speedPercent}
                  reverseColors
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer hint */}
      <div className="border-t border-border/40 pt-1.5">
        <p className="text-[8px] text-muted/60 italic">
          Drag to move • Drop outside to discard
        </p>
      </div>
    </div>
  );
}

interface StatComparisonProps {
  hovered: number;
  equipped: number;
  reverseColors?: boolean;
}

function StatComparison({
  hovered,
  equipped,
  reverseColors,
}: StatComparisonProps) {
  const diff = hovered - equipped;

  if (diff === 0) {
    return <span className="text-[9px] text-muted">(=)</span>;
  }

  const isPositive = reverseColors ? diff < 0 : diff > 0;
  const colorClass = isPositive ? "text-vec-green" : "text-vec-magenta";
  const sign = diff > 0 ? "+" : "";

  return (
    <span className={`text-[9px] ${colorClass}`}>
      ({sign}
      {diff})
    </span>
  );
}
