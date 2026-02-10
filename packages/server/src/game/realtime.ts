import type { Database } from "bun:sqlite";
import {
  type InventoryActionErrorCode,
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
  dropInventoryItem,
  getWeaponModifiersFromInventoryState,
  loadInventoryStateForCharacter,
  moveInventoryItem,
} from "../inventory/repository";
import { findEnemyArchetypeById } from "./enemyArchetypeRepository";
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
            const weaponModifiers =
              getWeaponModifiersFromInventoryState(inventoryState);
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
            socket.data.session.characterWeaponDamageFlat =
              weaponModifiers.damageFlat;
            socket.data.session.characterWeaponRangeFlat =
              weaponModifiers.rangeFlat;
            socket.data.session.characterWeaponSpeedPercent =
              weaponModifiers.speedPercent;
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
            socket.data.session.characterMaxHealth = scaledBaseStats.maxHp;
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
                    scaledBaseStats.maxHp,
                    socket.data.session.characterCurrentHealth ??
                      scaledBaseStats.maxHp,
                  ),
                )
              : scaledBaseStats.maxHp;

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
                  maxHealth: scaledBaseStats.maxHp,
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
                weaponModifiers,
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
              {
                characterClass,
                characterLevel,
              },
            );
            if (!result.ok) {
              sendInventoryActionRejected(socket, result.code, result.message);
              return;
            }

            worlds.updatePlayerWeaponModifiers(
              socket,
              getWeaponModifiersFromInventoryState(result.state),
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
              );
              if (!result.ok) {
                sendInventoryActionRejected(
                  socket,
                  result.code,
                  result.message,
                );
                return;
              }

              worlds.updatePlayerWeaponModifiers(
                socket,
                getWeaponModifiersFromInventoryState(result.state),
              );
              socket.send(
                stringifyServerMessage({
                  type: "inventory.drop.ack",
                  from: result.from,
                  removedItemInstanceId: result.removedItemInstanceId,
                  state: result.state,
                }),
              );
            }
            return;

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
