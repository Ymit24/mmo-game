import {
  type ClientToServerMessage,
  HUB_ALPHA_MAP,
  PLAYER_COLLIDER_SIZE,
  PLAYER_MOVE_SPEED,
  type PlayerInputState,
  type ServerToClientMessage,
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
  position: Phaser.Math.Vector2,
  input: PlayerInputState,
  dtMs: number,
): void {
  const velocity = inputToVelocity(input, PLAYER_MOVE_SPEED);
  const resolved = resolveMovementWithSliding(
    position,
    velocity,
    dtMs,
    HUB_ALPHA_MAP,
  );

  position.set(resolved.x, resolved.y);
}

function hexToNumber(colorHex: string): number {
  const parsed = Number.parseInt(colorHex.replace("#", ""), 16);
  if (Number.isNaN(parsed)) {
    return 0xfbbf24;
  }
  return parsed;
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
    this.unsubscribeTakeoverRequest = this.bridge.onTakeoverRequest(() => {
      this.authenticate(true);
    });

    this.bridge.updateState({
      connectionStatus: "connecting",
      modal: null,
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
    applyPredictedInput(this.predictedPosition, input, dtMs);
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
      graphics.fillRect(shape.x, shape.y, shape.width, shape.height);
    }

    graphics.lineStyle(2, 0xfbbf24, 0.4);
    for (const region of HUB_ALPHA_MAP.regions) {
      graphics.strokeRect(
        region.shape.x,
        region.shape.y,
        region.shape.width,
        region.shape.height,
      );
    }
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
      this.inputLocked = true;
      this.bridge.updateState({
        connectionStatus: "error",
        lastMessage:
          current.modal?.message ??
          current.lastMessage ??
          "Disconnected from server.",
      });
    });

    ws.addEventListener("error", () => {
      const current = this.bridge.getState();
      this.inputLocked = true;
      this.bridge.updateState({
        connectionStatus: "error",
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
          worldId: HUB_ALPHA_MAP.id,
          characterId: this.characterId,
        });
        return;

      case "auth.error":
        this.inputLocked = true;
        this.bridge.updateState({
          connectionStatus: "error",
          modal: {
            kind: "error",
            message: message.error,
          },
          lastMessage: message.error,
        });
        this.socket?.close();
        return;

      case "world.joined": {
        this.localCharacterId = message.characterId;
        this.bridge.updateState({
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
        const actor = this.remotePlayers.get(message.characterId);
        actor?.sprite.destroy();
        actor?.label.destroy();
        this.remotePlayers.delete(message.characterId);
        this.syncOverlayPlayers();
        return;
      }

      case "world.snapshot": {
        for (const player of message.payload.players) {
          if (player.id === this.localCharacterId) {
            continue;
          }

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
        this.inputLocked = true;
        this.clearWorldActors();
        this.bridge.updateState({
          connectionStatus: "error",
          modal: {
            kind: "kicked",
            message: message.reason,
          },
          worldId: null,
          lastMessage: message.reason,
          players: [],
        });
        this.socket?.close();
        return;

      case "session.conflict":
        this.inputLocked = true;
        this.clearWorldActors();
        if (this.conflictRetryCount < 1) {
          this.conflictRetryCount += 1;
          this.bridge.updateState({
            connectionStatus: "connecting",
            modal: null,
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

  private clearWorldActors(): void {
    this.localPlayer?.sprite.destroy();
    this.localPlayer?.label.destroy();
    this.localPlayer = null;
    for (const actor of this.remotePlayers.values()) {
      actor.sprite.destroy();
      actor.label.destroy();
    }
    this.remotePlayers.clear();
    this.pendingInputs = [];
    this.localCharacterId = null;
    this.predictedPosition.set(0, 0);
    this.bridge.updateState({
      localPlayerId: null,
      localPosition: null,
      players: [],
    });
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
