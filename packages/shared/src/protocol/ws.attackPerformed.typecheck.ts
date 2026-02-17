import type { ServerToClientMessage } from "./ws";

const attackPerformedMessage: Extract<
  ServerToClientMessage,
  { type: "combat.attackPerformed" }
> = {
  type: "combat.attackPerformed",
  attackerId: "attacker-1",
  attackStyle: "aoe",
  attackPatternId: "staff_ground_aoe",
  weaponStyle: "staff",
  origin: { x: 100, y: 200 },
  direction: { x: 1, y: 0 },
  range: 120,
  target: { x: 132, y: 212 },
  aoeRadius: 72,
  impactDelayMs: 180,
};

const attackStyle: "melee" | "ranged" | "aoe" =
  attackPerformedMessage.attackStyle;
void attackStyle;
