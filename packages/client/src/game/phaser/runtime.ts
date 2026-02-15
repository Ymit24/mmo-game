import {
  type ClientToServerMessage,
  type CollisionShape,
  type CombatFloatingTextVariant,
  DEFAULT_WORLD_ID,
  type EnemySnapshot,
  LOOT_BAG_INTERACT_RADIUS,
  type LootBagSnapshot,
  PLAYER_COLLIDER_SIZE,
  PLAYER_MOVE_SPEED,
  type PlayerInputState,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type ServerToClientMessage,
  WORLD_MAPS_BY_ID,
  type WorldMap,
  centeredBoxToCollisionShape,
  clampInputDtMs,
  inputToVelocity,
  resolveMovementWithSliding,
} from "@mmo/shared";
import Phaser from "phaser";

import { API_BASE_URL } from "../../config/env";
import type {
  GameBridge,
  OverlayEnemy,
  OverlayLootBag,
  OverlayPlayer,
  OverlayProjectile,
} from "../bridge";

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

interface EnemyActor {
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  healthBarBackground: Phaser.GameObjects.Rectangle;
  healthBarFill: Phaser.GameObjects.Rectangle;
  healthText: Phaser.GameObjects.Text;
  colorHex: string;
}

interface ProjectileActor {
  body: Phaser.GameObjects.Arc;
  trail: Phaser.GameObjects.Arc;
  colorHex: string;
}

interface LootBagActor {
  body: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  itemCount: number;
  ownerCharacterId: string | null;
  ownerLockedUntilEpochMs: number | null;
  openedByCharacterId: string | null;
}

const PLAYER_LABEL_OFFSET_Y = 30;
const ENEMY_LABEL_OFFSET_Y = 34;
const ENEMY_HEALTH_TEXT_OFFSET_Y = 22;
const ENEMY_HEALTH_BAR_OFFSET_Y = 12;

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
  dynamicColliders: ReadonlyArray<CollisionShape>,
): void {
  const velocity = inputToVelocity(input, PLAYER_MOVE_SPEED);
  const resolved = resolveMovementWithSliding(
    position,
    velocity,
    dtMs,
    map,
    PLAYER_COLLIDER_SIZE,
    dynamicColliders,
  );

  position.set(resolved.x, resolved.y);
}

