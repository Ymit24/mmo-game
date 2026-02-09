import type { PlayerInputState, Vector2 } from "../protocol/ws";
import type { CollisionShape, WorldMap } from "./map";

export const PLAYER_MOVE_SPEED = 240;
export const MIN_INPUT_DT_MS = 5;
export const MAX_INPUT_DT_MS = 80;

export interface ColliderSize {
  width: number;
  height: number;
}

export const PLAYER_COLLIDER_SIZE: ColliderSize = {
  width: 32,
  height: 32,
};

interface Aabb {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

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

function toAabb(position: Vector2, colliderSize: ColliderSize): Aabb {
  const halfWidth = colliderSize.width / 2;
  const halfHeight = colliderSize.height / 2;

  return {
    left: position.x - halfWidth,
    right: position.x + halfWidth,
    top: position.y - halfHeight,
    bottom: position.y + halfHeight,
  };
}

function intersectsRect(aabb: Aabb, rect: CollisionShape): boolean {
  return (
    aabb.left < rect.x + rect.width &&
    aabb.right > rect.x &&
    aabb.top < rect.y + rect.height &&
    aabb.bottom > rect.y
  );
}

export function positionCollidesWithMap(
  position: Vector2,
  map: Pick<WorldMap, "collisions">,
  colliderSize: ColliderSize = PLAYER_COLLIDER_SIZE,
  dynamicColliders: ReadonlyArray<CollisionShape> = [],
): boolean {
  const playerAabb = toAabb(position, colliderSize);

  for (const rect of map.collisions) {
    if (intersectsRect(playerAabb, rect)) {
      return true;
    }
  }

  for (const rect of dynamicColliders) {
    if (intersectsRect(playerAabb, rect)) {
      return true;
    }
  }

  return false;
}

export function clampToWorldBounds(
  position: Vector2,
  world: Pick<WorldMap, "width" | "height">,
  colliderSize: ColliderSize = PLAYER_COLLIDER_SIZE,
): Vector2 {
  const halfWidth = colliderSize.width / 2;
  const halfHeight = colliderSize.height / 2;

  const minX = halfWidth;
  const maxX = Math.max(halfWidth, world.width - halfWidth);
  const minY = halfHeight;
  const maxY = Math.max(halfHeight, world.height - halfHeight);

  return {
    x: Math.max(minX, Math.min(maxX, position.x)),
    y: Math.max(minY, Math.min(maxY, position.y)),
  };
}

export function resolveMovementWithSliding(
  position: Vector2,
  velocity: Vector2,
  dtMs: number,
  map: Pick<WorldMap, "width" | "height" | "collisions">,
  colliderSize: ColliderSize = PLAYER_COLLIDER_SIZE,
  dynamicColliders: ReadonlyArray<CollisionShape> = [],
): Vector2 {
  const dtSeconds = clampInputDtMs(dtMs) / 1000;
  const deltaX = velocity.x * dtSeconds;
  const deltaY = velocity.y * dtSeconds;

  const clampedStart = clampToWorldBounds(position, map, colliderSize);
  const next = {
    x: clampedStart.x,
    y: clampedStart.y,
  };

  const movedX = clampToWorldBounds(
    {
      x: clampedStart.x + deltaX,
      y: clampedStart.y,
    },
    map,
    colliderSize,
  );

  if (!positionCollidesWithMap(movedX, map, colliderSize, dynamicColliders)) {
    next.x = movedX.x;
  }

  const movedY = clampToWorldBounds(
    {
      x: next.x,
      y: clampedStart.y + deltaY,
    },
    map,
    colliderSize,
  );

  if (!positionCollidesWithMap(movedY, map, colliderSize, dynamicColliders)) {
    next.y = movedY.y;
  }

  return next;
}

export function centeredBoxToCollisionShape(
  position: Vector2,
  colliderSize: ColliderSize,
): CollisionShape {
  return {
    type: "rect",
    x: position.x - colliderSize.width / 2,
    y: position.y - colliderSize.height / 2,
    width: colliderSize.width,
    height: colliderSize.height,
  };
}
