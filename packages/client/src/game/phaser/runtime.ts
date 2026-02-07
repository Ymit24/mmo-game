import {
  type ClientToServerMessage,
  HUB_ALPHA_MAP,
  type PlayerInputState,
  type ServerToClientMessage,
} from "@mmo/shared";
import Phaser from "phaser";

import { API_BASE_URL } from "../../config/env";
import type { GameBridge, OverlayPlayer } from "../bridge";

interface RuntimeOptions {
  container: HTMLDivElement;
  token: string;
  bridge: GameBridge;
}

interface PendingInput {
  sequence: number;
  input: PlayerInputState;
  dtMs: number;
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

function applyInput(
  position: Phaser.Math.Vector2,
  input: PlayerInputState,
  dtMs: number,
): void {
  const speed = 240;
  const horizontal = Number(input.right) - Number(input.left);
  const vertical = Number(input.down) - Number(input.up);

  if (horizontal === 0 && vertical === 0) {
    return;
  }

  const length = Math.hypot(horizontal, vertical) || 1;
  const dtSeconds = Math.max(5, Math.min(dtMs, 80)) / 1000;

  position.x += (horizontal / length) * speed * dtSeconds;
  position.y += (vertical / length) * speed * dtSeconds;

  position.x = Math.max(0, Math.min(HUB_ALPHA_MAP.width, position.x));
  position.y = Math.max(0, Math.min(HUB_ALPHA_MAP.height, position.y));
}

class HubScene extends Phaser.Scene {
  private readonly token: string;
  private readonly bridge: GameBridge;

  private socket: WebSocket | null = null;
  private playerId: string | null = null;

  private localPlayer: Phaser.GameObjects.Arc | null = null;
  private remotePlayers = new Map<string, Phaser.GameObjects.Arc>();

  private pointerWorld = new Phaser.Math.Vector2();
  private predictedPosition = new Phaser.Math.Vector2();

  private nextInputSequence = 1;
  private pendingInputs: PendingInput[] = [];

  private cursors!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private arrowKeys: Phaser.Types.Input.Keyboard.CursorKeys | null = null;

  private unsubscribeDropRequest: (() => void) | null = null;

  constructor(token: string, bridge: GameBridge) {
    super("hub-scene");
    this.token = token;
    this.bridge = bridge;
  }

  create(): void {
    this.drawBackground();
    this.drawMapShapes();

    this.cameras.main.setBounds(
      0,
      0,
      HUB_ALPHA_MAP.width,
      HUB_ALPHA_MAP.height,
    );
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

    this.bridge.updateState({
      connectionStatus: "connecting",
      mapSize: {
        width: HUB_ALPHA_MAP.width,
        height: HUB_ALPHA_MAP.height,
      },
      pointerWorld: {
        x: this.pointerWorld.x,
        y: this.pointerWorld.y,
      },
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeDropRequest?.();
      this.unsubscribeDropRequest = null;
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }
    });

    this.connect();
  }

