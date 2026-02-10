import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider } from "../auth/AuthContext";
import { clearSession, saveSession } from "../lib/auth/sessionStorage";
import { GameShell } from "./GameShell";

const moveRequests: Array<{
  from:
    | { kind: "bag"; index: number }
    | { kind: "equip"; slot: "weapon" | "armor" };
  to:
    | { kind: "bag"; index: number }
    | { kind: "equip"; slot: "weapon" | "armor" };
}> = [];
const dropRequests: Array<{
  from:
    | { kind: "bag"; index: number }
    | { kind: "equip"; slot: "weapon" | "armor" };
}> = [];

interface RuntimeMockBridge {
  onInventoryMoveRequest: (listener: (request: unknown) => void) => void;
  onInventoryDropRequest: (listener: (request: unknown) => void) => void;
  updateState: (state: Record<string, unknown>) => void;
}

function createDragDataTransfer(): DataTransfer {
  const data = new Map<string, string>();
  return {
    dropEffect: "move",
    effectAllowed: "move",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData(format?: string) {
      if (!format) {
        data.clear();
        return;
      }
      data.delete(format);
    },
    getData(format: string) {
      return data.get(format) ?? "";
    },
    setData(format: string, value: string) {
      data.set(format, value);
    },
    setDragImage() {},
  } as DataTransfer;
}

vi.mock("./phaser/runtime", () => ({
  mountGameRuntime: ({ bridge }: { bridge: RuntimeMockBridge }) => {
    bridge.onInventoryMoveRequest((request: unknown) => {
      moveRequests.push(
        request as {
          from:
            | { kind: "bag"; index: number }
            | { kind: "equip"; slot: "weapon" | "armor" };
          to:
            | { kind: "bag"; index: number }
            | { kind: "equip"; slot: "weapon" | "armor" };
        },
      );
    });
    bridge.onInventoryDropRequest((request: unknown) => {
      dropRequests.push(
        request as {
          from:
            | { kind: "bag"; index: number }
            | { kind: "equip"; slot: "weapon" | "armor" };
        },
      );
    });
    bridge.updateState({
      connectionStatus: "connected",
      isInWorld: true,
      worldId: "hub:alpha",
      mapSize: {
        width: 1000,
        height: 1000,
      },
      inventory: {
        bagSlots: [
          {
            id: "inv-1",
            itemDefinitionId: "training_sword",
          },
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
        ],
        equipSlots: {
          weapon: null,
          armor: null,
        },
        definitions: {
          training_sword: {
            id: "training_sword",
            name: "Training Sword",
            iconKey: "training_sword",
            type: "weapon",
            classRequirement: "knight",
            minLevelToEquip: 1,
            weaponDamageFlat: 4,
            weaponRangeFlat: 8,
            weaponSpeedPercent: 5,
          },
        },
      },
      players: [],
      enemies: [],
      projectiles: [],
      localHealthCurrent: 100,
      localHealthMax: 100,
      localLevel: 1,
      localXp: 0,
      localXpToNextLevel: 100,
    });
    return () => {};
  },
}));

describe("GameShell inventory UI", () => {
  beforeEach(() => {
    moveRequests.length = 0;
    dropRequests.length = 0;
    saveSession({
      token: "token",
      user: {
        id: "user-1",
        email: "user@example.com",
      },
      expiresAtEpochMs: Date.now() + 60_000,
    });
  });

  afterEach(() => {
    clearSession();
  });

  test("renders fixed 9 bag slots and equip slots", async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <GameShell characterId="character-1" />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Bag Slot/i })).toHaveLength(
        9,
      );
    });

    expect(screen.getByRole("button", { name: /Weapon Slot/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Armor Slot/i })).toBeDefined();
  });

  test("emits move and drop requests from drag interactions", async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <GameShell characterId="character-1" />
        </AuthProvider>
      </MemoryRouter>,
    );

    const bagSlotOne = await screen.findByRole("button", {
      name: /Bag Slot 1/i,
    });
    const bagSlotTwo = screen.getByRole("button", {
      name: /Bag Slot 2/i,
    });
    const groundDropZone = screen.getByText(/Drag an item here to drop it/i);

    const moveTransfer = createDragDataTransfer();
    fireEvent.dragStart(bagSlotOne, { dataTransfer: moveTransfer });
    fireEvent.dragOver(bagSlotTwo, { dataTransfer: moveTransfer });
    fireEvent.drop(bagSlotTwo, { dataTransfer: moveTransfer });

    expect(moveRequests).toContainEqual({
      from: { kind: "bag", index: 0 },
      to: { kind: "bag", index: 1 },
    });

    const dropTransfer = createDragDataTransfer();
    fireEvent.dragStart(bagSlotOne, { dataTransfer: dropTransfer });
    fireEvent.dragOver(groundDropZone, { dataTransfer: dropTransfer });
    fireEvent.drop(groundDropZone, { dataTransfer: dropTransfer });

    expect(dropRequests).toContainEqual({
      from: { kind: "bag", index: 0 },
    });
  });
});
