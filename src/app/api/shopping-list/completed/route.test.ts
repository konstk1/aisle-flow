import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCompletedShoppingList, hasValidSession } = vi.hoisted(() => ({
  getCompletedShoppingList: vi.fn(),
  hasValidSession: vi.fn(),
}));

vi.mock("@/auth/access", () => ({ hasValidSession }));
vi.mock("@/services/active-shopping-list", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/active-shopping-list")>();

  return {
    ...actual,
    getCompletedShoppingList,
  };
});

import { GET } from "./route";

describe("completed shopping list route", () => {
  beforeEach(() => {
    getCompletedShoppingList.mockReset();
    hasValidSession.mockResolvedValue(false);
  });

  it("rejects unauthenticated reads", async () => {
    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(getCompletedShoppingList).not.toHaveBeenCalled();
  });

  it("returns completed items for authenticated callers", async () => {
    hasValidSession.mockResolvedValue(true);
    getCompletedShoppingList.mockResolvedValue({
      store: { id: "store-1", name: "Example Market" },
      list: { id: "list-1", source: "manual", syncState: "synced" },
      items: [],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      completedList: {
        store: { id: "store-1", name: "Example Market" },
        list: { id: "list-1", source: "manual", syncState: "synced" },
        items: [],
      },
    });
  });

  it("returns null when no shopping list exists yet", async () => {
    hasValidSession.mockResolvedValue(true);
    getCompletedShoppingList.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      completedList: null,
    });
  });
});
