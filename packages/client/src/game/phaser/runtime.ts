import {
  type ClientToServerMessage,
  DEFAULT_WORLD_ID,
  PLAYER_COLLIDER_SIZE,
  PLAYER_MOVE_SPEED,
  type PlayerInputState,
  type ServerToClientMessage,
  WORLD_MAPS_BY_ID,
  type WorldMap,
  clampInputDtMs,
  inputToVelocity,
  resolveMovementWithSliding,
} from "@mmo/shared";
import Phaser from "phaser";

import { API_BASE_URL } from "../../config/env";
import type { GameBridge, OverlayPlayer } from "../bridge";

interface RuntimeOptions {
  container: HTMLDivElement;
  token: string;
  characterId: string;
  bridge: GameBridge;
}

interface PendingInput {
  sequence: number;
  input: PlayerInputState;
  dtMs: number;
}

interface PlayerActor {
  sprite: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  nickname: string;
  className: string;
  colorHex: string;
}

function toWsUrl(apiBaseUrl: string): string {
  const wsPath = `${apiBaseUrl}/ws`;

  if (wsPath.startsWith("ws://") || wsPath.startsWith("wss://")) {
    return wsPath;
  }

  if (wsPath.startsWith("http://") || wsPath.startsWith("https://")) {
    const url = new URL(wsPath);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${wsPath}`;
}

function applyPredictedInput(
  map: WorldMap,
  position: Phaser.Math.Vector2,
  input: PlayerInputState,
  dtMs: number,
): void {
  const velocity = inputToVelocity(input, PLAYER_MOVE_SPEED);
  const resolved = resolveMovementWithSliding(position, velocity, dtMs, map);

  position.set(resolved.x, resolved.y);
}

function hexToNumber(colorHex: string): number {
  const parsed = Number.parseInt(colorHex.replace("#", ""), 16);
  if (Number.isNaN(parsed)) {
    return 0xfbbf24;
  }
  return parsed;
}

function resolveMapById(worldId: string): WorldMap | null {
  return WORLD_MAPS_BY_ID.get(worldId) ?? null;
}

class HubScene extends Phaser.Scene {
  private readonly token: string;
  private readonly characterId: string;
  private readonly bridge: GameBridge;

  private socket: WebSocket | null = null;
  private localCharacterId: string | null = null;

  private localPlayer: PlayerActor | null = null;
  private remotePlayers = new Map<string, PlayerActor>();

  private pointerWorld = new Phaser.Math.Vector2();
  private predictedPosition = new Phaser.Math.Vector2();

  private nextInputSequence = 1;
  private pendingInputs: PendingInput[] = [];
  private inputLocked = true;
  private conflictRetryCount = 0;
  private currentMap: WorldMap;
  private mapBackgroundGraphics: Phaser.GameObjects.Graphics | null = null;
  private mapOverlayGraphics: Phaser.GameObjects.Graphics | null = null;

  private cursors!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private arrowKeys: Phaser.Types.Input.Keyboard.CursorKeys | null = null;

  private unsubscribeDropRequest: (() => void) | null = null;
  private unsubscribeTakeoverRequest: (() => void) | null = null;

  constructor(token: string, characterId: string, bridge: GameBridge) {
    super("hub-scene");
    this.token = token;
    this.characterId = characterId;
    this.bridge = bridge;
    const initialMap = resolveMapById(DEFAULT_WORLD_ID);
    const fallbackMap = [...WORLD_MAPS_BY_ID.values()][0];
    if (initialMap) {
      this.currentMap = initialMap;
      return;
    }
    if (fallbackMap) {
      this.currentMap = fallbackMap;
      return;
    }
    throw new Error("No world maps are configured.");
  }

  create(): void {
    this.applyWorldMap(this.currentMap);
    this.cameras.main.setZoom(1.15);

    this.cursors = this.input.keyboard?.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as HubScene["cursors"];
    this.arrowKeys = this.input.keyboard?.createCursorKeys() ?? null;

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.pointerWorld.set(pointer.worldX, pointer.worldY);
      this.bridge.updateState({
        pointerWorld: {
          x: this.pointerWorld.x,
          y: this.pointerWorld.y,
        },
      });
    });

    this.unsubscribeDropRequest = this.bridge.onDropRequest(
      ({ itemId, quantity }) => {
        if (!this.bridge.getState().isInWorld) {
          return;
        }
        this.sendMessage({
          type: "inventory.drop",
          payload: {
            itemId,
            quantity,
            position: {
              x: this.pointerWorld.x,
              y: this.pointerWorld.y,
            },
          },
        });
      },
    );
    this.unsubscribeTakeoverRequest = this.bridge.onTakeoverRequest(() => {
      this.authenticate(true);
    });

    this.bridge.updateState({
      connectionStatus: "connecting",
      modal: null,
      isInWorld: false,
      transitionMessage: null,
      pointerWorld: {
        x: this.pointerWorld.x,
        y: this.pointerWorld.y,
      },
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeDropRequest?.();
      this.unsubscribeDropRequest = null;
      this.unsubscribeTakeoverRequest?.();
      this.unsubscribeTakeoverRequest = null;
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }
    });

    this.connect();
  }

  override update(_: number, dt: number): void {
    if (!this.localPlayer || this.inputLocked) {
      return;
    }

    const input: PlayerInputState = {
      up: this.cursors.up.isDown || !!this.arrowKeys?.up.isDown,
      down: this.cursors.down.isDown || !!this.arrowKeys?.down.isDown,
      left: this.cursors.left.isDown || !!this.arrowKeys?.left.isDown,
      right: this.cursors.right.isDown || !!this.arrowKeys?.right.isDown,
    };

    const hasInput = input.up || input.down || input.left || input.right;
    if (!hasInput) {
      return;
    }

    const sequence = this.nextInputSequence++;
    const dtMs = clampInputDtMs(Math.round(dt));

    this.pendingInputs.push({ sequence, input, dtMs });
    applyPredictedInput(this.currentMap, this.predictedPosition, input, dtMs);
    this.localPlayer.sprite.setPosition(
      this.predictedPosition.x,
      this.predictedPosition.y,
    );
    this.localPlayer.label.setPosition(
      this.predictedPosition.x,
      this.predictedPosition.y - 30,
    );

    this.cameras.main.centerOn(
      this.predictedPosition.x,
      this.predictedPosition.y,
    );

    this.bridge.updateState({
      localPosition: {
        x: this.predictedPosition.x,
        y: this.predictedPosition.y,
      },
    });

    this.sendMessage({
      type: "player.input",
      sequence,
      dtMs,
      input,
    });
  }

  private applyWorldMap(map: WorldMap): void {
    this.currentMap = map;
    this.mapBackgroundGraphics?.destroy();
    this.mapOverlayGraphics?.destroy();

    const background = this.add.graphics();
    background.setDepth(-20);
    background.fillStyle(hexToNumber(map.background.color), 1);
    background.fillRect(0, 0, map.width, map.height);
    background.lineStyle(1, 0x2a4236, 0.3);
    for (let x = 0; x <= map.width; x += map.background.gridSize) {
      background.lineBetween(x, 0, x, map.height);
    }
    for (let y = 0; y <= map.height; y += map.background.gridSize) {
      background.lineBetween(0, y, map.width, y);
    }
    this.mapBackgroundGraphics = background;

    const overlay = this.add.graphics();
    overlay.setDepth(-10);
    overlay.fillStyle(0x1f3340, 0.5);
    for (const shape of map.collisions) {
      overlay.fillRect(shape.x, shape.y, shape.width, shape.height);
    }
    overlay.lineStyle(2, 0xfbbf24, 0.35);
    for (const region of map.regions) {
      overlay.strokeRect(
        region.shape.x,
        region.shape.y,
        region.shape.width,
        region.shape.height,
      );
    }

    overlay.fillStyle(0x22d3ee, 0.28);
    overlay.lineStyle(2, 0x67e8f9, 0.85);
    for (const portal of map.portals) {
      overlay.fillRect(
        portal.shape.x,
        portal.shape.y,
        portal.shape.width,
        portal.shape.height,
      );
      overlay.strokeRect(
        portal.shape.x,
        portal.shape.y,
        portal.shape.width,
        portal.shape.height,
      );
    }

    this.mapOverlayGraphics = overlay;
    this.cameras.main.setBounds(0, 0, map.width, map.height);
    this.bridge.updateState({
      mapSize: {
        width: map.width,
        height: map.height,
      },
    });
  }

  private connect(): void {
    const ws = new WebSocket(toWsUrl(API_BASE_URL));
    this.socket = ws;
    this.conflictRetryCount = 0;

    ws.addEventListener("open", () => {
      this.bridge.updateState({ connectionStatus: "connecting", modal: null });
      this.authenticate(false);
    });

    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }

      let message: ServerToClientMessage;
      try {
        message = JSON.parse(event.data) as ServerToClientMessage;
      } catch {
        return;
      }

      this.handleServerMessage(message);
    });

    ws.addEventListener("close", () => {
      const current = this.bridge.getState();
      this.resetWorldPresence();
      this.bridge.updateState({
        connectionStatus: "error",
        isInWorld: false,
        transitionMessage: null,
        worldId: null,
        lastMessage:
          current.modal?.message ??
          current.lastMessage ??
          "Disconnected from server.",
      });
    });

    ws.addEventListener("error", () => {
      const current = this.bridge.getState();
      this.resetWorldPresence();
      this.bridge.updateState({
        connectionStatus: "error",
        isInWorld: false,
        transitionMessage: null,
        worldId: null,
        lastMessage:
          current.modal?.message ??
          current.lastMessage ??
          "Realtime connection failed.",
      });
    });
  }

  private handleServerMessage(message: ServerToClientMessage): void {
    switch (message.type) {
      case "auth.ok":
        this.bridge.updateState({
          modal: null,
          connectionStatus: "connecting",
        });
        this.sendMessage({
          type: "world.join",
          worldId: DEFAULT_WORLD_ID,
          characterId: this.characterId,
        });
        return;

      case "auth.error":
        this.resetWorldPresence();
        this.bridge.updateState({
          connectionStatus: "error",
          modal: {
            kind: "error",
            message: message.error,
          },
          isInWorld: false,
          transitionMessage: null,
          worldId: null,
          lastMessage: message.error,
        });
        this.socket?.close();
        return;

      case "world.transitioning":
        this.startWorldTransition(
          resolveMapById(message.toWorldId)?.name ?? message.toWorldId,
        );
        return;

      case "world.joined": {
        const nextMap = resolveMapById(message.worldId);
        if (nextMap) {
          this.applyWorldMap(nextMap);
        }

        this.localCharacterId = message.characterId;
        this.pendingInputs = [];
        this.bridge.updateState({
          isInWorld: true,
          transitionMessage: null,
          worldId: message.worldId,
          lastMessage: `Joined ${message.worldId}`,
          connectionStatus: "connected",
          modal: null,
          localPlayerId: message.characterId,
        });
        this.inputLocked = false;

        if (!this.localPlayer) {
          const sprite = this.add.rectangle(
            message.spawn.x,
            message.spawn.y,
            PLAYER_COLLIDER_SIZE.width,
            PLAYER_COLLIDER_SIZE.height,
            hexToNumber(message.colorHex),
            1,
          );
          const label = this.add
            .text(message.spawn.x, message.spawn.y - 30, message.nickname, {
              fontFamily: "JetBrains Mono",
              fontSize: "11px",
              color: message.colorHex,
              stroke: "#05070b",
              strokeThickness: 2,
            })
            .setOrigin(0.5, 0.5);
          this.localPlayer = {
            sprite,
            label,
            nickname: message.nickname,
            className: message.class,
            colorHex: message.colorHex,
          };
        }

        this.predictedPosition.set(message.spawn.x, message.spawn.y);
        this.localPlayer.sprite.setPosition(message.spawn.x, message.spawn.y);
        this.localPlayer.label
          .setText(message.nickname)
          .setColor(message.colorHex)
          .setPosition(message.spawn.x, message.spawn.y - 30);
        this.cameras.main.centerOn(message.spawn.x, message.spawn.y);

        this.bridge.updateState({
          localPosition: {
            x: message.spawn.x,
            y: message.spawn.y,
          },
        });
        this.syncOverlayPlayers();
        return;
      }

      case "world.playerJoined": {
        if (message.worldId !== this.bridge.getState().worldId) {
          return;
        }
        if (message.player.id === this.localCharacterId) {
          return;
        }

        if (this.remotePlayers.has(message.player.id)) {
          return;
        }

        const sprite = this.add.rectangle(
          message.player.position.x,
          message.player.position.y,
          28,
          28,
          hexToNumber(message.player.colorHex),
          0.95,
        );
        const label = this.add
          .text(
            message.player.position.x,
            message.player.position.y - 30,
            message.player.nickname,
            {
              fontFamily: "JetBrains Mono",
              fontSize: "11px",
              color: message.player.colorHex,
              stroke: "#05070b",
              strokeThickness: 2,
            },
          )
          .setOrigin(0.5, 0.5);

        this.remotePlayers.set(message.player.id, {
          sprite,
          label,
          nickname: message.player.nickname,
          className: message.player.class,
          colorHex: message.player.colorHex,
        });
        this.syncOverlayPlayers();
        return;
      }

      case "world.playerLeft": {
        if (message.worldId !== this.bridge.getState().worldId) {
          return;
        }
        const actor = this.remotePlayers.get(message.characterId);
        actor?.sprite.destroy();
        actor?.label.destroy();
        this.remotePlayers.delete(message.characterId);
        this.syncOverlayPlayers();
        return;
      }

      case "world.snapshot": {
        if (message.payload.worldId !== this.bridge.getState().worldId) {
          return;
        }
        const snapshotIds = new Set<string>();
        for (const player of message.payload.players) {
          if (player.id === this.localCharacterId) {
            continue;
          }
          snapshotIds.add(player.id);

          const actor = this.remotePlayers.get(player.id);
          if (!actor) {
            const sprite = this.add.rectangle(
              player.position.x,
              player.position.y,
              28,
              28,
              hexToNumber(player.colorHex),
              0.95,
            );
            const label = this.add
              .text(
                player.position.x,
                player.position.y - 30,
                player.nickname,
                {
                  fontFamily: "JetBrains Mono",
                  fontSize: "11px",
                  color: player.colorHex,
                  stroke: "#05070b",
                  strokeThickness: 2,
                },
              )
              .setOrigin(0.5, 0.5);
            this.remotePlayers.set(player.id, {
              sprite,
              label,
              nickname: player.nickname,
              className: player.class,
              colorHex: player.colorHex,
            });
            continue;
          }

          actor.sprite.setPosition(player.position.x, player.position.y);
          actor.label
            .setText(player.nickname)
            .setColor(player.colorHex)
            .setPosition(player.position.x, player.position.y - 30);
          actor.nickname = player.nickname;
          actor.className = player.class;
          actor.colorHex = player.colorHex;
        }

        for (const [id, actor] of this.remotePlayers.entries()) {
          if (snapshotIds.has(id)) {
            continue;
          }
          actor.sprite.destroy();
          actor.label.destroy();
          this.remotePlayers.delete(id);
        }

        this.syncOverlayPlayers();
        return;
      }

      case "player.state": {
        this.predictedPosition.set(message.position.x, message.position.y);

        this.pendingInputs = this.pendingInputs.filter(
          (pending) => pending.sequence > message.lastProcessedInputSequence,
        );

        for (const pending of this.pendingInputs) {
          applyPredictedInput(
            this.currentMap,
            this.predictedPosition,
            pending.input,
            pending.dtMs,
          );
        }

        if (this.localPlayer) {
          this.localPlayer.sprite.setPosition(
            this.predictedPosition.x,
            this.predictedPosition.y,
          );
          this.localPlayer.label.setPosition(
            this.predictedPosition.x,
            this.predictedPosition.y - 30,
          );
        }

        this.bridge.updateState({
          localPosition: {
            x: this.predictedPosition.x,
            y: this.predictedPosition.y,
          },
        });

        this.syncOverlayPlayers();
        return;
      }

      case "inventory.drop.ack":
        this.bridge.updateState({
          lastMessage: `Dropped ${message.quantity}x ${message.itemId}`,
        });
        return;

      case "error":
        this.bridge.updateState({
          lastMessage: message.error,
        });
        return;

      case "session.kicked":
        this.resetWorldPresence();
        this.bridge.updateState({
          connectionStatus: "error",
          modal: {
            kind: "kicked",
            message: message.reason,
          },
          isInWorld: false,
          transitionMessage: null,
          worldId: null,
          lastMessage: message.reason,
          players: [],
        });
        this.socket?.close();
        return;

      case "session.conflict":
        this.resetWorldPresence();
        if (this.conflictRetryCount < 1) {
          this.conflictRetryCount += 1;
          this.bridge.updateState({
            connectionStatus: "connecting",
            modal: null,
            isInWorld: false,
            transitionMessage: null,
            worldId: null,
            lastMessage: "Reconnecting to existing session...",
            players: [],
          });
          setTimeout(() => {
            this.authenticate(false);
          }, 350);
          return;
        }
        this.bridge.updateState({
          connectionStatus: "error",
          modal: {
            kind: "conflict",
            message: message.reason,
          },
          isInWorld: false,
          transitionMessage: null,
          worldId: null,
          lastMessage: message.reason,
          players: [],
        });
        return;

      default:
        return;
    }
  }

  private authenticate(forceTakeover: boolean): void {
    this.sendMessage({
      type: "auth.hello",
      token: this.token,
      forceTakeover,
    });
  }

  private startWorldTransition(destinationName: string): void {
    this.resetWorldPresence();
    this.bridge.updateState({
      isInWorld: false,
      transitionMessage: `Traveling to ${destinationName}`,
      lastMessage: `Traveling to ${destinationName}`,
    });
  }

  private clearWorldActors(): void {
    this.localPlayer?.sprite.destroy();
    this.localPlayer?.label.destroy();
    this.localPlayer = null;
    this.clearRemotePlayers();
    this.pendingInputs = [];
    this.nextInputSequence = 1;
    this.localCharacterId = null;
    this.predictedPosition.set(0, 0);
    this.bridge.updateState({
      isInWorld: false,
      worldId: null,
      transitionMessage: null,
      localPlayerId: null,
      localPosition: null,
      players: [],
    });
  }

  private resetWorldPresence(): void {
    this.inputLocked = true;
    this.clearWorldActors();
  }

  private clearRemotePlayers(): void {
    for (const actor of this.remotePlayers.values()) {
      actor.sprite.destroy();
      actor.label.destroy();
    }
    this.remotePlayers.clear();
  }

  private syncOverlayPlayers(): void {
    const players: OverlayPlayer[] = [];

    if (
      this.localCharacterId &&
      this.localPlayer &&
      this.bridge.getState().worldId
    ) {
      players.push({
        id: this.localCharacterId,
        nickname: this.localPlayer.nickname,
        className: this.localPlayer.className,
        colorHex: this.localPlayer.colorHex,
        isLocal: true,
        x: this.predictedPosition.x,
        y: this.predictedPosition.y,
      });
    }

    for (const [id, actor] of this.remotePlayers.entries()) {
      players.push({
        id,
        nickname: actor.nickname,
        className: actor.className,
        colorHex: actor.colorHex,
        isLocal: false,
        x: actor.sprite.x,
        y: actor.sprite.y,
      });
    }

    this.bridge.updateState({ players });
  }

  private sendMessage(message: ClientToServerMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }
}

export function mountGameRuntime({
  container,
  token,
  characterId,
  bridge,
}: RuntimeOptions): () => void {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    backgroundColor: "#05070b",
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: container.clientWidth,
      height: container.clientHeight,
    },
    scene: [new HubScene(token, characterId, bridge)],
    physics: {
      default: "arcade",
      arcade: {
        debug: false,
      },
    },
  });

  return () => {
    game.scene.getScene("hub-scene")?.events.emit("shutdown");
    game.destroy(true);
  };
}