function hexToNumber(colorHex: string): number {
  const parsed = Number.parseInt(colorHex.replace("#", ""), 16);
  if (Number.isNaN(parsed)) {
    return 0x00ff41;
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
  private enemyActors = new Map<string, EnemyActor>();
  private projectileActors = new Map<string, ProjectileActor>();
  private lootBagActors = new Map<string, LootBagActor>();
  private enemyPredictionColliders: CollisionShape[] = [];

  private pointerWorld = new Phaser.Math.Vector2();
  private predictedPosition = new Phaser.Math.Vector2();

  private nextInputSequence = 1;
  private pendingInputs: PendingInput[] = [];
  private inputLocked = true;
  private conflictRetryCount = 0;
  private floatingTextSerial = 0;
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
  private attackKey: Phaser.Input.Keyboard.Key | null = null;
  private interactKey: Phaser.Input.Keyboard.Key | null = null;

  private unsubscribeInventoryMoveRequest: (() => void) | null = null;
  private unsubscribeInventoryDropRequest: (() => void) | null = null;
  private unsubscribeContainerMoveRequest: (() => void) | null = null;
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
    this.cameras.main.setZoom(1);
    this.cameras.main.setRoundPixels(true);

    this.cursors = this.input.keyboard?.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as HubScene["cursors"];
    this.arrowKeys = this.input.keyboard?.createCursorKeys() ?? null;
    this.attackKey =
      this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE) ?? null;
    this.interactKey =
      this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E) ?? null;

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.pointerWorld.set(pointer.worldX, pointer.worldY);
      this.bridge.updateState({
        pointerWorld: {
          x: this.pointerWorld.x,
          y: this.pointerWorld.y,
        },
      });
    });
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) {
        return;
      }
      this.pointerWorld.set(pointer.worldX, pointer.worldY);
      this.tryAttack();
    });
    this.attackKey?.on("down", () => {
      this.tryAttack();
    });
    this.interactKey?.on("down", () => {
      this.tryInteract();
    });

    this.unsubscribeInventoryMoveRequest = this.bridge.onInventoryMoveRequest(
      ({ from, to }) => {
        if (!this.bridge.getState().isInWorld) {
          return;
        }
        this.sendMessage({
          type: "inventory.move",
          payload: {
            from,
            to,
          },
        });
      },
    );
    this.unsubscribeInventoryDropRequest = this.bridge.onInventoryDropRequest(
      ({ from }) => {
        if (!this.bridge.getState().isInWorld) {
          return;
        }
        this.sendMessage({
          type: "inventory.drop",
          payload: {
            from,
            position: {
              x: this.pointerWorld.x,
              y: this.pointerWorld.y,
            },
          },
        });
      },
    );
    this.unsubscribeContainerMoveRequest = this.bridge.onContainerMoveRequest(
      ({ from, to }) => {
        if (!this.bridge.getState().isInWorld) {
          return;
        }
        this.sendMessage({
          type: "container.move",
          payload: {
            from,
            to,
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
      inventory: null,
      pointerWorld: {
        x: this.pointerWorld.x,
        y: this.pointerWorld.y,
      },
      projectiles: [],
      lootBags: [],
      openContainer: null,
      localHealthCurrent: null,
      localHealthMax: null,
      localLevel: null,
      localXp: null,
      localXpToNextLevel: null,
      lastCombatDeniedReason: null,
      inventoryError: null,
      containerError: null,
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeInventoryMoveRequest?.();
      this.unsubscribeInventoryMoveRequest = null;
      this.unsubscribeInventoryDropRequest?.();
      this.unsubscribeInventoryDropRequest = null;
      this.unsubscribeContainerMoveRequest?.();
      this.unsubscribeContainerMoveRequest = null;
      this.unsubscribeTakeoverRequest?.();
      this.unsubscribeTakeoverRequest = null;
      this.attackKey?.off("down");
      this.attackKey = null;
      this.interactKey?.off("down");
      this.interactKey = null;
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }
    });

    this.connect();
  }

  private createPlayerLabel(
    x: number,
    y: number,
    nickname: string,
    colorHex: string,
  ): Phaser.GameObjects.Text {
    return this.add
      .text(Math.round(x), Math.round(y - PLAYER_LABEL_OFFSET_Y), nickname, {
        fontFamily: "Share Tech Mono",
        fontSize: "12px",
        color: colorHex,
        stroke: "#000000",
        strokeThickness: 1,
      })
      .setOrigin(0.5, 0.5);
  }

  private positionPlayerLabel(
    label: Phaser.GameObjects.Text,
    x: number,
    y: number,
  ): void {
    label.setPosition(Math.round(x), Math.round(y - PLAYER_LABEL_OFFSET_Y));
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
    applyPredictedInput(
      this.currentMap,
      this.predictedPosition,
      input,
      dtMs,
      this.enemyPredictionColliders,
    );
    this.localPlayer.sprite.setPosition(
      this.predictedPosition.x,
      this.predictedPosition.y,
    );
    this.positionPlayerLabel(
      this.localPlayer.label,
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

  private tryAttack(): void {
    if (this.inputLocked || !this.localPlayer || !this.localCharacterId) {
      return;
    }
    if (!this.bridge.getState().isInWorld) {
      return;
    }

    this.sendMessage({
      type: "player.attack",
      aim: {
        x: this.pointerWorld.x || this.predictedPosition.x + 1,
        y: this.pointerWorld.y || this.predictedPosition.y,
      },
    });
  }

  private tryInteract(): void {
    if (this.inputLocked || !this.localCharacterId) {
      return;
    }
    const openContainer = this.bridge.getState().openContainer;
    if (openContainer) {
      this.sendMessage({
        type: "container.close",
        containerId: openContainer.containerId,
      });
      return;
    }

    const nearest = this.findNearestLootBagActor();
    if (!nearest) {
      return;
    }

    this.sendMessage({
      type: "container.open",
      containerId: nearest.id,
    });
  }

  private applyWorldMap(map: WorldMap): void {
    this.currentMap = map;
    this.mapBackgroundGraphics?.destroy();
    this.mapOverlayGraphics?.destroy();

    const background = this.add.graphics();
    background.setDepth(-20);
    background.fillStyle(0x000000, 1);
    background.fillRect(0, 0, map.width, map.height);
    background.lineStyle(1, 0x00ff41, 0.12);
    for (let x = 0; x <= map.width; x += map.background.gridSize) {
      background.lineBetween(x, 0, x, map.height);
    }
    for (let y = 0; y <= map.height; y += map.background.gridSize) {
      background.lineBetween(0, y, map.width, y);
    }
    this.mapBackgroundGraphics = background;

    const overlay = this.add.graphics();
    overlay.setDepth(-10);
    for (const shape of map.collisions) {
      overlay.fillStyle(0x00ff41, 0.03);
      overlay.fillRect(shape.x, shape.y, shape.width, shape.height);
      overlay.lineStyle(1, 0x00ff41, 0.3);
      overlay.strokeRect(shape.x, shape.y, shape.width, shape.height);
    }
    overlay.lineStyle(2, 0xffd700, 0.25);
    for (const region of map.regions) {
      overlay.strokeRect(
        region.shape.x,
        region.shape.y,
        region.shape.width,
        region.shape.height,
      );
    }

    overlay.fillStyle(0x00e5ff, 0.18);
    overlay.lineStyle(2, 0x00e5ff, 0.85);
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
        inventory: null,
        inventoryError: null,
        containerError: null,
        openContainer: null,
        lootBags: [],
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
        inventory: null,
        inventoryError: null,
        containerError: null,
        openContainer: null,
        lootBags: [],
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
          inventory: null,
          inventoryError: null,
          containerError: null,
          openContainer: null,
          lootBags: [],
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
        this.enemyPredictionColliders = [];
        this.clearEnemyActors();
        this.clearProjectileActors();
        this.clearLootBagActors();
        this.bridge.updateState({
          isInWorld: true,
          transitionMessage: null,
          worldId: message.worldId,
          lastMessage: `Joined ${message.worldId}`,
          connectionStatus: "connected",
          modal: null,
          localPlayerId: message.characterId,
          localHealthCurrent: message.currentHealth,
          localHealthMax: message.maxHealth,
          localLevel: message.level,
          localXp: message.xp,
          localXpToNextLevel: message.xpToNextLevel,
          lastCombatDeniedReason: null,
          inventoryError: null,
          containerError: null,
          openContainer: null,
          lootBags: [],
        });
        this.inputLocked = false;

        if (!this.localPlayer) {
          const sprite = this.add.rectangle(
            message.spawn.x,
            message.spawn.y,
            PLAYER_COLLIDER_SIZE.width,
            PLAYER_COLLIDER_SIZE.height,
            hexToNumber(message.colorHex),
            0.08,
          );
          sprite.setStrokeStyle(2, hexToNumber(message.colorHex), 0.9);
          const label = this.createPlayerLabel(
            message.spawn.x,
            message.spawn.y,
            message.nickname,
            message.colorHex,
          );
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
          .setColor(message.colorHex);
        this.positionPlayerLabel(
          this.localPlayer.label,
          message.spawn.x,
          message.spawn.y,
        );
        this.cameras.main.centerOn(message.spawn.x, message.spawn.y);

        this.bridge.updateState({
          localPosition: {
            x: message.spawn.x,
            y: message.spawn.y,
          },
        });
        this.syncOverlayState();
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
          0.08,
        );
        sprite.setStrokeStyle(1, hexToNumber(message.player.colorHex), 0.85);
        const label = this.createPlayerLabel(
          message.player.position.x,
          message.player.position.y,
          message.player.nickname,
          message.player.colorHex,
        );

        this.remotePlayers.set(message.player.id, {
          sprite,
          label,
          nickname: message.player.nickname,
          className: message.player.class,
          colorHex: message.player.colorHex,
        });
        this.syncOverlayState();
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
        this.syncOverlayState();
        return;
      }

      case "world.snapshot": {
        if (message.payload.worldId !== this.bridge.getState().worldId) {
          return;
        }
        this.reconcileSnapshotPlayers(message.payload.players);
        this.reconcileSnapshotEnemies(message.payload.enemies);
        this.reconcileSnapshotProjectiles(message.payload.projectiles);
        this.reconcileSnapshotLootBags(message.payload.lootBags);
        this.enemyPredictionColliders = message.payload.enemies.map((enemy) =>
          centeredBoxToCollisionShape(
            { x: enemy.position.x, y: enemy.position.y },
            {
              width: enemy.width,
              height: enemy.height,
            },
          ),
        );

        this.syncOverlayState();
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
            this.enemyPredictionColliders,
          );
        }

        if (this.localPlayer) {
          this.localPlayer.sprite.setPosition(
            this.predictedPosition.x,
            this.predictedPosition.y,
          );
          this.positionPlayerLabel(
            this.localPlayer.label,
            this.predictedPosition.x,
            this.predictedPosition.y,
          );
        }

        this.bridge.updateState({
          localPosition: {
            x: this.predictedPosition.x,
            y: this.predictedPosition.y,
          },
          localHealthCurrent: message.currentHealth,
          localHealthMax: message.maxHealth,
        });

        this.syncOverlayState();
        return;
      }

      case "combat.attackDenied":
        this.bridge.updateState({
          lastMessage: message.message,
          lastCombatDeniedReason: message.reason,
        });
        if (message.reason === "safe_zone") {
          this.spawnSafeZoneText();
        }
        return;

      case "combat.attackPerformed":
        this.playAttackEffect(
          message.attackStyle,
          message.origin,
          message.direction,
          message.range,
        );
        return;

      case "combat.playerDied":
        this.bridge.updateState({
          lastMessage: "You were defeated. Respawning...",
        });
        return;

      case "combat.floatingText":
        this.spawnCombatFloatingText(
          message.position.x,
          message.position.y,
          message.text,
          message.variant,
        );
        return;

      case "progression.updated":
        this.bridge.updateState({
          localLevel: message.level,
          localXp: message.xp,
          localXpToNextLevel: message.xpToNextLevel,
          localHealthMax: message.maxHealth,
          localHealthCurrent: Math.min(
            message.maxHealth,
            message.currentHealth,
          ),
          lastMessage:
            message.xpToNextLevel === null
              ? `Level ${message.level} (max) reached`
              : `Level ${message.level} • ${message.xp}/${message.xpToNextLevel} XP`,
        });
        return;

      case "inventory.state":
        this.bridge.updateState({
          inventory: message.state,
          inventoryError: null,
          containerError: null,
        });
        return;

      case "inventory.moved":
        this.bridge.updateState({
          inventory: message.state,
          inventoryError: null,
          containerError: null,
          lastMessage: "Inventory updated.",
        });
        return;

      case "inventory.drop.ack":
        this.bridge.updateState({
          inventory: message.state,
          inventoryError: null,
          containerError: null,
          lastMessage: "Dropped item.",
        });
        return;

      case "container.opened":
        this.bridge.updateState({
          openContainer: message.state,
          containerError: null,
          lastMessage: "Loot bag opened.",
        });
        return;

      case "container.updated":
        this.bridge.updateState({
          openContainer: message.state,
          containerError: null,
        });
        return;

      case "container.closed":
        this.bridge.updateState({
          openContainer: null,
          containerError: null,
          lastMessage:
            message.reason === "out_of_range"
              ? "Moved out of range."
              : message.reason === "despawned"
                ? "Loot bag disappeared."
                : "Loot bag closed.",
        });
        return;

      case "container.openDenied":
        this.bridge.updateState({
          containerError: message.message,
          lastMessage: message.message,
        });
        return;

      case "container.actionRejected":
        this.bridge.updateState({
          containerError: message.message,
          lastMessage: message.message,
        });
        return;

      case "inventory.actionRejected":
        this.bridge.updateState({
          inventoryError: message.message,
          lastMessage: message.message,
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
          enemies: [],
          lootBags: [],
          inventory: null,
          inventoryError: null,
          containerError: null,
          openContainer: null,
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
            enemies: [],
            lootBags: [],
            inventory: null,
            inventoryError: null,
            containerError: null,
            openContainer: null,
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
          enemies: [],
          lootBags: [],
          inventory: null,
          inventoryError: null,
          containerError: null,
          openContainer: null,
        });
        return;

      default:
        return;
    }
  }

  private reconcileSnapshotPlayers(players: PlayerSnapshot[]): void {
    const snapshotIds = new Set<string>();
    for (const player of players) {
      if (player.id === this.localCharacterId) {
        this.bridge.updateState({
          localHealthCurrent: player.currentHealth,
          localHealthMax: player.maxHealth,
        });
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
          0.08,
        );
        sprite.setStrokeStyle(1, hexToNumber(player.colorHex), 0.85);
        const label = this.createPlayerLabel(
          player.position.x,
          player.position.y,
          player.nickname,
          player.colorHex,
        );
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
      actor.label.setText(player.nickname).setColor(player.colorHex);
      this.positionPlayerLabel(
        actor.label,
        player.position.x,
        player.position.y,
      );
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
  }

  private reconcileSnapshotEnemies(enemies: EnemySnapshot[]): void {
    const snapshotIds = new Set<string>();

    for (const enemy of enemies) {
      snapshotIds.add(enemy.id);

      const existing = this.enemyActors.get(enemy.id);
      if (!existing) {
        this.enemyActors.set(enemy.id, this.createEnemyActor(enemy));
        continue;
      }

      this.updateEnemyActor(existing, enemy);
    }

    for (const [id, actor] of this.enemyActors.entries()) {
      if (snapshotIds.has(id)) {
        continue;
      }

      this.destroyEnemyActor(actor);
      this.enemyActors.delete(id);
    }
  }

  private reconcileSnapshotProjectiles(
    projectiles: ProjectileSnapshot[],
  ): void {
    const snapshotIds = new Set<string>();

    for (const projectile of projectiles) {
      snapshotIds.add(projectile.id);
      const existing = this.projectileActors.get(projectile.id);
      if (!existing) {
        const trail = this.add.circle(
          projectile.position.x,
          projectile.position.y,
          Math.max(2, projectile.radius + 2),
          hexToNumber(projectile.colorHex),
          0.18,
        );
        const body = this.add.circle(
          projectile.position.x,
          projectile.position.y,
          Math.max(2, projectile.radius),
          hexToNumber(projectile.colorHex),
          0.95,
        );
        this.projectileActors.set(projectile.id, {
          body,
          trail,
          colorHex: projectile.colorHex,
        });
        continue;
      }

      existing.colorHex = projectile.colorHex;
      existing.body
        .setPosition(projectile.position.x, projectile.position.y)
        .setRadius(Math.max(2, projectile.radius))
        .setFillStyle(hexToNumber(projectile.colorHex), 0.95);
      existing.trail
        .setPosition(projectile.position.x, projectile.position.y)
        .setRadius(Math.max(2, projectile.radius + 2))
        .setFillStyle(hexToNumber(projectile.colorHex), 0.18);
    }

    for (const [id, actor] of this.projectileActors.entries()) {
      if (snapshotIds.has(id)) {
        continue;
      }
      actor.body.destroy();
      actor.trail.destroy();
      this.projectileActors.delete(id);
    }
  }

  private reconcileSnapshotLootBags(lootBags: LootBagSnapshot[]): void {
    const snapshotIds = new Set<string>();

    for (const lootBag of lootBags) {
      snapshotIds.add(lootBag.id);
      const existing = this.lootBagActors.get(lootBag.id);
      if (!existing) {
        this.lootBagActors.set(lootBag.id, this.createLootBagActor(lootBag));
        continue;
      }
      this.updateLootBagActor(existing, lootBag);
    }

    for (const [id, actor] of this.lootBagActors.entries()) {
      if (snapshotIds.has(id)) {
        continue;
      }
      this.destroyLootBagActor(actor);
      this.lootBagActors.delete(id);
    }
  }

  private createLootBagActor(lootBag: {
    position: { x: number; y: number };
    itemCount: number;
    ownerCharacterId: string | null;
    ownerLockedUntilEpochMs: number | null;
    openedByCharacterId: string | null;
  }): LootBagActor {
    const body = this.add.rectangle(
      lootBag.position.x,
      lootBag.position.y,
      20,
      16,
      0x8a5a2b,
      0.75,
    );
    body.setStrokeStyle(2, 0xffd27d, 0.9);

    const label = this.add
      .text(
        Math.round(lootBag.position.x),
        Math.round(lootBag.position.y - 22),
        `${lootBag.itemCount}`,
        {
          fontFamily: "Share Tech Mono",
          fontSize: "10px",
          color: "#ffd27d",
          stroke: "#000000",
          strokeThickness: 2,
        },
      )
      .setOrigin(0.5, 0.5);

    const actor: LootBagActor = {
      body,
      label,
      itemCount: lootBag.itemCount,
      ownerCharacterId: lootBag.ownerCharacterId,
      ownerLockedUntilEpochMs: lootBag.ownerLockedUntilEpochMs,
      openedByCharacterId: lootBag.openedByCharacterId,
    };
    this.updateLootBagActor(actor, lootBag);
    return actor;
  }

  private updateLootBagActor(
    actor: LootBagActor,
    lootBag: {
      position: { x: number; y: number };
      itemCount: number;
      ownerCharacterId: string | null;
      ownerLockedUntilEpochMs: number | null;
      openedByCharacterId: string | null;
    },
  ): void {
    actor.itemCount = lootBag.itemCount;
    actor.ownerCharacterId = lootBag.ownerCharacterId;
    actor.ownerLockedUntilEpochMs = lootBag.ownerLockedUntilEpochMs;
    actor.openedByCharacterId = lootBag.openedByCharacterId;

    const isOpen = lootBag.openedByCharacterId !== null;
    actor.body
      .setPosition(lootBag.position.x, lootBag.position.y)
      .setFillStyle(isOpen ? 0x6c4b2d : 0x8a5a2b, 0.82)
      .setStrokeStyle(2, isOpen ? 0x00e5ff : 0xffd27d, 0.9);
    actor.label
      .setText(`${lootBag.itemCount}`)
      .setPosition(
        Math.round(lootBag.position.x),
        Math.round(lootBag.position.y - 22),
      );
  }

  private destroyLootBagActor(actor: LootBagActor): void {
    actor.body.destroy();
    actor.label.destroy();
  }

  private createEnemyActor(enemy: EnemySnapshot): EnemyActor {
    const body = this.add.rectangle(
      enemy.position.x,
      enemy.position.y,
      enemy.width,
      enemy.height,
      hexToNumber(enemy.colorHex),
      0.06,
    );
    body.setStrokeStyle(1, hexToNumber(enemy.colorHex), 0.85);
    const label = this.add
      .text(
        Math.round(enemy.position.x),
        Math.round(enemy.position.y - enemy.height / 2 - ENEMY_LABEL_OFFSET_Y),
        enemy.name,
        {
          fontFamily: "Share Tech Mono",
          fontSize: "10px",
          color: "#d8dce8",
          stroke: "#000000",
          strokeThickness: 1,
        },
      )
      .setOrigin(0.5, 0.5);
    const healthBarBackground = this.add.rectangle(
      enemy.position.x,
      enemy.position.y - enemy.height / 2 - ENEMY_HEALTH_BAR_OFFSET_Y,
      Math.max(48, enemy.width),
      6,
      0x000000,
      0.95,
    );
    healthBarBackground.setStrokeStyle(1, 0x00ff41, 0.3);
    const healthBarFill = this.add
      .rectangle(
        enemy.position.x,
        enemy.position.y - enemy.height / 2 - ENEMY_HEALTH_BAR_OFFSET_Y,
        Math.max(48, enemy.width),
        4,
        0x00ff41,
        0.95,
      )
      .setOrigin(0, 0.5);
    const healthText = this.add
      .text(
        Math.round(enemy.position.x),
        Math.round(
          enemy.position.y - enemy.height / 2 - ENEMY_HEALTH_TEXT_OFFSET_Y,
        ),
        `${Math.round(enemy.currentHealth)}/${Math.round(enemy.maxHealth)}`,
        {
          fontFamily: "Share Tech Mono",
          fontSize: "10px",
          color: "#00ff41",
          stroke: "#000000",
          strokeThickness: 1,
        },
      )
      .setOrigin(0.5, 0.5);

    const actor: EnemyActor = {
      body,
      label,
      healthBarBackground,
      healthBarFill,
      healthText,
      colorHex: enemy.colorHex,
    };
    this.updateEnemyActor(actor, enemy);
    return actor;
  }

  private updateEnemyActor(actor: EnemyActor, enemy: EnemySnapshot): void {
    actor.body
      .setPosition(enemy.position.x, enemy.position.y)
      .setSize(enemy.width, enemy.height)
      .setFillStyle(hexToNumber(enemy.colorHex), 0.06);
    actor.body.setStrokeStyle(1, hexToNumber(enemy.colorHex), 0.85);

    const barWidth = Math.max(48, enemy.width);
    const labelY = enemy.position.y - enemy.height / 2 - ENEMY_LABEL_OFFSET_Y;
    const barY =
      enemy.position.y - enemy.height / 2 - ENEMY_HEALTH_BAR_OFFSET_Y;
    const healthTextY =
      enemy.position.y - enemy.height / 2 - ENEMY_HEALTH_TEXT_OFFSET_Y;
    const barLeft = enemy.position.x - barWidth / 2;
    const healthRatio =
      enemy.maxHealth <= 0
        ? 0
        : Math.max(0, Math.min(1, enemy.currentHealth / enemy.maxHealth));
    actor.colorHex = enemy.colorHex;

    actor.label
      .setText(enemy.name)
      .setPosition(Math.round(enemy.position.x), Math.round(labelY));
    actor.healthBarBackground
      .setPosition(enemy.position.x, barY)
      .setSize(barWidth, 6);
    actor.healthBarFill
      .setPosition(barLeft, barY)
      .setSize(Math.max(2, barWidth * healthRatio), 4)
      .setFillStyle(healthRatio > 0.35 ? 0x00ff41 : 0xff0066, 0.95);
    actor.healthText
      .setText(
        `${Math.round(enemy.currentHealth)}/${Math.round(enemy.maxHealth)}`,
      )
      .setPosition(Math.round(enemy.position.x), Math.round(healthTextY));
  }

  private destroyEnemyActor(actor: EnemyActor): void {
    actor.body.destroy();
    actor.label.destroy();
    actor.healthBarBackground.destroy();
    actor.healthBarFill.destroy();
    actor.healthText.destroy();
  }

  private playAttackEffect(
    attackStyle: "melee" | "ranged",
    origin: { x: number; y: number },
    direction: { x: number; y: number },
    range: number,
  ): void {
    if (attackStyle === "melee") {
      const baseRotation = Math.atan2(direction.y, direction.x);
      const sweepAngle = Phaser.Math.DegToRad(60);
      const startAngle = baseRotation - sweepAngle;
      const endAngle = baseRotation + sweepAngle;
      const swingRadius = Phaser.Math.Clamp(range * 0.85, 40, 90);
      const handleOffset = 10;
      const centerX = origin.x + direction.x * handleOffset;
      const centerY = origin.y + direction.y * handleOffset;

      const arcGraphics = this.add.graphics();

      const drawCrescent = (currentAngle: number, alpha: number) => {
        arcGraphics.clear();

        const innerR = swingRadius * 0.65;
        const outerR = swingRadius;

        const arcStart = currentAngle - sweepAngle * 0.7;
        const arcEnd = currentAngle + sweepAngle * 0.7;

        arcGraphics.fillStyle(0x00ff41, alpha * 0.35);
        arcGraphics.beginPath();
        arcGraphics.arc(centerX, centerY, outerR, arcStart, arcEnd);
        arcGraphics.arc(centerX, centerY, innerR, arcEnd, arcStart, true);
        arcGraphics.closePath();
        arcGraphics.fillPath();

        arcGraphics.lineStyle(2, 0xffd700, alpha * 0.95);
        arcGraphics.beginPath();
        arcGraphics.arc(centerX, centerY, outerR, arcStart, arcEnd);
        arcGraphics.strokePath();

        arcGraphics.lineStyle(1, 0xffffff, alpha * 0.7);
        arcGraphics.beginPath();
        arcGraphics.arc(
          centerX,
          centerY,
          innerR + (outerR - innerR) * 0.5,
          arcStart + 0.1,
          arcEnd - 0.1,
        );
        arcGraphics.strokePath();
      };

      drawCrescent(startAngle, 1);

      this.tweens.add({
        targets: { angle: startAngle },
        angle: endAngle,
        duration: 160,
        ease: "Sine.Out",
        onUpdate: (tween) => {
          const angle = tween.getValue() as number;
          const progress = (angle - startAngle) / (endAngle - startAngle);
          const alpha = 1 - progress * 0.9;
          drawCrescent(angle, alpha);
        },
        onComplete: () => {
          arcGraphics.destroy();
        },
      });
      return;
    }

    const burst = this.add.circle(
      origin.x + direction.x * 12,
      origin.y + direction.y * 12,
      8,
      0x00e5ff,
      0.45,
    );
    this.tweens.add({
      targets: burst,
      alpha: 0,
      scaleX: 1.9,
      scaleY: 1.9,
      duration: 170,
      onComplete: () => {
        burst.destroy();
      },
    });
  }

  private spawnSafeZoneText(): void {
    const anchor = this.localPlayer?.sprite ?? null;
    const x = anchor?.x ?? this.predictedPosition.x;
    const y = anchor?.y ?? this.predictedPosition.y;
    const text = this.add
      .text(Math.round(x), Math.round(y - 44), "SAFE ZONE", {
        fontFamily: "Share Tech Mono",
        fontSize: "12px",
        color: "#00e5ff",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0.5);

    this.tweens.add({
      targets: text,
      y: y - 74,
      alpha: 0,
      duration: 620,
      ease: "Cubic.Out",
      onComplete: () => {
        text.destroy();
      },
    });
  }

  private spawnCombatFloatingText(
    x: number,
    y: number,
    text: string,
    variant: CombatFloatingTextVariant,
  ): void {
    const serial = this.floatingTextSerial++;
    const lane = (serial % 3) - 1;
    const jitterX = Phaser.Math.Between(-8, 8);
    const startX = Math.round(x + lane * 18 + jitterX);
    const startY = Math.round(y - 44 - (serial % 2) * 8);

    const styleByVariant: Record<
      CombatFloatingTextVariant,
      {
        color: string;
        glowColor: string;
        stroke: string;
        fontSize: string;
        driftY: number;
        duration: number;
        holdMs: number;
        scaleTo: number;
        shake: number;
      }
    > = {
      damage_enemy: {
        color: "#ffd700",
        glowColor: "#ffd700",
        stroke: "#000000",
        fontSize: "24px",
        driftY: 98,
        duration: 1_260,
        holdMs: 130,
        scaleTo: 1.34,
        shake: 0.0012,
      },
      damage_player: {
        color: "#ff0066",
        glowColor: "#ff0066",
        stroke: "#000000",
        fontSize: "24px",
        driftY: 96,
        duration: 1_300,
        holdMs: 140,
        scaleTo: 1.3,
        shake: 0.0014,
      },
      xp_gain: {
        color: "#00e5ff",
        glowColor: "#00e5ff",
        stroke: "#000000",
        fontSize: "26px",
        driftY: 120,
        duration: 1_520,
        holdMs: 180,
        scaleTo: 1.38,
        shake: 0.0016,
      },
      level_up: {
        color: "#ffd700",
        glowColor: "#ffd700",
        stroke: "#000000",
        fontSize: "38px",
        driftY: 160,
        duration: 2_150,
        holdMs: 260,
        scaleTo: 1.55,
        shake: 0.0032,
      },
    };

    const style = styleByVariant[variant];
    const glowText = this.add
      .text(startX, startY, text, {
        fontFamily: "Silkscreen",
        fontSize: style.fontSize,
        color: style.glowColor,
        stroke: style.glowColor,
        strokeThickness: 8,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(138)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.34)
      .setScale(0.62);
    const floatingText = this.add
      .text(startX, startY, text, {
        fontFamily: "Silkscreen",
        fontSize: style.fontSize,
        color: style.color,
        stroke: style.stroke,
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(140)
      .setShadow(0, 0, style.glowColor, 12, false, true)
      .setScale(0.62)
      .setAlpha(0.98);

    this.tweens.add({
      targets: [floatingText, glowText],
      y: startY - style.driftY,
      alpha: 0,
      scaleX: style.scaleTo,
      scaleY: style.scaleTo,
      delay: style.holdMs,
      duration: style.duration,
      ease: variant === "level_up" ? "Back.Out" : "Cubic.Out",
      onComplete: () => {
        glowText.destroy();
        floatingText.destroy();
      },
    });

    const burst = this.add
      .circle(startX, startY + 6, 16, hexToNumber(style.glowColor), 0.36)
      .setDepth(137)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: burst,
      alpha: 0,
      scaleX: variant === "level_up" ? 3.4 : 2.5,
      scaleY: variant === "level_up" ? 3.4 : 2.5,
      duration: variant === "level_up" ? 700 : 420,
      ease: "Cubic.Out",
      onComplete: () => {
        burst.destroy();
      },
    });

    this.cameras.main.shake(
      variant === "level_up" ? 210 : 90,
      style.shake,
      true,
    );

    if (variant === "level_up" || variant === "xp_gain") {
      const burst = this.add
        .circle(
          startX,
          startY - 2,
          variant === "level_up" ? 20 : 14,
          0xffffff,
          0.22,
        )
        .setDepth(29);
      this.tweens.add({
        targets: burst,
        alpha: 0,
        scaleX: variant === "level_up" ? 3.9 : 2.7,
        scaleY: variant === "level_up" ? 3.9 : 2.7,
        duration: variant === "level_up" ? 800 : 520,
        ease: "Cubic.Out",
        onComplete: () => {
          burst.destroy();
        },
      });
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
    this.clearEnemyActors();
    this.clearProjectileActors();
    this.clearLootBagActors();
    this.enemyPredictionColliders = [];
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
      enemies: [],
      projectiles: [],
      lootBags: [],
      openContainer: null,
      localHealthCurrent: null,
      localHealthMax: null,
      localLevel: null,
      localXp: null,
      localXpToNextLevel: null,
      lastCombatDeniedReason: null,
      inventoryError: null,
      containerError: null,
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

  private clearEnemyActors(): void {
    for (const actor of this.enemyActors.values()) {
      this.destroyEnemyActor(actor);
    }
    this.enemyActors.clear();
  }

  private clearProjectileActors(): void {
    for (const actor of this.projectileActors.values()) {
      actor.body.destroy();
      actor.trail.destroy();
    }
    this.projectileActors.clear();
  }

  private clearLootBagActors(): void {
    for (const actor of this.lootBagActors.values()) {
      this.destroyLootBagActor(actor);
    }
    this.lootBagActors.clear();
  }

  private findNearestLootBagActor(): { id: string; distanceSq: number } | null {
    let nearest: { id: string; distanceSq: number } | null = null;
    const maxDistanceSq = LOOT_BAG_INTERACT_RADIUS * LOOT_BAG_INTERACT_RADIUS;

    for (const [id, actor] of this.lootBagActors.entries()) {
      const dx = actor.body.x - this.predictedPosition.x;
      const dy = actor.body.y - this.predictedPosition.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq > maxDistanceSq) {
        continue;
      }
      if (!nearest || distanceSq < nearest.distanceSq) {
        nearest = { id, distanceSq };
      }
    }

    return nearest;
  }

  private syncOverlayState(): void {
    const players: OverlayPlayer[] = [];
    const enemies: OverlayEnemy[] = [];
    const projectiles: OverlayProjectile[] = [];
    const lootBags: OverlayLootBag[] = [];

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

    for (const [id, actor] of this.enemyActors.entries()) {
      enemies.push({
        id,
        colorHex: actor.colorHex,
        x: actor.body.x,
        y: actor.body.y,
      });
    }

    for (const [id, actor] of this.projectileActors.entries()) {
      projectiles.push({
        id,
        colorHex: actor.colorHex,
        x: actor.body.x,
        y: actor.body.y,
      });
    }

    for (const [id, actor] of this.lootBagActors.entries()) {
      lootBags.push({
        id,
        x: actor.body.x,
        y: actor.body.y,
        itemCount: actor.itemCount,
        ownerCharacterId: actor.ownerCharacterId,
        ownerLockedUntilEpochMs: actor.ownerLockedUntilEpochMs,
        openedByCharacterId: actor.openedByCharacterId,
      });
    }

    this.bridge.updateState({ players, enemies, projectiles, lootBags });
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
    backgroundColor: "#000000",
    antialias: false,
    pixelArt: true,
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
