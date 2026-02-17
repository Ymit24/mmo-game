import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ItemsPage } from "./ItemsPage";

const listItemsMock = vi.fn();
const listItemIconsMock = vi.fn();
const createItemMock = vi.fn();
const updateItemMock = vi.fn();
const deleteItemMock = vi.fn();

vi.mock("../api/adminApi", () => ({
  listItems: () => listItemsMock(),
  listItemIcons: () => listItemIconsMock(),
  createItem: (...args: unknown[]) => createItemMock(...args),
  updateItem: (...args: unknown[]) => updateItemMock(...args),
  deleteItem: (...args: unknown[]) => deleteItemMock(...args),
}));

describe("ItemsPage icon picker", () => {
  beforeEach(() => {
    listItemsMock.mockReset();
    listItemIconsMock.mockReset();
    createItemMock.mockReset();
    updateItemMock.mockReset();
    deleteItemMock.mockReset();
  });

  test("selects icon from catalog instead of free text", async () => {
    listItemsMock.mockResolvedValue([
      {
        id: "training_sword",
        name: "Training Sword",
        iconKey: "training_sword",
        type: "weapon",
        classRequirement: "knight",
        minLevelToEquip: 1,
        weaponDamageFlat: 10,
        weaponRangeFlat: 8,
        weaponSpeedPercent: 5,
        weaponStyle: "sword",
        attackPatternId: "sword_cleave",
        attackDamageMultiplier: 1,
        attackProjectileCount: 1,
        attackSpreadDegrees: 0,
        attackBurstCount: 1,
        attackBurstIntervalMs: 0,
        attackAoeRadius: 0,
        attackAoeDelayMs: 0,
      },
    ]);
    listItemIconsMock.mockResolvedValue([
      { key: "training_sword", name: "Training Sword", itemUsageCount: 1 },
      { key: "training_wand", name: "Training Wand", itemUsageCount: 1 },
    ]);

    render(<ItemsPage />);

    const nameCells = await screen.findAllByText("Training Sword");
    const itemButton = nameCells
      .map((node) => node.closest("button"))
      .find((node): node is HTMLButtonElement => !!node);
    if (!itemButton) {
      throw new Error("Expected item button");
    }
    fireEvent.click(itemButton);

    const iconSelect = await screen.findByDisplayValue("training_sword");
    fireEvent.change(iconSelect, { target: { value: "training_wand" } });

    await waitFor(() => {
      expect(screen.getByDisplayValue("training_wand")).toBeInTheDocument();
    });
  });
});