  override update(_: number, dt: number): void {
    if (!this.localPlayer) {
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
    const dtMs = Math.round(dt);

    this.pendingInputs.push({ sequence, input, dtMs });
    applyInput(this.predictedPosition, input, dtMs);
    this.localPlayer.setPosition(
      this.predictedPosition.x,
      this.predictedPosition.y,
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

  private drawBackground(): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x070f17, 1);
    graphics.fillRect(0, 0, HUB_ALPHA_MAP.width, HUB_ALPHA_MAP.height);

    graphics.lineStyle(1, 0x143047, 0.25);
    for (
      let x = 0;
      x <= HUB_ALPHA_MAP.width;
      x += HUB_ALPHA_MAP.background.gridSize
    ) {
      graphics.lineBetween(x, 0, x, HUB_ALPHA_MAP.height);
    }
    for (
      let y = 0;
      y <= HUB_ALPHA_MAP.height;
      y += HUB_ALPHA_MAP.background.gridSize
    ) {
      graphics.lineBetween(0, y, HUB_ALPHA_MAP.width, y);
    }
  }

  private drawMapShapes(): void {
    const graphics = this.add.graphics();

    graphics.fillStyle(0x1c3243, 0.5);
    for (const shape of HUB_ALPHA_MAP.collisions) {
      if (shape.type === "rect") {
        graphics.fillRect(shape.x, shape.y, shape.width, shape.height);
      } else {
        graphics.fillCircle(shape.x, shape.y, shape.radius);
      }
    }

    graphics.lineStyle(2, 0xfbbf24, 0.4);
    for (const region of HUB_ALPHA_MAP.regions) {
      if (region.shape.type === "rect") {
        graphics.strokeRect(
          region.shape.x,
          region.shape.y,
          region.shape.width,
          region.shape.height,
        );
      } else {
        graphics.strokeCircle(
          region.shape.x,
          region.shape.y,
          region.shape.radius,
        );
      }
    }
  }

  private connect(): void {
    const ws = new WebSocket(toWsUrl(API_BASE_URL));
    this.socket = ws;

    ws.addEventListener("open", () => {
      this.bridge.updateState({ connectionStatus: "connected" });
      this.sendMessage({
        type: "auth.hello",
        token: this.token,
      });
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
      this.bridge.updateState({
        connectionStatus: "error",
        lastMessage: "Disconnected from server.",
      });
    });

    ws.addEventListener("error", () => {
      this.bridge.updateState({
        connectionStatus: "error",
        lastMessage: "Realtime connection failed.",
      });
    });
  }

  private handleServerMessage(message: ServerToClientMessage): void {
    switch (message.type) {
      case "auth.ok":
        this.playerId = message.playerId;
        this.bridge.updateState({
          localPlayerId: message.playerId,
        });
        return;

      case "auth.error":
        this.bridge.updateState({
          connectionStatus: "error",
          lastMessage: message.error,
        });
        this.socket?.close();
        return;

      case "world.joined": {
        this.bridge.updateState({
          worldId: message.worldId,
          lastMessage: `Joined ${message.worldId}`,
        });

        if (!this.localPlayer) {
          this.localPlayer = this.add.circle(
            message.spawn.x,
            message.spawn.y,
            18,
            0xfbbf24,
            1,
          );
        }

        this.predictedPosition.set(message.spawn.x, message.spawn.y);
        this.localPlayer.setPosition(message.spawn.x, message.spawn.y);
        this.cameras.main.centerOn(message.spawn.x, message.spawn.y);

        this.bridge.updateState({
          localPosition: {
            x: message.spawn.x,
            y: message.spawn.y,
          },
        });
        return;
      }

      case "world.playerJoined": {
        if (message.player.id === this.playerId) {
          return;
        }

        if (this.remotePlayers.has(message.player.id)) {
          return;
        }

        const sprite = this.add.circle(
          message.player.position.x,
          message.player.position.y,
          14,
          0x22d3ee,
          0.95,
        );
        this.remotePlayers.set(message.player.id, sprite);
        this.syncOverlayPlayers();
        return;
      }

      case "world.playerLeft": {
        const sprite = this.remotePlayers.get(message.playerId);
        sprite?.destroy();
        this.remotePlayers.delete(message.playerId);
        this.syncOverlayPlayers();
        return;
      }

      case "world.snapshot": {
        for (const player of message.payload.players) {
          if (player.id === this.playerId) {
            continue;
          }

          const sprite = this.remotePlayers.get(player.id);
          if (!sprite) {
            const next = this.add.circle(
              player.position.x,
              player.position.y,
              14,
              0x22d3ee,
              0.95,
            );
            this.remotePlayers.set(player.id, next);
            continue;
          }

          sprite.setPosition(player.position.x, player.position.y);
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
          applyInput(this.predictedPosition, pending.input, pending.dtMs);
        }

        if (this.localPlayer) {
          this.localPlayer.setPosition(
            this.predictedPosition.x,
            this.predictedPosition.y,
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

      default:
        return;
    }
  }

  private syncOverlayPlayers(): void {
    const players: OverlayPlayer[] = [];

    if (this.playerId) {
      players.push({
        id: this.playerId,
        isLocal: true,
        x: this.predictedPosition.x,
        y: this.predictedPosition.y,
      });
    }

    for (const [id, sprite] of this.remotePlayers.entries()) {
      players.push({
        id,
        isLocal: false,
        x: sprite.x,
        y: sprite.y,
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
    scene: [new HubScene(token, bridge)],
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
