import type { Database } from "bun:sqlite";
import {
  getCharacterClassColorHex,
  parseClientMessage,
  stringifyServerMessage,
} from "@mmo/shared";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";

import { verifyAccessToken } from "../auth/jwt";
import {
  findCharacterByIdForUser,
  setLastUsedCharacterIdForUser,
} from "../characters/repository";
import type { ServerConfig } from "../config";
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

export function createRealtimeGateway(
  config: ServerConfig,
  db: Database,
): RealtimeGateway {
  const worlds = new WorldManager((archetypeId) =>
    findEnemyArchetypeById(db, archetypeId),
  );
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

            socket.data.session.characterId = character.id;
            socket.data.session.characterNickname = character.nickname;
            socket.data.session.characterClass = character.class;
            socket.data.session.characterColorHex = getCharacterClassColorHex(
              character.class,
            );

            const spawn = worlds.joinWorld(
              socket,
              incoming.worldId,
              character.id,
              character.nickname,
              character.class,
              getCharacterClassColorHex(character.class),
            );
            if (!spawn) {
              sendError(socket, `Unknown world '${incoming.worldId}'.`);
              return;
            }
            setLastUsedCharacterIdForUser(db, userId, character.id);
            return;
          }

          case "player.input":
            worlds.applyInput(socket, incoming);
            return;

          case "inventory.drop":
            worlds.acknowledgeDrop(socket, incoming);
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
