import type { Database } from "bun:sqlite";
import {
  type ContainerActionErrorCode,
  type InventoryActionErrorCode,
  type StorageSlotRef,
  applyArmorModifiersToMaxHealth,
  applyWeaponModifiersToCombatStats,
  computeLevelScaledCombatStats,
  getCharacterClassColorHex,
  parseClientMessage,
  stringifyServerMessage,
} from "@mmo/shared";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";

import { verifyAccessToken } from "../auth/jwt";
import {
  findCharacterByIdForUser,
  setLastUsedCharacterIdForUser,
  updateCharacterProgressForUser,
} from "../characters/repository";
import type { ServerConfig } from "../config";
import {
  consumeInventoryItem,
  dropInventoryItem,
  getEquipmentLoadoutFromInventoryState,
  loadInventoryStateForCharacter,
  moveBetweenInventoryAndContainer,
  moveInventoryItem,
} from "../inventory/repository";
import { findEnemyArchetypeById } from "./enemyArchetypeRepository";
import { resolveEnemyLootDropDefinitionIds } from "./enemyLootRepository";
import { WorldManager } from "./world";
import type { RealtimeSocketData } from "./world";

export interface RealtimeGateway {
  createSocketData: () => RealtimeSocketData;
  handlers: WebSocketHandler<RealtimeSocketData>;
  onFetchUpgrade: (
    request: Request,
    server: Server<RealtimeSocketData>,
  ) => Response | undefined;
}

function isTextMessage(message: string | Buffer): message is string {
  return typeof message === "string";
}

function sendError(
  socket: ServerWebSocket<RealtimeSocketData>,
  error: string,
): void {
  socket.send(stringifyServerMessage({ type: "error", error }));
}

function sendInventoryActionRejected(
  socket: ServerWebSocket<RealtimeSocketData>,
  code: InventoryActionErrorCode,
  message: string,
): void {
  socket.send(
    stringifyServerMessage({
      type: "inventory.actionRejected",
      code,
      message,
    }),
  );
}

function sendContainerOpenDenied(
  socket: ServerWebSocket<RealtimeSocketData>,
  code: ContainerActionErrorCode,
  message: string,
): void {
  socket.send(
    stringifyServerMessage({
      type: "container.openDenied",
      code,
      message,
    }),
  );
}

function sendContainerActionRejected(
  socket: ServerWebSocket<RealtimeSocketData>,
  code: ContainerActionErrorCode,
  message: string,
): void {
  socket.send(
    stringifyServerMessage({
      type: "container.actionRejected",
      code,
      message,
    }),
  );
}

function getContainerIdFromStorageRef(slot: StorageSlotRef): string | null {
  if (slot.kind !== "container") {
    return null;
  }
  return slot.containerId;
}

function mapInventoryErrorToContainerCode(
  code: InventoryActionErrorCode,
): ContainerActionErrorCode {
  switch (code) {
    case "INVENTORY_SOURCE_EMPTY":
      return "CONTAINER_SOURCE_EMPTY";
    case "INVENTORY_SLOT_INVALID":
      return "CONTAINER_SLOT_INVALID";
    case "INVENTORY_SLOT_TYPE_MISMATCH":
      return "CONTAINER_SLOT_TYPE_MISMATCH";
    case "INVENTORY_CLASS_REQUIREMENT_FAILED":
      return "CONTAINER_CLASS_REQUIREMENT_FAILED";
    case "INVENTORY_LEVEL_REQUIREMENT_FAILED":
      return "CONTAINER_LEVEL_REQUIREMENT_FAILED";
    default:
      return "CONTAINER_REQUEST_INVALID";
  }
}

