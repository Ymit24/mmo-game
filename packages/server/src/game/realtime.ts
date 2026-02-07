import { parseClientMessage, stringifyServerMessage } from "@mmo/shared";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";

import { verifyAccessToken } from "../auth/jwt";
import type { ServerConfig } from "../config";
import { WorldManager } from "./world";
import type { RealtimeSocketData } from "./world";

const DEFAULT_WORLD_ID = "hub:alpha";

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

export function createRealtimeGateway(config: ServerConfig): RealtimeGateway {
  const worlds = new WorldManager();

  async function handleAuth(
    socket: ServerWebSocket<RealtimeSocketData>,
    token: string,
  ): Promise<void> {
    try {
      const result = await verifyAccessToken(token, config);
      const playerId = result.payload.sub;
      const email = result.payload.email;

      if (typeof playerId !== "string" || typeof email !== "string") {
        socket.send(
          stringifyServerMessage({
            type: "auth.error",
            error: "Token payload is invalid.",
          }),
        );
        socket.close();
        return;
      }

      socket.data.session.authenticated = true;
      socket.data.session.playerId = playerId;
      socket.data.session.email = email;

      socket.send(
        stringifyServerMessage({
          type: "auth.ok",
          playerId,
          email,
        }),
      );

      worlds.joinWorld(socket, DEFAULT_WORLD_ID, playerId, email);
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

          await handleAuth(socket, incoming.token);
          return;
        }

        if (!socket.data.session.authenticated) {
          sendError(socket, "Authenticate before sending world messages.");
          return;
        }

        switch (incoming.type) {
          case "world.join": {
            const playerId = socket.data.session.playerId;
            const email = socket.data.session.email;
            if (!playerId || !email) {
              sendError(socket, "Session is missing identity information.");
              return;
            }

            const spawn = worlds.joinWorld(
              socket,
              incoming.worldId,
              playerId,
              email,
            );
            if (!spawn) {
              sendError(socket, `Unknown world '${incoming.worldId}'.`);
            }
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
