import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { IconsPage } from "./IconsPage";

const listItemIconsMock = vi.fn();
const createItemIconMock = vi.fn();
const updateItemIconMock = vi.fn();
const deleteItemIconMock = vi.fn();

vi.mock("../api/adminApi", () => ({
  listItemIcons: () => listItemIconsMock(),
  createItemIcon: (...args: unknown[]) => createItemIconMock(...args),
  updateItemIcon: (...args: unknown[]) => updateItemIconMock(...args),
  deleteItemIcon: (...args: unknown[]) => deleteItemIconMock(...args),
}));

describe("IconsPage", () => {
  beforeEach(() => {
    listItemIconsMock.mockReset();
    createItemIconMock.mockReset();
    updateItemIconMock.mockReset();
    deleteItemIconMock.mockReset();
  });

  test("shows missing asset warning for catalog entries without SVG", async () => {
    listItemIconsMock.mockResolvedValue([
      { key: "training_sword", name: "Training Sword", itemUsageCount: 1 },
      { key: "missing_icon", name: "Missing Icon", itemUsageCount: 0 },
    ]);

    render(<IconsPage />);

    await screen.findByText("Missing Icon");
    fireEvent.click(screen.getByRole("button", { name: /Missing Icon/i }));

    await waitFor(() => {
      expect(screen.getByText("Missing SVG asset")).toBeInTheDocument();
    });
  });
});