export function createRealtimeGateway(
  config: ServerConfig,
  db: Database,
): RealtimeGateway {
  const worlds = new WorldManager({
    resolveEnemyArchetype: (archetypeId) =>
      findEnemyArchetypeById(db, archetypeId),
    persistCharacterProgression: ({ userId, characterId, level, xp }) => {
      updateCharacterProgressForUser(db, userId, characterId, level, xp);
    },
    resolveEnemyLootDropDefinitionIds: (enemyArchetypeId, killerClass) =>
      resolveEnemyLootDropDefinitionIds(db, enemyArchetypeId, killerClass),
  });
  const activeSocketsByAccountKey = new Map<
    string,
    ServerWebSocket<RealtimeSocketData>
  >();

  async function handleAuth(
    socket: ServerWebSocket<RealtimeSocketData>,
    token: string,
    forceTakeover = false,
  ): Promise<void> {
    try {
      const result = await verifyAccessToken(token, config);
      const userId = result.payload.sub;
      const exp = result.payload.exp;

      if (typeof userId !== "string" || typeof exp !== "number") {
        socket.send(
          stringifyServerMessage({
            type: "auth.error",
            error: "Token payload is invalid.",
          }),
        );
        socket.close();
        return;
      }

      const accountKey = userId;
      const activeSocket = activeSocketsByAccountKey.get(accountKey);
      if (activeSocket && activeSocket !== socket) {
        const isSameTokenReconnect =
          activeSocket.data.session.authToken === token;

        if (!forceTakeover && !isSameTokenReconnect) {
          socket.send(
            stringifyServerMessage({
              type: "session.conflict",
              reason:
                "An active session already exists for this account. Disconnect it to continue here.",
            }),
          );
          return;
        }

        activeSocket.send(
          stringifyServerMessage({
            type: "session.kicked",
            reason:
              "This account signed in from another connection. Reconnect to continue.",
          }),
        );
        activeSocket.close();
      }

      socket.data.session.authenticated = true;
      socket.data.session.accountKey = accountKey;
      socket.data.session.authToken = token;
      socket.data.session.authExpiresAtEpochMs = exp * 1000;
      socket.data.session.userId = userId;
      activeSocketsByAccountKey.set(accountKey, socket);

      socket.send(
        stringifyServerMessage({
          type: "auth.ok",
        }),
      );
    } catch {
      socket.send(
        stringifyServerMessage({
          type: "auth.error",
          error: "Invalid or expired token.",
        }),
      );
      socket.close();
    }
  }

  return {
    createSocketData: () => worlds.createSocketData(),
    handlers: {
      close: (socket) => {
        const { accountKey } = socket.data.session;
        if (
          accountKey &&
          activeSocketsByAccountKey.get(accountKey) === socket
        ) {
          activeSocketsByAccountKey.delete(accountKey);
        }
        worlds.leaveWorld(socket);
      },
      message: async (socket, message) => {
        if (!isTextMessage(message)) {
          sendError(socket, "Only text messages are supported.");
          return;
        }

        const incoming = parseClientMessage(message);
        if (!incoming) {
          sendError(socket, "Malformed message payload.");
          return;
        }

        if (incoming.type === "auth.hello") {
          if (socket.data.session.authenticated) {
            sendError(socket, "Session is already authenticated.");
            return;
          }

          await handleAuth(socket, incoming.token, incoming.forceTakeover);
          return;
        }

        if (!socket.data.session.authenticated) {
          sendError(socket, "Authenticate before sending world messages.");
          return;
        }
        const authExpiresAtEpochMs = socket.data.session.authExpiresAtEpochMs;
        if (
          typeof authExpiresAtEpochMs !== "number" ||
          Date.now() >= authExpiresAtEpochMs
        ) {
          socket.send(
            stringifyServerMessage({
              type: "auth.error",
              error: "Session expired. Please sign in again.",
            }),
          );
          socket.close();
          return;
        }

        switch (incoming.type) {
          case "world.join": {
            const userId = socket.data.session.userId;
            if (!userId) {
              sendError(socket, "Session is missing identity information.");
              return;
            }
            const character = findCharacterByIdForUser(
              db,
              userId,
              incoming.characterId,
            );
            if (!character) {
              sendError(socket, "Character selection is invalid.");
              return;
            }

            const previousCharacterId = socket.data.session.characterId;
            const inventoryState = loadInventoryStateForCharacter(
              db,
              character.id,
            );
            const equipmentLoadout = getEquipmentLoadoutFromInventoryState(
              inventoryState,
              character.class,
            );
            const armorModifiers = equipmentLoadout.armor;
            const weaponLoadout = equipmentLoadout.weapon;
            const weaponModifiers = weaponLoadout.modifiers;
            socket.data.session.characterId = character.id;
            socket.data.session.characterNickname = character.nickname;
            socket.data.session.characterClass = character.class;
            socket.data.session.characterColorHex = getCharacterClassColorHex(
              character.class,
            );
            socket.data.session.characterRawMaxHealth = character.maxHp;
            socket.data.session.characterRawBaseDamage = character.baseDamage;
            socket.data.session.characterRawBaseAttackSpeedMs =
              character.baseAttackSpeedMs;
            socket.data.session.characterRawBaseAttackRange =
              character.baseAttackRange;
            socket.data.session.characterArmorMaxHpFlat =
              armorModifiers.maxHpFlat;
            socket.data.session.characterArmorDamageReductionPercent =
              armorModifiers.damageReductionPercent;
            socket.data.session.characterWeaponDamageFlat =
              weaponModifiers.damageFlat;
            socket.data.session.characterWeaponRangeFlat =
              weaponModifiers.rangeFlat;
            socket.data.session.characterWeaponSpeedPercent =
              weaponModifiers.speedPercent;
            socket.data.session.characterWeaponStyle =
              weaponLoadout.attack.weaponStyle;
            socket.data.session.characterAttackPatternId =
              weaponLoadout.attack.attackPatternId;
            socket.data.session.characterAttackDamageMultiplier =
              weaponLoadout.attack.damageMultiplier;
            socket.data.session.characterAttackProjectileCount =
              weaponLoadout.attack.projectileCount;
            socket.data.session.characterAttackSpreadDegrees =
              weaponLoadout.attack.spreadDegrees;
            socket.data.session.characterAttackBurstCount =
              weaponLoadout.attack.burstCount;
            socket.data.session.characterAttackBurstIntervalMs =
              weaponLoadout.attack.burstIntervalMs;
            socket.data.session.characterAttackAoeRadius =
              weaponLoadout.attack.aoeRadius;
            socket.data.session.characterAttackAoeDelayMs =
              weaponLoadout.attack.aoeDelayMs;
            socket.data.session.characterAttackMaxTargetHitsPerAttack =
              weaponLoadout.attack.maxTargetHitsPerAttack;
            socket.data.session.characterLevel = character.level;
            socket.data.session.characterXp = character.xp;
            socket.data.session.characterXpToNextLevel =
              character.xpToNextLevel;

            const scaledBaseStats = computeLevelScaledCombatStats(
              {
                maxHp: character.maxHp,
                baseDamage: character.baseDamage,
                baseAttackSpeedMs: character.baseAttackSpeedMs,
                baseAttackRange: character.baseAttackRange,
              },
              character.level,
            );
            const effectiveStats = applyWeaponModifiersToCombatStats(
              {
                baseDamage: scaledBaseStats.baseDamage,
                baseAttackSpeedMs: scaledBaseStats.baseAttackSpeedMs,
                baseAttackRange: scaledBaseStats.baseAttackRange,
              },
              weaponModifiers,
            );
            const effectiveMaxHealth = applyArmorModifiersToMaxHealth(
              scaledBaseStats.maxHp,
              armorModifiers,
            );
            socket.data.session.characterMaxHealth = effectiveMaxHealth;
            socket.data.session.characterBaseDamage = effectiveStats.baseDamage;
            socket.data.session.characterBaseAttackSpeedMs =
              effectiveStats.baseAttackSpeedMs;
            socket.data.session.characterBaseAttackRange =
              effectiveStats.baseAttackRange;
            const shouldKeepRuntimeHealth =
              socket.data.session.characterCurrentHealth !== null &&
              previousCharacterId === character.id;
            socket.data.session.characterCurrentHealth = shouldKeepRuntimeHealth
              ? Math.max(
                  0,
                  Math.min(
                    effectiveMaxHealth,
                    socket.data.session.characterCurrentHealth ??
                      effectiveMaxHealth,
                  ),
                )
              : effectiveMaxHealth;

            const spawn = worlds.joinWorld(
              socket,
              incoming.worldId,
              character.id,
              character.nickname,
              character.class,
              getCharacterClassColorHex(character.class),
              {
                combatStats: {
                  currentHealth: socket.data.session.characterCurrentHealth,
                  maxHealth: effectiveMaxHealth,
                  baseDamage: effectiveStats.baseDamage,
                  baseAttackSpeedMs: effectiveStats.baseAttackSpeedMs,
                  baseAttackRange: effectiveStats.baseAttackRange,
                },
                baseStats: {
                  maxHp: character.maxHp,
                  baseDamage: character.baseDamage,
                  baseAttackSpeedMs: character.baseAttackSpeedMs,
                  baseAttackRange: character.baseAttackRange,
                },
                progression: {
                  level: character.level,
                  xp: character.xp,
                  xpToNextLevel: character.xpToNextLevel,
                },
                armorModifiers,
                weaponModifiers,
                attackConfig: weaponLoadout.attack,
              },
            );
            if (!spawn) {
              sendError(socket, `Unknown world '${incoming.worldId}'.`);
              return;
            }
            setLastUsedCharacterIdForUser(db, userId, character.id);
            socket.send(
              stringifyServerMessage({
                type: "inventory.state",
                state: inventoryState,
              }),
            );
            return;
          }

          case "player.input":
            worlds.applyInput(socket, incoming);
            return;

          case "player.attack":
            worlds.applyAttack(socket, incoming);
            return;

          case "inventory.move": {
            const { characterId, characterClass, characterLevel, worldId } =
              socket.data.session;
            if (!characterId || !characterClass || !characterLevel) {
              sendError(socket, "Character session is not initialized.");
              return;
            }
            if (!worldId) {
              sendError(socket, "Join a world before inventory actions.");
              return;
            }

            const result = moveInventoryItem(
              db,
              characterId,
              incoming.payload.from,
              incoming.payload.to,
              incoming.payload.count,
              {
                characterClass,
                characterLevel,
              },
            );
            if (!result.ok) {
              sendInventoryActionRejected(socket, result.code, result.message);
              return;
            }
            const equipmentLoadout = getEquipmentLoadoutFromInventoryState(
              result.state,
              characterClass,
            );

            worlds.updatePlayerEquipmentModifiers(
              socket,
              equipmentLoadout.armor,
              equipmentLoadout.weapon.modifiers,
              equipmentLoadout.weapon.attack,
            );
            socket.send(
              stringifyServerMessage({
                type: "inventory.moved",
                from: result.from,
                to: result.to,
                state: result.state,
              }),
            );
            return;
          }

          case "inventory.drop":
            {
              const { characterId, worldId } = socket.data.session;
              if (!characterId) {
                sendError(socket, "Character session is not initialized.");
                return;
              }
              if (!worldId) {
                sendError(socket, "Join a world before inventory actions.");
                return;
              }

              const result = dropInventoryItem(
                db,
                characterId,
                incoming.payload.from,
                incoming.payload.count,
              );
              if (!result.ok) {
                sendInventoryActionRejected(
                  socket,
                  result.code,
                  result.message,
                );
                return;
              }
              const characterClassForLoadout =
                socket.data.session.characterClass ?? "knight";
              const equipmentLoadout = getEquipmentLoadoutFromInventoryState(
                result.state,
                characterClassForLoadout,
              );

              worlds.updatePlayerEquipmentModifiers(
                socket,
                equipmentLoadout.armor,
                equipmentLoadout.weapon.modifiers,
                equipmentLoadout.weapon.attack,
              );
              worlds.createPlayerDropLootBag(
                socket,
                incoming.payload.position,
                {
                  id: `drop-${crypto.randomUUID()}`,
                  itemDefinitionId: result.droppedItemDefinitionId,
                  quantity: result.droppedCount,
                },
              );
              socket.send(
                stringifyServerMessage({
                  type: "inventory.drop.ack",
                  from: result.from,
                  droppedItemDefinitionId: result.droppedItemDefinitionId,
                  droppedCount: result.droppedCount,
                  state: result.state,
                }),
              );
            }
            return;

          case "inventory.consume": {
            const { characterId, worldId } = socket.data.session;
            if (!characterId) {
              sendError(socket, "Character session is not initialized.");
              return;
            }
            if (!worldId) {
              sendError(socket, "Join a world before inventory actions.");
              return;
            }
            const healthProbe = worlds.applyDirectHealToPlayer(socket, 0);
            if (!healthProbe) {
              sendInventoryActionRejected(
                socket,
                "INVENTORY_HEALTH_FULL",
                "Health is already full.",
              );
              return;
            }
            if (healthProbe.currentHealth >= healthProbe.maxHealth) {
              sendInventoryActionRejected(
                socket,
                "INVENTORY_HEALTH_FULL",
                "Health is already full.",
              );
              return;
            }

            const result = consumeInventoryItem(
              db,
              characterId,
              incoming.payload.from,
            );
            if (!result.ok) {
              sendInventoryActionRejected(socket, result.code, result.message);
              return;
            }

            const healed = worlds.applyDirectHealToPlayer(
              socket,
              result.restoreAmount,
            );
            if (!healed || healed.restoredHealth <= 0) {
              sendInventoryActionRejected(
                socket,
                "INVENTORY_HEALTH_FULL",
                "Health is already full.",
              );
              return;
            }
            socket.send(
              stringifyServerMessage({
                type: "inventory.consumed",
                from: result.from,
                consumedItemInstanceId: result.consumedItemInstanceId,
                consumedItemDefinitionId: result.consumedItemDefinitionId,
                consumedCount: result.consumedCount,
                restoredHealth: healed.restoredHealth,
                currentHealth: healed.currentHealth,
                maxHealth: healed.maxHealth,
                state: result.state,
              }),
            );
            return;
          }

          case "container.open": {
            const result = worlds.openContainer(socket, incoming.containerId);
            if (!result.ok) {
              sendContainerOpenDenied(socket, result.code, result.message);
              return;
            }
            socket.send(
              stringifyServerMessage({
                type: "container.opened",
                state: result.state,
              }),
            );
            return;
          }

          case "container.close": {
            const openedContainer = worlds.getOpenedContainer(socket);
            if (!openedContainer) {
              sendContainerActionRejected(
                socket,
                "CONTAINER_NOT_OPEN",
                "This loot bag is not currently open.",
              );
              return;
            }
            if (incoming.containerId !== openedContainer.containerId) {
              sendContainerActionRejected(
                socket,
                "CONTAINER_NOT_OPEN",
                "Open this loot bag before closing it.",
              );
              return;
            }
            const closed = worlds.closeContainer(
              socket,
              openedContainer.containerId,
              "manual",
            );
            if (!closed) {
              sendContainerActionRejected(
                socket,
                "CONTAINER_NOT_OPEN",
                "This loot bag is not currently open.",
              );
            }
            return;
          }

          case "container.move": {
            const { characterId, characterClass, characterLevel } =
              socket.data.session;
            if (!characterId || !characterClass || !characterLevel) {
              sendContainerActionRejected(
                socket,
                "CONTAINER_REQUEST_INVALID",
                "Character session is not initialized.",
              );
              return;
            }

            const openedContainer = worlds.getOpenedContainer(socket);
            if (!openedContainer) {
              sendContainerActionRejected(
                socket,
                "CONTAINER_NOT_OPEN",
                "Open a loot bag before moving items.",
              );
              return;
            }

            const fromContainerId = getContainerIdFromStorageRef(
              incoming.payload.from,
            );
            const toContainerId = getContainerIdFromStorageRef(
              incoming.payload.to,
            );
            const messageContainerId = fromContainerId ?? toContainerId;
            if (
              messageContainerId &&
              messageContainerId !== openedContainer.containerId
            ) {
              sendContainerActionRejected(
                socket,
                "CONTAINER_NOT_OPEN",
                "Open this loot bag before moving items.",
              );
              return;
            }

            const result = moveBetweenInventoryAndContainer(
              db,
              characterId,
              openedContainer.containerId,
              openedContainer.slots,
              incoming.payload.from,
              incoming.payload.to,
              incoming.payload.count,
              {
                characterClass,
                characterLevel,
              },
            );
            if (!result.ok) {
              sendContainerActionRejected(
                socket,
                mapInventoryErrorToContainerCode(result.code),
                result.message,
              );
              return;
            }
            const equipmentLoadout = getEquipmentLoadoutFromInventoryState(
              result.inventoryState,
              characterClass,
            );

            worlds.updatePlayerEquipmentModifiers(
              socket,
              equipmentLoadout.armor,
              equipmentLoadout.weapon.modifiers,
              equipmentLoadout.weapon.attack,
            );
            const updateResult = worlds.updateOpenedContainerSlots(
              socket,
              openedContainer.containerId,
              result.containerSlots,
            );
            if (!updateResult.ok) {
              sendContainerActionRejected(
                socket,
                updateResult.code,
                updateResult.message,
              );
              return;
            }

            socket.send(
              stringifyServerMessage({
                type: "inventory.state",
                state: result.inventoryState,
              }),
            );
            socket.send(
              stringifyServerMessage({
                type: "container.updated",
                state: updateResult.state,
              }),
            );
            return;
          }

          default:
            return;
        }
      },
      open: () => {
        // Session bootstrapped by server.upgrade() data payload.
      },
    },
    onFetchUpgrade: (request, server) => {
      const url = new URL(request.url);
      if (url.pathname !== "/ws") {
        return undefined;
      }

      const upgraded = server.upgrade(request, {
        data: worlds.createSocketData(),
      });

      if (upgraded) {
        return undefined;
      }

      return Response.json(
        { error: "WebSocket upgrade failed." },
        { status: 400 },
      );
    },
  };
}
