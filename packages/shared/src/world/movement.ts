import type { PlayerInputState, Vector2 } from "../protocol/ws";
import type { WorldMap } from "./map";

export const PLAYER_MOVE_SPEED = 240;
export const MIN_INPUT_DT_MS = 5;
export const MAX_INPUT_DT_MS = 80;

export function clampInputDtMs(dtMs: number): number {
  return Math.max(MIN_INPUT_DT_MS, Math.min(dtMs, MAX_INPUT_DT_MS));
}

export function inputToVelocity(
  input: PlayerInputState,
  speed = PLAYER_MOVE_SPEED,
): Vector2 {
  const horizontal = Number(input.right) - Number(input.left);
  const vertical = Number(input.down) - Number(input.up);

  if (horizontal === 0 && vertical === 0) {
    return { x: 0, y: 0 };
  }

  const length = Math.hypot(horizontal, vertical) || 1;
  return {
    x: (horizontal / length) * speed,
    y: (vertical / length) * speed,
  };
}

export function integrateMovement(
  position: Vector2,
  velocity: Vector2,
  dtMs: number,
): Vector2 {
  const dtSeconds = clampInputDtMs(dtMs) / 1000;
  return {
    x: position.x + velocity.x * dtSeconds,
    y: position.y + velocity.y * dtSeconds,
  };
}

export function clampToWorldBounds(
  position: Vector2,
  world: Pick<WorldMap, "width" | "height">,
): Vector2 {
  return {
    x: Math.max(0, Math.min(world.width, position.x)),
    y: Math.max(0, Math.min(world.height, position.y)),
  };
}
